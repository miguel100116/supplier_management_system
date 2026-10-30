import assert from 'node:assert/strict';
import test from 'node:test';
import { getRequiredDocumentKeys } from './documentRequirements';
import { computeCompanyDocumentSummary, computeDocumentStatus } from './compliance';

const localSupplier = { type: 'Supplier' as const, supplierOrigin: 'Local' as const, createdAt: '2026-01-01', id: 'c', name: 'Supplier', branches: [{ id: 'b', bpCode: 'BP-1', documents: {} }] };

test('CORP and SOL are mutually exclusive and unset classification does not count either set as missing', () => {
  const unknown = getRequiredDocumentKeys('Supplier', 'Local');
  const corp = getRequiredDocumentKeys('Supplier', 'Local', 'CORP');
  const sol = getRequiredDocumentKeys('Supplier', 'Local', 'SOL');
  assert.equal(unknown.includes('GIS (Corp)') || unknown.includes('SEC (Corp)') || unknown.includes('DTI (Sole)'), false);
  assert.ok(corp.includes('GIS (Corp)') && corp.includes('SEC (Corp)'));
  assert.equal(corp.includes('DTI (Sole)'), false);
  assert.ok(sol.includes('DTI (Sole)'));
  assert.equal(sol.includes('GIS (Corp)') || sol.includes('SEC (Corp)'), false);
  const summary = computeCompanyDocumentSummary(localSupplier);
  assert.equal(summary.classificationRequired, true);
  assert.equal(summary.missingCount, unknown.length);
  assert.equal(summary.totalRequired, unknown.length);
});

test('historical legal documents do not change applicability after classification changes', () => {
  const changed = { ...localSupplier, businessClassification: 'SOL' as const, branches: [{ ...localSupplier.branches[0], documents: { 'GIS (Corp)': { provided: true, expiryDate: '2027-01-01' } } }] };
  const required = getRequiredDocumentKeys(changed.type, changed.supplierOrigin, changed.businessClassification);
  assert.equal(required.includes('GIS (Corp)'), false);
  assert.equal(changed.branches[0].documents['GIS (Corp)'].provided, true);
});

test('an explicit not-provided status stays missing even when an old expiry date is retained for history', () => {
  assert.deepEqual(computeDocumentStatus({ provided: false, expiryDate: '2026-01-01' }, new Date('2026-10-28T00:00:00Z'), 'DTI (Sole)'), { status: 'Missing', daysLeft: -300 });
});
