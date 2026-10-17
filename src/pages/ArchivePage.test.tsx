import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchivePage, countActiveArchiveFilters } from './ArchivePage';

Object.assign(globalThis, { React });

test('SMS-60 puts archive search beside Filters and nests sort and date range in the popover', () => {
  const html = renderToStaticMarkup(createElement(ArchivePage, {
    surveys: [],
    partnerCompanies: [],
    archivedResponses: [],
    onUpdatePartnerCompany: async (company) => company,
    isAdmin: true,
  }));
  assert.match(html, /role="toolbar" aria-label="Archive filters"/);
  assert.match(html, /placeholder="Search archived forms/);
  assert.match(html, /<details class="relative shrink-0"><summary[^>]*>.*Filters/);
  assert.match(html, /<\/summary><div[^>]*>.*aria-label="Sort archived items"/);
  assert.match(html, /aria-label="Archived date from"/);
  assert.match(html, /aria-label="Archived date to"/);
  assert.match(html, /0 archived forms/);
  assert.doesNotMatch(html, /Reset<\/button>/);
  assert.doesNotMatch(html, /rounded-xl border border-slate-200 bg-slate-50\/70 p-3/);
});

test('SMS-60 counts only active sort, date, and tab-specific partner filters', () => {
  assert.equal(countActiveArchiveFilters('date-desc', '', '', 'All', 'surveys'), 0);
  assert.equal(countActiveArchiveFilters('name-asc', '', '', 'All', 'responses'), 1);
  assert.equal(countActiveArchiveFilters('date-desc', '2026-09-01', '2026-09-30', 'All', 'surveys'), 1);
  assert.equal(countActiveArchiveFilters('date-asc', '2026-09-01', '', 'Supplier', 'companies'), 3);
  assert.equal(countActiveArchiveFilters('date-desc', '', '', 'Supplier', 'surveys'), 0);
});
