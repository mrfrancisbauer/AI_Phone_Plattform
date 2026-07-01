/**
 * Maps a persona (the customer-facing voice choice) to a concrete neural TTS
 * voice that Twilio's <Say> can speak. This is what makes the persona selector
 * actually audible — previously the stored persona never reached the audio path,
 * so every call used Twilio's robotic default regardless of the selection.
 *
 * Provider is configurable (TTS_VOICE_PROVIDER):
 *   google → Google Neural2 (5 distinct DE/EN voices, high quality) [default]
 *   polly  → Amazon Polly Neural (universally enabled on Twilio; smaller DE set)
 *   basic  → no voice attribute (Twilio's legacy voice) — escape hatch
 *
 * The `voice` token carries its own locale, so <Say> must NOT also set language.
 */
import { personaByVoiceId } from '@ai-phone/shared';
import { config } from '../config.js';

type PersonaId = 'anna' | 'david' | 'lisa' | 'julia' | 'alex';
type Lang = 'de' | 'en';

// Google Cloud Neural2 voices (Twilio `<Say voice="Google...">`).
const GOOGLE: Record<Lang, Record<PersonaId, string>> = {
  de: { anna: 'Google.de-DE-Neural2-C', david: 'Google.de-DE-Neural2-B', lisa: 'Google.de-DE-Neural2-A', julia: 'Google.de-DE-Neural2-F', alex: 'Google.de-DE-Neural2-D' },
  en: { anna: 'Google.en-US-Neural2-C', david: 'Google.en-US-Neural2-D', lisa: 'Google.en-US-Neural2-F', julia: 'Google.en-US-Neural2-E', alex: 'Google.en-US-Neural2-A' },
};

// Amazon Polly Neural voices (fallback; DE neural inventory is small so some
// personas share a voice — documented tradeoff).
const POLLY: Record<Lang, Record<PersonaId, string>> = {
  de: { anna: 'Polly.Vicki-Neural', david: 'Polly.Daniel-Neural', lisa: 'Polly.Hannah-Neural', julia: 'Polly.Vicki-Neural', alex: 'Polly.Daniel-Neural' },
  en: { anna: 'Polly.Joanna-Neural', david: 'Polly.Matthew-Neural', lisa: 'Polly.Kimberly-Neural', julia: 'Polly.Kendra-Neural', alex: 'Polly.Joey-Neural' },
};

function langOf(locale: string): Lang {
  return locale === 'en' ? 'en' : 'de';
}

/**
 * Resolve the Twilio <Say> voice token for a stored assistant voice (persona
 * voiceId) and locale. Returns '' when the provider is "basic" (caller then
 * falls back to a plain language-based <Say>).
 */
export function resolveTwilioVoice(assistantVoice: string | null | undefined, locale: string): string {
  if (config.TTS_VOICE_PROVIDER === 'basic') return '';
  const persona = personaByVoiceId(assistantVoice);
  const id = (persona.id as PersonaId) ?? 'anna';
  const lang = langOf(locale);
  const table = config.TTS_VOICE_PROVIDER === 'polly' ? POLLY : GOOGLE;
  return table[lang][id] ?? table[lang].anna;
}

/** Platform default voice for prompts spoken before an assistant is resolved. */
export function defaultTwilioVoice(locale = 'de'): string {
  return resolveTwilioVoice(undefined, locale);
}
