import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import type { PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { isOfficialAnalyticsResponse } from '../../analytics/domain/responseProvenance';
import { hasAnsweredItem, submissionCount, submissionScores } from '../../../utils/analytics';
import { commitRawEvaluationImport, EvaluationFormMismatchError, FORM_SPECS, previewRawEvaluationImport } from '../../../utils/rawEvaluationImport';
import { getLeaderboard } from '../../../utils/scoring';
import type { EvaluationImportArchive } from './importArchive';
import { detectEvaluationPreviews, normalizeEvaluationFile } from './evaluationFilePreview';
import { archiveEvaluationBatch, reconcileEvaluationBatchPartners, validateEvaluationBatchPreviews } from './evaluationBatch';
import { isTestImportArchive, selectTestImportCleanup, testImportToken } from './testImport';
import { selectOrdinaryImportResponses } from './importCleanup';

const batchId = 'test-workbook:12345678-1234-4234-8234-123456789abc';
const types: SurveyType[] = ['Supplier', 'Subcontractor', 'Courier'];

function archive(importBatchId = batchId): EvaluationImportArchive {
  return {
    id: 'archive-1', surveyType: 'Combined', uploadedAt: '2026-10-01T00:00:00.000Z',
    uploadedBy: 'admin@mgenesis.com', sourceFileName: 'evaluations.xlsx',
    storagePath: 'combined/2026-10-01/archive-1.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileSize: 100, importBatchId,
  };
}

function workbook(): File {
  const book = XLSX.utils.book_new();
  for (const surveyType of types) {
    const spec = FORM_SPECS[surveyType];
    const width = Math.max(spec.nameCol, ...spec.columns.map((column) => column.col)) + 1;
    const header = Array.from({ length: width }, () => '');
    header[spec.idCol] = 'ID';
    header[spec.nameCol] = spec.headerAnchor.text;
    const row = Array.from({ length: width }, () => '' as string | number);
    row[spec.idCol] = `source-${surveyType}`;
    row[spec.nameCol] = `${surveyType} Partner`;
    row[spec.completionTimeCol] = '2026-10-01';
    for (const column of spec.columns) if (column.kind === 'rating') row[column.col] = 1;
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, row]), surveyType);
  }
  return new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'evaluations.xlsx');
}

test('test workbook reaches analytics and cleanup selects only its isolated records', async () => {
  const file = workbook();
  const existingCompanies: PartnerCompany[] = types
    .filter((type) => type !== 'Subcontractor')
    .map((type) => ({ id: `existing-${type}`, name: `${type} Partner`, type, createdAt: '2026-01-01T00:00:00.000Z' }));
  const detected = await detectEvaluationPreviews(file, (source, type) => previewRawEvaluationImport(source, type, existingCompanies));
  assert.deepEqual(detected.map((preview) => preview.surveyType), types);
  const testResponses: SurveyResponse[] = [];
  const normalResponses: SurveyResponse[] = [];
  const testCompanies: PartnerCompany[] = [];

  for (const surveyType of types) {
    const preview = await previewRawEvaluationImport(file, surveyType, existingCompanies);
    const decisions = Object.fromEntries(preview.companyMatches.map((match) => [match.normalizedName, 'add-as-partner' as const]));
    const normal = commitRawEvaluationImport(preview, decisions);
    const testResult = commitRawEvaluationImport({ ...preview, importBatchId: batchId }, decisions);
    normalResponses.push(...normal.responses);
    testResponses.push(...testResult.responses);
    testCompanies.push(...testResult.newPartnerCompanies);
    assert.equal(testResult.summary.imported, 1);
    assert.ok(testResult.responses.every((response) => response.importBatchId === batchId));
    assert.ok(testResult.responses.every((response) => !normal.responses.some((item) => item.responseId === response.responseId)));
  }

  assert.equal(submissionCount(testResponses.filter(isOfficialAnalyticsResponse)), 3);
  assert.equal(submissionScores(testResponses).length, 3);
  assert.equal(testCompanies.length, 1);
  assert.equal(testCompanies[0].testImportBatchId, batchId);
  assert.equal(testCompanies[0].isArchived, true);
  const selected = selectTestImportCleanup(archive(), [...normalResponses, ...testResponses], [...existingCompanies, ...testCompanies]);
  assert.equal(selected.responses.length, testResponses.length);
  assert.deepEqual(selected.companies, testCompanies);
  assert.ok(normalResponses.every((response) => !selected.responses.includes(response)));
});

