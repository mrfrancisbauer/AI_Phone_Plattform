/**
 * Streaming OpenAI Chat Completions client for the dialogue agent (plain
 * fetch + SSE parsing, no SDK — consistent with services/llm.ts). Forwards
 * text deltas as they arrive (→ TTS starts speaking early) and assembles
 * tool-call deltas into complete calls; reports real token usage.
 */
import { config } from '../config.js';
import type { AgentLlm, ChatMessage, LlmTurnResult, ToolCall } from './agent.js';

interface StreamDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

function toApiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class OpenAiAgentLlm implements AgentLlm {
  constructor(private readonly tools: unknown[]) {}

  async complete(
    messages: ChatMessage[],
    onTextDelta: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<LlmTurnResult> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.LLM_MODEL,
        temperature: 0.4,
        max_tokens: 300, // spoken replies are short; caps cost + latency
        stream: true,
        stream_options: { include_usage: true },
        messages: toApiMessages(messages),
        tools: this.tools,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`OpenAI stream failed (${res.status}): ${await res.text().catch(() => '')}`);
    }

    let text = '';
    const toolParts = new Map<number, { id: string; name: string; arguments: string }>();
    const usage = { inputTokens: 0, outputTokens: 0 };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by double newlines; each data line is JSON.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let json: {
            choices?: Array<{ delta?: StreamDelta }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          try {
            json = JSON.parse(payload);
          } catch {
            continue; // tolerate malformed keep-alive frames
          }
          if (json.usage) {
            usage.inputTokens = json.usage.prompt_tokens ?? 0;
            usage.outputTokens = json.usage.completion_tokens ?? 0;
          }
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            text += delta.content;
            onTextDelta(delta.content);
          }
          for (const t of delta.tool_calls ?? []) {
            const part = toolParts.get(t.index) ?? { id: '', name: '', arguments: '' };
            if (t.id) part.id = t.id;
            if (t.function?.name) part.name += t.function.name;
            if (t.function?.arguments) part.arguments += t.function.arguments;
            toolParts.set(t.index, part);
          }
        }
      }
    }

    const toolCalls: ToolCall[] = [...toolParts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, p]) => ({ id: p.id, name: p.name, arguments: p.arguments }));
    return { text, toolCalls, usage };
  }
}
