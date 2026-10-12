import assert from 'node:assert/strict';
import test from 'node:test';
import type { RawEvalPreview } from '../../../utils/rawEvaluationImport';
import type { EvaluationImportArchive } from './importArchive';
import { evaluationPreviewFingerprint, findEvaluationImportDuplicates } from './duplicateDetection';

const base: RawEvalPreview = {
  surveyType: 'Supplier', sheetName: 'Supplier', fileName: 'a.csv', importBatchId: 'a', totalRows: 1,
  skippedBlank: 0, missingRespondentInfo: 0, companyMatches: [],
  rows: [{ cells: ['id-1', 'Vendor', 5, 'good'], rawCompany: 'Vendor', normalizedCompany: 'vendor', responseId: 'id-1', submissionDate: '2026-01-01', respondentType: 'Manager', department: 'Procurement' }],
};

const archive: EvaluationImportArchive = {
  id: 'archive-1', surveyType: 'Supplier', uploadedAt: '2026-01-01T00:00:00Z', uploadedBy: 'admin@mgenesis.com',
  sourceFileName: 'old.csv', storagePath: 'supplier/2026-01-01/a.csv', contentType: 'text/csv', fileSize: 100, importBatchId: 'client-workbook:old',
};

test('fingerprint ignores response IDs and row order but preserves answers and dates', () => {
  const reordered = { ...base, rows: [{ ...base.rows[0], responseId: 'new-id', cells: ['new-id', 'Vendor', 5, 'good'] }] };
  assert.equal(evaluationPreviewFingerprint([base]), evaluationPreviewFingerprint([reordered]));
  assert.notEqual(evaluationPreviewFingerprint([base]), evaluationPreviewFingerprint([{ ...reordered, rows: [{ ...reordered.rows[0], cells: ['new-id', 'Vendor', 4, 'good'] }] }]));
});

test('detects same-name and same-content independently and reports both', () => {
  const same = findEvaluationImportDuplicates('old.csv', [base], [{ archive, previews: [base] }]);
  assert.equal(same[0].reason, 'both');
  const renamed = findEvaluationImportDuplicates('renamed.csv', [base], [{ archive, previews: [base] }]);
  assert.equal(renamed[0].reason, 'identical-content');
  const changed = { ...base, rows: [{ ...base.rows[0], cells: ['id-1', 'Vendor', 2, 'changed'] }] };
  const sameNameChangedContent = findEvaluationImportDuplicates('old.csv', [changed], [{ archive, previews: [base] }]);
  assert.equal(sameNameChangedContent[0].reason, 'matching-filename');
  assert.equal(findEvaluationImportDuplicates('new.csv', [changed], [{ archive, previews: [base] }]).length, 0);
});
