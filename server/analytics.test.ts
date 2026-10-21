import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { analyticsHandler } from './analytics';
import { buildAnalyticsSnapshot, parseAnalyticsSnapshot, parseAnalyticsViews } from '../src/features/analytics/domain/analyticsSnapshot';
import type { SurveyResponse, SurveyAccessRole, SurveyType } from '../src/types/survey';
import { DEFAULT_CATEGORIES } from '../src/data/questionCategories';
import { stableUuid } from '../scripts/supabase-import/importPlan';
import { questionWeights } from '../src/data/questionWeights';

const identityId = '11111111-1111-4111-8111-111111111111';
const response = (id: string, rating: SurveyResponse['rating'], extra: Partial<SurveyResponse> = {}): SurveyResponse => ({
  responseId: id, surveyType: 'Courier', respondentType: 'Employee', submissionDate: '2026-10-01T00:00:00.000Z',
  company: 'Synthetic Partner', questionId: 'Q01', questionNumber: 1, question: 'Reliability', questionCategory: 'Delivery',
  rating, comment: 'private respondent remark', respondentEmail: 'private.person@mgenesis.com', department: 'TASS',
  dataSource: 'production_submission', ...extra,
});
const fixtures = [
  response('private-id-1', 3), response('private-id-2', 5, { department: 'Logistics' }),
  response('private-id-3', 1, { archived: true, seriesId: 'period-1', submissionDate: '2026-09-01T00:00:00.000Z' }),
  response('private-test', 0, { dataSource: 'test_submission' }), response('private-na', 'N/A'),
];

test('Analytics counts a CSV re-upload once and preserves a new client evaluation', async () => {
  const weight = questionWeights.Subcontractor[0];
  const upload = response('IMPORT-SUBCONTRACTOR-1', 1.6, { surveyType: 'Subcontractor',
    dataSource: 'client_csv', questionId: weight.questionId, questionCategory: weight.section });
  const original = { ...upload, surveyId: 'default-subcontractor',
    responseId: stableUuid('evaluation-submission:evaluation-form-subcontractor:1') };
  const added = { ...upload, responseId: 'RESP-new-client', rating: 2, dataSource: 'production_submission' as const };
  const result = await request({ role: 'Admin', responses: [original, upload, added] });
  assert.equal(result.status, 200);
  assert.equal(result.data.totalSubmissions, 2);
  assert.equal(result.data.companies[0].count, 2);
  assert.equal(result.data.companies[0].rankScore, 90);
});
type Row = { record_type: string; record_id: string; payload: unknown; created_at: string };
const row = (r: SurveyResponse): Row => ({ record_type: 'survey_response', record_id: `${r.responseId}:${r.questionId}`, payload: r, created_at: r.submissionDate });
interface Options {
  designation?: SurveyAccessRole; role?: string; invalidToken?: boolean; unconfirmed?: boolean; outsider?: boolean;
  missingProfile?: boolean; pages?: string[]; types?: string[]; departmentPages?: string[]; departmentTypes?: string[];
  failPage?: boolean; malformed?: boolean; responses?: SurveyResponse[]; unconfigured?: boolean;
  pageCap?: number; pageDelay?: number; missingCount?: boolean; shortPage?: boolean; categoryLabels?: Record<SurveyType, string[]>;
}

