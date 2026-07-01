import assert from 'node:assert/strict';
import { test } from 'node:test';

// Adapters load config transitively; provide the required env before import.
process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
// Ensure Twilio looks unconfigured in this test regardless of the environment.
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

const { getTelephony, provisioningProvider } = await import('./index.js');

test('factory maps each provider to the right adapter', () => {
  assert.equal(getTelephony('twilio').provider, 'twilio');
  assert.equal(getTelephony('telnyx').provider, 'telnyx');
  assert.equal(getTelephony('sip').provider, 'sip');
});

test('twilio adapter cannot provision without credentials', () => {
  const twilio = getTelephony('twilio');
  assert.equal(twilio.configured(), false);
  assert.equal(twilio.canProvision(), false);
});

test('provisioningProvider is null when no provider is configured', () => {
  assert.equal(provisioningProvider(), null);
});

test('manual (sip) adapter: no provisioning, webhook wiring is a no-op URL', async () => {
  const manual = getTelephony('sip');
  assert.equal(manual.configured(), true);
  assert.equal(manual.canProvision(), false);
  await assert.rejects(() => manual.searchNumbers({ country: 'DE' }));
  await assert.rejects(() => manual.buyNumber('+493012345678'));
  const { voiceUrl } = await manual.setInboundWebhook('+493012345678');
  assert.match(voiceUrl, /\/webhooks\/twilio\/voice$/);
});

test('telnyx adapter is stubbed: provisioning rejects clearly', async () => {
  const telnyx = getTelephony('telnyx');
  assert.equal(telnyx.canProvision(), false);
  await assert.rejects(() => telnyx.buyNumber('+493012345678'), /Telnyx/);
});
