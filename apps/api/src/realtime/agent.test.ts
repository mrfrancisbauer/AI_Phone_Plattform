import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';

const { DialogueAgent } = await import('./agent.js');
type AgentLlm = import('./agent.js').AgentLlm;
type AgentStore = import('./agent.js').AgentStore;
type AgentTransport = import('./agent.js').AgentTransport;
type LlmTurnResult = import('./agent.js').LlmTurnResult;

const QUESTIONS = [
  { key: 'name', prompt: 'Wie heißen Sie?', type: 'free_text', required: true },
  { key: 'dringend', prompt: 'Ist es dringend?', type: 'yes_no', required: false },
];

/** In-memory fakes recording every side effect. */
function makeFakes(turns: LlmTurnResult[]) {
  const events: string[] = [];
  const answers = new Map<string, unknown>();
  let llmCalls = 0;
  const llm: AgentLlm = {
    async complete(_messages, onTextDelta, signal) {
      llmCalls += 1;
      if (signal.aborted) {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      }
      const turn = turns.shift() ?? { text: '', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } };
      if (turn.text) onTextDelta(turn.text);
      return turn;
    },
  };
  const store: AgentStore = {
    async saveMessage(role, text) { events.push(`msg:${role}:${text.slice(0, 40)}`); },
    async saveAnswer(key, _type, value) { answers.set(key, value); events.push(`answer:${key}`); },
    async setConsent(given) { events.push(`consent:${given}`); },
    async setCallStatus(status) { events.push(`status:${status}`); },
    async addUsage() { /* recorded implicitly */ },
  };
  const sent: Array<{ token: string; last: boolean }> = [];
  let endedTransport = false;
  const transport: AgentTransport = {
    sendToken(token, last) { sent.push({ token, last }); },
    end() { endedTransport = true; },
  };
  return { llm, store, transport, events, answers, sent, isEnded: () => endedTransport, llmCalls: () => llmCalls };
}

function makeAgent(f: ReturnType<typeof makeFakes>, consentGiven = false) {
  return new DialogueAgent(
    { systemPrompt: 'SYS', consentText: 'Einverstanden?', questions: QUESTIONS, consentGiven },
    f.llm, f.store, f.transport,
  );
}

test('consent gate: "nein" declines, ends the call, never reaches the LLM', async () => {
  const f = makeFakes([]);
  const agent = makeAgent(f);
  await agent.onCallerText('nein, möchte ich nicht');
  assert.ok(f.events.includes('status:declined'));
  assert.equal(f.llmCalls(), 0);
  assert.equal(f.isEnded(), true);
  assert.equal(agent.isEnded, true);
});

test('consent gate: unclear answer re-asks without calling the LLM', async () => {
  const f = makeFakes([]);
  const agent = makeAgent(f);
  await agent.onCallerText('äh was?');
  assert.equal(f.llmCalls(), 0);
  assert.equal(f.isEnded(), false);
  assert.match(f.sent.map((s) => s.token).join(''), /Ja oder Nein/);
});

test('consent gate: "ja" persists consent and hands over to the LLM', async () => {
  const f = makeFakes([
    { text: 'Wie heißen Sie denn?', toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } },
  ]);
  const agent = makeAgent(f);
  await agent.onCallerText('ja klar');
  assert.ok(f.events.includes('consent:true'));
  assert.ok(f.events.includes('status:in_progress'));
  assert.equal(f.llmCalls(), 1);
});

test('save_answer tool: valid value is validated + persisted, invalid is rejected', async () => {
  const f = makeFakes([
    // Model saves an answer, then (after the tool result) replies with text.
    { text: '', toolCalls: [{ id: 't1', name: 'save_answer', arguments: '{"key":"dringend","value":true}' }], usage: { inputTokens: 1, outputTokens: 1 } },
    { text: 'Notiert!', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  const agent = makeAgent(f, true);
  await agent.onCallerText('ja das ist dringend');
  assert.equal(f.answers.get('dringend'), true);

  const f2 = makeFakes([
    { text: '', toolCalls: [{ id: 't1', name: 'save_answer', arguments: '{"key":"unbekannt","value":1}' }], usage: { inputTokens: 1, outputTokens: 1 } },
    { text: 'Entschuldigung.', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  const agent2 = makeAgent(f2, true);
  await agent2.onCallerText('hallo');
  assert.equal(f2.answers.size, 0); // unknown key rejected
});

test('end_call tool speaks the goodbye and ends the session', async () => {
  const f = makeFakes([
    { text: '', toolCalls: [{ id: 't1', name: 'end_call', arguments: '{"goodbye":"Danke, auf Wiederhören!"}' }], usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  const agent = makeAgent(f, true);
  await agent.onCallerText('das war alles');
  assert.equal(agent.isEnded, true);
  assert.equal(f.isEnded(), true);
  assert.match(f.sent.map((s) => s.token).join(''), /auf Wiederhören/);
});

test('after end, further caller text is ignored', async () => {
  const f = makeFakes([
    { text: '', toolCalls: [{ id: 't1', name: 'end_call', arguments: '{"goodbye":"Tschüss"}' }], usage: { inputTokens: 1, outputTokens: 1 } },
  ]);
  const agent = makeAgent(f, true);
  await agent.onCallerText('fertig');
  const callsBefore = f.llmCalls();
  await agent.onCallerText('hallo? noch da?');
  assert.equal(f.llmCalls(), callsBefore);
});

test('time-up wraps up politely and ends', async () => {
  const f = makeFakes([]);
  const agent = makeAgent(f, true);
  await agent.onTimeUp();
  assert.equal(agent.isEnded, true);
  assert.equal(f.isEnded(), true);
});
