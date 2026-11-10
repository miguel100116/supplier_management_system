import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerCompany } from '../../../types/survey';
import { computeCategoryRankSummary } from './categorySummary';

const company = (id: string, isArchived: boolean, branches: PartnerCompany['branches']): PartnerCompany => ({
  id,
  name: id,
  type: 'Supplier',
  createdAt: '2026-01-01T00:00:00.000Z',
  isArchived,
  branches,
});

test('category summary excludes archived companies and their supplier ranks', () => {
  const summary = computeCategoryRankSummary([
    company('current', false, [
      { id: 'trade', bpCode: 'SUP001', rawCategory: 'Supplier-Local', supplierRank: 'Major' },
      { id: 'non-trade', bpCode: 'SUP002-NT', rawCategory: 'Supplier-Local-NT', supplierRank: 'Regular' },
    ]),
    company('archived', true, [
      { id: 'old-trade', bpCode: 'OLD001', rawCategory: 'Supplier-Local', supplierRank: 'Major' },
      { id: 'old-foreign', bpCode: 'OLD002', rawCategory: 'Supplier-Foreign', supplierRank: 'Regular' },
    ]),
  ]);

  assert.equal(summary.buckets['Supplier-Local'], 1);
  assert.equal(summary.buckets['Supplier-Local-NT'], 1);
  assert.equal(summary.buckets['Supplier-Foreign'], 0);
  assert.equal(summary.total, 2);
  assert.equal(summary.major, 1);
  assert.equal(summary.regular, 1);
});
