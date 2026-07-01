import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyInbound,
  inboundLogLevel,
  resolveAssistantForNumber,
  type InboundPhone,
} from './phone-routing.js';

const A = [{ id: 'a1', name: 'One' }];
const AB = [
  { id: 'a1', name: 'One' },
  { id: 'a2', name: 'Two' },
];

test('resolveAssistantForNumber: explicit id belonging to the tenant is accepted', () => {
  assert.deepEqual(resolveAssistantForNumber(AB, 'a2'), { ok: true, assistantId: 'a2' });
});

test('resolveAssistantForNumber: explicit id NOT belonging to the tenant is rejected', () => {
  const r = resolveAssistantForNumber(AB, 'other');
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /gehört nicht zu diesem Mandanten/);
});

test('resolveAssistantForNumber: single assistant is auto-selected', () => {
  assert.deepEqual(resolveAssistantForNumber(A), { ok: true, assistantId: 'a1' });
});

test('resolveAssistantForNumber: no assistant → must create one first', () => {
  const r = resolveAssistantForNumber([]);
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /zuerst einen Assistenten erstellen/);
});

test('resolveAssistantForNumber: multiple assistants require an explicit choice', () => {
  const r = resolveAssistantForNumber(AB);
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /einen Assistenten für diese Telefonnummer auswählen/);
});

const base: InboundPhone = { active: true, assistant: { id: 'a1' }, tenant: { paused: false } };

test('classifyInbound: healthy number is reachable', () => {
  assert.deepEqual(classifyInbound(base), { reachable: true, reason: 'ok' });
});
test('classifyInbound: missing number → not_found', () => {
  assert.deepEqual(classifyInbound(null), { reachable: false, reason: 'not_found' });
});
test('classifyInbound: inactive number → inactive', () => {
  assert.deepEqual(classifyInbound({ ...base, active: false }), { reachable: false, reason: 'inactive' });
});
test('classifyInbound: no assistant → no_assistant', () => {
  assert.deepEqual(classifyInbound({ ...base, assistant: null }), { reachable: false, reason: 'no_assistant' });
});
test('classifyInbound: paused tenant → paused', () => {
  assert.deepEqual(classifyInbound({ ...base, tenant: { paused: true } }), { reachable: false, reason: 'paused' });
});

test('inboundLogLevel: ok is info, everything else is warn', () => {
  assert.equal(inboundLogLevel('ok'), 'info');
  assert.equal(inboundLogLevel('not_found'), 'warn');
  assert.equal(inboundLogLevel('inactive'), 'warn');
  assert.equal(inboundLogLevel('no_assistant'), 'warn');
  assert.equal(inboundLogLevel('paused'), 'warn');
});
