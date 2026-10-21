import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportPlan, IMPORT_TABLE_ROWS, loadCompanyAliases, stableUuid } from './importPlan';
import { previewRawEvaluationImport, commitRawEvaluationImport } from '../../src/features/evaluation-imports/services/rawEvaluationImport';
import { createImportedResponseFilter } from '../../src/features/evaluation-imports/services/importedResponseIdentity';
import { buildAnalyticsSnapshot } from '../../src/features/analytics/domain/analyticsSnapshot';
import { submissionCount } from '../../src/features/analytics/domain/analytics';
import type { SurveyResponse } from '../../src/types/survey';
import { createCompanyReportData, getReportAverageText } from '../../src/features/feedback-hub/reporting/companyReportData';
import { formatAnalyticsScore, getAnalyticsBand } from '../../src/features/analytics/domain/rankings';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

for (const [type, sourceCount, countableCount] of [['Courier', 30, 30], ['Supplier', 185, 178], ['Subcontractor', 65, 65]] as const) {
  test(`${type} reference CSV retains its counts and scores when UUID and UI import copies coexist`, async () => {
    const name = `Microgenesis ${type} Evaluation Form.csv`;
    const preview = await previewRawEvaluationImport(new File([readFileSync(resolve(projectRoot, 'reference-materials/source-data', name))], name), type, []);
    assert.equal(preview.rows.length, sourceCount);
    assert.equal(new Set(preview.rows.map((row) => row.responseId)).size, sourceCount);
    const imported = commitRawEvaluationImport(preview, Object.fromEntries(preview.companyMatches.map((match) => [match.normalizedName, 'add-as-partner'])));
    const legacy = imported.responses.map((response) => ({ ...response,
      responseId: stableUuid(`evaluation-submission:evaluation-form-${type.toLowerCase()}:${response.responseId.split('-').at(-1)}`),
      surveyId: `default-${type.toLowerCase()}`,
    }));
    const combined = [...legacy, ...imported.responses];
    assert.equal(submissionCount(combined), countableCount * 2);
    const unique = combined.filter(await createImportedResponseFilter(combined));
    assert.equal(submissionCount(unique), countableCount);
    assert.deepEqual(buildAnalyticsSnapshot(unique, [type], imported.newPartnerCompanies, []),
      buildAnalyticsSnapshot(imported.responses, [type], imported.newPartnerCompanies, []));
    for (const ranking of buildAnalyticsSnapshot(unique, [type], imported.newPartnerCompanies, []).companies) {
      const partner = imported.newPartnerCompanies.find((company) => company.name === ranking.name)!;
      const report = createCompanyReportData({ survey: { id: `default-${type.toLowerCase()}`, title: 'Reference CSV', surveyType: type },
        companyId: partner.id, partnerCompanies: imported.newPartnerCompanies, responses: unique, scopeToSurveyId: false, includeArchived: true });
      assert.equal(report.volumeWeightedScore, ranking.rankScore);
      assert.equal(report.composite?.evaluationCount, ranking.count);
      assert.equal(getReportAverageText(report), formatAnalyticsScore(type, ranking.rankScore));
      assert.deepEqual(report.volumeWeightedBand, getAnalyticsBand(type, ranking.rankScore));
    }

    // Client submissions and distinct periods/source IDs must remain countable.
    const reference = imported.responses[0];
    const newRows: SurveyResponse[] = [
      { ...reference, responseId: 'RESP-client-added', dataSource: 'production_submission' },
      { ...legacy[0], responseId: stableUuid('unrelated-submission') },
      { ...legacy[0], archived: true, seriesId: 'previous-period' },
      { ...legacy[0], submissionDate: '2026-10-20T12:00:00Z' },
      { ...legacy[0], respondentEmail: 'another@mgenesis.com' },
      { ...legacy[0], dataSource: 'test_submission' },
    ];
    assert.deepEqual(newRows.filter(await createImportedResponseFilter([...combined, ...newRows])), newRows);
  });
}

