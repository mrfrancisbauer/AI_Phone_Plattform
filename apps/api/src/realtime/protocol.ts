/**
 * Twilio ConversationRelay WebSocket protocol (pure parsing/serialising).
 *
 * Incoming (Twilio → us):
 *   {"type":"setup", "callSid": "...", ...}          session start
 *   {"type":"prompt", "voicePrompt":"…", "last":…}   caller utterance (STT)
 *   {"type":"interrupt", …}                          caller barged in
 *   {"type":"dtmf", "digit":"1"}                     keypad
 *   {"type":"error", "description":"…"}
 *
 * Outgoing (us → Twilio):
 *   {"type":"text", "token":"…", "last":bool}        text tokens → TTS
 *   {"type":"end", "handoffData":"…"}                end the relay session
 *
 * Parsing is deliberately tolerant: unknown message types are surfaced as
 * {kind:'other'} instead of throwing, so protocol additions never crash a call.
 */

export type RelayInbound =
  | { kind: 'setup'; callSid: string }
  | { kind: 'prompt'; text: string }
  | { kind: 'interrupt' }
  | { kind: 'dtmf'; digit: string }
  | { kind: 'error'; description: string }
  | { kind: 'other'; type: string };

export function parseRelayMessage(raw: string): RelayInbound | null {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const type = typeof msg.type === 'string' ? msg.type : '';
  switch (type) {
    case 'setup':
      return { kind: 'setup', callSid: String(msg.callSid ?? '') };
    case 'prompt':
      return { kind: 'prompt', text: String(msg.voicePrompt ?? '') };
    case 'interrupt':
      return { kind: 'interrupt' };
    case 'dtmf':
      return { kind: 'dtmf', digit: String(msg.digit ?? '') };
    case 'error':
      return { kind: 'error', description: String(msg.description ?? '') };
    default:
      return { kind: 'other', type };
  }
}

/** A text token for the TTS stream. `last` marks the end of this reply. */
export function textToken(token: string, last: boolean): string {
  return JSON.stringify({ type: 'text', token, last });
}

/** End the relay session (Twilio then requests the <Connect> action URL). */
export function endSession(handoffData = ''): string {
  return JSON.stringify({ type: 'end', handoffData });
}
