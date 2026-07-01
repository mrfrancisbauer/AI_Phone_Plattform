# Integrations: Calendar (Google & Microsoft Outlook)

When an appointment call captures a date/time, the assistant writes the event to
the tenant's connected calendar. The integration is provider-agnostic (a
`CalendarPort` with Google and Microsoft adapters, selected by a factory), so
adding a provider is a new adapter — call finalization never changes.

## How it works

1. A tenant admin connects their calendar under **Unternehmen → Integrationen**.
   The frontend calls `POST /api/integrations/calendar/:provider/connect`, which
   returns the provider consent URL, and the browser is redirected to it.
2. The provider redirects back to the **public** callback
   `GET $API_PUBLIC_URL/integrations/calendar/callback` with `code` + `state`.
   `state` is a short-lived signed JWT carrying the tenant/user identity (it is
   also the CSRF guard, since the callback has no session).
3. The backend exchanges the code for tokens and stores them **encrypted**
   (`calendar_connections`). Access tokens are refreshed transparently.
4. On call finalization, if a `datetime` answer was captured and the tenant has
   an active connection, the event is created **best-effort** — a failure is
   logged/audited and marks the connection `error` (prompting a reconnect), but
   never breaks the call summary or emails.

## Configuration

OAuth client credentials are platform-level env vars (all optional — absent =
the provider shows as "not available"):

| Provider | Env vars |
|----------|----------|
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| Microsoft | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_TENANT` (default `common`) |

**Redirect URI** to register in both OAuth apps:

```
$API_PUBLIC_URL/integrations/calendar/callback
```

**Scopes requested**

- Google: `calendar.events openid email` with `access_type=offline` (to obtain a
  refresh token).
- Microsoft: `offline_access openid email Calendars.ReadWrite`.

## Security

- Tokens are AES-256-GCM encrypted at rest and never returned to the frontend
  (`GET /api/integrations/calendar` only exposes provider, status, and the
  connected account email).
- `tenantId` always comes from the authenticated context; the OAuth callback
  derives it from the signed `state`, never from a query parameter.

## Data model

`CalendarConnection` — one per `(tenantId, provider)`: encrypted access/refresh
tokens, expiry, target `calendarId` (default `primary`), account email, status.

## Not included yet

- Free/busy conflict checks before booking.
- Choosing a non-primary calendar from the UI.
- A manual "push to calendar" action on the call detail page.
