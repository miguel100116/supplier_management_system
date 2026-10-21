import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionPerformanceRow } from './QuestionPerformanceRow';
import { AnalyticsDateRangeControls } from './AnalyticsDateRangeControls';
import { AnalyticsPage } from '../../../pages/AnalyticsPage';
import { applyFilters, initialFilters } from '../domain/analytics';
import type { SurveyResponse, SurveyType } from '../../../types/survey';
import { ExecutiveSummaryReportBuilderPage } from '../../../pages/ExecutiveSummaryReportBuilderPage';
import { QuestionReportBuilderPage } from '../../../pages/QuestionReportBuilderPage';
import { CompanyReportBuilderPage } from '../../../pages/CompanyReportBuilderPage';
import { questionWeights } from '../../../data/questionWeights';
import { ReportsPage } from '../../../pages/ReportsPage';

function renderReport(element: React.ReactElement) {
  const previousReact = (globalThis as { React?: typeof React }).React;
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { React, localStorage: { getItem: () => null }, window: { location: { pathname: '/reports', search: '' } } });
  try { return renderToStaticMarkup(element); }
  finally { Object.assign(globalThis, { React: previousReact, localStorage: previousStorage, window: previousWindow }); }
}

test('empty executive reports do not invent findings or declining performance', () => {
  const markup = renderReport(<ExecutiveSummaryReportBuilderPage responses={[]} partnerCompanies={[]} onBack={() => {}} />);
  assert.doesNotMatch(markup, /Courier lines lead|documentation bottlenecks|Core Performance Advisory|Focus Required on|has dropped/);
});

test('question reports do not list registry-only partners as evaluated companies', () => {
  const markup = renderReport(<QuestionReportBuilderPage responses={[]} partnerCompanies={[{
    id: 'unevaluated', name: 'Registry Only Partner', type: 'Courier', createdAt: '2026-01-01',
  }]} onBack={() => {}} />);
  assert.doesNotMatch(markup, /Registry Only Partner/);
});

test('company report preview includes historical names by stable company ID', () => {
  const weight = questionWeights.Courier[0];
  const base: SurveyResponse = { responseId: 'current', companyId: 'partner', company: 'Current Partner', surveyType: 'Courier',
    submissionDate: '2026-10-01', respondentType: 'Employee', questionId: weight.questionId, questionNumber: 1,
    question: 'Criterion', questionCategory: weight.section, rating: weight.maxPoints, comment: '' };
  const markup = renderReport(<CompanyReportBuilderPage responses={[base, {
    ...base, responseId: 'old-name', company: 'Old Partner Name', submissionDate: '2026-09-01', rating: weight.maxPoints / 2,
  }]} partnerCompanies={[{ id: 'partner', name: 'Current Partner', type: 'Courier', createdAt: '2026-01-01' }]}
    initialSettings={{ category: 'Courier', selectedCompany: 'Current Partner' }} onBack={() => {}} />);
  assert.match(markup, /Leaderboard score<\/p><p[^>]*>75\.00 \/ 100<\/p>/);
});

test('generated report summaries and question content use the same official cohort as their rankings', () => {
  const weight = questionWeights.Courier[0];
  const official: SurveyResponse = { responseId: 'official', company: 'Official Partner', surveyType: 'Courier',
    respondentType: 'Employee', submissionDate: '2026-10-01', questionId: weight.questionId, questionNumber: 1,
    question: 'Official Criterion', questionCategory: weight.section, rating: weight.maxPoints, comment: '' };
  const raw = { ...official, responseId: 'test', company: 'Test Partner', question: 'Test-only Criterion', rating: 0 };
  const markup = renderReport(<ReportsPage responses={[official, raw]} rankingResponses={[official]} partnerCompanies={[]}
    initialRecipe={{ kind: 'summary', parameters: {} }} />);
  assert.match(markup, /Official Partner/);
  assert.doesNotMatch(markup, /Test-only Criterion|Test Partner/);
  assert.match(markup, /Average System-wide Score:<\/span> 100\.00%/);
});

test('executive notes entered by the client are retained and unscored categories do not create warnings', () => {
  const weight = questionWeights.Courier[0];
  const response: SurveyResponse = { responseId: 'one', company: 'Partner', surveyType: 'Courier', respondentType: 'Employee',
    submissionDate: '2026-10-01', questionId: weight.questionId, questionNumber: 1, question: 'Criterion',
    questionCategory: weight.section, rating: weight.maxPoints, comment: '' };
  const markup = renderReport(<ExecutiveSummaryReportBuilderPage responses={[response]} partnerCompanies={[]}
    initialSettings={{ customNotesText: 'Client reviewed this reporting period.' }} onBack={() => {}} />);
  assert.match(markup, /Client reviewed this reporting period\./);
  assert.doesNotMatch(markup, /Focus Required on Supplier|Focus Required on Subcontractor/);
});

const COMPANY_ANALYSIS_SOURCE = readFileSync(
  new URL('./CompanyAnalysisPanel.tsx', import.meta.url),
  'utf8',
);

