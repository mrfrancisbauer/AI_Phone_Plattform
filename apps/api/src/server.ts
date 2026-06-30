import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { prisma } from './db.js';

async function main() {
  const app = await buildApp();

  const close = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  logger.info(`API listening on ${config.API_PUBLIC_URL}`);
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