test('cleanup rejects ordinary imports and unexpected identities', () => {
  assert.equal(testImportToken('client-workbook:abc'), null);
  assert.equal(isTestImportArchive(archive('client-workbook:abc')), false);
  assert.throws(() => selectTestImportCleanup(archive('client-workbook:abc'), [], []), /Only isolated test imports/);
  assert.deepEqual(selectTestImportCleanup(archive(), [], []), { responses: [], companies: [] });

  const unexpected = { responseId: 'IMPORT-SUPPLIER-1', importBatchId: batchId, dataSource: 'client_csv' } as SurveyResponse;
  assert.throws(() => selectTestImportCleanup(archive(), [unexpected], []), /unexpected identities/);

  const untrustedCompany = { id: 'existing-supplier', testImportBatchId: batchId } as PartnerCompany;
  assert.throws(() => selectTestImportCleanup(archive(), [], [untrustedCompany]), /unexpected identities/);

  const company = { id: 'pc-test-12345678-1234-4234-8234-123456789abc-supplier-0', testImportBatchId: batchId } as PartnerCompany;
  const referenced = { responseId: 'OTHER-1', companyId: company.id } as SurveyResponse;
  assert.throws(() => selectTestImportCleanup(archive(), [referenced], [company]), /referenced by another evaluation/);
});

test('ordinary file removal selects only its current response rows and rejects untrusted identities', () => {
  const firstBatchId = `client-workbook:${'a'.repeat(64)}`;
  const secondBatchId = `client-workbook:${'b'.repeat(64)}`;
  const firstArchive = { ...archive(firstBatchId), surveyType: 'Supplier' as const };
  const first = {
    responseId: 'IMPORT-SUPPLIER-one', surveyType: 'Supplier', dataSource: 'client_csv', importBatchId: firstBatchId,
  } as SurveyResponse;
  const later = { ...first, importBatchId: secondBatchId };
  assert.deepEqual(selectOrdinaryImportResponses(firstArchive, [first, later]), [first]);
  assert.deepEqual(selectOrdinaryImportResponses(firstArchive, [later]), []);
  const combinedArchive = archive(firstBatchId);
  const courier = { ...first, responseId: 'IMPORT-COURIER-one', surveyType: 'Courier' as const };
  assert.deepEqual(selectOrdinaryImportResponses(combinedArchive, [first, courier]), [first, courier]);
  assert.throws(() => selectOrdinaryImportResponses(archive(), [first]), /Use test import removal/);
  assert.throws(() => selectOrdinaryImportResponses(archive('client-workbook:invalid'), [first]), /no recognized import identity/);
  assert.throws(() => selectOrdinaryImportResponses(firstArchive, [{ ...first, dataSource: 'production_submission' }]), /unexpected identities/);
  assert.throws(() => selectOrdinaryImportResponses(firstArchive, [{ ...first, responseId: 'RESP-one' }]), /unexpected identities/);
  assert.throws(() => selectOrdinaryImportResponses(firstArchive, [{ ...first, surveyType: 'Courier' }]), /unexpected identities/);
});

