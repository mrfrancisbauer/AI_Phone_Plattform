/**
 * The realtime dialogue agent — the brain of a ConversationRelay call.
 *
 * All dependencies are injected (LLM, persistence, transport), so the full
 * conversation logic is unit-testable without a DB, network or Twilio:
 *
 *   transport  — sends text tokens to Twilio TTS / ends the relay session
 *   store      — persists messages/answers/state (prisma adapter in prod)
 *   llm        — streaming chat completion with tool-calls (OpenAI in prod)
 *
 * Hard guards live HERE, outside the LLM:
 *   - consent gate: until the caller says yes, the LLM never runs
 *   - tools-only writes: save_answer values are validated before persisting
 *   - budget caps: max turns per call; the session layer adds a wall-clock cap
 */
import type { PromptQuestion } from './prompt.js';
import { validateAnswerValue } from './answer-validate.js';

// Mirrors the turn-based consent matching (conversation.service.ts).
const YES = /\b(ja|jo|jawohl|klar|genau|korrekt|richtig|passt|yes|yep)\b/i;
const NO = /\b(nein|ne|nö|nicht|falsch|no|nope)\b/i;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments as produced by the model. */
  arguments: string;
}

export interface LlmTurnResult {
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AgentLlm {
  /**
   * One model turn. Streams text deltas via onTextDelta (already forwarded to
   * TTS by the caller); resolves with the full turn incl. tool calls + usage.
   * Must reject with AbortError when `signal` fires (barge-in).
   */
  complete(
    messages: ChatMessage[],
    onTextDelta: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<LlmTurnResult>;
}

export interface AgentStore {
  saveMessage(role: 'assistant' | 'caller' | 'system', text: string): Promise<void>;
  saveAnswer(key: string, type: string, value: unknown, rawText: string): Promise<void>;
  setConsent(given: boolean): Promise<void>;
  setCallStatus(status: string): Promise<void>;
  addUsage(inputTokens: number, outputTokens: number): Promise<void>;
}

export interface AgentTransport {
  sendToken(token: string, last: boolean): void;
  end(): void;
}

export interface AgentConfig {
  systemPrompt: string;
  consentText: string;
  questions: PromptQuestion[];
  /** Consent already given (e.g. reconnect mid-call). */
  consentGiven: boolean;
  maxTurns?: number;
}

const DECLINE_TEXT =
  'Kein Problem, ich verstehe. Sie erreichen unser Team gerne auch persönlich. Vielen Dank für Ihren Anruf und auf Wiederhören.';
const CONSENT_RETRY =
  'Darf ich Sie kurz fragen: Sind Sie mit der KI-gestützten Bearbeitung einverstanden? Bitte sagen Sie Ja oder Nein.';
const WRAPUP_TEXT = 'Vielen Dank für das Gespräch. Unser Team meldet sich zeitnah bei Ihnen. Auf Wiederhören.';

export class DialogueAgent {
  private history: ChatMessage[] = [];
  private consentGiven: boolean;
  private turns = 0;
  private ended = false;
  private abort: AbortController | null = null;

  constructor(
    private readonly cfg: AgentConfig,
    private readonly llm: AgentLlm,
    private readonly store: AgentStore,
    private readonly transport: AgentTransport,
  ) {
    this.consentGiven = cfg.consentGiven;
    this.history.push({ role: 'system', content: cfg.systemPrompt });
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** Caller barged in — cancel any in-flight generation. */
  onInterrupt(): void {
    this.abort?.abort();
  }

  /** Wall-clock cap reached (session layer timer): wrap up politely. */
  async onTimeUp(): Promise<void> {
    if (this.ended) return;
    this.abort?.abort();
    await this.speak(WRAPUP_TEXT);
    await this.finish('timeout');
  }

  /** One caller utterance (final STT result). */
  async onCallerText(text: string): Promise<void> {
    if (this.ended || !text.trim()) return;
    await this.store.saveMessage('caller', text.trim());

    // --- Consent gate (state machine, not the LLM) ---
    if (!this.consentGiven) {
      if (NO.test(text) && !YES.test(text)) {
        await this.store.setCallStatus('declined');
        await this.speak(DECLINE_TEXT);
        this.ended = true;
        this.transport.end();
        return;
      }
      if (YES.test(text)) {
        this.consentGiven = true;
        await this.store.setConsent(true);
        await this.store.setCallStatus('in_progress');
        // The consented utterance seeds the LLM conversation.
        this.history.push({ role: 'user', content: text.trim() });
        await this.runLlmTurn();
        return;
      }
      await this.speak(CONSENT_RETRY);
      return;
    }

    this.history.push({ role: 'user', content: text.trim() });
    await this.runLlmTurn();
  }

  // --- internals ---------------------------------------------------------

  private async speak(text: string): Promise<void> {
    await this.store.saveMessage('assistant', text);
    this.transport.sendToken(text, true);
  }

  private async finish(reason: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    await this.store.saveMessage('system', `Gespräch beendet (${reason}).`);
    this.transport.end();
  }

  private async runLlmTurn(): Promise<void> {
    this.turns += 1;
    if (this.turns > (this.cfg.maxTurns ?? 40)) {
      await this.speak(WRAPUP_TEXT);
      await this.finish('max_turns');
      return;
    }

    // Tool-call loop: the model may call tools, get results, then speak.
    for (let hop = 0; hop < 4 && !this.ended; hop++) {
      this.abort = new AbortController();
      let result: LlmTurnResult;
      let spoken = '';
      try {
        result = await this.llm.complete(
          this.history,
          (delta) => {
            spoken += delta;
            this.transport.sendToken(delta, false);
          },
          this.abort.signal,
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // barge-in: stay silent
        throw err;
      } finally {
        this.abort = null;
      }

      await this.store.addUsage(result.usage.inputTokens, result.usage.outputTokens);
      if (result.text.trim()) {
        this.transport.sendToken('', true); // close the TTS token stream
        await this.store.saveMessage('assistant', result.text.trim());
      } else if (spoken.trim()) {
        this.transport.sendToken('', true);
        await this.store.saveMessage('assistant', spoken.trim());
      }
      this.history.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });

      if (result.toolCalls.length === 0) return; // plain reply — wait for caller

      for (const call of result.toolCalls) {
        const outcome = await this.execTool(call);
        this.history.push({ role: 'tool', content: outcome, toolCallId: call.id });
        if (this.ended) return;
      }
      // Loop: give the model the tool results so it can respond.
    }
  }

  private async execTool(call: ToolCall): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
    } catch {
      return 'FEHLER: ungültige Tool-Argumente (kein JSON).';
    }

    switch (call.name) {
      case 'save_answer': {
        const key = String(args.key ?? '');
        const question = this.cfg.questions.find((q) => q.key === key);
        if (!question) return `FEHLER: unbekannter key "${key}".`;
        const check = validateAnswerValue(question, args.value);
        if (!check.ok) return `FEHLER: ${check.reason}. Bitte frage noch einmal nach.`;
        await this.store.saveAnswer(key, question.type, check.value, String(args.value ?? ''));
        return `OK: Antwort für "${key}" gespeichert.`;
      }
      case 'end_call': {
        const goodbye = String(args.goodbye ?? '').trim() || WRAPUP_TEXT;
        await this.speak(goodbye);
        await this.finish('end_call');
        return 'OK';
      }
      default:
        return `FEHLER: unbekanntes Tool "${call.name}".`;
    }
  }
}

/** OpenAI tool schemas for the agent (kept next to the agent that uses them). */
export function agentToolSchemas(questions: PromptQuestion[]): unknown[] {
  return [
    {
      type: 'function',
      function: {
        name: 'save_answer',
        description: 'Speichert eine vom Anrufer genannte Information. Sofort aufrufen, sobald ein Wert genannt wurde.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: questions.map((q) => q.key), description: 'Der Fragen-Key.' },
            value: { description: 'Der erfasste Wert, typgerecht (boolean für yes_no, Zahl für scale, sonst String).' },
          },
          required: ['key', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'end_call',
        description: 'Beendet das Gespräch mit einer freundlichen Verabschiedung. Erst aufrufen, wenn alles erfasst ist oder der Anrufer abbrechen möchte.',
        parameters: {
          type: 'object',
          properties: { goodbye: { type: 'string', description: 'Der Verabschiedungssatz.' } },
          required: ['goodbye'],
        },
      },
    },
  ];
}
