import assert from 'node:assert/strict';
import test from 'node:test';
import { isDistributionRecipient, validateDistributionRecipients } from './formRecipients';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

test('persisted recipient lists round trip and reject malformed external values', () => {
  const form = { id: 'selected-form', title: 'Selected form', surveyType: 'Courier', createdAt: '2026-11-09T00:00:00Z', questions: [], distributionRecipientEmails: ['first@mgenesis.com'] };
  assert.deepEqual(parseApplicationRecordPayload('survey', form, form.id), form);
  for (const distributionRecipientEmails of [null, 'first@mgenesis.com', [null], ['bad-email'], ['first@mgenesis.com\nother@mgenesis.com']]) {
    assert.throws(() => parseApplicationRecordPayload('survey', { ...form, distributionRecipientEmails }, form.id), /distributionRecipientEmails/);
  }
});

test('distribution accepts only selected eligible employees and normalizes duplicate emails', () => {
  const eligible = [{ email: 'first@mgenesis.com' }, { email: 'second@mgenesis.com' }];
  assert.deepEqual(validateDistributionRecipients([' FIRST@mgenesis.com ', 'first@mgenesis.com'], eligible), ['first@mgenesis.com']);
  assert.throws(() => validateDistributionRecipients([], eligible), /Select at least one eligible employee/);
  assert.throws(() => validateDistributionRecipients(['removed@mgenesis.com'], eligible), /Review the recipient selection/);
  assert.throws(() => validateDistributionRecipients([''], eligible), /Select at least one eligible employee/);
});

test('legacy forms keep reminders while explicit selections only notify their recipients', () => {
  assert.equal(isDistributionRecipient({}, 'first@mgenesis.com'), true);
  assert.equal(isDistributionRecipient({ distributionRecipientEmails: [] }, 'first@mgenesis.com'), false);
  const form = { distributionRecipientEmails: ['First@mgenesis.com'] };
  assert.equal(isDistributionRecipient(form, ' FIRST@mgenesis.com '), true);
  assert.equal(isDistributionRecipient(form, 'second@mgenesis.com'), false);
});