async function request(options: Options = {}, query = '', token: string | null = 'synthetic-token') {
  const operations: string[] = [];
  let activeReads = 0;
  let maxConcurrentReads = 0;
  const records: Row[] = [
    ...(options.responses ?? fixtures).map(row),
    { record_type: 'archive_series', record_id: 'period-1', payload: { id: 'period-1', label: 'First period', createdAt: '2026-09-01' }, created_at: '2026-09-01' },
    { record_type: 'partner_company', record_id: 'partner-1', payload: { id: 'partner-1', name: 'Synthetic Partner', type: 'Courier', createdAt: '2026-09-01' }, created_at: '2026-09-01' },
    { record_type: 'category_labels', record_id: 'global', payload: options.categoryLabels ?? { ...DEFAULT_CATEGORIES, Courier: ['Renamed Delivery', ...DEFAULT_CATEGORIES.Courier.slice(1)] }, created_at: '2026-09-01' },
  ];
  if (options.departmentPages || options.departmentTypes) records.push({
    record_type: 'department_permission', record_id: 'TASS', payload: { department: 'TASS', pages: options.departmentPages ?? ['analytics'], surveyTypes: options.departmentTypes ?? ['Courier'] }, created_at: '2026-09-01',
  });
  if (options.malformed) records.push({ ...row(response('bad', 4)), payload: { invalid: true } });
  const result = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const client = createClient('https://synthetic.supabase.co', 'synthetic-server-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      assert.equal(init?.method ?? 'GET', 'GET', 'Analytics must never mutate records');
      const target = new URL(String(url));
      if (target.pathname === '/auth/v1/user') {
        operations.push('identity');
        return options.invalidToken ? result({ message: 'invalid' }, 401) : result({ id: identityId, email: options.outsider ? 'person@example.com' : 'employee@mgenesis.com', email_confirmed_at: options.unconfirmed ? null : '2026-09-01', aud: 'authenticated', created_at: '2026-09-01', app_metadata: {}, user_metadata: {} });
      }
      if (target.pathname === '/rest/v1/app_profiles') {
        assert.equal(target.searchParams.get('user_id'), `eq.${identityId}`);
        assert.equal(target.searchParams.get('email'), 'eq.employee@mgenesis.com');
        return result(options.missingProfile ? null : { email: 'employee@mgenesis.com', role: options.role ?? 'Employee', designation: options.designation ?? 'Rank & File', department: 'TASS', permission_pages: options.pages ?? null, permission_survey_types: options.types ?? null });
      }
      if (target.pathname === '/rest/v1/application_records') {
        const types = target.searchParams.get('record_type') ?? '';
        const from = Number(target.searchParams.get('offset') ?? 0);
        operations.push(`${types}:${from}`);
        if (options.failPage && from > 0) return result({ message: 'private provider failure' }, 400);
        const selected = records.filter((r) => types.includes(r.record_type)).sort((a, b) => a.record_type.localeCompare(b.record_type) || a.record_id.localeCompare(b.record_id));
        const limit = Math.min(Number(target.searchParams.get('limit') ?? 1_000), options.pageCap ?? 1_000);
        const page = selected.slice(from, from + limit);
        if (options.shortPage && from > 0) page.pop();
        activeReads += 1;
        maxConcurrentReads = Math.max(maxConcurrentReads, activeReads);
        try {
          if (options.pageDelay) await new Promise((resolve) => setTimeout(resolve, options.pageDelay));
          return new Response(JSON.stringify(page), { headers: {
            'Content-Type': 'application/json',
            ...(!options.missingCount ? { 'Content-Range': page.length ? `${from}-${from + page.length - 1}/${selected.length}` : `*/${selected.length}` } : {}),
          } });
        } finally { activeReads -= 1; }
      }
      throw new Error('Unexpected provider request.');
    } },
  });
  const app = express();
  app.get('/api/analytics', analyticsHandler(options.unconfigured ? null : client));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/analytics?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json(), operations, maxConcurrentReads };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('all five employee ranks and Admin receive identical company-wide aggregates without respondent data', async () => {
  const admin = await request({ role: 'Admin' });
  assert.equal(admin.status, 200);
  assert.equal(admin.cache, 'no-store');
  assert.equal(admin.data.totalSubmissions, 2);
  assert.equal(admin.data.companies[0].count, 2);
  const expected = buildAnalyticsSnapshot(fixtures.slice(0, 2).concat(fixtures[4]), ['Courier', 'Supplier', 'Subcontractor'], [], []);
  assert.equal(admin.data.averageScore, expected.averageScore);
  assert.deepEqual(admin.data.companies, expected.companies);
  assert.equal(admin.data.analysis[0].companies[0].sections[0].section, 'Renamed Delivery');
  const { categories, ...summary } = admin.data;
  assert.deepEqual(parseAnalyticsSnapshot(summary), summary);
  assert.deepEqual(parseAnalyticsViews(admin.data).categories, categories);
  for (const designation of ['Rank & File', 'Supervisory', 'Managerial', 'Director', 'Executive'] as const) {
    const employee = await request({ designation });
    assert.equal(employee.status, 200);
    assert.deepEqual(employee.data, admin.data);
  }
  const serialized = JSON.stringify(admin.data);
  for (const secret of ['private.person', 'private respondent remark', 'private-id', 'respondentEmail', 'responseId', 'comment', 'department']) assert.equal(serialized.includes(secret), false);
});

