'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { INDUSTRIES, PLANS, PLAN_PRICING } from '@ai-phone/shared';

interface Props {
  onClose: () => void;
  onCreated: (magicLink: string | null) => void;
}

const STEPS = ['Firma', 'Admin', 'Plan', 'Telefonie', 'OpenAI', 'Budget'];

export function TenantWizard({ onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', slug: '', industry: 'Kanzlei', country: 'DE', locale: 'de', timezone: 'Europe/Berlin',
    adminName: '', adminEmail: '', password: '', useMagicLink: true,
    plan: 'starter' as (typeof PLANS)[number],
    telephonyMode: 'platform_twilio' as 'platform_twilio' | 'own_twilio' | 'sip' | 'telnyx',
    openaiMode: 'platform' as 'platform' | 'own',
    monthlyBudgetLimit: '' as string, autoPauseOnBudget: true,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(''); setBusy(true);
    try {
      const res = await api<{ magicLink: string | null }>('/api/admin/provision-tenant', {
        method: 'POST',
        body: JSON.stringify({
          tenant: {
            name: form.name, slug: form.slug, locale: form.locale,
            industry: form.industry, country: form.country, timezone: form.timezone,
            plan: form.plan, telephonyMode: form.telephonyMode, openaiMode: form.openaiMode,
            monthlyBudgetLimit: form.monthlyBudgetLimit ? Number(form.monthlyBudgetLimit) : null,
            autoPauseOnBudget: form.autoPauseOnBudget,
          },
          admin: {
            email: form.adminEmail, name: form.adminName || undefined,
            password: form.useMagicLink ? undefined : form.password,
          },
          seedStarterContent: true,
        }),
      });
      onCreated(res.magicLink);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen');
      setBusy(false);
    }
  }

  const canNext =
    (step === 0 && form.name && form.slug) ||
    (step === 1 && form.adminEmail && (form.useMagicLink || form.password.length >= 8)) ||
    step >= 2;

  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Mandant anlegen</h2>
          <button className="btn secondary" onClick={onClose}>✕</button>
        </div>
        <div className="ac-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`ac-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>{i + 1}. {s}</div>
          ))}
        </div>

        {step === 0 && (
          <div>
            <label>Firmenname</label>
            <input value={form.name} onChange={(e) => { set('name', e.target.value); if (!form.slug) set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} />
            <label>Slug</label>
            <input value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
            <div className="ac-grid k2">
              <div><label>Branche</label>
                <select value={form.industry} onChange={(e) => set('industry', e.target.value)}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select>
              </div>
              <div><label>Land</label>
                <select value={form.country} onChange={(e) => set('country', e.target.value)}><option value="DE">Deutschland</option><option value="AT">Österreich</option><option value="CH">Schweiz</option></select>
              </div>
              <div><label>Sprache</label>
                <select value={form.locale} onChange={(e) => set('locale', e.target.value)}><option value="de">Deutsch</option><option value="en">English</option></select>
              </div>
              <div><label>Zeitzone</label>
                <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)}><option>Europe/Berlin</option><option>Europe/Vienna</option><option>Europe/Zurich</option></select>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <label>Admin Name</label>
            <input value={form.adminName} onChange={(e) => set('adminName', e.target.value)} />
            <label>Admin E-Mail</label>
            <input type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
            <label className="row" style={{ marginTop: 12 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.useMagicLink} onChange={(e) => set('useMagicLink', e.target.checked)} />
              <span style={{ marginLeft: 8 }}>Per Magic Link einladen (kein Passwort setzen)</span>
            </label>
            {!form.useMagicLink && (<><label>Passwort (min. 8 Zeichen)</label><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></>)}
          </div>
        )}

        {step === 2 && (
          <div className="ac-grid k3">
            {PLANS.map((p) => (
              <button key={p} type="button" className={`ac-choice${form.plan === p ? ' active' : ''}`} onClick={() => set('plan', p)}>
                <strong style={{ textTransform: 'capitalize' }}>{p}</strong>
                <div className="muted">{PLAN_PRICING[p]} € / Monat</div>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="ac-grid k2">
            {([['platform_twilio', 'Plattform-Twilio'], ['own_twilio', 'Eigene Twilio Credentials'], ['sip', 'SIP'], ['telnyx', 'Telnyx']] as const).map(([v, l]) => (
              <button key={v} type="button" className={`ac-choice${form.telephonyMode === v ? ' active' : ''}`} onClick={() => set('telephonyMode', v)}>{l}</button>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="ac-grid k2">
            {([['platform', 'Plattform-Key verwenden'], ['own', 'Eigener API Key']] as const).map(([v, l]) => (
              <button key={v} type="button" className={`ac-choice${form.openaiMode === v ? ' active' : ''}`} onClick={() => set('openaiMode', v)}>{l}</button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div>
            <label>Monatsbudget (EUR, optional)</label>
            <input type="number" step="0.01" value={form.monthlyBudgetLimit} onChange={(e) => set('monthlyBudgetLimit', e.target.value)} />
            <p className="muted" style={{ fontSize: '0.82rem' }}>Warnungen werden automatisch bei 50 %, 80 % und 100 % versendet.</p>
            <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={form.autoPauseOnBudget} onChange={(e) => set('autoPauseOnBudget', e.target.checked)} /><span style={{ marginLeft: 8 }}>Automatischer Stopp bei 100 %</span></label>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="row between" style={{ marginTop: 18 }}>
          <button className="btn secondary" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>Zurück</button>
          {step < STEPS.length - 1 ? (
            <button className="btn" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Weiter</button>
          ) : (
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Wird angelegt…' : 'Mandant anlegen'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
