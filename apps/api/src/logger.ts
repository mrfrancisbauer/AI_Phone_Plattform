import { pino, type LoggerOptions } from 'pino';
import { config, isProd } from './config.js';

/**
 * Structured logging configuration, shared between the standalone service
 * logger and Fastify. PII must never be logged in plaintext — known sensitive
 * paths are redacted defensively.
 */
export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.e164',
      '*.fromNumber',
      '*.callerEmail',
      '*.transcript',
    ],
    censor: '[redacted]',
  },
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  base: { service: 'ai-phone-api', env: config.NODE_ENV },
};

/** Standalone logger for use in services and jobs (outside the request scope). */
export const logger = pino(loggerOptions);
