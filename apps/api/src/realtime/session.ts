/**
 * Realtime session orchestration: verifies the call token, loads the call
 * context, wires the ConversationRelay WebSocket to a DialogueAgent with real
 * dependencies (OpenAI LLM, prisma store), and enforces the wall-clock cap.
 *
 * Failure posture: any error ends the relay session; Twilio then requests the
 * <Connect> action URL, which redirects the call into the classic turn-based
 * flow — the caller is never left in silence.
 */
import type { WebSocket } from 'ws';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { finalizeCall } from '../services/summary.service.js';
import { DialogueAgent, agentToolSchemas, type AgentTransport } from './agent.js';
import { OpenAiAgentLlm } from './openai-llm.js';
import { createPrismaStore } from './prisma-store.js';
import { buildRealtimeSystemPrompt, type PromptQuestion } from './prompt.js';
import { parseRelayMessage, textToken, endSession } from './protocol.js';
import { verifyCallToken } from './token.js';

export async function handleRelaySocket(socket: WebSocket, token: string): Promise<void> {
  const callId = await verifyCallToken(token);
  if (!callId) {
    socket.close(1008, 'invalid token');
    return;
  }

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      tenant: { select: { name: true } },
      assistant: { include: { questionnaire: { include: { questions: true } } } },
    },
  });
  if (!call) {
    socket.close(1008, 'unknown call');
    return;
  }

  const questions: PromptQuestion[] = (call.assistant.questionnaire?.questions ?? [])
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      key: q.key,
      prompt: q.prompt,
      type: q.type,
      required: q.required,
      options: (q.options as PromptQuestion['options']) ?? null,
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
    }));

  const transport: AgentTransport = {
    sendToken(t, last) {
      if (socket.readyState === socket.OPEN) socket.send(textToken(t, last));
    },
    end() {
      if (socket.readyState === socket.OPEN) socket.send(endSession('done'));
    },
  };

  const agent = new DialogueAgent(
    {
      systemPrompt: buildRealtimeSystemPrompt({
        assistantName: call.assistant.name,
        tenantName: call.tenant.name,
        systemPrompt: call.assistant.systemPrompt,
        locale: call.assistant.locale,
        questions,
      }),
      consentText: call.assistant.consentText,
      questions,
      consentGiven: call.consentGiven,
    },
    new OpenAiAgentLlm(agentToolSchemas(questions)),
    createPrismaStore(call.id, call.tenantId),
    transport,
  );

  // Wall-clock cap: wrap up politely instead of cutting the line.
  const timer = setTimeout(() => {
    void agent.onTimeUp().catch((err) => logger.error({ err, callId }, 'realtime time-up failed'));
  }, config.REALTIME_MAX_MINUTES * 60_000);

  socket.on('message', (raw: Buffer | string) => {
    const msg = parseRelayMessage(String(raw));
    if (!msg) return;
    switch (msg.kind) {
      case 'prompt':
        void agent.onCallerText(msg.text).catch((err) => {
          logger.error({ err, callId }, 'realtime turn failed — ending relay (fallback to turn-based)');
          transport.end();
        });
        break;
      case 'interrupt':
        agent.onInterrupt();
        break;
      case 'error':
        logger.warn({ callId, description: msg.description }, 'ConversationRelay reported an error');
        break;
      case 'setup':
      case 'dtmf':
      case 'other':
        break;
    }
  });

  socket.on('close', () => {
    clearTimeout(timer);
    agent.onInterrupt();
    // If the agent completed the conversation, finalize right away (idempotent;
    // the Twilio status callback remains the safety net for hang-ups).
    if (agent.isEnded) {
      void finalizeCall(callId).catch((err) => logger.error({ err, callId }, 'realtime finalize failed'));
    }
  });

  logger.info({ callId, tenantId: call.tenantId }, 'realtime session started');
}
