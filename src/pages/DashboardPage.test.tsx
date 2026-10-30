import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmployeeWorkspacePage } from '../features/employee-experience/components/EmployeeWorkspacePage';
import { AdminDashboardControlBanner, DashboardDataScopeFilter, DashboardDataScopeToggle, DashboardPage } from './DashboardPage';
import { applyFilters, formatNumber, getKpiSummary } from '../features/analytics/domain/analytics';
import { buildAnalyticsSnapshot } from '../features/analytics/domain/analyticsSnapshot';
import { isOfficialAnalyticsResponse } from '../features/analytics/domain/responseProvenance';
import { filterCustomAnalyticsResponses } from '../features/analytics/domain/dateRange';
import type { FilterState, SurveyResponse, SurveyType } from '../types/survey';
import type { PersistedProfile } from '../features/account-management/domain/accountProfile';

Object.assign(globalThis, { React });

test('App supplies the same filtered official cohort and exact scope to Dashboard, Analytics, and generated reports', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const dashboard = source.match(/<DashboardPage\s[\s\S]*?\/>/)?.[0] ?? '';
  const analytics = source.match(/<AnalyticsPage\s[\s\S]*?\/>/)?.[0] ?? '';
  const reports = source.match(/<ReportsPage\s[\s\S]*?\/>/)?.[0] ?? '';
  for (const component of [dashboard, analytics]) {
    assert.match(component, /responses=\{analyticsFilteredResponses\}/);
    assert.match(component, /dataScope=\{dataScope\}/);
  }
  assert.match(dashboard, /historyResponses=\{analyticsFilteredResponses\}/);
  assert.match(dashboard, /allResponses=\{userAccessibleAllResponses\}/, 'Operational completion retains current-round submissions');
  assert.match(reports, /rankingResponses=\{analyticsFilteredResponses\}/);
  assert.match(reports, /companyReportResponses=\{analyticsFilteredResponses\}/);
});

test('Dashboard evaluation summary agrees with Analytics and report KPIs for filtered current, all-time, custom, and empty cohorts', () => {
  const row = (responseId: string, surveyType: SurveyType, rating: SurveyResponse['rating'], overrides: Partial<SurveyResponse> = {}): SurveyResponse => ({
    responseId, surveyType, company: `${surveyType} Partner`, companyId: surveyType,
    respondentType: 'Employee', submissionDate: '2026-10-10T12:00:00+08:00',
    questionId: surveyType === 'Courier' ? 'Q01' : surveyType === 'Supplier' ? 'Q39' : 'Q03',
    questionNumber: 1, question: 'Scored criterion', questionCategory: 'Quality', rating, comment: '',
    dataSource: 'client_csv', ...overrides,
  });
  const rows = [row('courier-zero', 'Courier', 0), row('supplier', 'Supplier', 3.55556), row('subcontractor', 'Subcontractor', 1.5),
    row('archived', 'Supplier', 4, { archived: true, seriesId: 'prior', submissionDate: '2026-08-01T12:00:00+08:00' }),
    row('blank', 'Supplier', 'N/A'), row('test', 'Supplier', 0, { dataSource: 'test_submission' })];
  const scenarios: { scope: 'current' | 'all-time' | 'custom'; input: SurveyResponse[]; company: string; expected: number; filters?: Partial<FilterState> }[] = [
    { scope: 'current' as const, input: rows.filter(r => !r.archived), company: '', expected: 3 },
    { scope: 'all-time' as const, input: rows, company: '', expected: 4 },
    { scope: 'custom' as const, input: filterCustomAnalyticsResponses(rows, { from: '2026-08-01', to: '2026-08-01' }, ['prior']), company: '', expected: 1 },
    { scope: 'current' as const, input: rows.filter(r => !r.archived), company: 'Supplier Partner', expected: 1 },
    { scope: 'custom' as const, input: filterCustomAnalyticsResponses(rows, { from: '2099-01-01', to: '' }), company: '', expected: 0 },
    { scope: 'current', input: rows.filter(r => !r.archived), company: '', expected: 1, filters: { surveyType: ['Supplier'] } },
    { scope: 'current', input: rows.filter(r => !r.archived), company: '', expected: 1, filters: { questionId: 'Q39' } },
    { scope: 'current', input: rows.filter(r => !r.archived), company: '', expected: 1, filters: { rating: 0 } },
    { scope: 'all-time', input: rows, company: '', expected: 1, filters: { search: 'Subcontractor Partner' } },
  ];
  const types: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
  for (const scenario of scenarios) {
    const cohort = applyFilters(scenario.input.filter(isOfficialAnalyticsResponse), {
      surveyType: [], search: '', questionId: '', rating: 'All', company: scenario.company, ...scenario.filters,
    });
    const summary = buildAnalyticsSnapshot(cohort, types, [], []);
    const report = getKpiSummary(cohort);
    assert.equal(summary.totalSubmissions, scenario.expected);
    assert.equal(report.totalResponses, summary.totalSubmissions);
    assert.equal(report.averageRating, summary.averageScore);
    const html = renderToStaticMarkup(createElement(DashboardPage, {
      responses: cohort, historyResponses: cohort, allResponses: rows.filter(r => !r.archived),
      partnerCompanies: [], isLoading: false, error: null, surveyTypeFilter: [], isAdmin: true, dataScope: scenario.scope,
    }));
    const table = html.match(/<table class="admin-dashboard-performance-table"[\s\S]*?<\/table>/)?.[0] ?? '';
    let dashboardCount = 0;
    for (const type of types) {
      const metrics = getKpiSummary(cohort.filter(r => r.surveyType === type));
      const categoryRow = table.match(new RegExp(`<tr><th[^>]*>${type}</th>[\\s\\S]*?</tr>`))?.[0] ?? '';
      assert.match(categoryRow, new RegExp(`>${metrics.totalResponses} submissions<`));
      if (metrics.totalResponses) assert.ok(categoryRow.includes(`<strong>${formatNumber(metrics.averageRating)}</strong>`));
      dashboardCount += metrics.totalResponses;
    }
    assert.equal(dashboardCount, report.totalResponses);
    if (scenario.scope === 'custom') assert.match(html, /Custom date range/);
  }
});

