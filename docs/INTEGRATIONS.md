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
4. During the call, when the caller states a date/time, the assistant parses it
   (natural language, DE + EN) in the tenant's timezone and checks the calendar's
   **free/busy**. If the slot is busy it does **not** book — it proposes free
   alternatives and asks again. If the date is unclear it asks again.
5. On call finalization the appointment is created on the tenant's **default
   calendar**, fail-closed: free/busy is re-checked immediately before booking,
   so a slot is never double-booked. The outcome (booked / conflict / failed /
   detected) is recorded on the call and never breaks the summary or emails.

## Free/busy conflict checks

- Google: [FreeBusy API](https://developers.google.com/calendar/api/v3/reference/freebusy/query).
- Microsoft: Graph `calendarView` (events with `showAs = free` are ignored).
- Both go through the `CalendarPort` (`getBusy`); conversation/finalization code
  never touches a provider directly. Slot maths and alternative-slot proposal
  are pure and unit-tested (`lib/calendar-availability.ts`); business hours are
  applied in the tenant timezone (`lib/timezone.ts`).

## Calendar selection

- The account's calendars are listed via `listCalendars`; the tenant picks a
  default under **Integrationen** and it is stored on the connection
  (`calendarId`). Bookings and free/busy always use it; Primary is the fallback.

## Natural-language date/time

`parseNaturalDateTime` (pure, `packages/shared/src/datetime-nl.ts`) understands
ISO, `DD.MM.YYYY [HH:MM]`, and German + English relative phrasing: "morgen um 14
Uhr", "übermorgen Nachmittag", "nächsten Dienstag um 10", "next Monday at 3pm",
"tomorrow afternoon", "in 3 Tagen", "halb drei". It returns wall-clock components
relative to the tenant-timezone "now"; the caller converts to UTC. When nothing
resolves it returns null → the assistant asks again.

## Where outcomes surface (UX)

- **Call protocol** (`/calls/:id`): a "Termin" block — detected / booked /
  conflict / failed, the calendar, a link to the event, and any error.
- **Dashboard**: a "Termine heute" widget with booked vs. failed/conflict counts.
- **Integrationen**: traffic-light status — green (connected), yellow (attention
  needed), red (disconnected/error) — plus "verbunden als", calendar picker,
  save default, test connection, disconnect.

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

`CallAppointment` — one per call: the booking outcome (booked / conflict /
failed / detected), provider, calendar, event id/link, and any error.

## Not included yet

- A manual "push to calendar" retry action on the call detail page.
- Attendee invites / reminders configuration.
