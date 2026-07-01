import assert from 'node:assert/strict';
import { test } from 'node:test';

// Config is read at import time — set env before importing the adapters.
process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.API_PUBLIC_URL = 'https://api.example.com';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-secret';
// Microsoft intentionally left unconfigured.
delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;

const { getCalendar, configuredCalendarProviders } = await import('./index.js');

test('factory maps providers to the right adapter', () => {
  assert.equal(getCalendar('google').provider, 'google');
  assert.equal(getCalendar('microsoft').provider, 'microsoft');
});

test('configured() reflects which client credentials are present', () => {
  assert.equal(getCalendar('google').configured(), true);
  assert.equal(getCalendar('microsoft').configured(), false);
  assert.deepEqual(configuredCalendarProviders(), ['google']);
});

test('google authorizeUrl carries client, redirect, offline access and state', () => {
  const url = getCalendar('google').authorizeUrl('STATE123');
  assert.match(url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  assert.match(url, /client_id=google-client-id/);
  assert.match(url, /access_type=offline/);
  assert.match(url, /state=STATE123/);
  assert.match(url, /integrations%2Fcalendar%2Fcallback/);
});