test('builds the normalized plan from the four inspected production CSV files', () => {
  const plan = buildImportPlan(projectRoot);

  assert.equal(plan.sourceFiles.length, 4);
  assert.equal(plan.companies.length, 1138);
  assert.equal(plan.companyBranches.length, 1251);
  assert.equal(plan.evaluationForms.length, 3);
  assert.equal(plan.evaluationQuestions.length, 65);
  assert.equal(plan.evaluators.length, 56);
  assert.equal(plan.evaluationSubmissions.length, 280);
  assert.equal(plan.evaluationAnswers.length, 6355);

  assert.deepEqual(plan.summary.evaluationSubmissions, {
    Courier: 30,
    Supplier: 185,
    Subcontractor: 65,
  });
  assert.equal(plan.summary.masterNamedRows, 1252);
  assert.equal(plan.summary.masterUniqueRecords, 1251);
  assert.equal(plan.summary.masterExactDuplicatesSkipped, 1);
  assert.equal(plan.summary.masterBlankBpCodes, 1);
  assert.equal(plan.summary.unresolvedCompanyNames, 2);
  assert.equal(plan.summary.blockingErrors, 2);
  assert.deepEqual(
    plan.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code),
    ['COMPANY_MATCH_UNRESOLVED', 'COMPANY_MATCH_UNRESOLVED'],
  );
});

