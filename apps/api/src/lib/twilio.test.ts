import assert from 'node:assert/strict';
import { test } from 'node:test';

// Signature validation must be SKIPPED when TWILIO_VALIDATE_SIGNATURE=false
// (local development). Set env before importing the config-backed module.
process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.TWILIO_VALIDATE_SIGNATURE = 'false';

const { validateTwilioSignature } = await import('./twilio.js');

test('validateTwilioSignature returns true when validation is disabled', () => {
  // No signature header, no auth token — must still pass because it is disabled.
  assert.equal(validateTwilioSignature('https://api.example.com/webhooks/twilio/voice', { To: '+49', From: '+49' }, undefined), true);
});
