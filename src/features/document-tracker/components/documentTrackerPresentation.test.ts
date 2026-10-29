import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentRegisterPage } from '../../../pages/DocumentRegisterPage';
import type { PartnerCompany } from '../../../types/survey';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const DOCUMENT_TRACKER_SOURCE = readFileSync(
  new URL('../../../pages/DocumentRegisterPage.tsx', import.meta.url),
  'utf8',
);

test('compliance overview does not repeat the category selected in the filter tabs', () => {
  const overviewHeader = DOCUMENT_TRACKER_SOURCE.match(
    /<div className="flex items-center justify-between">[\s\S]*?<div className="relative" ref=\{customizeRef\}>/,
  )?.[0];

  assert.ok(overviewHeader);
  assert.match(overviewHeader, />Compliance Overview<\/h3>/);
  assert.doesNotMatch(overviewHeader, /\{viewLabel\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /<span>\{cat\.label\}<\/span>/);
});

test('category document review is a compact expandable company list with accessible per-document actions', () => {
  const listStart = DOCUMENT_TRACKER_SOURCE.indexOf('<div className="space-y-2" aria-label="Partner compliance list">');
  const listEnd = DOCUMENT_TRACKER_SOURCE.indexOf('<ChartCard', listStart);
  assert.ok(listStart >= 0 && listEnd > listStart);
  const listSource = DOCUMENT_TRACKER_SOURCE.slice(listStart, listEnd);
  assert.doesNotMatch(listSource, /overflow-x-(auto|scroll)/);
  assert.doesNotMatch(listSource, /<table/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-label="Partner compliance list"/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-expanded=\{isExpanded\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /Review documents/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /Required documents/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /Historical & additional/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /DOCUMENT_STATUS_ICONS\[status\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /<DocumentQuickActions/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /grid-cols-1 gap-2\.5 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /const DOCUMENT_LIST_GRID_COLUMNS = 'xl:grid-cols-\[minmax\(170px,1fr\)_88px_104px_minmax\(120px,1fr\)_88px_minmax\(220px,0\.5fr\)_32px\] xl:gap-x-3 2xl:grid-cols-\[minmax\(240px,1fr\)_88px_104px_minmax\(210px,1fr\)_88px_minmax\(300px,0\.5fr\)_32px\] 2xl:gap-x-5';/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /flex min-h-12 min-w-0 flex-col items-start justify-center gap-y-1 text-xs/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /const statusColor = status === 'Missing' \? 'text-rose-700[\s\S]*?status === 'Expired' \? 'text-rose-800[\s\S]*?'text-amber-700/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /onMouseEnter=\{clearHoverClose\} onMouseLeave=\{scheduleHoverClose\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /'Add remarks'/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-haspopup="menu"/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /role=\{isViewingRemarks \? 'dialog' : isRemarksOpen \? 'group' : 'menu'\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /role="menuitem"[^>]*>[\s\S]*?Mark missing/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /role="dialog" aria-label=\{`Actions for \$\{docName\}`\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /w-\[min\(16rem,calc\(100vw-24px\)\)\]/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /Current record|Not provided|Close document actions/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /Add supplementary document|Supplementary document name/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /Partner compliance document matrix/);
  for (const category of ['supplier-local', 'supplier-foreign', 'courier', 'subcontractor']) {
    const markup = renderCategoryEntry(category);
    if (category === 'subcontractor') {
      assert.match(markup, /No active Subcontractor companies found/);
    } else {
      assert.match(markup, /Partner compliance list/);
      assert.match(markup, /Review documents/);
    }
  }
});

test('document maintenance separates schedules, validity, and category alerts with guarded saving', () => {
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-labelledby="document-maintenance-title"/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /\['schedule', 'Reminder schedule'\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /\['validity', 'Validity periods'\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /\['category', 'Category alerts'\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-label="Document maintenance settings"/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /placeholder="Not set"/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /Reminder days before expiry \(comma separated\)/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /Pending confirmation|validity verification status|appropriate authority guidance/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /Configure the default duration used when a new expiry date is entered/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /await saveDocumentMaintenanceSettings\(savedSettings\)/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /await saveNotificationSettings\(notificationRules\)/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /useModalEscape\(isNotificationSettingsOpen, requestCloseMaintenance/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /keepFocusInside/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /Discard unsaved changes\?/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /controller\.signal\.aborted\) return/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /max-w-\[900px\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /max-h-\[calc\(100dvh-16px\)\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /maintenanceTab === 'validity' \? 'max-h-/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /h-\[100dvh\]|max-w-\[1320px\]/);
});

test('partner rows show the saved branch status as a badge, separate from document compliance statuses', () => {
  assert.match(DOCUMENT_TRACKER_SOURCE, /const DOCUMENT_LIST_GRID_COLUMNS = 'xl:grid-cols-\[minmax\(170px,1fr\)_88px_104px_minmax\(120px,1fr\)_88px_minmax\(220px,0\.5fr\)_32px\] xl:gap-x-3 2xl:grid-cols-\[minmax\(240px,1fr\)_88px_104px_minmax\(210px,1fr\)_88px_minmax\(300px,0\.5fr\)_32px\] 2xl:gap-x-5';/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /title=\{row\.company\.name\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /className="block w-full[^\"]*break-words[^\"]*xl:truncate"/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /xl:flex-nowrap/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /col-start-2 row-start-3 min-w-0 xl:col-start-5 xl:row-auto/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /const DOCUMENT_ROW_BADGE_CLASS = 'inline-flex h-8 max-w-full items-center rounded-md border px-2\.5 text-\[10px\] font-semibold';/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /col-span-2 row-start-4 flex min-h-12 min-w-0 flex-col items-start justify-center gap-y-1 text-xs/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-label=\{`Branch status: \$\{row\.branch\.status\}`\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /SupplierRankSelect label=\{`Supplier rank for \$\{row\.branch\.bpCode \|\| row\.company\.name\}`\}/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /<span[^>]*>Supplier rank<\/span>|<span[^>]*>Status<\/span>/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /branchStatusBadgeClasses\(row\.branch\.status\)/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /\{row\.branch\.status\}/);
  assert.doesNotMatch(DOCUMENT_TRACKER_SOURCE, /Calculated from required documents, classification, and expiry dates/);
});


const categoryPartners: PartnerCompany[] = [
  { id: 'local', name: 'Local', type: 'Supplier', createdAt: '2026-01-01', branches: [{ id: 'local-branch', bpCode: 'LOCAL', status: 'Completed' }] },
  { id: 'foreign', name: 'Foreign', type: 'Supplier', supplierOrigin: 'Foreign', createdAt: '2026-01-01', branches: [{ id: 'foreign-branch', bpCode: 'FOREIGN', status: 'Pending' }] },
  { id: 'courier', name: 'Courier', type: 'Courier', createdAt: '2026-01-01', branches: [{ id: 'courier-branch', bpCode: 'COURIER', status: 'Accredited' }] },
  { id: 'subcontractor', name: 'Subcontractor', type: 'Subcontractor', createdAt: '2026-01-01', branches: [{ id: 'subcontractor-branch', bpCode: 'SUB', status: 'Inactive' }] },
];

function renderCategoryEntry(categoryFromUrl?: string) {
  Object.assign(globalThis, { React });
  return renderToStaticMarkup(React.createElement(DocumentRegisterPage, {
    partnerCompanies: categoryPartners,
    categoryFromUrl,
    onUpdateCompany() {},
    onRenewDocument: async () => { throw new Error('Rendering must not save'); },
  }));
}

function partnerTotal(markup: string): string {
  const start = markup.indexOf('>Total Partners</h3>');
  assert.ok(start >= 0);
  return markup.slice(start, markup.indexOf('</section>', start));
}

test('SMS-15 opens and reopens on all-category overview while valid URL categories narrow the data', () => {
  const all = renderCategoryEntry();
  assert.match(partnerTotal(all), />3<\/span>/);
  assert.match(partnerTotal(all), /All Categories/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /label: 'Branch Registry Status/);
  assert.match(all, /Documents Needing Attention/);
  assert.match(partnerTotal(renderCategoryEntry('supplier-local')), />1<\/span>/);
  assert.match(partnerTotal(renderCategoryEntry('supplier-foreign')), /Supplier \(Foreign\)/);
  assert.match(partnerTotal(renderCategoryEntry('courier')), /Courier/);
  assert.match(partnerTotal(renderCategoryEntry('invalid')), />3<\/span>/);
  assert.match(partnerTotal(renderCategoryEntry()), />3<\/span>/);
});

test('pinned category strip keeps all categories reachable and exposes the selected category', () => {
  for (const category of [undefined, 'courier']) {
    const html = renderCategoryEntry(category);
    const strip = html.slice(html.indexOf('class="document-category-filter'), html.indexOf('>Compliance Overview</h3>'));
    assert.match(strip, /sticky top-20 z-20/);
    assert.match(strip, /role="group" aria-label="Filter document register by category"/);
    assert.match(strip, /overflow-x-auto/);
    assert.equal((strip.match(/<button /g) ?? []).length, 5);
    assert.equal((strip.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.match(strip, new RegExp(`aria-pressed="true"[^>]*>[\\s\\S]*?<span>${category === 'courier' ? 'Courier' : 'All Categories'}</span>`));
  }
});
