import assert from 'node:assert/strict';
import test from 'node:test';
import { getRequiredDocumentKeys, isExpiryDocument, shouldShowHistoricalDocument } from './documentRequirements';
import { computeCompanyDocumentSummary, computeDocumentStatus } from './compliance';

const localSupplier = { type: 'Supplier' as const, supplierOrigin: 'Local' as const, createdAt: '2026-01-01', id: 'c', name: 'Supplier', branches: [{ id: 'b', bpCode: 'BP-1', documents: {} }] };

test('CORP and SOL are mutually exclusive and unset classification does not count either set as missing', () => {
  const unknown = getRequiredDocumentKeys('Supplier', 'Local');
  const corp = getRequiredDocumentKeys('Supplier', 'Local', 'CORP');
  const sol = getRequiredDocumentKeys('Supplier', 'Local', 'SOL');
  assert.equal(unknown.includes('GIS (Corp)') || unknown.includes('SEC (Corp)') || unknown.includes('DTI (Sole)'), false);
  assert.ok(corp.includes('GIS (Corp)') && corp.includes('SEC (Corp)'));
  assert.ok(corp.includes('Articles of Incorporation'));
  assert.equal(corp.includes("Sole Proprietorship (Owner's ID)"), false);
  assert.equal(corp.includes('DTI (Sole)'), false);
  assert.ok(sol.includes('DTI (Sole)'));
  assert.ok(sol.includes("Sole Proprietorship (Owner's ID)"));
  assert.equal(sol.includes('Articles of Incorporation'), false);
  assert.equal(sol.includes('GIS (Corp)') || sol.includes('SEC (Corp)'), false);
  const summary = computeCompanyDocumentSummary(localSupplier);
  assert.equal(summary.classificationRequired, true);
  assert.equal(summary.missingCount, unknown.length);
  assert.equal(summary.totalRequired, unknown.length);
});

test('foreign suppliers keep their separate checklist regardless of domestic classification', () => {
  const foreign = getRequiredDocumentKeys('Supplier', 'Foreign', 'CORP');
  for (const name of ['SIF', 'AFS', 'Certificate of Incorporation', 'Articles of Incorporation', 'Business Permit/License', "Owner's ID", 'Product Profile', 'Other Documents']) {
    assert.ok(foreign.includes(name), `${name} remains required`);
  }
  assert.equal(foreign.includes('GIS (Corp)'), false);
  assert.equal(foreign.includes('SEC (Corp)'), false);
  assert.equal(foreign.includes('DTI (Sole)'), false);
  assert.equal(foreign.includes("Sole Proprietorship (Owner's ID)"), false);
});

test('classified local partners hide inapplicable history while unclassified and foreign records retain it', () => {
  for (const name of ['DTI (Sole)', "Sole Proprietorship (Owner's ID)"]) {
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', 'Local', 'CORP'), false);
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', 'Local', 'SOL'), true);
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', undefined, undefined), true);
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', 'Foreign', 'CORP'), true);
  }
  for (const name of ['GIS (Corp)', 'SEC (Corp)']) {
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', 'Local', 'SOL'), false);
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', 'Local', 'CORP'), true);
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', undefined, undefined), true);
  }
});

test('historical legal documents do not change applicability after classification changes', () => {
  const changed = { ...localSupplier, businessClassification: 'SOL' as const, branches: [{ ...localSupplier.branches[0], documents: { 'GIS (Corp)': { provided: true, expiryDate: '2027-01-01' } } }] };
  const required = getRequiredDocumentKeys(changed.type, changed.supplierOrigin, changed.businessClassification);
  assert.equal(required.includes('GIS (Corp)'), false);
  assert.equal(changed.branches[0].documents['GIS (Corp)'].provided, true);
});

test('corporation compliance requires independently current GIS and SEC records plus every other applicable item', () => {
  const required = getRequiredDocumentKeys('Supplier', 'Local', 'CORP');
  const baseDocuments = Object.fromEntries(required.map((name) => [name, { provided: true, ...(isExpiryDocument(name) ? { expiryDate: '2027-12-31' } : {}) }]));
  const company = { ...localSupplier, businessClassification: 'CORP' as const, branches: [{ ...localSupplier.branches[0], documents: baseDocuments }] };
  assert.equal(computeCompanyDocumentSummary(company, new Date('2026-11-05T00:00:00Z')).missingCount, 0);
  for (const name of ['GIS (Corp)', 'SEC (Corp)']) {
    const withoutOne = { ...company, branches: [{ ...company.branches[0], documents: { ...baseDocuments, [name]: { provided: false } } }] };
    assert.equal(computeCompanyDocumentSummary(withoutOne, new Date('2026-11-05T00:00:00Z')).missingCount, 1, `${name} remains independently required`);
  }
  const sharedMissing = { ...company, branches: [{ ...company.branches[0], documents: { ...baseDocuments, SIF: { provided: false } } }] };
  assert.equal(computeCompanyDocumentSummary(sharedMissing, new Date('2026-11-05T00:00:00Z')).missingCount, 1);
});

test('an explicit not-provided status stays missing even when an old expiry date is retained for history', () => {
  assert.deepEqual(computeDocumentStatus({ provided: false, expiryDate: '2026-01-01' }, new Date('2026-10-28T00:00:00Z'), 'DTI (Sole)'), { status: 'Missing', daysLeft: -300 });
});
