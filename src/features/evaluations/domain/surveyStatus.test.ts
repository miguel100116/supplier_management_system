import assert from 'node:assert/strict';
import test from 'node:test';
import { getSurveyStatus } from './surveyStatus';
import { getSurveyCompletionSummary } from './surveyCompletion';
import type { CustomForm } from '../../../types/survey';

const beforeDeadlineEnds = new Date(2026, 11, 31, 23, 59, 59, 999);
const afterDeadlineEnds = new Date(2027, 0, 1);

test('SMS-50 derives status from the deadline through the end of its day', () => {
  assert.equal(getSurveyStatus({ status: 'Completed', deadlineDate: '31/12/2026' }, beforeDeadlineEnds), 'Running');
  assert.equal(getSurveyStatus({ status: 'Running', deadlineDate: '31/12/2026' }, afterDeadlineEnds), 'Completed');
  assert.equal(getSurveyStatus({ status: 'Paused', deadlineDate: '31/12/2026' }, beforeDeadlineEnds), 'Paused');
  assert.equal(getSurveyStatus({ status: 'Paused', deadlineDate: '31/12/2026' }, afterDeadlineEnds), 'Completed');
});

test('SMS-50 preserves archived and undated manual statuses', () => {
  assert.equal(getSurveyStatus({ status: 'Archived', deadlineDate: '31/12/2026' }, beforeDeadlineEnds), 'Archived');
  assert.equal(getSurveyStatus({ status: 'Completed' }, beforeDeadlineEnds), 'Completed');
  assert.equal(getSurveyStatus({ status: 'Running', deadlineDate: 'bad date' }, afterDeadlineEnds), 'Running');
});

test('SMS-50 does not treat a stale Completed value before a future deadline as manual completion', () => {
  const survey: CustomForm = {
    id: 'future-form',
    title: 'Future form',
    description: '',
    surveyType: 'Supplier',
    createdAt: '2026-10-01',
    status: 'Completed',
    deadlineDate: '31/12/2099',
    questions: [],
  };
  assert.equal(getSurveyCompletionSummary(survey, [], [], []).isComplete, false);
  assert.equal(getSurveyCompletionSummary({ ...survey, deadlineDate: '01/01/2000' }, [], [], []).isComplete, true);
});
