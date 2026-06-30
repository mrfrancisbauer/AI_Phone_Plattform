/**
 * Thin API client for the dashboard. Attaches the session JWT (stored in
 * localStorage) as a Bearer token. The tenantId is NEVER sent from here — the
 * API derives it from the token, so the frontend cannot spoof a tenant.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'ai_phone_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && typeof window !== 'undefined') {
    clearToken();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, formatApiError(body, res.status), body);
  }

  if (options.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Turn an API error body into a single human-readable German message. */
function formatApiError(body: unknown, status: number): string {
  if (typeof body === 'string' && body.trim()) return body;
  const b = body as { message?: string; error?: string; issues?: { path?: (string | number)[]; message?: string }[] };
  if (b?.issues?.length) {
    return b.issues
      .map((i) => `${(i.path ?? []).join('.') || 'Eingabe'}: ${i.message ?? 'ungültig'}`)
      .join(' · ');
  }
  if (b?.message) return b.message;
  const fallback: Record<number, string> = {
    401: 'Nicht angemeldet oder Sitzung abgelaufen.',
    403: 'Keine Berechtigung für diese Aktion.',
    404: 'Nicht gefunden.',
    409: 'Konflikt — der Eintrag existiert bereits.',
    429: 'Zu viele Anfragen. Bitte kurz warten.',
  };
  return fallback[status] ?? `Anfrage fehlgeschlagen (${status}).`;
}

export { API_URL };
