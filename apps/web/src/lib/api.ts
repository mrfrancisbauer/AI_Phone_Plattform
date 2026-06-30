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
    // Technical detail stays in the console for developers; never in the UI.
    if (typeof console !== 'undefined') {
      console.error(`[api] ${options.method ?? 'GET'} ${path} → ${res.status}`, body);
    }
    throw new ApiError(res.status, formatApiError(body, res.status), body);
  }

  if (options.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Map an API error to a friendly, user-facing German message. Raw technical
 * details (stack traces, crypto/DB errors) are NEVER shown — they stay in the
 * server logs / browser console. Status codes drive the message; only
 * intentional domain messages (validation, conflicts) are surfaced.
 */
function formatApiError(body: unknown, status: number): string {
  const b = (typeof body === 'object' && body ? body : {}) as {
    message?: string;
    error?: string;
    issues?: { path?: (string | number)[]; message?: string }[];
  };

  switch (status) {
    case 401:
      return 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.';
    case 403:
      return 'Sie haben keine Berechtigung für diese Aktion.';
    case 404:
      return 'Der Eintrag wurde nicht gefunden.';
    case 429:
      return 'Zu viele Anfragen. Bitte versuchen Sie es in einem Moment erneut.';
  }
  if (status === 400) {
    // Validation errors are domain-level and safe to show as a hint.
    if (b.issues?.length) {
      const first = b.issues[0]?.message;
      return first ? `Bitte überprüfen Sie Ihre Eingaben: ${first}` : 'Bitte überprüfen Sie Ihre Eingaben.';
    }
    return b.message && b.message.length < 160 ? b.message : 'Bitte überprüfen Sie Ihre Eingaben.';
  }
  if (status === 409) {
    return b.message && b.message.length < 160 ? b.message : 'Der Eintrag existiert bereits.';
  }
  // 500 and anything unexpected → generic, never raw.
  return 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.';
}

export { API_URL };