test('Dashboard totals count unique eligible employee/company assignments rather than submission volume', () => {
  const surveys = [{ id: 'form-1', title: 'Supplier round', surveyType: 'Supplier', description: '', createdAt: '2026-01-01', status: 'Running', questions: [], accessDepartments: ['TASS'], evaluationCompanyIds: ['supplier-1'] }];
  const accounts: PersistedProfile[] = [
    { email: 'one@example.com', role: 'Employee', department: 'TASS', designation: 'Rank & File' },
    { email: 'two@example.com', role: 'Employee', department: 'TASS', designation: 'Rank & File' },
    { email: 'admin@example.com', role: 'Admin', department: 'TASS', designation: 'Rank & File' },
    { email: 'other@example.com', role: 'Employee', department: 'Logistics', designation: 'Rank & File' },
  ];
  const partnerCompanies = ['supplier-1', 'supplier-2'].map(id => ({ id, name: id, type: 'Supplier' as const, createdAt: '2026-01-01' }));
  const row: SurveyResponse = { responseId: 'one', surveyId: 'form-1', surveyType: 'Supplier', company: 'supplier-1', companyId: 'supplier-1', respondentEmail: 'one@example.com', respondentType: 'Employee', submissionDate: '2026-10-01', questionId: 'Q39', questionNumber: 1, question: 'Quality', questionCategory: 'Quality', rating: 0, comment: '', dataSource: 'production_submission' };
  const render = (scope: 'current' | 'all-time' | 'custom', employees = accounts, rows = [row, { ...row, questionId: 'Q40' }]) => renderToStaticMarkup(createElement(DashboardPage, {
    responses: rows, historyResponses: rows, allResponses: rows, partnerCompanies, surveys, accounts: employees,
    isLoading: false, error: null, surveyTypeFilter: ['Supplier'], isAdmin: true, dataScope: scope,
  }));
  assert.equal((render('current').match(/>1 of 2 completed · 50%</g) ?? []).length, 2);
  assert.match(render('current'), />1 submissions</);
  assert.match(render('current', [], []), /No required assignments/);
  assert.match(render('current', [], [row]), /No required assignments/, 'Unassigned imports do not complete employee assignments');
  const repeated = [row, { ...row, responseId: 'repeat' }, { ...row, responseId: 'outside', respondentEmail: 'other@example.com' }];
  assert.equal((render('current', accounts, repeated).match(/>1 of 2 completed · 50%</g) ?? []).length, 2);
  assert.match(render('current', accounts, repeated), />3 submissions</);
  for (const scope of ['all-time', 'custom'] as const) {
    assert.match(render(scope), />1 submissions</);
    assert.match(render(scope), /Current-round completion/);
    assert.doesNotMatch(render(scope), /Historical completion/);
    assert.equal((render(scope).match(/>1 of 2 completed · 50%</g) ?? []).length, 2);
    assert.equal((render(scope, accounts, []).match(/>0 of 2 completed · 0%</g) ?? []).length, 2, 'Known zero completion remains visible in historical reporting views');
    assert.match(render(scope), />1 of 2 completed · 50%</, 'Operational form totals remain current-round');
  }
});

