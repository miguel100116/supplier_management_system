import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchivedReportBuilder } from './ArchivedReportBuilder';
import type { ArchivedReportData } from '../domain/archivedReports';
import type { SurveyResponse } from '../../../types/survey';

Object.assign(globalThis, { React });

test('single-item builder blocks downloads without selection or export permission, including empty company profiles', () => {
  const data: ArchivedReportData = { responses: [], surveys: [], knownSurveys: [], series: [],
    companies: [{ id: 'archived-company', name: 'Sample Courier', type: 'Courier', createdAt: '2026-01-01', isArchived: true }] };
  const props = { kind: 'archived-company' as const, data, onBack() {}, initialSettings: { category: 'Courier' as const, archivedItemId: 'archived-company' } };
  const restricted = renderToStaticMarkup(<ArchivedReportBuilder {...props} canExport={false} />);
  assert.match(restricted, /disabled=""[^>]*>Download report/);
  assert.match(restricted, /Export access restricted/);
  assert.match(restricted, /No response data/);
  assert.match(restricted, /Company profile/);
  const allowed = renderToStaticMarkup(<ArchivedReportBuilder {...props} canExport={true} />);
  assert.doesNotMatch(allowed, /disabled=""[^>]*>Download report/);
  const unselected = renderToStaticMarkup(<ArchivedReportBuilder {...props} initialSettings={{ archivedItemId: '' }} canExport={true} />);
  assert.match(unselected, /Select an archived item/);
  assert.match(unselected, /disabled=""[^>]*>Download report/);
});

test('an archive in Supplier opens automatically even when Courier has no records', () => {
  const data: ArchivedReportData = { responses: [], surveys: [], knownSurveys: [], series: [],
    companies: [{ id: 'supplier', name: 'Archived Supplier', type: 'Supplier', createdAt: '2026-01-01', isArchived: true }] };
  const html = renderToStaticMarkup(<ArchivedReportBuilder kind="archived-company" data={data} canExport={true} onBack={() => {}} />);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Supplier \(1\)/);
  assert.match(html, /value="supplier" selected=""/);
  assert.match(html, /Archived Supplier/);
  assert.doesNotMatch(html, /disabled=""[^>]*>Download report/);
});

test('archived preview has one compact leaderboard before the details without inner scroll containers', () => {
  const responses: SurveyResponse[] = Array.from({ length: 5 }, (_, index) => ({
    responseId: `archived-${index}`, companyId: `company-${index}`, company: `Company ${index}`, surveyType: 'Courier',
    respondentType: 'Employee', submissionDate: '2026-07-01', questionId: 'Q01', questionNumber: 1,
    question: 'Delivery reliability', questionCategory: 'Delivery', rating: (index + 1) * 3, comment: '', archived: true, seriesId: 'batch-a',
  }));
  const data: ArchivedReportData = { responses, surveys: [], knownSurveys: [], companies: [], series: [{ id: 'batch-a', label: 'Batch A', createdAt: '2026-07-01' }] };
  const html = renderToStaticMarkup(<ArchivedReportBuilder kind="archived-responses" data={data} canExport onBack={() => {}} />);
  assert.equal((html.match(/aria-label="Courier Company Leaderboard"/g) ?? []).length, 1);
  assert.match(html, /Rank 1: Company 4, 100.00 \/ 100/);
  assert.match(html, /Rank 5: Company 0, 20.00 \/ 100/);
  assert.doesNotMatch(html, /overflow-[xy]-auto|max-h-\[75vh\]|min-w-\[640px\]/);
});

test('survey preview defaults to Letter and presents numbered reference pages with a three-column question table', () => {
  const survey = { id: 'survey', title: 'Archived survey', description: '', createdAt: '2026-01-01', status: 'Archived' as const, surveyType: 'Courier' as const, questions: [] };
  const data: ArchivedReportData = { responses: [{ responseId: 'one', surveyId: 'survey', company: 'Courier company', surveyType: 'Courier', respondentType: 'Employee', submissionDate: '2026-07-01', questionId: 'Q01', questionNumber: 1, question: 'Service quality', questionCategory: 'Delivery', rating: 15, comment: '', archived: true }], surveys: [survey], knownSurveys: [survey], companies: [], series: [] };
  const html = renderToStaticMarkup(<ArchivedReportBuilder kind="archived-survey" data={data} canExport onBack={() => {}} />);
  assert.match(html, /value="letter" selected=""/);
  for (const number of [1, 2, 3]) assert.match(html, new RegExp(`Page ${number} of 3`));
  assert.match(html, /Created \/ Archived/);
  assert.doesNotMatch(html, />Answers \(including N\/A\)</);
  assert.match(html, /background:#e8ecf2/);
  const saved = renderToStaticMarkup(<ArchivedReportBuilder kind="archived-survey" data={data} canExport onBack={() => {}} initialSettings={{ paperSize: 'legal' }} />);
  assert.match(saved, /value="legal" selected=""/);
});

test('the semantic report text retains the 50-comment limit without dropping downloadable comments', () => {
  const survey = { id: 'survey', title: 'Archived survey', description: '', createdAt: '2026-01-01', status: 'Archived' as const, surveyType: 'Courier' as const, questions: [] };
  const data: ArchivedReportData = { responses: Array.from({ length: 51 }, (_, index) => ({ responseId: `form-${index}`, surveyId: 'survey', company: 'Courier company', surveyType: 'Courier', respondentType: 'Employee', submissionDate: '2026-07-01', questionId: 'remark', questionNumber: 1, question: 'Remarks', questionCategory: 'Overall', rating: 'N/A', comment: `Stored comment ${index + 1} ends here`, archived: true })), surveys: [survey], knownSurveys: [survey], companies: [], series: [] };
  const html = renderToStaticMarkup(<ArchivedReportBuilder kind="archived-survey" data={data} canExport onBack={() => {}} initialSettings={{ includeComments: true }} />);
  assert.match(html, /First 50 of 51 comments shown/);
  assert.match(html, /Stored comment 50 ends here/);
  assert.doesNotMatch(html, /Stored comment 51 ends here/);
  assert.equal(data.responses.length, 51);
});
