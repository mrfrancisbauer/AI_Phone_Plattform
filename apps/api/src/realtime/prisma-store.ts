/**
 * DB adapter for the dialogue agent: persists exactly the same rows as the
 * turn-based flow (encrypted CallMessage, CallAnswer, call status), so
 * finalizeCall and the whole downstream pipeline work unchanged. Real LLM token
 * usage is accumulated on call.state.realtimeUsage for accurate cost tracking.
 */
import { prisma } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import type { AgentStore } from './agent.js';

export function createPrismaStore(callId: string, tenantId: string): AgentStore {
  return {
    async saveMessage(role, text) {
      await prisma.callMessage.create({
        data: { callId, tenantId, role, textEnc: encrypt(text) },
      });
    },

    async saveAnswer(key, type, value, rawText) {
      await prisma.callAnswer.upsert({
        where: { callId_questionKey: { callId, questionKey: key } },
        create: {
          tenantId,
          callId,
          questionKey: key,
          type: type as never,
          value: value as object,
          rawTextEnc: encrypt(rawText),
        },
        update: { value: value as object, rawTextEnc: encrypt(rawText) },
      });
    },

    async setConsent(given) {
      await prisma.call.update({ where: { id: callId }, data: { consentGiven: given } });
    },

    async setCallStatus(status) {
      await prisma.call.update({
        where: { id: callId },
        data: { status: status as never, ...(status === 'declined' ? { endedAt: new Date() } : {}) },
      });
    },

    async addUsage(inputTokens, outputTokens) {
      // Read-modify-write on the state JSON; calls are single-session so there
      // is no concurrent writer for this field.
      const call = await prisma.call.findUnique({ where: { id: callId }, select: { state: true } });
      const state = (call?.state as Record<string, unknown> | null) ?? {};
      const prev = (state.realtimeUsage as { inputTokens?: number; outputTokens?: number } | undefined) ?? {};
      const next = {
        inputTokens: (prev.inputTokens ?? 0) + inputTokens,
        outputTokens: (prev.outputTokens ?? 0) + outputTokens,
      };
      await prisma.call.update({
        where: { id: callId },
        data: { state: { ...state, realtimeUsage: next } as object },
      });
    },
  };
}
