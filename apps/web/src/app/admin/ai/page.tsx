'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Card, PageHeader, Spinner } from '@/components/admin/ui';

interface AiSettings { defaultModel: string; fallbackModel: string; temperature: number; maxTokens: number; voice: string }
interface Prompt { id: string; version: number; label: string | null; content: string; active: boolean; createdBy: string | null; createdAt: string }

export default function AiPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [newPrompt, setNewPrompt] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const r = await api<{ settings: AiSettings; prompts: Prompt[] }>('/api/admin/ai');
    setSettings(r.settings); setPrompts(r.prompts);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 3000); }

  async function saveSettings() {
    if (!settings) return;
    await api('/api/admin/ai', { method: 'PUT', body: JSON.stringify(settings) });
    flash('Einstellungen gespeichert.');
  }
  async function createPrompt(activate: boolean) {
    if (!newPrompt.trim()) return;
    await api('/api/admin/ai/prompts', { method: 'POST', body: JSON.stringify({ content: newPrompt, label: label || undefined, activate }) });
    setNewPrompt(''); setLabel(''); await load(); flash('Prompt-Version gespeichert.');
  }
  async function activate(id: string) {
    await api(`/api/admin/ai/prompts/${id}/activate`, { method: 'POST' }); await load();
  }

  if (error) return <p className="error">{error}</p>;
  if (!settings) return <Spinner />;

  return (
    <>
      <PageHeader title="KI" subtitle="Globale KI-Einstellungen und Prompt-Versionierung" />
      {msg && <p className="success">{msg}</p>}

      <Card title="Globale Einstellungen">
        <div className="ac-grid k3">
          <div><label>Default Modell</label><input value={settings.defaultModel} onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })} /></div>
          <div><label>Fallback Modell</label><input value={settings.fallbackModel} onChange={(e) => setSettings({ ...settings, fallbackModel: e.target.value })} /></div>
          <div><label>Voice</label><input value={settings.voice} onChange={(e) => setSettings({ ...settings, voice: e.target.value })} /></div>
          <div><label>Temperature</label><input type="number" step="0.1" min="0" max="2" value={settings.temperature} onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })} /></div>
          <div><label>Max Tokens</label><input type="number" value={settings.maxTokens} onChange={(e) => setSettings({ ...settings, maxTokens: Number(e.target.value) })} /></div>
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={saveSettings}>Speichern</button>
      </Card>

      <div style={{ marginTop: '1rem' }}>
        <Card title="Globaler System Prompt — neue Version">
          <label>Label (optional)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. 'Freundlicher Ton v2'" />
          <label>Inhalt</label>
          <textarea rows={6} value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn secondary" onClick={() => createPrompt(false)}>Als Entwurf speichern</button>
            <button className="btn" onClick={() => createPrompt(true)}>Speichern &amp; aktivieren</button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <Card title="Versionen">
          <table>
            <thead><tr><th>Version</th><th>Label</th><th>Status</th><th>Erstellt</th><th></th></tr></thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id}>
                  <td>v{p.version}</td>
                  <td>{p.label ?? '–'}</td>
                  <td>{p.active ? <Badge color="#16a34a">aktiv</Badge> : <span className="muted">inaktiv</span>}</td>
                  <td className="muted">{dateTime(p.createdAt)}</td>
                  <td>{!p.active && <button className="btn secondary" onClick={() => activate(p.id)}>Rollback / Aktivieren</button>}</td>
                </tr>
              ))}
              {prompts.length === 0 && <tr><td colSpan={5} className="muted">Keine Versionen.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
