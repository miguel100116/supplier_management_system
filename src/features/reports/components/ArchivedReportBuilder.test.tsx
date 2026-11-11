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
  assert.match(html, /value="Supplier" selected=""/);
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
  assert.ok(html.indexOf('aria-label="Courier Company Leaderboard"') < html.indexOf('id="archived-section-0"'));
  assert.doesNotMatch(html, /overflow-[xy]-auto|max-h-\[75vh\]|min-w-\[640px\]/);
});
