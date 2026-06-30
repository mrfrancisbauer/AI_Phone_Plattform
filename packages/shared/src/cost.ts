/**
 * Cost calculation logic.
 *
 * A call's cost is the sum of four raw provider costs plus a configurable
 * platform markup:
 *
 *   telephony  = minutes * telephonyPerMinute
 *   stt        = minutes * sttPerMinute
 *   tts        = minutes * ttsPerMinute
 *   llm        = (inputTokens/1000)*inputPer1k + (outputTokens/1000)*outputPer1k
 *   subtotal   = telephony + stt + tts + llm
 *   markup     = subtotal * markupPercent
 *   total      = subtotal + markup
 *
 * All monetary values are in the platform's billing currency (default EUR)
 * and rounded to 6 decimals internally; presentation rounding (e.g. to cents)
 * is the UI's responsibility. Keeping this pure makes it trivially testable
 * and reusable in the dashboard's per-call cost calculator.
 */

export interface CostRates {
  /** Telephony carrier cost per minute. */
  telephonyPerMinute: number;
  /** Speech-to-text cost per minute. */
  sttPerMinute: number;
  /** Text-to-speech cost per minute. */
  ttsPerMinute: number;
  /** LLM input price per 1,000 tokens. */
  llmInputPer1k: number;
  /** LLM output price per 1,000 tokens. */
  llmOutputPer1k: number;
  /** Platform markup as a fraction (0.30 = +30%). */
  markupPercent: number;
}

export interface CostUsage {
  durationSeconds: number;
  llmInputTokens: number;
  llmOutputTokens: number;
}

export interface CostBreakdown {
  durationSeconds: number;
  telephonyCost: number;
  sttCost: number;
  ttsCost: number;
  llmCost: number;
  /** Sum of the four raw provider costs (before markup). */
  providerSubtotal: number;
  platformMarkup: number;
  totalCost: number;
}

/** Round to 6 decimal places to avoid floating point dust accumulating. */
function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

/**
 * Compute the full per-call cost breakdown from raw usage and tenant/platform
 * rates. Negative inputs are clamped to zero so a malformed usage event can
 * never produce a negative invoice line.
 */
export function calculateCallCost(usage: CostUsage, rates: CostRates): CostBreakdown {
  const seconds = Math.max(0, usage.durationSeconds);
  const minutes = seconds / 60;
  const inputTokens = Math.max(0, usage.llmInputTokens);
  const outputTokens = Math.max(0, usage.llmOutputTokens);

  const telephonyCost = round6(minutes * rates.telephonyPerMinute);
  const sttCost = round6(minutes * rates.sttPerMinute);
  const ttsCost = round6(minutes * rates.ttsPerMinute);
  const llmCost = round6(
    (inputTokens / 1000) * rates.llmInputPer1k +
      (outputTokens / 1000) * rates.llmOutputPer1k,
  );

  const providerSubtotal = round6(telephonyCost + sttCost + ttsCost + llmCost);
  const platformMarkup = round6(providerSubtotal * Math.max(0, rates.markupPercent));
  const totalCost = round6(providerSubtotal + platformMarkup);

  return {
    durationSeconds: seconds,
    telephonyCost,
    sttCost,
    ttsCost,
    llmCost,
    providerSubtotal,
    platformMarkup,
    totalCost,
  };
}

/** Which budget alert thresholds a new spend total has newly crossed. */
export function crossedBudgetThresholds(
  previousSpend: number,
  newSpend: number,
  monthlyLimit: number,
  thresholds: ReadonlyArray<number>,
): number[] {
  if (monthlyLimit <= 0) return [];
  const prevFraction = previousSpend / monthlyLimit;
  const newFraction = newSpend / monthlyLimit;
  return thresholds.filter((t) => prevFraction < t && newFraction >= t);
}
