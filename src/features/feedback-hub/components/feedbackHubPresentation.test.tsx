import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomForm, SurveyResponse } from '../../../types/survey';
import { formatLogDateTime } from '../../../utils/time';
import { FeedbackHubFilterBar } from './FeedbackHubFilterBar';
import { PastResultsTab } from './PastResultsTab';
import { SentReportsTab } from './SentReportsTab';
import { SurveyDetailModal } from './SurveyDetailModal';
import { SurveyProgressModal } from './SurveyProgressModal';

const noop = () => {};

test('Feedback Hub filter bar keeps search and count visible and discloses filters on demand', () => {
  const defaults = {
    searchValue: '',
    searchPlaceholder: 'Search results',
    searchLabel: 'Search results by title',
    onSearchChange: noop,
    resultCount: 4,
    resultLabel: 'results',
    sortOptions: [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }],
    sortValue: 'newest',
    defaultSortValue: 'newest',
    onSortChange: noop,
    dateFrom: '',
    dateTo: '',
    dateLabel: 'Created date',
    onDateFromChange: noop,
    onDateToChange: noop,
    categoryValue: 'All',
    categoryLabel: 'Partner type',
    categoryOptions: [{ value: 'All', label: 'All partner types' }, { value: 'Supplier', label: 'Supplier' }],
    onCategoryChange: noop,
    onReset: noop,
  };
  const defaultMarkup = renderToStaticMarkup(createElement(FeedbackHubFilterBar, defaults));
  assert.match(defaultMarkup, /Search results by title/);
  assert.match(defaultMarkup, /4 results/);
  assert.match(defaultMarkup, /aria-label="Created date"/);
  assert.match(defaultMarkup, /aria-label="Sort: Newest first"/);
  assert.doesNotMatch(defaultMarkup, /feedback-reset-filters/);

  const activeMarkup = renderToStaticMarkup(createElement(FeedbackHubFilterBar, {
    ...defaults,
    searchValue: 'Acme',
    categoryValue: 'Supplier',
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    sortValue: 'oldest',
  }));
  for (const label of ['Search: Acme', 'Partner type: Supplier', 'Created date: 2026-01-01', 'Sort: Oldest first', 'Reset']) {
    assert.ok(activeMarkup.includes(label), label);
  }
});

function response(index: number, surveyType: SurveyResponse['surveyType'] = 'Supplier'): SurveyResponse {
  return {
    responseId: `response-${index}`,
    surveyType,
    respondentType: 'Employee',
    submissionDate: '2026-05-03T10:24:00.000Z',
    company: `Company ${index}`,
    department: 'Procurement',
    questionId: 'supplier-quality',
    questionNumber: 1,
    question: 'How was the service?',
    questionCategory: 'Quality',
    rating: 80,
    comment: '',
    respondentEmail: `person${index}@mgenesis.com`,
  };
}

const survey: CustomForm = {
  id: 'survey-1',
  title: 'Supplier performance review',
  surveyType: 'Supplier',
  description: 'Quarterly supplier review',
  createdAt: '2026-04-01T00:00:00.000Z',
  status: 'Completed',
  questions: [{ questionId: 'supplier-quality', questionNumber: 1, question: 'How was the service?', questionCategory: 'Quality' }],
};

test('Past Results explains type-wide response counts and retains the existing capped threshold calculation', () => {
  const markup = renderToStaticMarkup(createElement(PastResultsTab, {
    surveys: [survey],
    responses: Array.from({ length: 11 }, (_, index) => response(index)),
    partnerCompanies: [],
    sentReports: [],
    onOpenSendToPartner: noop,
  }));

  assert.match(markup, /100%/);
  assert.match(markup, /11 type responses \/ 10 threshold/);
  assert.match(markup, /grouped across unarchived submissions for the partner type/);
  assert.match(markup, /Survey created/);
  assert.match(markup, /Partner type/);
  assert.match(markup, /Scope/);
  assert.match(markup, /Export PDF/);
  assert.match(markup, /Send report to partner/);
});

