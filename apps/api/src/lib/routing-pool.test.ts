import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseRoutingNumber } from './routing-pool.js';

const DE = { id: 'de1', country: 'DE' };
const AT = { id: 'at1', country: 'AT' };

test('chooseRoutingNumber: empty pool → null', () => {
  assert.equal(chooseRoutingNumber([]), null);
  assert.equal(chooseRoutingNumber([], 'DE'), null);
});

test('chooseRoutingNumber: prefers a number in the requested country', () => {
  assert.deepEqual(chooseRoutingNumber([AT, DE], 'DE'), DE);
});

test('chooseRoutingNumber: falls back to the first available when no country match', () => {
  assert.deepEqual(chooseRoutingNumber([AT], 'DE'), AT);
});

test('chooseRoutingNumber: no country preference → first available (FIFO)', () => {
  assert.deepEqual(chooseRoutingNumber([DE, AT]), DE);
});
