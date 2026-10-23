import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentRegisterPage } from '../../../pages/DocumentRegisterPage';
import type { PartnerCompany } from '../../../types/survey';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { scrollDocumentMatrixWithArrowKey } from './documentMatrixKeyboard';

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

test('document matrix arrow keys scroll horizontally and leave other keys alone', () => {
  const calls: ScrollToOptions[] = [];
  const surface = { scrollBy: (options: ScrollToOptions) => calls.push(options) };

  assert.equal(scrollDocumentMatrixWithArrowKey(surface, 'ArrowRight'), true);
  assert.equal(scrollDocumentMatrixWithArrowKey(surface, 'ArrowLeft'), true);
  assert.equal(scrollDocumentMatrixWithArrowKey(surface, 'ArrowDown'), false);
  assert.deepEqual(calls, [
    { left: 160, behavior: 'smooth' },
    { left: -160, behavior: 'smooth' },
  ]);
});

test('document matrix is keyboard-focusable and preserves arrow keys in form controls', () => {
  assert.match(DOCUMENT_TRACKER_SOURCE, /aria-label="Partner compliance document matrix[^"]*"/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /tabIndex=\{0\}[\s\S]*?onKeyDown=\{handleMatrixKeyDown\}/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /input, select, textarea, \[contenteditable="true"\]/);
  assert.match(DOCUMENT_TRACKER_SOURCE, /onKeyDown=\{handleMatrixKeyDown\}/);
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
  assert.match(partnerTotal(all), />4<\/span>/);
  assert.match(partnerTotal(all), /All Categories/);
  assert.match(all, /Status Breakdown/);
  assert.match(all, /Documents Needing Attention/);
  assert.match(partnerTotal(renderCategoryEntry('supplier-local')), />1<\/span>/);
  assert.match(partnerTotal(renderCategoryEntry('supplier-foreign')), /Supplier \(Foreign\)/);
  assert.match(partnerTotal(renderCategoryEntry('courier')), /Courier/);
  assert.match(partnerTotal(renderCategoryEntry('invalid')), />4<\/span>/);
  assert.match(partnerTotal(renderCategoryEntry()), />4<\/span>/);
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
