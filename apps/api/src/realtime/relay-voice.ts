/**
 * Map the persona voice to ConversationRelay attributes. Relay separates the
 * TTS provider from the voice name (unlike <Say>, which encodes both in one
 * token like "Google.de-DE-Neural2-C"), so we reuse the existing Phase-1
 * mapping and split it.
 */
import { resolveTwilioVoice } from '../lib/voice.js';

export interface RelayVoice {
  /** ConversationRelay ttsProvider attribute (e.g. "Google", "Amazon"). */
  ttsProvider: string;
  /** Provider-native voice name (e.g. "de-DE-Neural2-C", "Vicki-Neural"). */
  voice: string;
}

export function resolveRelayVoice(assistantVoice: string | null | undefined, locale: string): RelayVoice | null {
  const sayToken = resolveTwilioVoice(assistantVoice, locale);
  if (!sayToken) return null; // TTS_VOICE_PROVIDER=basic → let Relay use its default
  const dot = sayToken.indexOf('.');
  if (dot === -1) return null;
  const prefix = sayToken.slice(0, dot);
  const voice = sayToken.slice(dot + 1);
  const ttsProvider = prefix === 'Polly' ? 'Amazon' : prefix; // "Google" stays
  return { ttsProvider, voice };
}