test('creates the same logical rows and identifiers on every run', () => {
  const first = buildImportPlan(projectRoot);
  const second = buildImportPlan(projectRoot);

  assert.deepEqual(second, first);
  assert.equal(
    stableUuid('evaluation-submission:evaluation-form-supplier:1'),
    stableUuid('evaluation-submission:evaluation-form-supplier:1'),
  );

  for (const rows of [
    first.sourceFiles,
    first.companies,
    first.companyBranches,
    first.companyDocuments,
    first.evaluationQuestions,
    first.evaluators,
    first.evaluationSubmissions,
    first.evaluationAnswers,
  ]) {
    const ids = rows.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('an explicit CSV directory produces the same import plan as the reorganized repository', () => {
  const repositoryPlan = buildImportPlan(projectRoot);
  const directSourcePlan = buildImportPlan(resolve(projectRoot, 'reference-materials', 'source-data'));

  assert.deepEqual(directSourcePlan, repositoryPlan);
});

test('preserves Master List presentation rows outside the import dataset', () => {
  const plan = buildImportPlan(projectRoot);
  const masterSource = plan.sourceFiles.find((row) => row.source_key === 'master-list-v4-sms-copy');

  assert.equal(masterSource?.source_record_count, 1252);
  assert.ok(plan.companyBranches.every((row) => Number(row.source_row_number) >= 23));
  assert.ok(plan.companyBranches.every((row) => typeof row.company_id === 'string'));
  assert.ok(plan.companyBranches.every((row) => row.source_record_key !== undefined));
});

test('does not guess unresolved company relationships', () => {
  const plan = buildImportPlan(projectRoot);
  const unresolved = plan.evaluationSubmissions.filter((row) => row.company_id === null);

  assert.ok(unresolved.length > 0);
  assert.equal(new Set(unresolved.map((row) => `${row.form_code}:${row.company_name_raw}`)).size, 2);
  assert.equal(plan.companyAliases.length, 0);
});

test('clears unresolved relationships only when reviewed aliases are supplied', () => {
  const baseline = buildImportPlan(projectRoot);
  const targetBpCode = baseline.companyBranches.find((row) => typeof row.bp_code === 'string')?.bp_code;
  assert.equal(typeof targetBpCode, 'string');

  const unresolvedByKey = new Map<string, { surveyType: 'Courier' | 'Supplier' | 'Subcontractor'; sourceName: string }>();
  for (const row of baseline.evaluationSubmissions.filter((submission) => submission.company_id === null)) {
    const surveyType = row.form_code as 'Courier' | 'Supplier' | 'Subcontractor';
    const sourceName = String(row.company_name_raw);
    unresolvedByKey.set(`${surveyType}:${sourceName}`, { surveyType, sourceName });
  }

  const resolved = buildImportPlan(projectRoot, [...unresolvedByKey.values()].map((alias) => ({
    ...alias,
    targetBpCode: String(targetBpCode),
    reviewedBy: 'automated-test-only',
    reviewedAt: '2026-09-16T09:30:00+08:00',
  })));

  assert.equal(resolved.summary.unresolvedCompanyNames, 0);
  assert.equal(resolved.summary.blockingErrors, 0);
  assert.equal(resolved.companyAliases.length, unresolvedByKey.size);
  assert.ok(resolved.evaluationSubmissions.every((submission) => typeof submission.company_id === 'string'));
});

test('preserves a reviewed unmatched evaluation company as a distinct company without a BP Code', () => {
  const baseline = buildImportPlan(projectRoot);
  const sourceName = 'Mec Computer Corporation';
  const resolved = buildImportPlan(projectRoot, [{
    surveyType: 'Supplier',
    sourceName,
    resolution: 'distinct',
    reviewedBy: 'business-owner',
    reviewedAt: '2026-09-16T09:30:00+08:00',
  }]);

  const distinctCompany = resolved.companies.find((company) => company.canonical_name === sourceName);
  assert.ok(distinctCompany);
  assert.equal(resolved.companies.length, baseline.companies.length + 1);
  assert.equal(resolved.companyBranches.filter((branch) => branch.company_id === distinctCompany.id).length, 0);
  assert.ok(resolved.evaluationSubmissions
    .filter((submission) => submission.company_name_raw === sourceName)
    .every((submission) => submission.company_id === distinctCompany.id));
  assert.equal(resolved.summary.unresolvedCompanyNames, 1);
  assert.equal(resolved.summary.blockingErrors, 1);
});

test('migration is additive and contains no destructive SQL statements', () => {
  const migration = readFileSync(
    resolve(projectRoot, 'supabase', 'migrations', '202609150001_normalized_business_data.sql'),
    'utf8',
  );
  const executableSql = migration
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  assert.doesNotMatch(executableSql, /\b(drop|truncate|delete)\b/i);
  assert.doesNotMatch(executableSql, /alter\s+table\s+public\.(suppliers|survey_responses)\b/i);
});

test('uses a real primary key as the conflict target for every imported table', () => {
  assert.deepEqual(
    IMPORT_TABLE_ROWS.map(([table, , onConflict]) => [table, onConflict]),
    [
      ['import_source_files', 'id'],
      ['companies', 'id'],
      ['company_branches', 'id'],
      ['company_documents', 'id'],
      ['evaluation_forms', 'code'],
      ['evaluation_questions', 'id'],
      ['evaluators', 'id'],
      ['company_aliases', 'id'],
      ['evaluation_submissions', 'id'],
      ['evaluation_answers', 'id'],
    ],
  );
});

test('requires auditable, timezone-qualified company aliases', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'sms-company-aliases-'));
  const aliasPath = resolve(directory, 'aliases.json');

  try {
    writeFileSync(aliasPath, JSON.stringify([{
      surveyType: 'Supplier',
      sourceName: 'Reviewed source name',
      targetBpCode: 'BP001',
      reviewedBy: 'procurement-owner',
      reviewedAt: '2026-09-16T09:30:00+08:00',
    }]));
    assert.deepEqual(loadCompanyAliases(aliasPath), [{
      surveyType: 'Supplier',
      sourceName: 'Reviewed source name',
      resolution: 'existing',
      targetBpCode: 'BP001',
      reviewedBy: 'procurement-owner',
      reviewedAt: '2026-09-16T09:30:00+08:00',
    }]);

    writeFileSync(aliasPath, JSON.stringify([{
      surveyType: 'Supplier',
      sourceName: 'Distinct source name',
      resolution: 'distinct',
      reviewedBy: 'procurement-owner',
      reviewedAt: '2026-09-16T09:30:00+08:00',
    }]));
    assert.deepEqual(loadCompanyAliases(aliasPath), [{
      surveyType: 'Supplier',
      sourceName: 'Distinct source name',
      resolution: 'distinct',
      reviewedBy: 'procurement-owner',
      reviewedAt: '2026-09-16T09:30:00+08:00',
    }]);

    writeFileSync(aliasPath, JSON.stringify([{
      surveyType: 'Supplier',
      sourceName: 'Reviewed source name',
      targetBpCode: 'BP001',
    }]));
    assert.throws(() => loadCompanyAliases(aliasPath), /reviewedBy, and reviewedAt/);

    writeFileSync(aliasPath, JSON.stringify([{
      surveyType: 'Supplier',
      sourceName: 'Reviewed source name',
      targetBpCode: 'BP001',
      reviewedBy: 'procurement-owner',
      reviewedAt: '2026-09-16T09:30:00',
    }]));
    assert.throws(() => loadCompanyAliases(aliasPath), /ISO timestamp with a timezone/);

    writeFileSync(aliasPath, JSON.stringify([{
      surveyType: 'Supplier',
      sourceName: 'Reviewed source name',
      targetBpCode: 'BP001',
      reviewedBy: 'procurement-owner',
      reviewedAt: '2026-09-16T09:30:00+14:01',
    }]));
    assert.throws(() => loadCompanyAliases(aliasPath), /ISO timestamp with a timezone/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