test('Sent Reports exposes compact partner-type filtering and counts its filtered results', () => {
  const markup = renderToStaticMarkup(createElement(SentReportsTab, {
    sentReports: [],
    onConfirmNow: noop,
    onReturnReport: noop,
    onReviseReport: noop,
    onResendReport: noop,
    onPreviewDocument: noop,
    onUpdateTimerSettings: noop,
    currentTimerMinutes: 30,
    userEmail: 'admin@mgenesis.com',
  }));

  assert.match(markup, /Filter by partner type/);
  assert.match(markup, /Filter by delivery status/);
  assert.match(markup, /0 reports/);
  assert.doesNotMatch(markup, /feedback-reset-filters/);
});

test('Analytics modal presents partner-type aggregation and human-readable respondent dates', () => {
  const submittedAt = '2026-05-03T10:24:00.000Z';
  const markup = renderToStaticMarkup(createElement(SurveyDetailModal, {
    survey,
    responses: [response(1)],
    partnerCompanies: [],
    onClose: noop,
    onSendToPartner: noop,
  }));

  assert.match(markup, /Overall score/);
  assert.match(markup, /Total responses/);
  assert.match(markup, /all unarchived submissions for Supplier/);
  assert.match(markup, new RegExp(`dateTime="${submittedAt}"`, 'i'));
  assert.ok(markup.includes(`>${formatLogDateTime(submittedAt)}<`));
  assert.doesNotMatch(markup, new RegExp(`>${submittedAt}<`));
});

test('Progress modal formats raw submission timestamps and separates footer actions', () => {
  const submittedAt = '2026-05-03T10:24:00.000Z';
  const markup = renderToStaticMarkup(createElement(SurveyProgressModal, {
    survey,
    surveys: [survey],
    responses: [response(1)],
    partnerCompanies: [],
    accounts: [],
    onClose: noop,
    onMarkComplete: noop,
    isAdmin: true,
  }));

  assert.match(markup, new RegExp(`dateTime="${submittedAt}"`, 'i'));
  assert.ok(markup.includes(`>${formatLogDateTime(submittedAt)}<`));
  assert.ok(markup.indexOf('Supplier performance review') < markup.indexOf('>Ongoing<'));
  assert.ok(markup.indexOf('>Ongoing<') < markup.indexOf('>Supplier<'));
  assert.match(markup, /feedback-progress-header-main/);
  assert.match(markup, /aria-label="Close survey progress"/);
  assert.ok(markup.indexOf('feedback-progress-close"') < markup.indexOf('Complete survey'));
  assert.match(markup, /primary-button feedback-progress-complete/);
  assert.doesNotMatch(markup, /feedback-progress-footer-help|Completes automatically once/);
  assert.doesNotMatch(markup, new RegExp(`>${submittedAt}<`));
});

test('progress overview separates submissions from per-employee completion and keeps records accessible', () => {
  const running = { ...survey, status: 'Running' as const, deadlineDate: '31/12/2099' };
  const markup = renderToStaticMarkup(createElement(SurveyProgressModal, {
    survey: running, surveys: [running], responses: [response(1)],
    partnerCompanies: [1, 2].map(index => ({ id: `company-${index}`, name: `Company ${index}`, type: 'Supplier' as const, createdAt: '2026-01-01' })),
    accounts: [1, 2].map(index => ({ email: `person${index}@mgenesis.com`, role: 'Employee', designation: 'Rank & File', department: 'Logistics' })),
    onClose: noop, isAdmin: false,
  }));
  assert.match(markup, /<dt>Submitted evaluations<\/dt><dd>1<\/dd>/);
  assert.match(markup, /0 of 2 employees complete/);
  assert.match(markup, /<progress value="1" max="2" aria-label="Evaluations completed by person1@mgenesis.com"/);
  assert.match(markup, /<caption class="sr-only">Employee evaluation completion<\/caption>/);
  assert.match(markup, /<caption class="sr-only">Recorded respondents<\/caption>/);
  assert.doesNotMatch(markup, /Complete survey|Export PDF|\/ 2 target/);
});

test('empty progress is explicit and does not imply a company target or score', () => {
  const markup = renderToStaticMarkup(createElement(SurveyProgressModal, {
    survey, surveys: [survey], responses: [], partnerCompanies: [], accounts: [], onClose: noop,
  }));
  assert.match(markup, /No employees currently have access/);
  assert.match(markup, /No employees have submitted responses yet/);
  assert.match(markup, /<dd>N\/A<\/dd>/);
  assert.doesNotMatch(markup, /<progress|Complete survey/);
});
