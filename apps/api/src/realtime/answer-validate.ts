/**
 * Validation for save_answer tool calls (pure). The LLM output is untrusted —
 * every value is checked against the question's type before it is persisted,
 * mirroring the semantics of the turn-based normalizeAnswer.
 */
import type { PromptQuestion } from './prompt.js';

export type ValidationResult = { ok: true; value: unknown } | { ok: false; reason: string };

export function validateAnswerValue(q: PromptQuestion, value: unknown): ValidationResult {
  switch (q.type) {
    case 'yes_no': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'ja' || value === 'yes' || value === 'true') return { ok: true, value: true };
      if (value === 'nein' || value === 'no' || value === 'false') return { ok: true, value: false };
      return { ok: false, reason: 'yes_no erwartet true/false' };
    }
    case 'scale': {
      const n = typeof value === 'number' ? value : Number(value);
      const min = q.scaleMin ?? 1;
      const max = q.scaleMax ?? 10;
      if (Number.isFinite(n) && n >= min && n <= max) return { ok: true, value: n };
      return { ok: false, reason: `scale erwartet Zahl ${min}–${max}` };
    }
    case 'email': {
      const s = String(value ?? '').trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: true, value: s };
      return { ok: false, reason: 'ungültige E-Mail' };
    }
    case 'phone': {
      const digits = String(value ?? '').replace(/[^\d+]/g, '');
      if (digits.replace(/\D/g, '').length >= 7) return { ok: true, value: digits };
      return { ok: false, reason: 'ungültige Telefonnummer' };
    }
    case 'multiple_choice': {
      const s = String(value ?? '').toLowerCase();
      const opt = (q.options ?? []).find(
        (o) => o.value.toLowerCase() === s || o.label.toLowerCase() === s,
      );
      if (opt) return { ok: true, value: opt.value };
      return { ok: false, reason: `erwartet eine der Optionen: ${(q.options ?? []).map((o) => o.value).join(', ')}` };
    }
    case 'urgency': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(n) && n >= 0 && n <= 1) return { ok: true, value: n };
      return { ok: false, reason: 'urgency erwartet Zahl 0–1' };
    }
    case 'budget': {
      if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
      const s = String(value ?? '').trim();
      if (s) return { ok: true, value: s };
      return { ok: false, reason: 'leerer Budget-Wert' };
    }
    case 'datetime':
    case 'free_text':
    default: {
      const s = String(value ?? '').trim();
      if (s) return { ok: true, value: s };
      return { ok: false, reason: 'leerer Wert' };
    }
  }
}
