'use client';

import { useState, type ReactNode } from 'react';

export function HeroHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="hero-head row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row" style={{ flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

/** A settings section with header, body and an optional sticky footer of actions. */
export function SettingCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="setting-card">
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ marginTop: 0 }}>{label}</label>
      {children}
      {hint && <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <div className="switch-row">
      <div className="switch-text">
        <strong>
          {label} {badge && <span className="choice-badge">{badge}</span>}
        </strong>
        {description && <span>{description}</span>}
      </div>
      <button
        type="button"
        className={`switch${checked ? ' on' : ''}`}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
      />
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <div className="copy-field">
      <code>{value}</code>
      <button className="btn secondary sm" onClick={copy}>{copied ? '✓ Kopiert' : 'Kopieren'}</button>
    </div>
  );
}

/** "Prepared / coming soon" banner for surfaces not yet backed by the API. */
export function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="alert alert-info" role="status">
      <span className="alert-ico">✨</span>
      <span>{children}</span>
    </div>
  );
}
