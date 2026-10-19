import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionPerformanceRow } from './QuestionPerformanceRow';
import { AnalyticsDateRangeControls } from './AnalyticsDateRangeControls';
import { AnalyticsPage } from '../../../pages/AnalyticsPage';

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