test('current, all-time, custom dates and archive selections use the same official records', async () => {
  assert.equal((await request({}, 'types=Courier,Courier')).data.companies.length, 1);
  assert.equal((await request({}, 'scope=all-time')).data.totalSubmissions, 3);
  const params = new URLSearchParams({ scope: 'custom', from: '2026-09-30T16:00:00.000Z', to: '2026-10-01T16:00:00.000Z' });
  assert.equal((await request({}, String(params))).data.totalSubmissions, 2);
  params.set('to', '2026-10-01T00:00:00.000Z');
  assert.equal((await request({}, String(params))).data.totalSubmissions, 0, 'upper boundary is exclusive');
  assert.equal((await request({}, 'scope=custom&series=period-1')).data.totalSubmissions, 1);
  assert.equal((await request({}, 'scope=custom&series=missing')).data.hasResponses, false);
});

test('all partner categories retain canonical scoring and exclude test provenance', async () => {
  const responses = [
    response('courier', 0),
    response('supplier', 4, { surveyType: 'Supplier', questionId: 'Q-SUP-04', company: 'Synthetic Supplier' }),
    response('subcontractor', 1, { surveyType: 'Subcontractor', questionId: 'Q-SUB-04-a', company: 'Synthetic Subcontractor' }),
    response('test', 5, { dataSource: 'test_submission' }),
  ];
  const result = await request({ responses });
  assert.equal(result.status, 200);
  const expected = buildAnalyticsSnapshot(responses.slice(0, 3), ['Courier', 'Supplier', 'Subcontractor'], [], []);
  assert.deepEqual(result.data.companies, expected.companies);
  assert.deepEqual(result.data.questions, expected.questions);
  assert.deepEqual(result.data.volume, expected.volume);
  assert.equal(result.data.totalSubmissions, 3, 'zero remains an answered evaluation');
  const views = parseAnalyticsViews(result.data);
  for (const category of views.categories) {
    const expectedCategory = buildAnalyticsSnapshot(responses.slice(0, 3).filter((response) => response.surveyType === category.type), [category.type], [], []);
    assert.deepEqual(category.snapshot.companies, expectedCategory.companies);
    assert.equal(category.snapshot.averageScore, expectedCategory.averageScore);
    assert.deepEqual(category.snapshot.questions, expectedCategory.questions);
    assert.equal(category.snapshot.totalSubmissions, 1);
    assert.equal(category.snapshot.partnerDenominator, 1);
  }
  assert.equal(result.operations.filter((op) => op.includes('survey_response')).length, 1, 'all tab summaries share one paged database read');
});

test('missing, invalid, unconfirmed and noncompany identities cannot read analytics', async () => {
  for (const options of [{ invalidToken: true }, { unconfirmed: true }, { outsider: true }]) {
    const result = await request(options);
    assert.equal(result.status, 401);
    assert.deepEqual(result.operations, ['identity']);
  }
  assert.equal((await request({}, '', null)).status, 401);
  assert.equal((await request({ missingProfile: true })).status, 403);
  assert.equal((await request({ unconfigured: true })).status, 503);
});

