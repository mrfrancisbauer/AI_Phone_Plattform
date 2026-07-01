import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';

const { parseRelayMessage, textToken, endSession } = await import('./protocol.js');
const { signCallToken, verifyCallToken } = await import('./token.js');
const { resolveRelayVoice } = await import('./relay-voice.js');
const { validateAnswerValue } = await import('./answer-validate.js');
const { buildRealtimeSystemPrompt } = await import('./prompt.js');
const { twimlConversationRelay } = await import('../lib/twilio.js');
const { config } = await import('../config.js');

// --- protocol ---------------------------------------------------------------
test('protocol: parses setup/prompt/interrupt/dtmf/error, tolerates unknown + junk', () => {
  assert.deepEqual(parseRelayMessage('{"type":"setup","callSid":"CA1"}'), { kind: 'setup', callSid: 'CA1' });
  assert.deepEqual(parseRelayMessage('{"type":"prompt","voicePrompt":"Hallo"}'), { kind: 'prompt', text: 'Hallo' });
  assert.deepEqual(parseRelayMessage('{"type":"interrupt"}'), { kind: 'interrupt' });
  assert.deepEqual(parseRelayMessage('{"type":"dtmf","digit":"3"}'), { kind: 'dtmf', digit: '3' });
  assert.deepEqual(parseRelayMessage('{"type":"error","description":"x"}'), { kind: 'error', description: 'x' });
  assert.deepEqual(parseRelayMessage('{"type":"whatever"}'), { kind: 'other', type: 'whatever' });
  assert.equal(parseRelayMessage('not json'), null);
});

test('protocol: outbound frames', () => {
  assert.deepEqual(JSON.parse(textToken('Hal', false)), { type: 'text', token: 'Hal', last: false });
  assert.deepEqual(JSON.parse(endSession('done')), { type: 'end', handoffData: 'done' });
});

// --- call token ---------------------------------------------------------------
test('call token roundtrip; garbage and wrong-purpose tokens are rejected', async () => {
  const token = await signCallToken('call-123');
  assert.equal(await verifyCallToken(token), 'call-123');
  assert.equal(await verifyCallToken('garbage'), null);
});

// --- relay voice ---------------------------------------------------------------
test('relay voice: splits provider and voice from the <Say> token', () => {
  config.TTS_VOICE_PROVIDER = 'google';
  assert.deepEqual(resolveRelayVoice('nova', 'de'), { ttsProvider: 'Google', voice: 'de-DE-Neural2-C' });
  config.TTS_VOICE_PROVIDER = 'polly';
  assert.deepEqual(resolveRelayVoice('nova', 'de'), { ttsProvider: 'Amazon', voice: 'Vicki-Neural' });
  config.TTS_VOICE_PROVIDER = 'basic';
  assert.equal(resolveRelayVoice('nova', 'de'), null);
  config.TTS_VOICE_PROVIDER = 'google';
});

// --- answer validation ---------------------------------------------------------
const Q = (type: string, extra: Record<string, unknown> = {}) =>
  ({ key: 'k', prompt: 'p', type, required: false, ...extra }) as never;

test('validateAnswerValue: per-type rules', () => {
  assert.deepEqual(validateAnswerValue(Q('yes_no'), true), { ok: true, value: true });
  assert.equal(validateAnswerValue(Q('yes_no'), 'vielleicht').ok, false);
  assert.deepEqual(validateAnswerValue(Q('scale', { scaleMin: 1, scaleMax: 5 }), 3), { ok: true, value: 3 });
  assert.equal(validateAnswerValue(Q('scale', { scaleMin: 1, scaleMax: 5 }), 9).ok, false);
  assert.deepEqual(validateAnswerValue(Q('email'), 'Max@Firma.DE'), { ok: true, value: 'max@firma.de' });
  assert.equal(validateAnswerValue(Q('email'), 'keine mail').ok, false);
  assert.equal(validateAnswerValue(Q('phone'), '+49 30 123456').ok, true);
  assert.equal(validateAnswerValue(Q('phone'), '12').ok, false);
  const mc = Q('multiple_choice', { options: [{ value: 'a', label: 'Anliegen A' }] });
  assert.deepEqual(validateAnswerValue(mc, 'a'), { ok: true, value: 'a' });
  assert.equal(validateAnswerValue(mc, 'zzz').ok, false);
  assert.equal(validateAnswerValue(Q('free_text'), '').ok, false);
  assert.equal(validateAnswerValue(Q('free_text'), 'Hallo').ok, true);
});

// --- prompt --------------------------------------------------------------------
test('system prompt embeds tenant, questions with keys, and the guard rules', () => {
  const p = buildRealtimeSystemPrompt({
    assistantName: 'Anna',
    tenantName: 'Kanzlei Test',
    systemPrompt: 'Sei höflich.',
    locale: 'de',
    questions: [{ key: 'anliegen', prompt: 'Worum geht es?', type: 'free_text', required: true }],
  });
  assert.match(p, /Kanzlei Test/);
  assert.match(p, /key="anliegen"/);
  assert.match(p, /save_answer/);
  assert.match(p, /end_call/);
  assert.match(p, /kann ich nicht zuverlässig beantworten/);
});

// --- TwiML ----------------------------------------------------------------------
test('twimlConversationRelay: connect verb with ws url, greeting, voice + action', () => {
  const xml = twimlConversationRelay({
    wsUrl: 'wss://api.example.com/realtime/TOKEN',
    welcomeGreeting: 'Guten Tag & willkommen',
    language: 'de-DE',
    ttsProvider: 'Google',
    voice: 'de-DE-Neural2-C',
    actionUrl: 'https://api.example.com/webhooks/twilio/relay-action?callId=c1',
  });
  assert.match(xml, /<Connect action="https:\/\/api\.example\.com\/webhooks\/twilio\/relay-action\?callId=c1">/);
  assert.match(xml, /url="wss:\/\/api\.example\.com\/realtime\/TOKEN"/);
  assert.match(xml, /welcomeGreeting="Guten Tag &amp; willkommen"/);
  assert.match(xml, /ttsProvider="Google" voice="de-DE-Neural2-C"/);
  assert.match(xml, /interruptible="speech"/);
});
