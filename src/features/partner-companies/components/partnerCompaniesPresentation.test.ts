import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartnerCompaniesFilterToolbar } from './PartnerCompaniesFilterToolbar';
import { PartnerCategoryRankBreakdown } from './PartnerCategoryRankBreakdown';
import { PartnerDirectoryArchiveButton } from './PartnerDirectoryArchiveButton';
import { PartnerRegistryOverview } from './PartnerRegistryOverview';

const PARTNER_COMPANIES_SOURCE = readFileSync(new URL('../../../pages/PartnerCompaniesPage.tsx', import.meta.url), 'utf8');
const FILTER_TOOLBAR_SOURCE = readFileSync(new URL('./PartnerCompaniesFilterToolbar.tsx', import.meta.url), 'utf8');
const ADMIN_REDESIGN_SOURCE = readFileSync(new URL('../../../adminRedesign.css', import.meta.url), 'utf8');
const categorySummary = {
  buckets: {
    'Supplier-Local': 3, 'Supplier-Foreign': 2, Courier: 1, Subcontractor: 0,
    'Supplier-Local-NT': 1, 'Supplier-Foreign-NT': 0, 'Courier-NT': 0, 'Subcontractor-NT': 0,
  },
  total: 7,
  major: 2,
  regular: 5,
};