test('account overrides and department ceilings are enforced before company-wide reads', async () => {
  for (const options of [{ pages: [] }, { departmentPages: [] }, { types: ['Supplier'] }, { departmentTypes: ['Supplier'] }]) {
    const result = await request(options, 'types=Courier');
    assert.equal(result.status, 403);
    assert.equal(result.operations.some((op) => op.includes('survey_response')), false);
  }
  const narrowed = await request({ pages: ['analytics'], types: ['Supplier'] });
  assert.equal(narrowed.status, 200);
  assert.equal(narrowed.data.totalSubmissions, 0);
  assert.deepEqual(narrowed.data.analysis.map((a: { type: string }) => a.type), ['Supplier']);
  assert.deepEqual(narrowed.data.categories.map((a: { type: string }) => a.type), ['Supplier']);
  assert.equal((await request({ role: 'Admin', pages: [], types: [], departmentPages: [] })).data.totalSubmissions, 2);
});

test('invalid filters and malformed stored rows fail closed without partial summaries', async () => {
  for (const query of ['scope=other', 'types=Uncategorized', 'from=bad', 'from=2026-02-30T00%3A00%3A00.000Z', 'scope=custom&from=2026-10-02T00%3A00%3A00.000Z&to=2026-10-01T00%3A00%3A00.000Z', 'types[0]=Courier']) assert.equal((await request({}, query)).status, 400);
  const invalid = await request({ malformed: true });
  assert.equal(invalid.status, 502);
  assert.equal('totalSubmissions' in invalid.data, false);
});

test('pagination includes records beyond the first thousand and a failed later page never returns partial metrics', async () => {
  const responses = Array.from({ length: 1_002 }, (_, index) => response(`private-${index}`, index % 2 ? 5 : 3));
  const full = await request({ responses });
  assert.equal(full.status, 200);
  assert.equal(full.data.totalSubmissions, 1_002);
  assert.ok(full.operations.some((op) => op.endsWith(':1000')));
  const partial = await request({ responses, failPage: true });
  assert.equal(partial.status, 502);
  assert.equal('totalSubmissions' in partial.data, false);
  assert.equal(JSON.stringify(partial.data).includes('private provider failure'), false);
});

test('database pages load in bounded parallel batches without losing capped or final-page rows', async () => {
  const responses = Array.from({ length: 2_507 }, (_, index) => response(`parallel-${index}`, index % 2 ? 5 : 3));
  const full = await request({ responses, pageCap: 500, pageDelay: 5 });
  assert.equal(full.status, 200);
  assert.equal(full.data.totalSubmissions, 2_507);
  assert.ok(full.maxConcurrentReads > 1);
  assert.ok(full.maxConcurrentReads <= 4);
  assert.ok(full.operations.some((op) => op.endsWith(':2500')));
  for (const options of [{ missingCount: true }, { responses, pageCap: 500, shortPage: true }]) {
    const incomplete = await request(options);
    assert.equal(incomplete.status, 502);
    assert.equal('totalSubmissions' in incomplete.data, false);
  }
});

test('reused company details receive renamed section labels exactly once across every view', async () => {
  const result = await request({ categoryLabels: { ...DEFAULT_CATEGORIES, Courier: ['Commercial', 'Delivery', 'Technology', 'Support', 'Security'] } });
  assert.equal(result.status, 200);
  assert.equal(result.data.analysis[0].companies[0].sections[0].section, 'Commercial');
  assert.equal(result.data.categories[0].snapshot.analysis[0].companies[0].sections[0].section, 'Commercial');
});

test('summary parsing rejects malformed nested data instead of trusting external JSON', () => {
  const summary = buildAnalyticsSnapshot(fixtures.slice(0, 2), ['Courier'], [], []);
  assert.deepEqual(parseAnalyticsSnapshot(summary), summary);
  for (const value of [null, {}, { ...summary, averageScore: '85' }, { ...summary, companies: [{ ...summary.companies[0], type: 'Other' }] }, { ...summary, analysis: [{ ...summary.analysis[0], companies: [{ ...summary.analysis[0].companies[0], sections: [{ section: 'Delivery', percent: NaN }] }] }] }]) assert.throws(() => parseAnalyticsSnapshot(value), /invalid summary/);
});
