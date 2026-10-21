import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsQueryParams, loadCompanyWideAnalytics, type AnalyticsQuery } from './companyWideAnalytics';
import { buildAnalyticsSnapshot, buildAnalyticsViews, parseAnalyticsViews, selectAnalyticsView } from '../domain/analyticsSnapshot';
import type { SurveyResponse, SurveyType } from '../../../types/survey';
import { DEFAULT_CATEGORIES, getStoredCategoryLabels } from '../../../data/questionCategories';
import { supabase } from '../../../services/supabaseClient';

const query: AnalyticsQuery = { scope: 'current', types: ['Courier'], dateRange: { from: '', to: '' }, series: [] };

test('custom dates use inclusive local days and an exclusive next-day boundary, including DST', (t) => {
  const previous = process.env.TZ;
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
  process.env.TZ = 'America/New_York';
  const params = analyticsQueryParams({ ...query, scope: 'custom', dateRange: { from: '2026-03-08', to: '2026-03-08' }, series: ['period-1'] });
  assert.equal(params.get('from'), '2026-03-08T05:00:00.000Z');
  assert.equal(params.get('to'), '2026-03-09T04:00:00.000Z');
  assert.equal(params.get('series'), 'period-1');
  assert.equal(analyticsQueryParams(query).has('from'), false);
  assert.throws(() => analyticsQueryParams({ ...query, scope: 'custom', dateRange: { from: '2026-10-02', to: '2026-10-01' } }));
  assert.throws(() => analyticsQueryParams({ ...query, scope: 'custom', dateRange: { from: '2026-02-30', to: '' } }));
});

test('Analytics service authenticates requests and validates summaries; it never falls back to scoped raw data', async (t) => {
  t.mock.method(supabase.auth, 'getSession', async () => ({ data: { session: { access_token: 'synthetic-token' } }, error: null }));
  const views = buildAnalyticsViews([], ['Courier'], [], []);
  const controller = new AbortController();
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.match(url, /^\/api\/analytics\?/);
    assert.equal(new URL(url, 'https://synthetic.invalid').searchParams.has('access_token'), false);
    assert.deepEqual(init.headers, { Authorization: 'Bearer synthetic-token' });
    assert.equal(init.signal, controller.signal);
    assert.equal(init.cache, 'no-store');
    return new Response(JSON.stringify({ ...views.all, categories: views.categories }), { status: 200 });
  });
  assert.deepEqual(await loadCompanyWideAnalytics(query, controller.signal), views);
  fetchMock.mock.mockImplementation(async () => new Response('<html>Static SPA fallback</html>', { status: 200 }));
  await assert.rejects(loadCompanyWideAnalytics(query, controller.signal), /Invalid Analytics/);
  fetchMock.mock.mockImplementation(async () => new Response('{}', { status: 503 }));
  await assert.rejects(loadCompanyWideAnalytics(query, controller.signal), /unavailable/);
  fetchMock.mock.mockImplementation(async () => { throw new Error('Network unavailable'); });
  await assert.rejects(loadCompanyWideAnalytics(query, controller.signal), /Network unavailable/);
});

test('all category tabs select already-loaded summaries without another network request', async (t) => {
  t.mock.method(supabase.auth, 'getSession', async () => ({ data: { session: { access_token: 'synthetic-token' } }, error: null }));
  const types = ['Courier', 'Supplier', 'Subcontractor'] as const;
  const views = buildAnalyticsViews([], [...types], [], []);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...views.all, categories: views.categories })));
  const loaded = await loadCompanyWideAnalytics({ ...query, types: [...types] }, new AbortController().signal);
  for (const type of [undefined, ...types, undefined, ...types]) {
    assert.equal(selectAnalyticsView(loaded, type ? [type] : []), type ? loaded.categories.find((category) => category.type === type)?.snapshot : loaded.all);
  }
  assert.equal(fetchMock.mock.callCount(), 1);
  const restricted = buildAnalyticsViews([], ['Courier'], [], []);
  assert.equal(selectAnalyticsView(restricted, ['Supplier']), undefined);
});

test('category view validation rejects missing, duplicate, and mixed-category summaries', () => {
  const views = buildAnalyticsViews([], ['Courier', 'Supplier'], [], []);
  const payload = { ...views.all, categories: views.categories };
  assert.deepEqual(parseAnalyticsViews(payload), views);
  assert.throws(() => parseAnalyticsViews({ ...payload, categories: views.categories.slice(0, 1) }), /Incomplete/);
  assert.throws(() => parseAnalyticsViews({ ...payload, categories: [views.categories[0], views.categories[0]] }), /Incomplete/);
  assert.throws(() => parseAnalyticsViews({ ...payload, categories: [{ ...views.categories[0], snapshot: views.all }, views.categories[1]] }), /Invalid/);
});

test('reusing company analysis preserves every independently calculated category metric', () => {
  const types: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
  const responses: SurveyResponse[] = types.flatMap((type, index) => [0, 1, 2].map((submission): SurveyResponse => ({
    responseId: `${type}-${submission}`, companyId: `${type}-partner`, company: `Synthetic ${type}`, surveyType: type,
    respondentType: 'Employee', submissionDate: `2026-${submission ? '02' : '01'}-01T00:00:00Z`,
    questionId: ['Q01', 'Q39', 'Q03'][index], questionNumber: 1, question: 'Criterion', questionCategory: 'Delivery',
    rating: submission === 2 ? 'N/A' : submission, comment: '', seriesId: 'period-1',
  })));
  const series = [{ id: 'period-1', label: 'First period', createdAt: '2026-01-01' }];
  const views = buildAnalyticsViews(responses, types, [], series);
  assert.deepEqual(views.all, buildAnalyticsSnapshot(responses, types, [], series));
  for (const category of views.categories) {
    assert.deepEqual(category.snapshot, buildAnalyticsSnapshot(responses.filter((response) => response.surveyType === category.type), [category.type], [], series));
  }
});

test('server rendering and blocked browser storage retain the same default section labels', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Reflect.deleteProperty(globalThis, 'localStorage');
    assert.deepEqual(getStoredCategoryLabels(), DEFAULT_CATEGORIES);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
    assert.deepEqual(getStoredCategoryLabels(), DEFAULT_CATEGORIES);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('Analytics service requires a session before making an API request', async (t) => {
  t.mock.method(supabase.auth, 'getSession', async () => ({ data: { session: null }, error: null }));
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected API request'); });
  await assert.rejects(loadCompanyWideAnalytics(query, new AbortController().signal), /Sign in again/);
  assert.equal(fetchMock.mock.callCount(), 0);
});
