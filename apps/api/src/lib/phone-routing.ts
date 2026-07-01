/**
 * Pure phone-number routing logic (no DB / no framework) so it can be unit
 * tested exhaustively.
 *
 *  - resolveAssistantForNumber: decides which assistant a new/updated number
 *    should be bound to, given the tenant's assistants and an optional request.
 *  - classifyInbound: decides whether an inbound call can be served and, if not,
 *    why — used for structured logging in the webhook.
 */

export interface AssistantRef {
  id: string;
  name?: string | null;
}

export type ResolveResult =
  | { ok: true; assistantId: string }
  | { ok: false; message: string };

/**
 * Resolve the assistant for a phone number.
 * - explicit id: must belong to the tenant (must be in `assistants`).
 * - no id + exactly one assistant: auto-select it.
 * - no id + multiple assistants: ask the caller to pick.
 * - no id + no assistants: require creating one first.
 */
export function resolveAssistantForNumber(
  assistants: AssistantRef[],
  requestedId?: string | null,
): ResolveResult {
  if (requestedId) {
    const found = assistants.some((a) => a.id === requestedId);
    if (!found) {
      return { ok: false, message: 'Der ausgewählte Assistent gehört nicht zu diesem Mandanten.' };
    }
    return { ok: true, assistantId: requestedId };
  }
  if (assistants.length === 0) {
    return { ok: false, message: 'Bitte zuerst einen Assistenten erstellen.' };
  }
  if (assistants.length === 1) {
    return { ok: true, assistantId: assistants[0]!.id };
  }
  return { ok: false, message: 'Bitte einen Assistenten für diese Telefonnummer auswählen.' };
}

/**
 * Initial forwarding status for a new number.
 * - A "keep your number" DID has a display number the customer forwards from:
 *   it stays 'pending' until the first forwarded call is actually received.
 * - A directly-dialed number (no display number) is reachable immediately.
 */
export function initialForwardingStatus(
  displayNumber?: string | null,
): 'pending' | 'active' {
  return displayNumber ? 'pending' : 'active';
}

export type InboundReason = 'ok' | 'not_found' | 'inactive' | 'no_assistant' | 'paused';

export interface InboundPhone {
  active: boolean;
  assistant: { id: string } | null;
  tenant: { paused: boolean };
}

export interface InboundDecision {
  reachable: boolean;
  reason: InboundReason;
}

/** Decide whether an inbound call to a (looked-up) number can be served. */
export function classifyInbound(phone: InboundPhone | null | undefined): InboundDecision {
  if (!phone) return { reachable: false, reason: 'not_found' };
  if (!phone.active) return { reachable: false, reason: 'inactive' };
  if (!phone.assistant) return { reachable: false, reason: 'no_assistant' };
  if (phone.tenant.paused) return { reachable: false, reason: 'paused' };
  return { reachable: true, reason: 'ok' };
}

/** Log level to use for a given inbound outcome. */
export function inboundLogLevel(reason: InboundReason): 'info' | 'warn' {
  return reason === 'ok' ? 'info' : 'warn';
}
