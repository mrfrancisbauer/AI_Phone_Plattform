import { PrismaClient } from '@prisma/client';
import { isProd } from './config.js';

/**
 * Single shared Prisma client. In dev we stash it on globalThis so hot-reload
 * (tsx watch) does not exhaust the connection pool by creating a new client on
 * every reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.prisma = prisma;
