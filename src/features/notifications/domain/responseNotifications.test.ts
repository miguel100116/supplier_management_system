import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurveyResponse } from '../../../types/survey';
import { groupResponsesToNotifications, toNotification } from './responseNotifications';

const row: SurveyResponse = { responseId: 'one', surveyType: 'Supplier', respondentType: 'Rank & File', submissionDate: '2026-10-23T00:00:00Z', company: 'Synthetic Supplier', questionId: 'Q39', questionNumber: 1, question: 'Quality', questionCategory: 'Quality', rating: 0, comment: '' };

test('response notifications preserve evidence without inventing identity or department', () => {
  assert.equal(toNotification([]), null);
  const notification = toNotification([row])!;
  assert.equal(notification.respondentEmail, undefined);
  assert.equal(notification.department, undefined);
  assert.equal(notification.designation, 'Rank & File');
  assert.equal(toNotification([{ ...row, respondentEmail: 'admin@mgenesis.com' }])?.designation, 'Rank & File');
});

test('notifications group actual answers once and sort by completion timestamp', () => {
  const notifications = groupResponsesToNotifications([row, { ...row, questionId: 'Q40' }, { ...row, responseId: 'two', submissionDate: '2026-10-24T00:00:00Z' }]);
  assert.deepEqual(notifications.map((item) => [item.id, item.questionCount]), [['two', 1], ['one', 2]]);
});
