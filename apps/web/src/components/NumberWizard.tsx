'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { CopyField } from '@/components/app';
import { Alert } from '@/components/ui';
import { TELEPHONY_CARRIERS } from '@ai-phone/shared';

interface AssistantRef { id: string; name: string }
interface Props {
  assistants: AssistantRef[];
  webhookUrl: string;
  twilioConfigured: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Mode = 'choose' | 'carrier' | 'existing-setup' | 'twilio' | 'sip';

function normalize(n: string) {
  return n.replace(/[^\d+]/g, '');
}

export function NumberWizard({ assistants, webhookUrl, twilioConfigured, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [carrier, setCarrier] = useState('Telekom');
  const [number, setNumber] = useState('');
  const [assistantId, setAssistantId] = useState(assistants.length === 1 ? assistants[0]!.id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(provider: 'sip' | 'twilio', configure: boolean) {
    setError('');
    const e164 = normalize(number);
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
      setError('Bitte die Nummer im Format +49… (mit Ländervorwahl, ohne Leerzeichen) angeben.');
      return;
    }
    if (assistants.length > 1 && !assistantId) {
      setError('Bitte einen Assistenten auswählen.');
      return;
    }
    setBusy(true);
    try {
      const created = await api<{ id: string }>('/api/phone-numbers', {
        method: 'POST',
        body: JSON.stringify({ provider, e164, active: true, assistantId: assistantId || undefined }),
      });
      if (configure && provider === 'twilio' && twilioConfigured) {
        await api(`/api/phone-numbers/${created.id}/configure-webhook`, { method: 'POST' }).catch(() => {});
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
      setBusy(false);
    }
  }

  const AssistantSelect = () =>
    assistants.length === 0 ? (
      <Alert kind="error">Bitte zuerst einen Assistenten erstellen, bevor eine Telefonnummer hinzugefügt werden kann.</Alert>
    ) : (
      <div style={{ marginTop: '0.75rem' }}>
        <label style={{ marginTop: 0 }}>Assistent</label>
        <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
          <option value="">Assistent wählen…</option>
          {assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
    );

  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Telefonnummer hinzufügen</h2>
          <button className="btn secondary sm" onClick={onClose}>✕</button>
        </div>
        {error && <Alert kind="error">{error}</Alert>}

        {mode === 'choose' && (
          <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
            <button className="choice" onClick={() => setMode('carrier')}>
              <span className="choice-badge">Empfehlung</span>
              <span className="choice-title">Bestehende Nummer behalten</span>
              <span className="choice-sub">Ihre vorhandene Rufnummer per Weiterleitung anbinden — kein Nummernwechsel nötig.</span>
            </button>
            <button className="choice" onClick={() => setMode('twilio')} disabled={!twilioConfigured}>
              <span className="choice-title">Neue Twilio-Nummer kaufen {!twilioConfigured && <span className="muted">(nicht konfiguriert)</span>}</span>
              <span className="choice-sub">Sofort eine neue Nummer über die Plattform bereitstellen.</span>
            </button>
            <button className="choice" onClick={() => setMode('sip')}>
              <span className="choice-title">SIP verbinden</span>
              <span className="choice-sub">Direkte SIP-Trunk-Anbindung.</span>
              <span className="choice-badge">Coming Soon</span>
            </button>
          </div>
        )}

        {mode === 'carrier' && (
          <div>
            <p className="muted">Bei welchem Anbieter ist Ihre Nummer aktuell?</p>
            <div className="choice-grid">
              {TELEPHONY_CARRIERS.map((c) => (
                <button key={c} className={`choice${carrier === c ? ' active' : ''}`} onClick={() => setCarrier(c)}>
                  <span className="choice-title" style={{ fontSize: '0.95rem' }}>{c}</span>
                </button>
              ))}
            </div>
            <div className="row between" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setMode('choose')}>Zurück</button>
              <button className="btn" onClick={() => setMode('existing-setup')}>Weiter</button>
            </div>
          </div>
        )}

        {mode === 'existing-setup' && (
          <div>
            <h3 style={{ marginTop: 0 }}>So verbinden Sie Ihre {carrier}-Nummer</h3>
            <div className="guide-step">
              <span className="guide-num">1</span>
              <div>
                <strong>Weiterleitung einrichten</strong>
                <p className="muted" style={{ margin: '2px 0 0' }}>Leiten Sie eingehende Anrufe Ihrer {carrier}-Nummer an unsere Plattform (SIP/Webhook) weiter. Die genaue anbieterspezifische Anleitung wird hier künftig mit Screenshots ergänzt.</p>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-num">2</span>
              <div style={{ flex: 1 }}>
                <strong>Webhook-URL hinterlegen</strong>
                <div style={{ marginTop: 6 }}><CopyField value={webhookUrl} /></div>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-num">3</span>
              <div style={{ flex: 1 }}>
                <strong>Nummer &amp; Assistent zuordnen</strong>
                <div style={{ marginTop: 6 }}>
                  <input placeholder="+49 …" value={number} onChange={(e) => setNumber(e.target.value)} />
                </div>
                <AssistantSelect />
              </div>
            </div>
            <div className="row between" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setMode('carrier')}>Zurück</button>
              <button className="btn" disabled={busy || assistants.length === 0} onClick={() => save('sip', false)}>{busy ? 'Speichern…' : 'Nummer verbinden'}</button>
            </div>
          </div>
        )}

        {mode === 'twilio' && (
          <div>
            <h3 style={{ marginTop: 0 }}>Neue Twilio-Nummer</h3>
            <label style={{ marginTop: 0 }}>Nummer (E.164)</label>
            <input placeholder="+49 …" value={number} onChange={(e) => setNumber(e.target.value)} />
            <AssistantSelect />
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 10 }}>Der Webhook wird automatisch bei Twilio konfiguriert.</p>
            <div className="row between" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setMode('choose')}>Zurück</button>
              <button className="btn" disabled={busy || assistants.length === 0} onClick={() => save('twilio', true)}>{busy ? 'Wird angelegt…' : 'Nummer hinzufügen'}</button>
            </div>
          </div>
        )}

        {mode === 'sip' && (
          <div>
            <Alert kind="info">Die direkte SIP-Trunk-Anbindung wird in Kürze verfügbar sein. Nutzen Sie bis dahin „Bestehende Nummer behalten".</Alert>
            <div className="row between" style={{ marginTop: 12 }}>
              <button className="btn secondary" onClick={() => setMode('choose')}>Zurück</button>
              <button className="btn" onClick={onClose}>Schließen</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
