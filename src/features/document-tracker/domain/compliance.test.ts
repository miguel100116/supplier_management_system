import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDocumentStatus, getBranchDocumentComplianceStatus, isBranchDocumentCompliant, summarizeDocumentAttention } from './compliance';
import { getRequiredDocumentKeys, isExpiryDocument } from './documentRequirements';

test('document attention keeps one expiring document visible and separates outdated from expired', () => {
  const referenceDate = new Date(2026, 9, 28);
  const entries = [
    { documentName: 'GIS (Corp)', status: computeDocumentStatus({ provided: true, expiryDate: '2026-11-27' }, referenceDate, 'GIS (Corp)').status },
    { documentName: 'GIS (Corp)', status: computeDocumentStatus({ provided: true, expiryDate: '2026-10-27' }, referenceDate, 'GIS (Corp)').status },
    { documentName: 'AFS', status: computeDocumentStatus({ provided: true, expiryDate: '2024-12-31' }, referenceDate, 'AFS').status },
    { documentName: 'SEC (Corp)', status: computeDocumentStatus({ provided: false }, referenceDate, 'SEC (Corp)').status },
  ];
  const summary = summarizeDocumentAttention(entries);

  assert.deepEqual(summary, [
    { documentName: 'GIS (Corp)', expiringSoon: 1, outdated: 0, expired: 1 },
    { documentName: 'AFS', expiringSoon: 0, outdated: 1, expired: 0 },
  ]);
});

test('a branch can only receive a fully compliant status when every applicable document is current', () => {
  const company = { type: 'Supplier' as const, supplierOrigin: 'Local' as const, businessClassification: 'SOL' as const };
  const documents = Object.fromEntries(getRequiredDocumentKeys(company.type, company.supplierOrigin, company.businessClassification)
    .map((name) => [name, { provided: true, ...(isExpiryDocument(name) ? { expiryDate: '2027-12-31' } : {}) }]));
  const branch = { id: 'branch-1', bpCode: 'BP001', documents };
  const referenceDate = new Date(2026, 9, 28);

  assert.equal(isBranchDocumentCompliant(company, branch, referenceDate), true);
  assert.equal(isBranchDocumentCompliant(company, { ...branch, documents: { ...documents, SIF: { provided: false } } }, referenceDate), false);
  assert.equal(isBranchDocumentCompliant(company, { ...branch, documents: { ...documents, 'Business Permit': { provided: true, expiryDate: '2026-10-01' } } }, referenceDate), false);
  assert.equal(getBranchDocumentComplianceStatus(company, branch, referenceDate), 'Current');
  assert.equal(getBranchDocumentComplianceStatus(company, { ...branch, documents: { ...documents, SIF: { provided: false } } }, referenceDate), 'Missing');
  assert.equal(getBranchDocumentComplianceStatus(company, { ...branch, documents: { ...documents, 'Business Permit': { provided: true, expiryDate: '2026-10-01' } } }, referenceDate), 'Expired');
  assert.equal(getBranchDocumentComplianceStatus(company, { ...branch, documents: { ...documents, AFS: { provided: true, expiryDate: '2024-12-31' } } }, referenceDate), 'For Update');
  assert.equal(getBranchDocumentComplianceStatus(company, { ...branch, documents: { ...documents, 'Business Permit': { provided: true, expiryDate: '2026-11-10' } } }, referenceDate), 'Expiring Soon');
  assert.equal(getBranchDocumentComplianceStatus({ type: 'Supplier', supplierOrigin: 'Local' }, branch, referenceDate), 'Needs classification');
  assert.equal(getBranchDocumentComplianceStatus(company, undefined, referenceDate), 'No branch');
  assert.equal(isBranchDocumentCompliant({ type: 'Supplier', supplierOrigin: 'Local' }, branch, referenceDate), false);
  assert.equal(isBranchDocumentCompliant(company, undefined, referenceDate), false);
});