test('assignment setup failure preserves loaded scores, forms and recent submissions without claiming zero completion', () => {
  const row: SurveyResponse = { responseId: 'saved', surveyId: 'supplier', surveyType: 'Supplier', companyId: 'partner', company: 'Saved Supplier',
    respondentType: 'Employee', respondentEmail: 'employee@example.com', submissionDate: '2026-10-01', questionId: 'Q39', questionNumber: 1,
    question: 'Quality', questionCategory: 'Quality', rating: 5, comment: '', dataSource: 'production_submission' };
  const html = renderToStaticMarkup(createElement(DashboardPage, {
    responses: [row], allResponses: [row], partnerCompanies: [{ id: 'partner', name: 'Saved Supplier', type: 'Supplier', createdAt: '2026-01-01' }],
    surveys: [{ id: 'supplier', surveyType: 'Supplier', title: 'Saved form', description: '', createdAt: '2026-01-01', status: 'Running', questions: [], activeEvaluationCompanyIds: [] }],
    accounts: [{ email: 'employee@example.com', role: 'Employee', department: 'TASS', designation: 'Rank & File' }],
    isAdmin: true, isLoading: false, error: null, assignmentError: 'Database setup is incomplete.', surveyTypeFilter: [],
  }));
  assert.match(html, /Evaluation assignments are unavailable: Database setup is incomplete\./);
  assert.doesNotMatch(html, /Dashboard data could not be loaded|No required assignments|0 of 0 completed/);
  assert.match(html, /Saved form/);
  assert.match(html, />1 submissions</);
  assert.match(html, /aria-label="Recent evaluation submissions"/);
  assert.match(html, /Saved Supplier/);
  assert.match(html, /Completion unavailable/);
});

test('Employee dashboard period toggle preserves its existing selection behavior', () => {
  const changes: Array<'current' | 'all-time'> = [];
  const control = DashboardDataScopeToggle({ scope: 'current', onChange: (scope) => changes.push(scope) });
  const buttons = control.props.children as ReactElement[];

  assert.equal(buttons[0].props['aria-pressed'], true);
  assert.equal(buttons[1].props['aria-pressed'], false);
  buttons.forEach((button) => (button.props as { onClick: () => void }).onClick());
  assert.deepEqual(changes, ['current', 'all-time']);
});

test('Admin dashboard period filter exposes both reporting scopes and updates the selected value', () => {
  const changes: Array<'current' | 'all-time'> = [];
  const control = DashboardDataScopeFilter({ scope: 'current', onChange: (scope) => changes.push(scope) });
  const children = control.props.children as ReactElement[];
  const select = children[1] as ReactElement<{ value: string; children: ReactElement[]; onChange: (event: { target: { value: string } }) => void }>;

  assert.equal(select.props.value, 'current');
  assert.deepEqual(select.props.children.map((option) => option.props.value), ['current', 'all-time']);
  select.props.onChange({ target: { value: 'all-time' } });
  assert.deepEqual(changes, ['all-time']);
});

test('Admin dashboard banner keeps its evaluation workspace destination', () => {
  const destinations: string[] = [];
  const banner = AdminDashboardControlBanner({ onNavigate: (page) => destinations.push(page) });
  const sharedBanner = banner.props.children as ReactElement<{ onAction?: () => void }>;

  sharedBanner.props.onAction?.();
  assert.deepEqual(destinations, ['survey-forms']);
});

test('Employee Home keeps its welcome copy and illustration after banner extraction', () => {
  const html = renderToStaticMarkup(createElement(EmployeeWorkspacePage, {
    view: 'Home',
    surveys: [],
    partnerCompanies: [],
    responses: [],
    userEmail: 'employee@example.com',
    isLoading: false,
    error: null,
    onNavigate: () => {},
    onStartEvaluation: () => {},
  }));

  assert.match(html, /Better partners\.<br\/>Better work, together\./);
  assert.match(html, /class="hero-art"/);
  assert.equal((html.match(/class="art-line"/g) ?? []).length, 3);
  assert.match(html, /Explore your evaluations/);
});

