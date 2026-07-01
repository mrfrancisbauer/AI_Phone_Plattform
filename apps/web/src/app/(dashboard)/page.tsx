'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { money, duration, dateTime } from '@/lib/format';
import { HeroHead } from '@/components/app';
import { Spinner } from '@/components/ui';
import { personaByVoiceId } from '@ai-phone/shared';

interface Stats {
  totalCalls: number;
  monthToDateSpend: number;
  monthlyBudgetLimit: number | null;
  series: { date: string; calls: number; durationSeconds: number; cost: number }[];
}
interface CallItem { id: string; callerName: string | null; fromNumber: string; leadCategory: string | null; durationSeconds: number; startedAt: string; status: string }
interface Assistant { id: string; name: string; voice: string; locale: string; questionnaireId: string | null }
interface PhoneNumber { id: string; e164: string; provider: string; active: boolean; assistantName: string | null }

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Stats>('/api/usage/stats?days=30'),
      api<{ items: CallItem[] }>('/api/calls?limit=5'),
      api<Assistant[]>('/api/assistants'),
      api<PhoneNumber[]>('/api/phone-numbers'),
    ])
      .then(([s, c, a, n]) => {
        // Fresh tenant with nothing set up → guide into the setup wizard.
        if (a.length === 0 && n.length === 0) {
          router.replace('/onboarding');
          return;
        }
        setStats(s);
        setCalls(c.items);
        setAssistant(a[0] ?? null);
        setNumbers(n);
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <Spinner />;

  const today = new Date().toISOString().slice(0, 10);
  const todayBucket = stats?.series.find((s) => s.date === today);
  const callsToday = todayBucket?.calls ?? 0;
  const costToday = todayBucket?.cost ?? 0;
  const openLeads = calls.filter((c) => c.leadCategory === 'A' || c.leadCategory === 'B').length;

  const number = numbers[0] ?? null;
  const steps = [
    { label: 'Unternehmen angelegt', done: true },
    { label: 'Telefonnummer verbunden', done: numbers.length > 0 },
    { label: 'Assistent konfiguriert', done: Boolean(assistant?.questionnaireId) },
    { label: 'Testanruf durchgeführt', done: (stats?.totalCalls ?? 0) > 0 },
    { label: 'Live schalten', done: Boolean(number?.active) && numbers.length > 0 && Boolean(assistant?.questionnaireId) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const currentStep = steps.findIndex((s) => !s.done);

  const persona = assistant ? personaByVoiceId(assistant.voice) : null;

  return (
    <>
      <HeroHead
        title="Willkommen zurück 👋"
        subtitle="Hier ist die Übersicht zu Ihrem KI-Telefonassistenten."
        actions={<Link href="/testcall" className="btn">🎧 Testanruf starten</Link>}
      />

      {/* KPIs */}
      <div className="ac-grid k4">
        <Kpi ico="📞" label="Gespräche heute" value={String(callsToday)} sub="letzte 30 Tage im Verlauf" accent="var(--accent)" bg="var(--accent-soft)" />
        <Kpi ico="👥" label="Offene Leads" value={String(openLeads)} sub="A/B-Leads der letzten Gespräche" accent="#0a7d2c" bg="#e9f7ef" />
        <Kpi ico="€" label="Kosten heute" value={money(costToday)} sub={`Monat: ${money(stats?.monthToDateSpend ?? 0)}`} accent="#b8860b" bg="#fdf6e3" />
        <Kpi
          ico="◑"
          label="Monatsbudget"
          value={stats?.monthlyBudgetLimit ? money(stats.monthlyBudgetLimit) : '–'}
          sub={stats?.monthlyBudgetLimit ? `${Math.round((stats.monthToDateSpend / stats.monthlyBudgetLimit) * 100)}% genutzt` : 'kein Limit gesetzt'}
          accent="#6d28d9"
          bg="#f3effe"
        />
      </div>

      {/* Setup progress */}
      {doneCount < steps.length && (
        <div className="setting-card" style={{ marginTop: '1.25rem' }}>
          <header>
            <div className="row between" style={{ flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ marginBottom: 2 }}>Einrichtung</h3>
                <p>{doneCount} von {steps.length} Schritten abgeschlossen</p>
              </div>
              <Link href="/onboarding" className="btn secondary sm">Weiter einrichten →</Link>
            </div>
          </header>
          <div className="body">
            <div className="stepper">
              {steps.map((s, i) => (
                <div key={s.label} className={`step${s.done ? ' done' : i === currentStep ? ' current' : ''}`}>
                  <span className="dot">{s.done ? '✓' : i + 1}</span>
                  <span className="lbl">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Three cards */}
      <div className="ac-grid k3" style={{ marginTop: '1.25rem' }}>
        <div className="setting-card">
          <header><div className="row between"><h3>Ihr Assistent</h3><Link href="/assistant/personality" className="btn secondary sm">Bearbeiten</Link></div></header>
          <div className="body">
            {assistant ? (
              <>
                <div className="row" style={{ gap: 12 }}>
                  <span className="avatar" style={{ width: 44, height: 44, fontSize: '1.1rem' }}>{assistant.name[0]?.toUpperCase() ?? 'A'}</span>
                  <div><strong style={{ fontSize: '1.05rem' }}>{assistant.name}</strong><div className="muted" style={{ fontSize: '0.85rem' }}>Digitale Rezeption</div></div>
                </div>
                <dl className="ac-kv" style={{ marginTop: 14, gridTemplateColumns: '110px 1fr' }}>
                  <dt>Stimme</dt><dd>{persona?.name}</dd>
                  <dt>Sprache</dt><dd>{assistant.locale === 'en' ? 'English' : 'Deutsch'}</dd>
                  <dt>Stil</dt><dd>{persona?.style}</dd>
                </dl>
              </>
            ) : (
              <p className="muted">Noch kein Assistent. <Link href="/onboarding">Jetzt einrichten →</Link></p>
            )}
          </div>
        </div>

        <div className="setting-card">
          <header><div className="row between"><h3>Telefonnummer</h3><Link href="/phone" className="btn secondary sm">Verwalten</Link></div></header>
          <div className="body">
            {number ? (
              <>
                <strong style={{ fontSize: '1.15rem' }}>{number.e164}</strong>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <span className="switch on" style={{ width: 10, height: 10, borderRadius: 999 }} />
                  <span className="muted" style={{ fontSize: '0.9rem' }}>{number.active ? 'Aktiv' : 'Inaktiv'} · {number.provider}</span>
                </div>
                <dl className="ac-kv" style={{ marginTop: 14, gridTemplateColumns: '130px 1fr' }}>
                  <dt>Assistent</dt><dd>{number.assistantName ?? <span className="error" style={{ margin: 0 }}>keiner</span>}</dd>
                </dl>
              </>
            ) : (
              <p className="muted">Noch keine Nummer verbunden. <Link href="/phone">Jetzt verbinden →</Link></p>
            )}
          </div>
        </div>

        <div className="setting-card">
          <header><div className="row between"><h3>Letzte Gespräche</h3><Link href="/calls" className="btn secondary sm">Alle</Link></div></header>
          <div className="body" style={{ paddingTop: 6 }}>
            {calls.length === 0 && <p className="muted">Noch keine Gespräche.</p>}
            {calls.map((c) => (
              <Link key={c.id} href={`/calls/${c.id}`} className="row between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)', color: 'inherit', textDecoration: 'none' }}>
                <span>{c.callerName ?? c.fromNumber}</span>
                <span className="muted" style={{ fontSize: '0.82rem' }}>{c.status === 'completed' ? duration(c.durationSeconds) : c.status}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ ico, label, value, sub, accent, bg }: { ico: string; label: string; value: string; sub: string; accent: string; bg: string }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-ico" style={{ background: bg, color: accent }}>{ico}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
