import assert from 'node:assert/strict';
import test from 'node:test';
import { companiesForDocumentCategory, resolveDocumentCategory } from './documentCategories';
import type { PartnerCompany } from '../../../types/survey';

const companies: PartnerCompany[] = [
  { id: 'local', name: 'Local', type: 'Supplier', createdAt: '2026-01-01' },
  { id: 'foreign', name: 'Foreign', type: 'Supplier', supplierOrigin: 'Foreign', createdAt: '2026-01-01' },
  { id: 'courier', name: 'Courier', type: 'Courier', createdAt: '2026-01-01' },
  { id: 'subcontractor', name: 'Subcontractor', type: 'Subcontractor', createdAt: '2026-01-01' },
  { id: 'archived', name: 'Archived', type: 'Supplier', createdAt: '2026-01-01', isArchived: true },
];

test('tracker entry defaults to All Categories for absent or invalid URL categories', () => {
  for (const value of [null, undefined, '', 'all', 'invalid', '<script>', ['courier']]) {
    assert.equal(resolveDocumentCategory(value), 'all');
    assert.deepEqual(companiesForDocumentCategory(companies, value).map(company => company.id), ['local', 'foreign', 'courier', 'subcontractor']);
  }
});

test('an explicit URL category selects only that partner type and supplier origin', () => {
  for (const [key, expected] of [['supplier-local', 'local'], ['supplier-foreign', 'foreign'], ['courier', 'courier'], ['subcontractor', 'subcontractor']]) {
    assert.equal(resolveDocumentCategory(key), key);
    assert.deepEqual(companiesForDocumentCategory(companies, key).map(company => company.id), [expected]);
  }
  assert.deepEqual(companiesForDocumentCategory([], 'all'), []);
});
