import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCallCost, crossedBudgetThresholds } from './cost.js';
import { scoreLead } from './lead-scoring.js';
import { nextQuestion, normalizeAnswer } from './questionnaire-engine.js';
import { QUESTION_TYPES } from './constants.js';
import type { QuestionnaireQuestion } from './types.js';

const rates = {
  telephonyPerMinute: 0.0085,
  sttPerMinute: 0.0043,
  ttsPerMinute: 0.015,
  llmInputPer1k: 0.00015,
  llmOutputPer1k: 0.0006,
  markupPercent: 0.3,
};

test('calculateCallCost sums provider costs and applies markup', () => {
  const b = calculateCallCost(
    { durationSeconds: 120, llmInputTokens: 2000, llmOutputTokens: 1000 },
    rates,
  );
  assert.equal(b.telephonyCost, 0.017);
  assert.equal(b.sttCost, 0.0086);
  assert.equal(b.ttsCost, 0.03);
  assert.equal(b.llmCost, 0.0009);
  assert.equal(b.providerSubtotal, 0.0565);
  assert.equal(b.platformMarkup, 0.01695);
  assert.equal(b.totalCost, 0.07345);
});

test('calculateCallCost clamps negative usage to zero', () => {
  const b = calculateCallCost(
    { durationSeconds: -10, llmInputTokens: -5, llmOutputTokens: -5 },
    rates,
  );
  assert.equal(b.totalCost, 0);
});

test('crossedBudgetThresholds reports newly crossed thresholds only', () => {
  const crossed = crossedBudgetThresholds(40, 85, 100, [0.5, 0.8, 1.0]);
  assert.deepEqual(crossed, [0.5, 0.8]);
});

test('scoreLead returns A for complete urgent lead', () => {
  const r = scoreLead({
    hasEmail: true,
    hasPhone: true,
    hasName: true,
    urgency: 0.9,
    wantsCallback: true,
    hasBudget: true,
    hasConcreteNeed: true,
  });
  assert.equal(r.category, 'A');
});

test('scoreLead returns C for anonymous vague caller', () => {
  const r = scoreLead({
    hasEmail: false,
    hasPhone: false,
    hasName: false,
    urgency: null,
    wantsCallback: false,
    hasBudget: false,
    hasConcreteNeed: false,
  });
  assert.equal(r.category, 'C');
});

test('normalizeAnswer parses yes/no', () => {
  const q = { type: QUESTION_TYPES.YES_NO } as QuestionnaireQuestion;
  assert.deepEqual(normalizeAnswer(q, 'Ja, gerne').value, true);
  assert.deepEqual(normalizeAnswer(q, 'nein danke').value, false);
  assert.equal(normalizeAnswer(q, 'vielleicht').ok, false);
});

test('nextQuestion skips conditional question until trigger satisfied', () => {
  const questions: QuestionnaireQuestion[] = [
    { id: '1', questionnaireId: 'q', key: 'is_urgent', prompt: 'Dringend?', type: QUESTION_TYPES.YES_NO, required: true, order: 1 },
    {
      id: '2',
      questionnaireId: 'q',
      key: 'callback_time',
      prompt: 'Wann zurückrufen?',
      type: QUESTION_TYPES.FREE_TEXT,
      required: false,
      order: 2,
      condition: { questionKey: 'is_urgent', operator: 'equals', value: true },
    },
  ];
  // Before answering, only the first question is active.
  assert.equal(nextQuestion(questions, {})?.key, 'is_urgent');
  // After answering "no", conditional question is skipped → complete.
  assert.equal(nextQuestion(questions, { is_urgent: { value: false, rawText: 'nein' } }), null);
  // After answering "yes", conditional question becomes active.
  assert.equal(
    nextQuestion(questions, { is_urgent: { value: true, rawText: 'ja' } })?.key,
    'callback_time',
  );
});
