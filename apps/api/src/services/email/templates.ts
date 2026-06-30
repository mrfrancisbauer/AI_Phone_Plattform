/**
 * Email templates.
 *
 * Two audiences:
 *  - tenant_summary:  internal email to the tenant's team. Contains everything
 *    including lead score and estimated cost.
 *  - caller_summary:  friendly email to the caller (only when they gave their
 *    email AND consented). Contains NO internal ratings/costs.
 *
 * Templates return both an HTML and a plaintext body. Everything is escaped to
 * avoid injection from transcribed caller input.
 */
import type { CostBreakdown, LeadCategory } from '@ai-phone/shared';

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n);
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')} min`;
}

export interface TenantSummaryData {
  tenantName: string;
  callerName: string | null;
  callerPhone: string | null;
  callerEmail: string | null;
  concern: string | null;
  answers: Array<{ question: string; answer: string }>;
  summary: string;
  recommendedAction: string;
  leadCategory: LeadCategory;
  durationSeconds: number;
  cost: CostBreakdown;
  startedAt: Date;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderTenantSummary(d: TenantSummaryData): RenderedEmail {
  const when = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d.startedAt);

  const subject = `Neuer Anruf (${d.leadCategory}-Lead)${
    d.callerName ? ` von ${d.callerName}` : ''
  } – ${d.tenantName}`;

  const answerRows = d.answers
    .map(
      (a) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${esc(
          a.question,
        )}</td><td style="padding:4px 0"><strong>${esc(a.answer)}</strong></td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:auto">
  <h2 style="margin-bottom:4px">Neuer Anruf zusammengefasst</h2>
  <p style="color:#666;margin-top:0">${esc(when)} · ${esc(fmtDuration(d.durationSeconds))}</p>
  <span style="display:inline-block;background:#111;color:#fff;border-radius:4px;padding:2px 10px;font-weight:600">Lead: ${d.leadCategory}</span>
  <h3>Kontakt</h3>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:2px 12px 2px 0;color:#555">Name</td><td>${esc(d.callerName) || '–'}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">Telefon</td><td>${esc(d.callerPhone) || '–'}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">E-Mail</td><td>${esc(d.callerEmail) || '–'}</td></tr>
  </table>
  <h3>Anliegen</h3>
  <p>${esc(d.concern) || '–'}</p>
  <h3>Antworten aus dem Fragebogen</h3>
  <table style="border-collapse:collapse;font-size:14px">${answerRows}</table>
  <h3>Gesprächszusammenfassung</h3>
  <p>${esc(d.summary)}</p>
  <h3>Empfohlene nächste Aktion</h3>
  <p>${esc(d.recommendedAction)}</p>
  <h3>Kosten (geschätzt)</h3>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:2px 12px 2px 0;color:#555">Telefonie</td><td>${fmtMoney(d.cost.telephonyCost)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">Speech-to-Text</td><td>${fmtMoney(d.cost.sttCost)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">Text-to-Speech</td><td>${fmtMoney(d.cost.ttsCost)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">KI-Modell</td><td>${fmtMoney(d.cost.llmCost)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">Plattformaufschlag</td><td>${fmtMoney(d.cost.platformMarkup)}</td></tr>
    <tr><td style="padding:4px 12px 2px 0;font-weight:600">Gesamt</td><td style="font-weight:600">${fmtMoney(d.cost.totalCost)}</td></tr>
  </table>
  <hr style="margin-top:24px;border:none;border-top:1px solid #eee">
  <p style="color:#999;font-size:12px">Automatisch erstellt vom KI-Telefonassistenten.</p>
  </body></html>`;

  const text = [
    `Neuer Anruf (${d.leadCategory}-Lead) – ${d.tenantName}`,
    `${when} · ${fmtDuration(d.durationSeconds)}`,
    '',
    `Name: ${d.callerName ?? '–'}`,
    `Telefon: ${d.callerPhone ?? '–'}`,
    `E-Mail: ${d.callerEmail ?? '–'}`,
    '',
    `Anliegen: ${d.concern ?? '–'}`,
    '',
    'Antworten:',
    ...d.answers.map((a) => `  - ${a.question}: ${a.answer}`),
    '',
    `Zusammenfassung: ${d.summary}`,
    `Empfohlene Aktion: ${d.recommendedAction}`,
    '',
    `Kosten gesamt (geschätzt): ${fmtMoney(d.cost.totalCost)}`,
  ].join('\n');

  return { subject, html, text };
}

export interface CallerSummaryData {
  tenantName: string;
  callerName: string | null;
  summary: string;
  nextSteps: string;
  contact: { phone?: string; email?: string; website?: string };
}

export function renderCallerSummary(d: CallerSummaryData): RenderedEmail {
  const subject = `Ihre Anfrage bei ${d.tenantName}`;
  const contactLines = [
    d.contact.phone ? `Telefon: ${esc(d.contact.phone)}` : '',
    d.contact.email ? `E-Mail: ${esc(d.contact.email)}` : '',
    d.contact.website ? `Web: ${esc(d.contact.website)}` : '',
  ].filter(Boolean);

  const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:auto">
  <h2>Vielen Dank für Ihren Anruf${d.callerName ? `, ${esc(d.callerName)}` : ''}!</h2>
  <p>hier eine kurze Zusammenfassung Ihres Anliegens:</p>
  <blockquote style="border-left:3px solid #111;margin:0;padding:8px 16px;color:#333">${esc(d.summary)}</blockquote>
  <h3>Nächste Schritte</h3>
  <p>${esc(d.nextSteps)}</p>
  ${contactLines.length ? `<h3>Kontakt</h3><p>${contactLines.join('<br>')}</p>` : ''}
  <p style="margin-top:24px">Herzliche Grüße<br>${esc(d.tenantName)}</p>
  </body></html>`;

  const text = [
    `Vielen Dank für Ihren Anruf${d.callerName ? `, ${d.callerName}` : ''}!`,
    '',
    'Zusammenfassung Ihres Anliegens:',
    d.summary,
    '',
    'Nächste Schritte:',
    d.nextSteps,
    ...(contactLines.length ? ['', 'Kontakt:', ...contactLines] : []),
    '',
    `Herzliche Grüße`,
    d.tenantName,
  ].join('\n');

  return { subject, html, text };
}

export function renderBudgetAlert(
  tenantName: string,
  thresholdPercent: number,
  spend: number,
  limit: number,
): RenderedEmail {
  const subject = `⚠️ Budgetwarnung (${Math.round(thresholdPercent * 100)}%) – ${tenantName}`;
  const body = `Ihr Telefonassistent-Budget hat ${Math.round(
    thresholdPercent * 100,
  )} % erreicht.\n\nVerbraucht: ${fmtMoney(spend)} von ${fmtMoney(limit)}.`;
  return {
    subject,
    text: body,
    html: `<p>${esc(body).replace(/\n/g, '<br>')}</p>`,
  };
}
