import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyEndOfCall, isFinalTwilioStatus, parseCallDuration } from './call-lifecycle.js';

test('non-final Twilio statuses are ignored', () => {
  for (const s of ['queued', 'ringing', 'in-progress', 'initiated']) {
    assert.equal(isFinalTwilioStatus(s), false);
    assert.equal(classifyEndOfCall({ twilioStatus: s, callStatus: 'in_progress', consentGiven: true, answerCount: 3 }), 'ignore');
  }
});

test('hang-up mid-questionnaire WITH consent + answers → finalize', () => {
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'in_progress', consentGiven: true, answerCount: 2 }),
    'finalize',
  );
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'summarizing', consentGiven: true, answerCount: 1 }),
    'finalize',
  );
});

test('hang-up before consent or without answers → abandon (no LLM processing)', () => {
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'consent_pending', consentGiven: false, answerCount: 0 }),
    'abandon',
  );
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'ringing', consentGiven: false, answerCount: 0 }),
    'abandon',
  );
  // Consent given but hung up before answering anything.
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'in_progress', consentGiven: true, answerCount: 0 }),
    'abandon',
  );
});

test('regularly ended calls get duration/usage backfilled', () => {
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'completed', consentGiven: true, answerCount: 4 }),
    'backfill',
  );
  assert.equal(
    classifyEndOfCall({ twilioStatus: 'completed', callStatus: 'declined', consentGiven: false, answerCount: 0 }),
    'backfill',
  );
});

test('carrier-side failures on unanswered calls → abandon', () => {
  for (const s of ['busy', 'failed', 'no-answer', 'canceled']) {
    assert.equal(
      classifyEndOfCall({ twilioStatus: s, callStatus: 'ringing', consentGiven: false, answerCount: 0 }),
      'abandon',
    );
  }
});

test('parseCallDuration is defensive', () => {
  assert.equal(parseCallDuration('42'), 42);
  assert.equal(parseCallDuration('0'), 0);
  assert.equal(parseCallDuration(undefined), null);
  assert.equal(parseCallDuration('abc'), null);
  assert.equal(parseCallDuration('-5'), null);
});
