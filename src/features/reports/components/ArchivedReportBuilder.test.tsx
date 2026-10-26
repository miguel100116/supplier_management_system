import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchivedReportBuilder } from './ArchivedReportBuilder';
import type { ArchivedReportData } from '../domain/archivedReports';

Object.assign(globalThis, { React });

test('single-item builder blocks downloads without selection or export permission, including empty company profiles', () => {
  const data: ArchivedReportData = { responses: [], surveys: [], knownSurveys: [], series: [],
    companies: [{ id: 'archived-company', name: 'Sample Courier', type: 'Courier', createdAt: '2026-01-01', isArchived: true }] };
  const props = { kind: 'archived-company' as const, data, onBack() {}, initialSettings: { category: 'Courier' as const, archivedItemId: 'archived-company' } };
  const restricted = renderToStaticMarkup(<ArchivedReportBuilder {...props} canExport={false} />);
  assert.match(restricted, /disabled=""[^>]*>Download report/);
  assert.match(restricted, /Export access restricted/);
  assert.match(restricted, /No evaluation data/);
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
