import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomForm, SurveyResponse, SurveyType } from '../../../types/survey';
import type { EvaluationImportArchive } from './importArchive';
import { classifyEvaluationImport, filterEvaluationImportArchives, getActiveEvaluationImportBatches, getLegacyActiveEvaluationImportIds } from './importClassification';

const archive = (id: string, importBatchId = id, importStatus?: EvaluationImportArchive['importStatus']): EvaluationImportArchive => ({
  id, importBatchId, importStatus, surveyType: 'Supplier', uploadedAt: '2026-01-01T00:00:00Z', uploadedBy: 'admin@example.com',
  sourceFileName: `${id}.csv`, storagePath: `supplier/2026-01-01/${id}.csv`, contentType: 'text/csv', fileSize: 12,
});

type Form = Pick<CustomForm, 'id' | 'surveyType' | 'status' | 'deadlineDate' | 'manuallyEndedAt'>;
type Response = Pick<SurveyResponse, 'surveyId' | 'surveyType' | 'importBatchId' | 'dataSource' | 'archived'>;
const form = (surveyType: SurveyType = 'Supplier', overrides: Partial<Form> = {}): Form => ({
  id: `default-${surveyType.toLowerCase()}`, surveyType, status: 'Running', ...overrides,
});
const response = (importBatchId = 'batch', overrides: Partial<Response> = {}): Response => ({
  importBatchId, surveyType: 'Supplier', dataSource: 'client_csv', ...overrides,
});

test('each imported category follows its own active standard Workspace form', () => {
  const types: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
  const active = getActiveEvaluationImportBatches(types.map((type) => form(type)), types.map((surveyType) => response(surveyType, { surveyType })));
  for (const surveyType of types) {
    assert.equal(classifyEvaluationImport({ ...archive(surveyType), surveyType }, active), 'active');
    assert.equal(classifyEvaluationImport({ ...archive(surveyType, surveyType, 'historical'), surveyType }, active), 'history');
  }
});

test('deleted form stays in History even if another form in the same category is active', () => {
  const file = archive('file', 'batch', 'active');
  const original = form('Supplier', { id: 'original-form' });
  const other = form('Supplier', { id: 'other-form' });
  const rows = [response('batch', { surveyId: original.id })];
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([original, other], rows)), 'active');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([other], rows)), 'history');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([form()], rows)), 'history');
});

test('legacy imports require their standard form, not an arbitrary active category form', () => {
  const file = archive('file', 'batch');
  const rows = [response()];
  const custom = form('Supplier', { id: 'custom-form' });
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([form('Supplier', { status: 'Paused' }), custom], rows)), 'history');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([custom], rows)), 'history');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([form('Supplier', { status: undefined })], rows)), 'active');
});

test('deleted, archived, replaced, unrelated, or non-imported responses cannot keep a file Active', () => {
  const file = archive('file', 'batch', 'active');
  for (const rows of [[], [response('other-batch')], [response('batch', { archived: true })], [response('batch', { dataSource: undefined })], [response('batch', { surveyId: 'default-courier' })]]) {
    assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([form(), form('Courier')], rows)), 'history');
  }
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([form()], [response()])), 'active');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches([form()], [])), 'history');
});

test('paused, ended, archived, and expired linked forms are inactive despite stored Active metadata', () => {
  const now = new Date(2026, 9, 19);
  for (const overrides of [
    { status: 'Paused' as const },
    { status: 'Completed' as const },
    { status: 'Archived' as const },
    { deadlineDate: '18/10/2026' },
    { status: 'Completed' as const, deadlineDate: '20/10/2026', manuallyEndedAt: '2026-10-18T00:00:00Z' },
  ]) {
    assert.equal(classifyEvaluationImport(archive('file', 'batch', 'active'), getActiveEvaluationImportBatches([form('Supplier', overrides)], [response()], now)), 'history');
  }
});

test('the linked form deadline moves its file to History at the end of the deadline day', () => {
  const forms = [form('Supplier', { deadlineDate: '19/10/2026' })];
  const file = archive('file', 'batch');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches(forms, [response()], new Date(2026, 9, 19, 23, 59, 59))), 'active');
  assert.equal(classifyEvaluationImport(file, getActiveEvaluationImportBatches(forms, [response()], new Date(2026, 9, 20))), 'history');
});

