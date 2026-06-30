'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader, Spinner, StatusDot } from '@/components/admin/ui';

interface Providers {
  twilio: { configured: boolean; accountSid: string | null; validateSignature: boolean; webhookUrl: string };
  openai: { configured: boolean; defaultModel: string; apiKey: string | null };
  email: { provider: string; configured: boolean; from: string };
  stripe: { configured: boolean; webhookConfigured: boolean };
}

export default function ProvidersPage() {
  const [data, setData] = useState<Providers | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [error, setError] = useState('');

  useEffect(() => { api<Providers>('/api/admin/providers').then(setData).catch((e) => setError(e.message)); }, []);

  async function test(provider: string) {
    setTests((t) => ({ ...t, [provider]: { ok: false, message: 'Teste…' } }));
    const r = await api<{ ok: boolean; message: string }>('/api/admin/providers/test', { method: 'POST', body: JSON.stringify({ provider }) });
    setTests((t) => ({ ...t, [provider]: r }));
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner />;

  const TestResult = ({ p }: { p: string }) => tests[p] ? <p className={tests[p].ok ? 'success' : 'error'}>{tests[p].message}</p> : null;

  return (
    <>
      <PageHeader title="Provider" subtitle="Telefonie, KI, E-Mail und Payments" />
      <div className="ac-grid k2">
        <Card title="Twilio" actions={<StatusDot status={data.twilio.configured ? 'ok' : 'not_configured'} label={data.twilio.configured ? 'Verbunden' : 'Nicht konfiguriert'} />}>
          <dl className="ac-kv">
            <dt>Account SID</dt><dd>{data.twilio.accountSid ?? '–'}</dd>
            <dt>Signaturprüfung</dt><dd>{data.twilio.validateSignature ? 'Aktiv' : 'Aus'}</dd>
            <dt>Webhook</dt><dd style={{ wordBreak: 'break-all' }}>{data.twilio.webhookUrl}</dd>
          </dl>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => test('twilio')}>Connection Test</button>
          <TestResult p="twilio" />
        </Card>

        <Card title="OpenAI" actions={<StatusDot status={data.openai.configured ? 'ok' : 'not_configured'} label={data.openai.configured ? 'Verbunden' : 'Fallback'} />}>
          <dl className="ac-kv">
            <dt>API Key</dt><dd>{data.openai.apiKey ?? '– (lokaler Fallback)'}</dd>
            <dt>Default Modell</dt><dd>{data.openai.defaultModel}</dd>
          </dl>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => test('openai')}>Health Check</button>
          <TestResult p="openai" />
        </Card>

        <Card title="E-Mail" actions={<StatusDot status={data.email.configured ? (data.email.provider === 'console' ? 'console' : 'ok') : 'not_configured'} label={data.email.provider} />}>
          <dl className="ac-kv">
            <dt>Provider</dt><dd>{data.email.provider}</dd>
            <dt>Absender</dt><dd>{data.email.from}</dd>
          </dl>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => test('email')}>Connection Test</button>
          <TestResult p="email" />
        </Card>

        <Card title="Stripe" actions={<StatusDot status={data.stripe.configured ? 'ok' : 'not_configured'} label={data.stripe.configured ? 'Verbunden' : 'Nicht konfiguriert'} />}>
          <dl className="ac-kv">
            <dt>API</dt><dd>{data.stripe.configured ? 'Konfiguriert' : '–'}</dd>
            <dt>Webhook</dt><dd>{data.stripe.webhookConfigured ? 'Konfiguriert' : '–'}</dd>
          </dl>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => test('stripe')}>Connection Test</button>
          <TestResult p="stripe" />
        </Card>
      </div>
      <p className="muted" style={{ fontSize: '0.82rem', marginTop: 12 }}>
        Zugangsdaten werden ausschließlich serverseitig aus dem Secret-Manager/Env geladen und niemals im Klartext angezeigt.
      </p>
    </>
  );
}