test('a single Courier CSV export can be test imported and removed', async () => {
  const spec = FORM_SPECS.Courier;
  const width = Math.max(spec.nameCol, ...spec.columns.map((column) => column.col)) + 1;
  const header = Array.from({ length: width }, () => '');
  header[spec.idCol] = 'ID';
  header[spec.nameCol] = spec.headerAnchor.text;
  const row = Array.from({ length: width }, () => '' as string | number);
  row[spec.idCol] = 'courier-1';
  row[spec.nameCol] = 'Courier Test Partner';
  row[spec.completionTimeCol] = '2026-10-01';
  for (const column of spec.columns) if (column.kind === 'rating') row[column.col] = 1;
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([header, row]));
  const file = new File([csv], 'Microgenesis Courier Evaluation Form.csv', { type: 'text/csv' });
  const extensionless = new File([csv], 'Microgenesis Courier Evaluation Form', { type: 'text/csv' });
  assert.equal(normalizeEvaluationFile(extensionless).name, file.name);
  assert.throws(() => normalizeEvaluationFile(new File([csv], 'Courier.pdf')), /not a supported evaluation file/);

  const detected = await detectEvaluationPreviews(file, (source, type) => previewRawEvaluationImport(source, type, []));
  assert.deepEqual(detected.map((preview) => preview.surveyType), ['Courier']);

  const preview = await previewRawEvaluationImport(file, 'Courier', []);
  await assert.rejects(previewRawEvaluationImport(file, 'Supplier', []), EvaluationFormMismatchError);
  await assert.rejects(previewRawEvaluationImport(file, 'Subcontractor', []), EvaluationFormMismatchError);
  const result = commitRawEvaluationImport({ ...preview, importBatchId: batchId }, {
    [preview.companyMatches[0].normalizedName]: 'add-as-partner',
  });
  assert.equal(result.summary.imported, 1);
  assert.equal(submissionCount(result.responses.filter(isOfficialAnalyticsResponse)), 1);
  const selected = selectTestImportCleanup({ ...archive(), surveyType: 'Courier', sourceFileName: file.name }, result.responses, result.newPartnerCompanies);
  assert.equal(selected.responses.length, result.responses.length);
  assert.equal(selected.companies.length, 1);
});

test('uploaded file answer contents drive countable forms after import', async () => {
  const spec = FORM_SPECS.Courier;
  const ratingColumns = spec.columns.filter((column) => column.kind === 'rating');
  const textColumn = spec.columns.find((column) => column.kind === 'text');
  assert.ok(ratingColumns.length >= 3);
  assert.ok(textColumn);

  const width = Math.max(spec.nameCol, ...spec.columns.map((column) => column.col)) + 1;
  const header = Array.from({ length: width }, () => '');
  header[spec.idCol] = 'ID';
  header[spec.nameCol] = spec.headerAnchor.text;

  const formRow = (id: string, company: string, answers: Array<string | number>, textAnswer = '') => {
    const row: Array<string | number> = Array.from({ length: width }, () => '');
    row[spec.idCol] = id;
    row[spec.nameCol] = company;
    row[spec.completionTimeCol] = '2026-10-01';
    ratingColumns.forEach((column, index) => { row[column.col] = answers[index] ?? ''; });
    if (textAnswer) row[textColumn.col] = textAnswer;
    return row;
  };

  const mixedAnswers: Array<string | number> = ratingColumns.map(() => '');
  mixedAnswers[0] = 5;
  mixedAnswers[1] = 'N/A';
  mixedAnswers[2] = 'N/A';
  const noAnswers: Array<string | number> = ratingColumns.map(() => 'N/A');
  const fullAnswers: Array<string | number> = ratingColumns.map(() => '');
  fullAnswers[0] = 4;
  fullAnswers[1] = 3;
  fullAnswers[2] = 5;
  const textAnswers: Array<string | number> = ratingColumns.map(() => '');

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    header,
    formRow('mixed', 'Mixed Answer Partner', mixedAnswers),
    formRow('na-only', 'N/A Only Partner', noAnswers),
    formRow('full', 'Fully Answered Partner', fullAnswers),
    formRow('text-only', 'Text Answer Partner', textAnswers, 'Answered with free text'),
  ]), 'Courier');
  const file = new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'answer-content.xlsx');

  const preview = await previewRawEvaluationImport(file, 'Courier', []);
  const decisions = Object.fromEntries(preview.companyMatches.map((match) => [match.normalizedName, 'add-as-partner' as const]));
  const imported = commitRawEvaluationImport(preview, decisions);

  assert.equal(imported.summary.imported, 4);
  assert.equal(submissionCount(imported.responses), 3);

  const leaderboard = new Map(getLeaderboard(imported.responses, 'Courier').map((company) => [company.company, company]));
  assert.equal(leaderboard.get('Mixed Answer Partner')?.evaluationCount, 1);
  assert.equal(leaderboard.get('N/A Only Partner')?.evaluationCount, 0);
  assert.equal(leaderboard.get('Fully Answered Partner')?.evaluationCount, 1);
  assert.equal(leaderboard.get('Text Answer Partner')?.evaluationCount, 1);
});