test('Combined requires an active form linked to its own batch and filters preserve category matching', () => {
  const current = archive('current', 'batch');
  const combined = { ...archive('combined', 'batch'), surveyType: 'Combined' as const };
  const deletedCombined = { ...combined, id: 'deleted', importBatchId: 'deleted-batch' };
  const courier = { ...archive('courier', 'batch'), surveyType: 'Courier' as const };
  const active = getActiveEvaluationImportBatches([form()], [response()]);
  assert.deepEqual(filterEvaluationImportArchives([current, combined, courier, deletedCombined], active, 'active', 'Supplier').map(({ id }) => id), ['current', 'combined']);
  assert.deepEqual(filterEvaluationImportArchives([current, combined, courier], active, 'history', 'Courier').map(({ id }) => id), ['courier']);
  assert.equal(classifyEvaluationImport(deletedCombined, active), 'history');
  assert.equal(classifyEvaluationImport(combined, new Map()), 'history');
  assert.equal(classifyEvaluationImport({ ...combined, importStatus: 'historical' }, active), 'history');
});

function standardSource(surveyType: SurveyType, id: string = surveyType, uploadedAt = '2026-10-12T11:40:52Z'): EvaluationImportArchive {
  return { ...archive(id), surveyType, uploadedAt, sourceFileName: `Microgenesis ${surveyType} Evaluation Form.csv` };
}

test('recovers the two missing standard sources alongside the already linked Courier source', () => {
  const forms = [form('Courier'), form('Supplier'), form('Subcontractor')];
  const currentCourier = { ...archive('current-courier', 'courier-batch'), surveyType: 'Courier' as const };
  const stored = [
    standardSource('Supplier'), standardSource('Subcontractor'),
    { ...standardSource('Courier'), importStatus: 'historical' as const },
    standardSource('Supplier', 'old-supplier', '2026-10-09T11:00:00Z'),
    archive('old-supplier-workbook'), currentCourier,
  ];
  const rows = [response('courier-batch', { surveyType: 'Courier' })];
  const activeBatches = getActiveEvaluationImportBatches(forms, rows);
  const recovered = getLegacyActiveEvaluationImportIds(stored, forms, rows);
  assert.deepEqual([...recovered].sort(), ['Subcontractor', 'Supplier']);
  assert.deepEqual(filterEvaluationImportArchives(stored, activeBatches, 'active', 'all', recovered).map(({ id }) => id), ['Supplier', 'Subcontractor', 'current-courier']);
});

test('legacy recovery respects deleted, paused, completed, and archived default Workspace forms', () => {
  const stored = [standardSource('Supplier')];
  for (const forms of [[], [form('Supplier', { status: 'Paused' })], [form('Supplier', { status: 'Completed' })], [form('Supplier', { status: 'Archived' })], [form('Supplier', { id: 'different-active-form' })]]) {
    assert.equal(getLegacyActiveEvaluationImportIds(stored, forms, []).size, 0);
  }
});

test('legacy recovery never revives an older copy after the newest copy is explicitly archived', () => {
  const stored = [standardSource('Supplier', 'older', '2026-10-09T00:00:00Z'), { ...standardSource('Supplier'), importStatus: 'historical' as const }];
  assert.equal(getLegacyActiveEvaluationImportIds(stored, [form()], []).size, 0);
});

test('known response batches, including archived and deleted-form links, cannot use legacy recovery', () => {
  const stored = [standardSource('Supplier', 'batch')];
  for (const rows of [[response()], [response('batch', { archived: true })], [response('batch', { surveyId: 'deleted-form' })]]) {
    assert.equal(getLegacyActiveEvaluationImportIds(stored, [form()], rows).size, 0);
  }
});

test('legacy recovery excludes isolated test imports and does not depend on archive ordering', () => {
  const stored = [standardSource('Supplier', 'older', '2026-10-09T00:00:00Z'), standardSource('Supplier', 'newer')];
  const testCopy = { ...standardSource('Supplier', 'test', '2026-10-19T00:00:00Z'), importBatchId: 'test-workbook:12345678-1234-1234-1234-123456789abc' };
  assert.deepEqual([...getLegacyActiveEvaluationImportIds([testCopy, ...stored], [form()], [])], ['newer']);
  assert.deepEqual([...getLegacyActiveEvaluationImportIds([...stored].reverse(), [form()], [])], ['newer']);
});
