import assert from 'node:assert/strict';
import { test } from 'node:test';

// Ensure required env exists before importing config-dependent modules.
process.env.ENCRYPTION_KEY ??= '11'.repeat(32);
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';

const { encrypt, decrypt, blindHash, tryDecrypt } = await import('./crypto.js');

test('encrypt/decrypt round-trips PII', () => {
  const plain = '+4930123456789';
  const ct = encrypt(plain);
  assert.notEqual(ct, plain);
  assert.equal(decrypt(ct), plain);
});

test('encrypt is non-deterministic (random IV) but decrypts equally', () => {
  const a = encrypt('hello');
  const b = encrypt('hello');
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test('blindHash is deterministic for equal input', () => {
  assert.equal(blindHash('+4930123456789'), blindHash('+4930123456789'));
  assert.notEqual(blindHash('+4930123456789'), blindHash('+4930000000000'));
});

test('tryDecrypt returns null on undecryptable data instead of throwing', () => {
  assert.equal(tryDecrypt(encrypt('hello')), 'hello');
  assert.equal(tryDecrypt(null), null);
  // Garbage / wrong-key ciphertext must not throw (would otherwise 500 a page).
  assert.equal(tryDecrypt('not-valid-ciphertext'), null);
  assert.equal(tryDecrypt(Buffer.from('x'.repeat(40)).toString('base64')), null);
});
