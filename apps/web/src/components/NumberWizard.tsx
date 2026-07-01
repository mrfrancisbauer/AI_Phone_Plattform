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
  /** Whether the platform can search & buy DIDs via a provider API. */
  canProvision: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Mode = 'choose' | 'carrier' | 'forward-setup' | 'forward-done' | 'purchase' | 'sip';
interface AvailableNumber { e164: string; friendlyName?: string }

function normalize(n: string) {
  return n.replace(/[^\d+]/g, '');
}
function isE164(n: string) {
  return /^\+[1-9]\d{6,14}$/.test(n);
}

/** Short, carrier-specific hint for setting up call forwarding. */
function forwardingHint(carrier: string): string {
  switch (carrier) {
    case 'Telekom':
      return 'Im Telekom-Kundencenter unter „Anrufweiterschaltung" alle Anrufe auf die Zielnummer umleiten (oder per Tastenkombination **21*Zielnummer#).';
    case 'Vodafone':
      return 'In der MeinVodafone-App/Telefonanlage die permanente Rufumleitung auf die Zielnummer aktivieren.';
    case 'O2':
      return 'Im o2-Kundenbereich unter „Rufumleitung" alle Anrufe dauerhaft auf die Zielnummer weiterleiten.';
    case 'Sipgate':
      return 'In sipgate unter „Routing" eine Weiterleitung der Rufnummer auf die Zielnummer einrichten.';
    case 'Placetel':
    case 'STARFACE':
    case '3CX':
    case 'NFON':
    case 'Microsoft Teams':
      return `In Ihrer ${carrier}-Telefonanlage eine Rufumleitung/Routing-Regel auf die Zielnummer anlegen.`;
    default:
      return 'Richten Sie in Ihrem Anschluss/Ihrer Telefonanlage eine dauerhafte Rufumleitung auf die Zielnummer ein.';
  }
}

