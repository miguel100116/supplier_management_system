import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurveyResponse } from '../../../types/survey';
import { loadEvaluationImportResponseCounts } from './evaluationImportArchiveService';

test('import inspection counts complete loaded submissions without a second response fetch', async () => {
  const row = { responseId: 'import-1', importBatchId: 'batch-1', dataSource: 'client_csv' } as SurveyResponse;
  const counts = await loadEvaluationImportResponseCounts([
    row, { ...row, questionId: 'q2' }, { ...row, responseId: 'import-2', archived: true },
    { ...row, responseId: 'other-source', dataSource: 'production_submission' },
  ]);
  assert.equal(counts.get('batch-1'), 2);
});
