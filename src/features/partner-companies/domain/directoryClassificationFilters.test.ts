import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerCompany } from '../../../types/survey';
import { matchesDirectoryClassificationFilters } from './directoryClassificationFilters';

const companies: PartnerCompany[] = [
  { id: 'local-trade', name: 'Local Trade', type: 'Supplier', supplierOrigin: 'Local', createdAt: '2026-01-01', branches: [{ id: 'lt', bpCode: 'LT001' }] },
  { id: 'local-nt', name: 'Local Non-Trade', type: 'Supplier', supplierOrigin: 'Local', createdAt: '2026-01-01', branches: [{ id: 'ln', bpCode: 'LN001-NT' }] },
  { id: 'foreign-trade', name: 'Foreign Trade', type: 'Supplier', supplierOrigin: 'Foreign', createdAt: '2026-01-01', branches: [{ id: 'ft', bpCode: 'FT001' }] },
  { id: 'foreign-nt', name: 'Foreign Non-Trade', type: 'Supplier', supplierOrigin: 'Foreign', createdAt: '2026-01-01', branches: [{ id: 'fn', bpCode: 'FN001-NT' }] },
  { id: 'courier-trade', name: 'Courier Trade', type: 'Courier', createdAt: '2026-01-01', branches: [{ id: 'ct', bpCode: 'CT001' }] },
];

const ids = (origins: Array<'Local' | 'Foreign'>, businessTypes: Array<'Trade' | 'Non-Trade'>, category: 'All' | 'Supplier' | 'Supplier (Local)' | 'Supplier (Foreign)' | 'Courier' | 'Subcontractor' | 'Uncategorized' = 'All') =>
  companies.filter((company) => matchesDirectoryClassificationFilters(company, origins, businessTypes, category)).map(({ id }) => id);

test('directory origin and business type selections use OR within groups and AND between groups', () => {
  assert.deepEqual(ids(['Local', 'Foreign'], ['Trade', 'Non-Trade'], 'Supplier (Local)'), ['local-trade', 'local-nt']);
  assert.deepEqual(ids(['Local', 'Foreign'], ['Trade', 'Non-Trade'], 'Supplier (Foreign)'), ['foreign-trade', 'foreign-nt']);
  assert.deepEqual(ids(['Local'], ['Trade']), ['local-trade']);
  assert.deepEqual(ids(['Foreign'], ['Non-Trade']), ['foreign-nt']);
  assert.deepEqual(ids(['Local', 'Foreign'], ['Trade']), ['local-trade', 'foreign-trade', 'courier-trade']);
  assert.deepEqual(ids(['Local'], ['Trade', 'Non-Trade']), ['local-trade', 'local-nt']);
  assert.deepEqual(ids(['Local', 'Foreign'], ['Trade', 'Non-Trade']), companies.map(({ id }) => id));
  assert.deepEqual(ids([], ['Trade']), []);
  assert.deepEqual(ids(['Local'], []), []);
  assert.deepEqual(ids(['Local'], ['Trade'], 'Courier'), ['courier-trade'], 'origin does not hide a different selected partner category');
  assert.equal(matchesDirectoryClassificationFilters({
    type: 'Supplier', supplierOrigin: 'Local',
    branches: [{ id: 'legacy-nt-branch', bpCode: 'LEGACY001', rawCategory: 'Supplier-Local-NT', businessType: 'Trade' }],
  }, ['Local'], ['Trade']), true, 'an explicit editable branch type takes precedence over legacy source-category metadata');
  assert.equal(matchesDirectoryClassificationFilters(companies[0], ['Foreign'], ['Trade', 'Non-Trade'], 'Supplier (Local)'), false, 'origin filter cannot broaden a selected local category');
});