test('Supplier imports count only real evaluation ratings and meaningful remarks', async () => {
  const spec = FORM_SPECS.Supplier;
  const ratingColumns = spec.columns.filter((column) => column.kind === 'rating');
  const remarkColumns = spec.columns.filter((column) => column.kind === 'text');
  const metadataColumns = spec.columns.filter((column) => column.kind === 'metadata');
  assert.equal(ratingColumns.length, 17);
  assert.equal(remarkColumns.length, 5);
  assert.equal(metadataColumns.length, 1);

  const width = Math.max(spec.nameCol, ...spec.columns.map((column) => column.col)) + 1;
  const header = Array.from({ length: width }, () => '');
  header[spec.idCol] = 'ID';
  header[spec.nameCol] = spec.headerAnchor.text;
  spec.columns.forEach((column) => { header[column.col] = column.originalHeader; });

  const formRow = (
    id: string,
    ratings: Array<string | number>,
    remarks: string[],
    period = '2nd Half',
  ) => {
    const row: Array<string | number> = Array.from({ length: width }, () => '');
    row[spec.idCol] = id;
    row[spec.startTimeCol] = '2026-07-20 09:00';
    row[spec.completionTimeCol] = '2026-07-20 09:01';
    row[spec.nameCol] = 'Answer Rule Test Supplier';
    if (spec.designationCol !== undefined) row[spec.designationCol] = 'Rank & File';
    if (spec.departmentCol !== undefined) row[spec.departmentCol] = 'Procurement Group';
    let ratingIndex = 0;
    let remarkIndex = 0;
    spec.columns.forEach((column) => {
      if (column.kind === 'rating') row[column.col] = ratings[ratingIndex++] ?? '';
      else if (column.kind === 'text') row[column.col] = remarks[remarkIndex++] ?? '';
      else if (column.kind === 'metadata') row[column.col] = period;
    });
    return row;
  };

  const naRatings = ratingColumns.map(() => 'N/A (not applicable)');
  const naRemarks = remarkColumns.map(() => 'n/a');
  const formA = [...naRatings];
  formA[0] = '7';
  const formC = ratingColumns.map((_, index) => index === 0 ? '4' : index === 1 ? '3' : index === 2 ? '5' : '4');
  const zeroRating = [...naRatings];
  zeroRating[0] = '0';
  const meaningfulRemark = remarkColumns.map((_, index) => index === 0 ? 'Delivery arrived in good condition.' : '');
  const noneRemarks = remarkColumns.map(() => 'none');
  const emptyRow: Array<string | number> = Array.from({ length: width }, () => '');
  emptyRow[spec.idCol] = '   ';

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    header,
    formRow('103', formA, naRemarks),
    formRow('104', naRatings, naRemarks),
    formRow('106', naRatings, naRemarks),
    formRow('1', formC, remarkColumns.map(() => '')),
    formRow('zero-rating', zeroRating, remarkColumns.map(() => '')),
    formRow('none-remark', naRatings, noneRemarks),
    formRow('meaningful-remark', naRatings, meaningfulRemark),
    emptyRow,
  ]), 'Supplier');
  const file = new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'supplier-answer-count.xlsx');

  const preview = await previewRawEvaluationImport(file, 'Supplier', []);
  const decisions = Object.fromEntries(preview.companyMatches.map((match) => [match.normalizedName, 'add-as-partner' as const]));
  const imported = commitRawEvaluationImport(preview, decisions);
  const countedIds = new Set(imported.responses.filter(hasAnsweredItem).map((response) => response.responseId));
  const excludedIds = preview.rows
    .map((row) => row.responseId)
    .filter((responseId) => !countedIds.has(responseId))
    .map((responseId) => responseId.replace('IMPORT-SUPPLIER-', ''));

  assert.equal(preview.totalRows, 8);
  assert.equal(preview.skippedBlank, 1);
  assert.equal(imported.summary.imported, 7);
  assert.equal(submissionCount(imported.responses), 4);
  assert.deepEqual(excludedIds, ['104', '106', 'none-remark']);
});

