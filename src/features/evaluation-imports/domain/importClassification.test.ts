import assert from 'node:assert/strict';
import test from 'node:test';
import type { EvaluationImportArchive } from './importArchive';
import { classifyEvaluationImport, filterEvaluationImportArchives } from './importClassification';

const archive = (id: string, importBatchId = id, importStatus?: EvaluationImportArchive['importStatus']): EvaluationImportArchive => ({
  id, importBatchId, importStatus, surveyType: 'Supplier', uploadedAt: '2026-01-01T00:00:00Z', uploadedBy: 'admin@example.com',
  sourceFileName: `${id}.csv`, storagePath: `supplier/2026-01-01/${id}.csv`, contentType: 'text/csv', fileSize: 12,
});

test('classifies linked legacy archives as active and unlinked ones as history', () => {
  const counts = new Map([['linked', 3]]);
  assert.equal(classifyEvaluationImport(archive('current', 'linked'), counts), 'active');
  assert.equal(classifyEvaluationImport(archive('old'), counts), 'history');
  assert.equal(classifyEvaluationImport(archive('replaced', 'linked', 'historical'), counts), 'history');
});

test('filters by status and category while retaining combined imports', () => {
  const current = archive('current', 'linked');
  const otherCategory = { ...archive('combined', 'linked'), surveyType: 'Combined' as const };
  assert.deepEqual(filterEvaluationImportArchives([current, otherCategory], new Map([['linked', 1]]), 'active', 'Supplier').map(({ id }) => id), ['current', 'combined']);
});
