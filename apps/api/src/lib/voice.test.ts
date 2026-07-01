import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';

const { config } = await import('../config.js');
const { resolveTwilioVoice, defaultTwilioVoice } = await import('./voice.js');
const { twimlGather, twimlHangup } = await import('./twilio.js');
const { VOICE_PERSONAS } = await import('@ai-phone/shared');

// Persona voiceIds: anna=nova, david=onyx, lisa=shimmer, julia=fable, alex=alloy.

test('google (default): each persona maps to a DISTINCT German neural voice', () => {
  config.TTS_VOICE_PROVIDER = 'google';
  const voices = VOICE_PERSONAS.map((p) => resolveTwilioVoice(p.voiceId, 'de'));
  assert.equal(new Set(voices).size, VOICE_PERSONAS.length); // all distinct
  assert.equal(resolveTwilioVoice('nova', 'de'), 'Google.de-DE-Neural2-C'); // Business Anna
  assert.equal(resolveTwilioVoice('onyx', 'de'), 'Google.de-DE-Neural2-B'); // Business David
});

test('google: English locale uses en-US neural voices', () => {
  config.TTS_VOICE_PROVIDER = 'google';
  assert.equal(resolveTwilioVoice('shimmer', 'en'), 'Google.en-US-Neural2-F'); // Lisa
});

test('polly fallback maps to Polly Neural voices', () => {
  config.TTS_VOICE_PROVIDER = 'polly';
  assert.equal(resolveTwilioVoice('nova', 'de'), 'Polly.Vicki-Neural');
  assert.equal(resolveTwilioVoice('onyx', 'de'), 'Polly.Daniel-Neural');
  config.TTS_VOICE_PROVIDER = 'google';
});

test('basic provider returns no voice token (legacy <Say>)', () => {
  config.TTS_VOICE_PROVIDER = 'basic';
  assert.equal(resolveTwilioVoice('nova', 'de'), '');
  config.TTS_VOICE_PROVIDER = 'google';
});

test('unknown/empty stored voice falls back to the default persona voice', () => {
  config.TTS_VOICE_PROVIDER = 'google';
  assert.equal(resolveTwilioVoice(undefined, 'de'), 'Google.de-DE-Neural2-C');
  assert.equal(resolveTwilioVoice('does-not-exist', 'de'), 'Google.de-DE-Neural2-C');
  assert.equal(defaultTwilioVoice('de'), 'Google.de-DE-Neural2-C');
});

test('twimlGather: neural voice is on <Say voice=>, STT language stays on <Gather>', () => {
  const xml = twimlGather('Hallo', 'https://x/act', { language: 'de-DE', voice: 'Google.de-DE-Neural2-C' });
  assert.match(xml, /<Say voice="Google\.de-DE-Neural2-C">Hallo<\/Say>/);
  assert.match(xml, /<Gather input="speech" language="de-DE"/);
  // The <Say> must not also carry language when a voice is set.
  assert.doesNotMatch(xml, /<Say voice="[^"]*" language=/);
});

test('twimlHangup: falls back to language-based <Say> when no voice given', () => {
  const xml = twimlHangup('Tschüss', { language: 'de-DE' });
  assert.match(xml, /<Say language="de-DE">Tschüss<\/Say>/);
});