test('a malformed recognized form stops detection instead of silently importing another form', async () => {
  const file = workbook();
  await assert.rejects(detectEvaluationPreviews(file, (source, type) => {
    if (type === 'Courier') return Promise.reject(new Error('Courier response has no source ID.'));
    return previewRawEvaluationImport(source, type, []);
  }), /Courier response has no source ID/);
});

test('multi-file batch rejects overlapping response IDs within a category', async () => {
  const file = workbook();
  const supplier = await previewRawEvaluationImport(file, 'Supplier', []);
  const courier = await previewRawEvaluationImport(file, 'Courier', []);
  assert.doesNotThrow(() => validateEvaluationBatchPreviews([supplier, courier]));
  assert.throws(() => validateEvaluationBatchPreviews([supplier, supplier]), /appears more than once/);
  const secondSupplier = {
    ...supplier,
    fileName: 'later-supplier.xlsx',
    rows: supplier.rows.map((row) => ({ ...row, responseId: 'IMPORT-SUPPLIER-different' })),
  };
  assert.doesNotThrow(() => validateEvaluationBatchPreviews([supplier, secondSupplier, courier]));
});

test('archive phase removes earlier source files if a later file fails', async () => {
  const removed: string[] = [];
  const stored = await archiveEvaluationBatch(
    ['first.xlsx', 'second.xlsx'],
    async (name) => ({ ...archive(), sourceFileName: name }),
    async (item) => { removed.push(item.sourceFileName); },
  );
  assert.deepEqual(stored.map((item) => item.sourceFileName), ['first.xlsx', 'second.xlsx']);
  assert.equal(removed.length, 0);
  await assert.rejects(archiveEvaluationBatch(
    ['first.xlsx', 'second.xlsx'],
    async (name) => {
      if (name === 'second.xlsx') throw new Error('Storage rejected second.xlsx');
      return { ...archive(), sourceFileName: name };
    },
    async (stored) => { removed.push(stored.sourceFileName); },
  ), /Storage rejected second.xlsx/);
  assert.deepEqual(removed, ['first.xlsx']);
});

test('normal files in one category share one newly created partner', async () => {
  const first = await previewRawEvaluationImport(workbook(), 'Supplier', []);
  const second = {
    ...first,
    fileName: 'later-supplier.xlsx',
    importBatchId: 'client-workbook:later',
    rows: first.rows.map((row) => ({ ...row, responseId: 'IMPORT-SUPPLIER-later' })),
  };
  const decisions = { [first.companyMatches[0].normalizedName]: 'add-as-partner' as const };
  const prepared = reconcileEvaluationBatchPartners([first, second].map((preview) => ({
    preview,
    ...commitRawEvaluationImport(preview, decisions),
  })));
  assert.equal(prepared.flatMap((entry) => entry.newPartnerCompanies).length, 1);
  assert.equal(prepared[0].responses[0].companyId, prepared[1].responses[0].companyId);
  assert.deepEqual(prepared[1].summary.addedCompanies, []);
});

test('separate test files in one category keep distinct identities for per-file cleanup', async () => {
  const first = await previewRawEvaluationImport(workbook(), 'Supplier', []);
  const secondBatchId = 'test-workbook:87654321-4321-4321-8321-cba987654321';
  const decisions = { [first.companyMatches[0].normalizedName]: 'add-as-partner' as const };
  const firstResult = commitRawEvaluationImport({ ...first, importBatchId: batchId }, decisions);
  const secondResult = commitRawEvaluationImport({ ...first, importBatchId: secondBatchId }, decisions);
  assert.notEqual(firstResult.responses[0].responseId, secondResult.responses[0].responseId);
  assert.equal(submissionCount([...firstResult.responses, ...secondResult.responses].filter(isOfficialAnalyticsResponse)), 2);
  const selected = selectTestImportCleanup(
    archive(),
    [...firstResult.responses, ...secondResult.responses],
    [...firstResult.newPartnerCompanies, ...secondResult.newPartnerCompanies],
  );
  assert.equal(selected.responses.length, firstResult.responses.length);
  assert.equal(selected.companies.length, firstResult.newPartnerCompanies.length);
});