test('directory category strip replaces partner status and uses the selected category state', () => {
  const overview = renderToStaticMarkup(createElement(PartnerRegistryOverview, {
    category: 'Supplier', onCategoryChange: () => {}, isAdmin: true,
    onOpenActiveCompanies: () => {}, onOpenRegister: () => {},
  }));

  for (const label of ['All Categories', 'Courier', 'Supplier', 'Subcontractor', 'Uncategorized']) assert.ok(overview.includes(label), label);
  assert.match(overview, /aria-label="Partner categories" role="tablist"/);
  assert.match(overview, /data-category="Supplier" aria-selected="true" tabindex="0"/);
  assert.doesNotMatch(overview, /Partner status|Incomplete Profile|Expired,|Archived,/);
  assert.match(ADMIN_REDESIGN_SOURCE, /\.admin-directory-category-strip-tab\[aria-selected="true"\][^{]*\{[^}]*color: #fff; background: #2187cd/);
  assert.doesNotMatch(PARTNER_COMPANIES_SOURCE, /statusTab|setStatusTab/);
});

test('branch category and rank analysis remains separate and before directory controls', () => {
  const props = { categorySummary, branchCount: 8 };
  const breakdown = renderToStaticMarkup(createElement(PartnerCategoryRankBreakdown, props));
  for (const text of ['Category &amp; Supplier Rank Breakdown', '7 Accredited Branches Mapped', 'Standard', 'Non-Trade (NT)', 'Regular Rank', 'Major Rank', '88% Rank Mapping Coverage']) assert.ok(breakdown.includes(text), text);
  assert.match(breakdown, /id="partner-category-breakdown-content"/);
  assert.doesNotMatch(breakdown, /Hide breakdown|View breakdown|aria-expanded/);
  assert.match(breakdown, /8 partner branches have a mapped supplier rank/);

  const overviewPosition = PARTNER_COMPANIES_SOURCE.indexOf('<PartnerRegistryOverview');
  const breakdownPosition = PARTNER_COMPANIES_SOURCE.indexOf('<PartnerCategoryRankBreakdown');
  const toolbarPosition = PARTNER_COMPANIES_SOURCE.indexOf('<PartnerCompaniesFilterToolbar');
  const paginationPosition = PARTNER_COMPANIES_SOURCE.indexOf('admin-directory-pagination panel');
  assert.ok(overviewPosition >= 0 && breakdownPosition > overviewPosition && breakdownPosition < toolbarPosition, 'analysis stays before directory controls');
  assert.ok(paginationPosition > toolbarPosition, 'pagination stays beneath directory results');

  const overviewWithBreakdown = renderToStaticMarkup(createElement(PartnerRegistryOverview, {
    category: 'All', onCategoryChange: () => {}, onOpenActiveCompanies: () => {}, onOpenRegister: () => {},
  }, createElement(PartnerCategoryRankBreakdown, props)));
  assert.ok(overviewWithBreakdown.indexOf('Category &amp; Supplier Rank Breakdown') < overviewWithBreakdown.indexOf('aria-label="Partner categories"'));
});

test('directory filters open from icons and reset independently inside their popovers', () => {
  const noop = () => {};
  const base: ComponentProps<typeof PartnerCompaniesFilterToolbar> = {
    categoryTab: 'All', onCategoryChange: noop, originFilter: 'All', onOriginChange: noop,
    searchQuery: '', onSearchChange: noop, onSearchClear: noop,
    sortOptions: [{ value: 'default', label: 'Default order' }, { value: 'name-desc', label: 'Company: Z-A' }], sortValue: 'default', onSortChange: noop,
    registeredFrom: '', registeredTo: '', onRegisteredFromChange: noop, onRegisteredToChange: noop,
    documentFilter: 'all', onDocumentFilterChange: noop, onReset: noop,
  };
  const defaultMarkup = renderToStaticMarkup(createElement(PartnerCompaniesFilterToolbar, base));
  assert.match(defaultMarkup, /Search partners by name or BP Code/);
  assert.match(defaultMarkup, /aria-label="Filter by document status"/);
  assert.match(defaultMarkup, /Filter by registration date/);
  assert.match(defaultMarkup, /Sort partners/);
  assert.doesNotMatch(defaultMarkup, /3 partners|All document states|<select/);
  assert.doesNotMatch(defaultMarkup, /Additional category|Filter by category|All Categories/);

  const activeMarkup = renderToStaticMarkup(createElement(PartnerCompaniesFilterToolbar, {
    ...base, categoryTab: 'Supplier', originFilter: 'Foreign', searchQuery: ' Acme ', sortValue: 'name-desc',
    registeredFrom: '2026-01-01', documentFilter: 'expired',
  }));
  for (const label of ['Filter by supplier origin', 'Filter by document status', 'Filter by registration date']) assert.ok(activeMarkup.includes(label), label);
  assert.match(activeMarkup, /Clear partner search/);
  assert.match(FILTER_TOOLBAR_SOURCE, /FileCheck2/);
  assert.match(FILTER_TOOLBAR_SOURCE, /<select aria-label="Document status"/);
  assert.equal((FILTER_TOOLBAR_SOURCE.match(/className="admin-directory-popover-reset"/g) ?? []).length, 4);
  assert.match(ADMIN_REDESIGN_SOURCE, /\.admin-directory-popover-reset/);
  assert.match(ADMIN_REDESIGN_SOURCE, /#partner-company-search \{[\s\S]*?padding-left: 38px;[\s\S]*?padding-right: 38px;/);
});

test('directory uses one color-coded category label and icon-only document/archive actions', () => {
  assert.match(PARTNER_COMPANIES_SOURCE, /`Supplier \$\{c\.supplierOrigin\}`/);
  assert.match(PARTNER_COMPANIES_SOURCE, /directoryCategoryBadgeClasses\(c\.type, c\.supplierOrigin\)/);
  assert.match(PARTNER_COMPANIES_SOURCE, /<FileText size=\{15\} aria-hidden="true" \/>/);
  assert.doesNotMatch(PARTNER_COMPANIES_SOURCE, /<span>Review docs<\/span>/);
  assert.match(ADMIN_REDESIGN_SOURCE, /admin-directory-family-supplier-local/);
  assert.match(ADMIN_REDESIGN_SOURCE, /admin-directory-family-supplier-foreign/);
  assert.match(ADMIN_REDESIGN_SOURCE, /admin-directory-family-courier/);
  assert.match(ADMIN_REDESIGN_SOURCE, /admin-directory-family-subcontractor/);
});

test('partner record modal has aligned actions and responsive width without horizontal overflow', () => {
  assert.match(PARTNER_COMPANIES_SOURCE, /admin-partner-dialog-actions[\s\S]*?Restore" : "Archive"/);
  assert.doesNotMatch(PARTNER_COMPANIES_SOURCE, /Close Dialog/);
  assert.match(ADMIN_REDESIGN_SOURCE, /width: min\(1000px, calc\(100vw - 36px\)\)/);
  assert.match(ADMIN_REDESIGN_SOURCE, /overflow-x: hidden;[\s\S]*?overflow-y: auto/);
});

test('archive icon is a direct row action for archive and restore', () => {
  const archiveMarkup = renderToStaticMarkup(createElement(PartnerDirectoryArchiveButton, {
    companyName: 'Acme', isArchived: false, onArchiveOrRestore: () => {},
  }));
  assert.match(archiveMarkup, /aria-label="Archive Acme"/);
  assert.match(archiveMarkup, /lucide-archive/);
  assert.doesNotMatch(archiveMarkup, /More actions|role="menu"/);

  const restoreMarkup = renderToStaticMarkup(createElement(PartnerDirectoryArchiveButton, {
    companyName: 'Acme', isArchived: true, onArchiveOrRestore: () => {},
  }));
  assert.match(restoreMarkup, /aria-label="Restore Acme from archive"/);
  assert.match(restoreMarkup, /lucide-archive-restore/);
  assert.match(PARTNER_COMPANIES_SOURCE, /\[\.\.\.classifiedCompanies\.active, \.\.\.classifiedCompanies\.archived\]/);
});

test('archived partner records remain identifiable and directory pagination is fixed at ten', () => {
  const surveyTypesSource = readFileSync(new URL('../../../types/survey.ts', import.meta.url), 'utf8');
  const recordSchemasSource = readFileSync(new URL('../../../services/applicationRecordSchemas.ts', import.meta.url), 'utf8');
  assert.match(surveyTypesSource, /archivedAt\?: string/);
  assert.match(recordSchemasSource, /optionalDate\(candidate\.archivedAt, `\$\{label\}\.archivedAt`\)/);
  assert.match(PARTNER_COMPANIES_SOURCE, /archivedAt: nextIsArchived \? new Date\(\)\.toISOString\(\) : undefined/);
  assert.match(PARTNER_COMPANIES_SOURCE, /companyToArchive/);
  assert.match(PARTNER_COMPANIES_SOURCE, /Are you sure you want to archive/);
  assert.match(PARTNER_COMPANIES_SOURCE, /Confirm Archive/);
  assert.match(PARTNER_COMPANIES_SOURCE, /hasArchivedCompanies && <th className="px-5 py-3">Archived<\/th>/);
  assert.match(PARTNER_COMPANIES_SOURCE, /formatDateTime\(c\.archivedAt\)/);
  assert.match(PARTNER_COMPANIES_SOURCE, /const COMPANIES_PAGE_SIZE = 10/);
  assert.match(PARTNER_COMPANIES_SOURCE, /pageSize=\{COMPANIES_PAGE_SIZE\}[^]*?showPageSizeSelector=\{false\}/);
  assert.doesNotMatch(PARTNER_COMPANIES_SOURCE, /setPageSize|pageSizeOptions/);
});
