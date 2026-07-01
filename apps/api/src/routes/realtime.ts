/**
 * ConversationRelay WebSocket endpoint. Unauthenticated in the session sense —
 * the wss URL carries a signed, single-call token minted by the /voice webhook
 * (which itself verified the Twilio signature). Everything else lives in
 * src/realtime/.
 */
import type { FastifyInstance } from 'fastify';
import { handleRelaySocket } from '../realtime/session.js';
import { logger } from '../logger.js';

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/realtime/:token', { websocket: true }, (socket, req) => {
    const { token } = req.params as { token: string };
    void handleRelaySocket(socket, token).catch((err) => {
      logger.error({ err }, 'realtime session setup failed');
      try {
        socket.close(1011, 'setup failed');
      } catch {
        /* already closed */
      }
    });
  });
}
