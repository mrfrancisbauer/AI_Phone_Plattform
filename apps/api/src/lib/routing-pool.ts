/**
 * Pure routing-number pool selection (no DB / no framework) so it can be unit
 * tested. Given the currently-available pool numbers, decide which one to hand
 * to a tenant. Preference: a number in the tenant's own country, otherwise the
 * first available (FIFO — callers pass them already ordered by age).
 */
export interface PoolCandidate {
  id: string;
  country: string;
}

export function chooseRoutingNumber(
  available: PoolCandidate[],
  country?: string | null,
): PoolCandidate | null {
  if (available.length === 0) return null;
  if (country) {
    const sameCountry = available.find((n) => n.country === country);
    if (sameCountry) return sameCountry;
  }
  return available[0] ?? null;
}
