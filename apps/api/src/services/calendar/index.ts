/**
 * Calendar port factory. Event creation and OAuth flow go through the adapter
 * returned here, keyed on the provider, so adding a provider is a new adapter.
 */
import { CALENDAR_PROVIDERS, type CalendarProvider } from '@ai-phone/shared';
import { GoogleCalendarAdapter } from './google.js';
import { MicrosoftCalendarAdapter } from './microsoft.js';
import type { CalendarPort } from './types.js';

export type { CalendarPort, OAuthTokens, CreatedEvent, CalendarInfo, BusyInterval } from './types.js';

export function getCalendar(provider: CalendarProvider): CalendarPort {
  switch (provider) {
    case 'google':
      return new GoogleCalendarAdapter();
    case 'microsoft':
      return new MicrosoftCalendarAdapter();
  }
}

/** Which calendar providers have OAuth credentials configured right now. */
export function configuredCalendarProviders(): CalendarProvider[] {
  return CALENDAR_PROVIDERS.filter((p) => getCalendar(p).configured());
}