test('partner type selector keeps its original buttons responsive without truncating labels', () => {
  assert.match(COMPANY_ANALYSIS_SOURCE, /segmented-control w-full max-w-full lg:w-auto/);
  assert.match(COMPANY_ANALYSIS_SOURCE, /min-w-max py-2 text-center w-full flex-1/);
  assert.match(COMPANY_ANALYSIS_SOURCE, /\{surveyTypeDisplayLabel\[type\]\}/);
  assert.doesNotMatch(COMPANY_ANALYSIS_SOURCE, /lg:w-\[23rem\]/);
});

test('question performance row wraps text and keeps its score bar in separate flow', () => {
  const question = 'A long evaluation question that needs more than one line to remain readable';
  const markup = renderToStaticMarkup(
    <QuestionPerformanceRow rank={39} question={question} average={84.5} />,
  );

  assert.match(markup, /whitespace-normal break-words/);
  assert.doesNotMatch(markup, /\btruncate\b/);
  assert.match(markup, /mt-2 block h-1\.5/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-valuenow="84\.5"/);
  assert.match(markup, new RegExp(question));
});

test('date calendars display selected values, boundary constraints, and reversed-range validation', () => {
  const markup = renderToStaticMarkup(<AnalyticsDateRangeControls value={{ from: '2026-09-10', to: '2026-09-12' }} />);
  assert.match(markup, /type="date"/);
  assert.match(markup, /value="2026-09-10"/);
  assert.match(markup, /value="2026-09-12"/);
  assert.match(markup, /max="2026-09-12"/);
  assert.match(markup, /min="2026-09-10"/);
  const invalid = renderToStaticMarkup(<AnalyticsDateRangeControls value={{ from: '2026-09-12', to: '2026-09-10' }} />);
  assert.match(invalid, /role="alert"/);
  assert.match(invalid, /From date must be on or before To date/);
});

test('custom calendars and period selection remain available when no analytics match', () => {
  // Legacy page JSX uses the classic transform in this Node test runner.
  const globals = globalThis as typeof globalThis & { React?: typeof React };
  const previous = globals.React;
  globals.React = React;
  try {
    const props = { responses: [], activeSurveyTypes: [], filters: { surveyType: [], questionId: '', rating: 'All' as const, company: '', search: '' }, setFilters: () => undefined };
    const custom = renderToStaticMarkup(<AnalyticsPage {...props} dataScope="custom" archiveSeries={[{ id: 'period-1', label: 'Example period', createdAt: '2026-09-01' }]} />);
    assert.match(custom, /id="analytics-date-from"/);
    assert.match(custom, /id="analytics-date-to"/);
    assert.match(custom, /Example period/);
    assert.match(custom, /No analytics available/);
    const current = renderToStaticMarkup(<AnalyticsPage {...props} dataScope="current" />);
    assert.doesNotMatch(current, /id="analytics-date-from"/);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globals, 'React');
    else globals.React = previous;
  }
});

test('local category views render their supplied response scope and keep every permitted tab available', () => {
  const globals = globalThis as typeof globalThis & { React?: typeof React };
  const previous = globals.React;
  globals.React = React;
  try {
    const types: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
    const responses: SurveyResponse[] = types.map((type, index) => ({
      responseId: `synthetic-${index}`, surveyType: type, respondentType: 'Employee', submissionDate: '2026-10-01T00:00:00Z',
      company: `Example ${type}`, questionId: ['Q01', 'Q-SUP-04', 'Q-SUB-04-a'][index], questionNumber: 1,
      question: `Synthetic ${type} question`, questionCategory: 'Delivery', rating: 1, comment: '',
    }));
    for (const type of [undefined, ...types, undefined]) {
      const selected = type ? [type] : [];
      const markup = renderToStaticMarkup(<AnalyticsPage responses={applyFilters(responses, { ...initialFilters, surveyType: selected })} activeSurveyTypes={type ? [type] : types} permittedSurveyTypes={types} filters={{ surveyType: selected, questionId: '', rating: 'All', company: '', search: '' }} setFilters={() => undefined} />);
      assert.match(markup, /Analytics summary/);
      assert.doesNotMatch(markup, /Loading Analytics|Analytics unavailable/);
      for (const category of types) assert.match(markup, new RegExp(`>${category}</button>`));
      for (const category of types) {
        assert.equal(markup.includes(`title="Example ${category}"`), !type || category === type);
      }
    }
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globals, 'React');
    else globals.React = previous;
  }
});

test('Analytics renders loaded responses without calling an aggregate API', (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Analytics must use loaded responses'); });
  const globals = globalThis as typeof globalThis & { React?: typeof React };
  const previous = globals.React;
  globals.React = React;
  try {
    const responses: SurveyResponse[] = [{
      responseId: 'retained', company: 'Retained Partner', surveyType: 'Courier', respondentType: 'Employee',
      submissionDate: '2026-10-01T00:00:00Z', questionId: 'Q01', questionNumber: 1, question: 'Criterion',
      questionCategory: 'Delivery', rating: 15, comment: '',
    }];
    const markup = renderToStaticMarkup(<AnalyticsPage responses={responses}
      activeSurveyTypes={['Courier']} permittedSurveyTypes={['Courier']}
      filters={{ surveyType: [], questionId: '', rating: 'All', company: '', search: '' }} setFilters={() => undefined} />);
    assert.match(markup, /Retained Partner/);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.match(markup, /Analytics summary/);
    assert.doesNotMatch(markup, /Loading Analytics/);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globals, 'React');
    else globals.React = previous;
  }
});
