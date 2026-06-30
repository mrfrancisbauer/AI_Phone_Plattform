'use client';

import type { ReactNode } from 'react';

/** Page header with optional actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="ac-pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Card({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  return (
    <div className="ac-card">
      {(title || actions) && (
        <div className="ac-card-head">
          {title && <h3 style={{ margin: 0 }}>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: 'green' | 'red' | 'blue' }) {
  return (
    <div className="ac-stat">
      <div className="ac-stat-label">{label}</div>
      <div className={`ac-stat-value${accent ? ` ac-${accent}` : ''}`}>{value}</div>
      {hint && <div className="ac-stat-hint">{hint}</div>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ok: '#22c55e', active: '#22c55e', completed: '#22c55e', sent: '#22c55e',
  warn: '#f59e0b', console: '#f59e0b', pending: '#f59e0b', running: '#f59e0b',
  down: '#ef4444', failed: '#ef4444', error: '#ef4444', paused: '#ef4444', locked: '#ef4444',
  not_configured: '#9ca3af', info: '#6b7280',
};

export function StatusDot({ status, label }: { status: string; label?: string }) {
  const color = STATUS_COLORS[status] ?? '#9ca3af';
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }} />
      <span>{label ?? status}</span>
    </span>
  );
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return <span className="ac-badge" style={color ? { background: color } : undefined}>{children}</span>;
}

/** Minimal dependency-free bar chart. */
export function Bars({ data, color = '#2563eb', height = 140, format }: { data: { date: string; value: number }[]; color?: string; height?: number; format?: (v: number) => string }) {
  if (!data.length) return <p className="muted">Keine Daten.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.map((d) => (
        <div key={d.date} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={`${d.date}: ${format ? format(d.value) : d.value}`}>
          <div style={{ height: `${(d.value / max) * (height - 24)}px`, background: color, borderRadius: '3px 3px 0 0', minHeight: d.value > 0 ? 2 : 0 }} />
          <div className="ac-bar-label">{d.date.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

/** Donut for the lead distribution. */
export function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s.value;
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(', ');
  return (
    <div className="row" style={{ gap: 20 }}>
      <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${stops})` }} />
      <div>
        {segments.map((s) => (
          <div key={s.label} className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ac-toolbar">{children}</div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="row between" style={{ marginTop: 12 }}>
      <span className="muted" style={{ fontSize: '0.85rem' }}>{total} Einträge · Seite {page}/{pages}</span>
      <div className="row">
        <button className="btn secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Zurück</button>
        <button className="btn secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Weiter</button>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="ac-empty muted">{children}</div>;
}

export function Spinner({ label = 'Lädt…' }: { label?: string }) {
  return <p className="muted">{label}</p>;
}

/** Inline alert for errors / success / info / warnings. */
export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  if (!children) return null;
  const ico = { error: '⚠', success: '✓', info: 'ℹ', warning: '⚠' }[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="alert-ico">{ico}</span>
      <span>{children}</span>
    </div>
  );
}
