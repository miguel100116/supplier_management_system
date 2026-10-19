import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeImportedResponses } from './archiveResponseTransfer';

const baseRow = {
  responseId: 'LEGACY-1',
  surveyType: 'Supplier',
  company: 'Supplier One',
  questionId: 'Q1',
  questionNumber: 1,
  question: 'Quality?',
  questionCategory: 'Quality',
  rating: 4,
  comment: '',
};

test('archive import rejects a row whose submission date cannot be recovered', () => {
  const result = mergeImportedResponses([{ row: 1, raw: baseRow }], []);
  assert.equal(result.stats.imported, 0);
  assert.equal(result.stats.skippedInvalid, 1);
  assert.match(result.log[0].reason ?? '', /submissionDate/);
});

test('archive import normalizes missing respondent type and recovers date from start time', () => {
  const result = mergeImportedResponses([{
    row: 1,
    raw: { ...baseRow, startTime: '2026-09-20T10:30:00.000Z' },
  }], []);
  assert.equal(result.stats.imported, 1);
  assert.equal(result.responses[0].respondentType, 'Unspecified');
  assert.equal(result.responses[0].submissionDate, '2026-09-20T10:30:00.000Z');
  assert.equal(result.responses[0].submissionDateInferredFrom, 'startTime');
});

test('archive import recovers a legacy UI response timestamp from its stable ID', () => {
  const timestamp = Date.parse('2026-09-20T10:30:00.000Z');
  const result = mergeImportedResponses([{
    row: 1,
    raw: { ...baseRow, responseId: `RESP-${timestamp}-12` },
  }], []);
  assert.equal(result.stats.imported, 1);
  assert.equal(result.responses[0].submissionDate, '2026-09-20T10:30:00.000Z');
  assert.equal(result.responses[0].submissionDateInferredFrom, 'responseId');
});
