import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isOptionalEmployeeRemark,
  isOverallFeedbackQuestion,
  isValidOverallFeedbackAnswer,
} from './surveyQuestionRequirements';

const question = (changes: Partial<Parameters<typeof isOptionalEmployeeRemark>[0]> = {}) => ({
  questionId: 'remark',
  questionNumber: 1,
  question: 'Delivery Remarks',
  questionCategory: 'Delivery',
  inputType: 'text' as const,
  ...changes,
});

test('Employee remark and additional-comment questions are optional', () => {
  assert.equal(isOptionalEmployeeRemark(question(), true), true);
  assert.equal(isOptionalEmployeeRemark(question({ question: 'Please provide any additional comments on delivery.' }), true), true);
});

test('overall feedback stays required, as do non-remark text fields and all Admin questions', () => {
  const overallFeedback = question({ question: 'Overall Comments and Feedback on the Company', questionCategory: 'General' });
  assert.equal(isOverallFeedbackQuestion(overallFeedback), true);
  assert.equal(isOptionalEmployeeRemark(overallFeedback, true), false);
  assert.equal(isOptionalEmployeeRemark(question({ question: 'Partner registration number' }), true), false);
  assert.equal(isOptionalEmployeeRemark(question(), false), false);
});

test('overall feedback rejects blank and placeholder-only answers but accepts real comments', () => {
  for (const answer of ['', '   ', 'N/A', 'na', ' None ']) {
    assert.equal(isValidOverallFeedbackAnswer(answer), false, JSON.stringify(answer));
  }
  assert.equal(isValidOverallFeedbackAnswer('Delivery has been consistent.'), true);
});
