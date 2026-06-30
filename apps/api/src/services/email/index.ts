/**
 * Email delivery with a pluggable provider. Defaults to `console` (logs the
 * email) so the platform runs with zero external setup; set EMAIL_PROVIDER
 * and RESEND_API_KEY to actually send. Every send is recorded in email_logs
 * (recipient encrypted) for the tenant's audit trail.
 */
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { encrypt } from '../../lib/crypto.js';
import { logger } from '../../logger.js';
import type { RenderedEmail } from './templates.js';

export type EmailKind = 'tenant_summary' | 'caller_summary' | 'budget_alert';

export interface SendEmailParams {
  tenantId: string;
  to: string;
  email: RenderedEmail;
  kind: EmailKind;
  callId?: string;
}

interface EmailProvider {
  send(to: string, email: RenderedEmail): Promise<void>;
}

const consoleProvider: EmailProvider = {
  async send(to, email) {
    logger.info({ to: '[redacted]', subject: email.subject }, 'email (console provider)');
  },
};

const resendProvider: EmailProvider = {
  async send(to, email) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    }
  },
};

function getProvider(): EmailProvider {
  if (config.EMAIL_PROVIDER === 'resend' && config.RESEND_API_KEY) return resendProvider;
  return consoleProvider;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const provider = getProvider();
  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  try {
    await provider.send(params.to, params.email);
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
    logger.error({ err, kind: params.kind }, 'email send failed');
  }

  await prisma.emailLog.create({
    data: {
      tenantId: params.tenantId,
      callId: params.callId,
      toEnc: encrypt(params.to),
      subject: params.email.subject,
      kind: params.kind,
      status,
      error,
    },
  });
  return status === 'sent';
}
