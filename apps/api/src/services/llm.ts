/**
 * LLM abstraction.
 *
 * The platform is provider-agnostic. When OPENAI_API_KEY is set we call the
 * Chat Completions API; otherwise we fall back to a deterministic local
 * summarizer so the whole conversation → summary → email flow runs end-to-end
 * with no external dependency (useful for tests, demos and CI).
 *
 * Every call returns an estimated token usage so the cost calculator can
 * attribute LLM cost to the call.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface SummaryRequest {
  systemPrompt: string;
  transcript: Array<{ role: 'assistant' | 'caller'; text: string }>;
  answers: Array<{ question: string; answer: string }>;
  locale: string;
}

export interface SummaryResult {
  summary: string;
  usage: LlmUsage;
}

/** Rough token estimate (~4 chars/token) — good enough for cost attribution. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function generateSummary(req: SummaryRequest): Promise<SummaryResult> {
  if (config.OPENAI_API_KEY) {
    try {
      return await openAiSummary(req);
    } catch (err) {
      logger.error({ err }, 'LLM summary failed, falling back to local summarizer');
    }
  }
  return localSummary(req);
}

async function openAiSummary(req: SummaryRequest): Promise<SummaryResult> {
  const userContent = [
    'Erstelle eine sachliche, kurze Gesprächszusammenfassung (3-5 Sätze) auf Basis von Transkript und strukturierten Antworten. Keine erfundenen Fakten.',
    '',
    'Transkript:',
    ...req.transcript.map((m) => `${m.role === 'assistant' ? 'Assistent' : 'Anrufer'}: ${m.text}`),
    '',
    'Antworten:',
    ...req.answers.map((a) => `- ${a.question}: ${a.answer}`),
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const summary = data.choices[0]?.message.content?.trim() ?? '';
  return {
    summary,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(userContent + req.systemPrompt),
      outputTokens: data.usage?.completion_tokens ?? estimateTokens(summary),
    },
  };
}

/** Deterministic, no-network summarizer used as the default/fallback engine. */
function localSummary(req: SummaryRequest): SummaryResult {
  const concern = req.answers.find((a) => /anliegen|concern|grund/i.test(a.question))?.answer;
  const lines: string[] = [];
  if (concern) lines.push(`Anliegen: ${concern}.`);
  const top = req.answers
    .filter((a) => a.answer && a.answer !== '–')
    .slice(0, 4)
    .map((a) => `${a.question}: ${a.answer}`);
  if (top.length) lines.push(`Erfasste Angaben — ${top.join('; ')}.`);
  lines.push(
    `Das Gespräch umfasste ${req.transcript.length} Beiträge und wurde vollständig erfasst.`,
  );
  const summary = lines.join(' ');
  const inputText = req.transcript.map((m) => m.text).join(' ') + req.systemPrompt;
  return {
    summary,
    usage: { inputTokens: estimateTokens(inputText), outputTokens: estimateTokens(summary) },
  };
}