test('Admin dashboard keeps the protected banner and presents its work in an action-first ledger', () => {
  const submitted: SurveyResponse[] = [{ responseId: 'response-1', surveyId: 'form-1', surveyType: 'Supplier', respondentType: 'Employee', submissionDate: '2026-10-20', company: 'Northstar Logistics', questionId: 'question-1', questionNumber: 1, question: 'How was the service?', questionCategory: 'Service', rating: 5, comment: '', dataSource: 'production_submission' }];
  const html = renderToStaticMarkup(createElement(DashboardPage, {
    responses: submitted,
    allResponses: submitted,
    partnerCompanies: [{
      id: 'partner-1',
      name: 'Northstar Logistics',
      type: 'Courier',
      createdAt: '2026-01-01',
      branches: [{ id: 'branch-1', bpCode: 'NORTHSTAR-1', documents: { 'Business Permit': { expiryDate: '2020-01-01' } } }],
    }],
    isLoading: false,
    error: null,
    surveyTypeFilter: [],
    surveys: [{ id: 'form-1', title: 'Quarterly Supplier Review', surveyType: 'Supplier', description: 'Quarterly review', createdAt: '2026-10-01', status: 'Running', questions: [] }],
    isAdmin: true,
    userEmail: 'admin@example.com',
    dataScope: 'current',
    onChangeDataScope: () => {},
    onOpenSurveyResponses: () => {},
    onNavigate: () => {},
  }));

  assert.match(html, /ADMINISTRATOR WORKSPACE/);
  assert.match(html, /Good to see you, Admin\./);
  assert.match(html, /Clear oversight\.<br\/>Better partnerships\./);
  assert.match(html, /Manage evaluations/);
  assert.match(html, /Operational overview/);
  assert.match(html, /Partners needing document review/);
  assert.match(html, /Partner documents/);
  assert.match(html, /Northstar Logistics/);
  assert.match(html, /Missing/);
  assert.match(html, /Evaluation forms in progress/);
  assert.match(html, /class="admin-dashboard-cycle-status running">Active<\/span>/);
  assert.match(html, /Recent submissions/);
  assert.match(html, /role="group" aria-label="Choose performance reporting period"/);
  assert.match(html, /aria-pressed="true" class="admin-dashboard-scope-button is-selected">Current Period<\/button>/);
  assert.match(html, /aria-pressed="false" class="admin-dashboard-scope-button">All-Time<\/button>/);
  assert.match(html, /class="admin-dashboard-category-badge courier"/);
  assert.match(html, /class="admin-dashboard-category-badge supplier"/);
  assert.match(html, /class="admin-dashboard-record-link"[^>]*>Quarterly Supplier Review<\/button>/);
  assert.match(html, /class="admin-dashboard-record-link"[^>]*>Northstar Logistics<\/button>/);
  assert.equal((html.match(/class="admin-dashboard-record-link"/g) ?? []).length, 3);
  assert.match(html, /Evaluation results/);
  assert.match(html, /<table class="admin-dashboard-work-table admin-dashboard-document-table" aria-label="Partners requiring document follow-up">/);
  assert.match(html, /<table class="admin-dashboard-work-table admin-dashboard-form-table" aria-label="Evaluation forms in progress">/);
  assert.match(html, /<table class="admin-dashboard-performance-table" aria-label="Average partner evaluation score by type">/);
  assert.ok(html.indexOf('admin-dashboard-document-table') < html.indexOf('admin-dashboard-form-table'));
  assert.ok(html.indexOf('admin-dashboard-form-table') < html.indexOf('admin-dashboard-performance-table'));
  assert.ok(html.indexOf('admin-dashboard-performance-table') < html.indexOf('Recent submissions'));
  assert.ok(html.indexOf('admin-dashboard-footer') > html.indexOf('Recent submissions'));
  assert.match(html, /Microgenesis · Administrator workspace/);
  assert.match(html, /Partner evaluations/);
  assert.doesNotMatch(html, /admin-dashboard-workbench|admin-dashboard-operations|admin-dashboard-insights/);
  assert.doesNotMatch(html, /admin-dashboard-bottom-grid/);
  assert.doesNotMatch(html, /Additional dashboard widgets/);
  assert.doesNotMatch(html, /Administrative modules/);
});

test('Dashboard hides stale results and recent entries during loading or failure', () => {
  for (const state of [{ isLoading: true, error: null }, { isLoading: false, error: 'Unable to load records' }]) {
    const html = renderToStaticMarkup(createElement(DashboardPage, {
      responses: [], allResponses: [], partnerCompanies: [], surveyTypeFilter: [], isAdmin: true, ...state,
    }));
    assert.match(html, /Evaluation results are temporarily unavailable/);
    assert.match(html, /Recent submissions are temporarily unavailable/);
    assert.doesNotMatch(html, /<table class="admin-dashboard-performance-table"/);
    assert.doesNotMatch(html, /No official submissions are available for this scope/);
  }
});