export function NumberWizard({ assistants, webhookUrl, canProvision, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [carrier, setCarrier] = useState('Telekom');
  const [ownNumber, setOwnNumber] = useState('');
  const [assistantId, setAssistantId] = useState(assistants.length === 1 ? assistants[0]!.id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The routing number the platform auto-assigned (shown after "keep number").
  const [routingNumber, setRoutingNumber] = useState('');
  // Purchase path.
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searched, setSearched] = useState(false);

  function assistantOk(): boolean {
    if (assistants.length === 0) {
      setError('Bitte zuerst einen Assistenten erstellen, bevor eine Telefonnummer hinzugefügt werden kann.');
      return false;
    }
    if (assistants.length > 1 && !assistantId) {
      setError('Bitte einen Assistenten auswählen.');
      return false;
    }
    return true;
  }

  // "Keep your number": the customer supplies only their own number; the
  // platform auto-assigns a routing DID from the pool and returns it so we can
  // show exactly where to forward. No routing number is typed by hand.
  async function saveForward() {
    setError('');
    const own = normalize(ownNumber);
    if (!isE164(own)) {
      setError('Bitte Ihre Rufnummer im Format +49… (mit Ländervorwahl, ohne Leerzeichen) angeben.');
      return;
    }
    if (!assistantOk()) return;
    setBusy(true);
    try {
      const res = await api<{ routingNumber: string }>('/api/phone-numbers/keep-number', {
        method: 'POST',
        body: JSON.stringify({ displayNumber: own, assistantId: assistantId || undefined }),
      });
      setRoutingNumber(res.routingNumber);
      setMode('forward-done');
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
      setBusy(false);
    }
  }

  async function search() {
    setError('');
    setBusy(true);
    try {
      const res = await api<{ numbers: AvailableNumber[] }>('/api/phone-numbers/available?country=DE');
      setResults(res.numbers);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Nummernsuche');
    } finally {
      setBusy(false);
    }
  }

  async function buy(e164: string) {
    setError('');
    if (!assistantOk()) return;
    setBusy(true);
    try {
      await api('/api/phone-numbers/purchase', {
        method: 'POST',
        body: JSON.stringify({ e164, assistantId: assistantId || undefined }),
      });
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
              <span className="choice-sub">Ihre vorhandene Rufnummer per Weiterleitung anbinden — kein Nummernwechsel, kein Providerwechsel nötig.</span>
            </button>
            <button className="choice" onClick={() => setMode('purchase')} disabled={!canProvision}>
              <span className="choice-title">Neue Nummer bereitstellen {!canProvision && <span className="muted">(nicht verfügbar)</span>}</span>
              <span className="choice-sub">Sofort eine neue Rufnummer über die Plattform buchen — wird direkt angerufen.</span>
            </button>
            <button className="choice" onClick={() => setMode('sip')}>
              <span className="choice-title">SIP-Trunk verbinden</span>
              <span className="choice-sub">Direkte SIP-Anbindung Ihrer Telefonanlage.</span>
              <span className="choice-badge">Für Fortgeschrittene</span>
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
              <button className="btn" onClick={() => setMode('forward-setup')}>Weiter</button>
            </div>
          </div>
        )}

        {mode === 'forward-setup' && (
          <div>
            <h3 style={{ marginTop: 0 }}>So behalten Sie Ihre {carrier}-Nummer</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Sie behalten Ihre Rufnummer und Ihren Vertrag. Wir stellen Ihnen automatisch eine
              Weiterleitungsnummer bereit — dort nimmt Ihr Assistent ab.
            </p>

            <div className="guide-step">
              <span className="guide-num">1</span>
              <div style={{ flex: 1 }}>
                <strong>Ihre bestehende Rufnummer</strong>
                <div style={{ marginTop: 6 }}>
                  <input placeholder="+49 …" value={ownNumber} onChange={(e) => setOwnNumber(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="guide-step">
              <span className="guide-num">2</span>
              <div style={{ flex: 1 }}>
                <strong>Assistent zuordnen</strong>
                <AssistantSelect />
              </div>
            </div>

            <Alert kind="info">
              Im nächsten Schritt erhalten Sie Ihre persönliche Weiterleitungsnummer und eine
              Anleitung für {carrier}.
            </Alert>

            <div className="row between" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setMode('carrier')}>Zurück</button>
              <button className="btn" disabled={busy || assistants.length === 0} onClick={saveForward}>{busy ? 'Wird bereitgestellt…' : 'Weiterleitungsnummer erhalten'}</button>
            </div>
          </div>
        )}

        {mode === 'forward-done' && (
          <div>
            <h3 style={{ marginTop: 0 }}>Fast fertig — jetzt Weiterleitung einrichten</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Ihre Rufnummer <strong>{normalize(ownNumber)}</strong> ist verbunden. Leiten Sie
              eingehende Anrufe bei {carrier} auf diese Nummer weiter:
            </p>

            <div className="guide-step">
              <span className="guide-num">1</span>
              <div style={{ flex: 1 }}>
                <strong>Weiterleitungs-Zielnummer</strong>
                <div style={{ marginTop: 6 }}><CopyField value={routingNumber} /></div>
              </div>
            </div>

            <div className="guide-step">
              <span className="guide-num">2</span>
              <div style={{ flex: 1 }}>
                <strong>Weiterleitung bei {carrier} aktivieren</strong>
                <p className="muted" style={{ margin: '2px 0 0' }}>{forwardingHint(carrier)}</p>
              </div>
            </div>

            <Alert kind="info">
              Die Nummer steht zunächst auf „Warte auf ersten Anruf". Sobald ein weitergeleiteter
              Anruf eingeht, wird die Weiterleitung automatisch als aktiv bestätigt.
            </Alert>

            <div className="row between" style={{ marginTop: 18 }}>
              <span />
              <button className="btn" onClick={onCreated}>Fertig</button>
            </div>
          </div>
        )}

        {mode === 'purchase' && (
          <div>
            <h3 style={{ marginTop: 0 }}>Neue Rufnummer bereitstellen</h3>
            <AssistantSelect />
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button className="btn secondary" disabled={busy} onClick={search}>{busy ? 'Suche…' : 'Verfügbare Nummern suchen'}</button>
            </div>
            {searched && results.length === 0 && (
              <Alert kind="info">Derzeit sind keine Nummern verfügbar. Nutzen Sie „Bestehende Nummer behalten".</Alert>
            )}
            {results.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.e164}>
                        <td><strong>{r.e164}</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn sm" disabled={busy || assistants.length === 0} onClick={() => buy(r.e164)}>Buchen</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row between" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setMode('choose')}>Zurück</button>
            </div>
          </div>
        )}

        {mode === 'sip' && (
          <div>
            <h3 style={{ marginTop: 0 }}>SIP-Trunk verbinden</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Richten Sie in Ihrer Telefonanlage eine Route auf die folgende Webhook-/Ziel-URL ein.
              Die genaue Anbindung stimmen wir individuell mit Ihnen ab.
            </p>
            <CopyField value={webhookUrl} />
            <Alert kind="info" >Für die meisten Kunden ist „Bestehende Nummer behalten" einfacher — SIP eignet sich für eigene Telefonanlagen.</Alert>
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
