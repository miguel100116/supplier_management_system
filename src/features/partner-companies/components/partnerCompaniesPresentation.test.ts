import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartnerCompaniesFilterToolbar } from './PartnerCompaniesFilterToolbar';
import { PartnerRegistryOverview } from './PartnerRegistryOverview';

const PARTNER_COMPANIES_SOURCE = readFileSync(
  new URL('../../../pages/PartnerCompaniesPage.tsx', import.meta.url),
  'utf8',
);
const FILTER_TOOLBAR_SOURCE = readFileSync(new URL('./PartnerCompaniesFilterToolbar.tsx', import.meta.url), 'utf8');

test('registry overview presents live status counts and branch category/rank distributions', () => {
  const overview = renderToStaticMarkup(createElement(PartnerRegistryOverview, {
    categorySummary: {
      buckets: {
        'Supplier-Local': 3,
        'Supplier-Foreign': 2,
        Courier: 1,
        Subcontractor: 0,
        'Supplier-Local-NT': 1,
        'Supplier-Foreign-NT': 0,
        'Courier-NT': 0,
        'Subcontractor-NT': 0,
      },
      total: 7,
      major: 2,
      regular: 5,
    },
    branchCount: 8,
    activeCount: 6,
    incompleteCount: 2,
    expiredCount: 1,
    archivedCount: 3,
    expanded: true,
    onToggleExpanded: () => {},
    onStatusChange: () => {},
    status: 'Active',
    isAdmin: true,
    onOpenActiveCompanies: () => {},
    onOpenRegister: () => {},
  }));

  for (const text of ['Active Companies by Type', 'Register New Partner', '6', '7 Accredited Branches Mapped', 'Supplier – Local', 'Standard', 'Non-Trade (NT)', 'Regular Rank', 'Major Rank', '88% Rank Mapping Coverage']) {
    assert.ok(overview.includes(text), text);
  }
  assert.match(overview, /role="tablist" aria-labelledby="partner-status-heading"/);
  assert.match(overview, /aria-selected="true"/);
  assert.match(PARTNER_COMPANIES_SOURCE, /onStatusChange=\{setStatusTab\}/);
});

test('registry filters keep search, category, origin, sorting, date, expiration, and reset controls visible', () => {
  const noop = () => {};
  const base: ComponentProps<typeof PartnerCompaniesFilterToolbar> = {
    statusTab: 'Active',
    statusLabels: { Active: 'Active', Expired: 'Expired', Incomplete: 'Incomplete Profile', Archived: 'Archived' },
    onStatusChange: noop,
    categoryTab: 'All',
    onCategoryChange: noop,
    originFilter: 'All',
    onOriginChange: noop,
    searchQuery: '',
    onSearchChange: noop,
    onSearchClear: noop,
    resultCount: 3,
    sortOptions: [{ value: 'default', label: 'Default order' }, { value: 'name-desc', label: 'Company: Z-A' }],
    sortValue: 'default',
    onSortChange: noop,
    registeredFrom: '',
    registeredTo: '',
    onRegisteredFromChange: noop,
    onRegisteredToChange: noop,
    documentFilter: 'all',
    onDocumentFilterChange: noop,
    onReset: noop,
  };
  const defaultMarkup = renderToStaticMarkup(createElement(PartnerCompaniesFilterToolbar, base));
  for (const label of ['Search company name or BP code', 'All categories', 'Couriers', 'Suppliers', 'Subcontractors', 'Uncategorized', 'Sort', 'Date range', 'Expiration', '3 partners found', 'Reset']) {
    assert.ok(defaultMarkup.includes(label), label);
  }
  assert.doesNotMatch(defaultMarkup, /partner-company-advanced-filters/);

  const activeMarkup = renderToStaticMarkup(createElement(PartnerCompaniesFilterToolbar, {
    ...base,
    statusTab: 'Expired',
    categoryTab: 'Supplier',
    originFilter: 'Foreign',
    searchQuery: ' Acme ',
    sortValue: 'name-desc',
    registeredFrom: '2026-01-01',
    documentFilter: 'expired',
  }));
  for (const label of ['Search: Acme', 'Status: Expired', 'Category: Suppliers', 'Origin: Foreign', 'Sort: Company: Z-A', 'Registered from: 2026-01-01', 'Documents: Expired / for update']) {
    assert.ok(activeMarkup.includes(label), label);
  }
  assert.match(activeMarkup, /Filter suppliers by origin/);
  assert.match(activeMarkup, /Clear partner search/);
});

test('archived partners record and display the archive date and time', () => {
  const surveyTypesSource = readFileSync(new URL('../../../types/survey.ts', import.meta.url), 'utf8');
  const recordSchemasSource = readFileSync(new URL('../../../services/applicationRecordSchemas.ts', import.meta.url), 'utf8');

  assert.match(surveyTypesSource, /archivedAt\?: string/);
  assert.match(recordSchemasSource, /optionalDate\(candidate\.archivedAt, `\$\{label\}\.archivedAt`\)/);
  assert.match(PARTNER_COMPANIES_SOURCE, /archivedAt: nextIsArchived \? new Date\(\)\.toISOString\(\) : undefined/);
  assert.match(PARTNER_COMPANIES_SOURCE, /companyToArchive/);
  assert.match(PARTNER_COMPANIES_SOURCE, /Are you sure you want to archive/);
  assert.match(PARTNER_COMPANIES_SOURCE, /Confirm Archive/);
  assert.doesNotMatch(PARTNER_COMPANIES_SOURCE, /window\.confirm/);
  assert.match(PARTNER_COMPANIES_SOURCE, /Archived Date &amp; Time/);
  assert.match(PARTNER_COMPANIES_SOURCE, /formatDateTime\(c\.archivedAt\)/);
});
