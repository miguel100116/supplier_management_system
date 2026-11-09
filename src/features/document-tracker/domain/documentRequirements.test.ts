import assert from 'node:assert/strict';
import test from 'node:test';
import { FOREIGN_SUPPLIER_REQUIREMENTS, getAvailableDocumentKeys, getRequiredDocumentKeys, isExpiryDocument, shouldShowHistoricalDocument } from './documentRequirements';
import { computeCompanyDocumentSummary, computeDocumentStatus } from './compliance';

const localSupplier = { type: 'Supplier' as const, supplierOrigin: 'Local' as const, createdAt: '2026-01-01', id: 'c', name: 'Supplier', branches: [{ id: 'b', bpCode: 'BP-1', documents: {} }] };

test('CORP and SOL are mutually exclusive and unset classification does not count either set as missing', () => {
  const unknown = getRequiredDocumentKeys('Supplier', 'Local');
  const corp = getRequiredDocumentKeys('Supplier', 'Local', 'CORP');
  const sol = getRequiredDocumentKeys('Supplier', 'Local', 'SOL');
  assert.equal(unknown.includes('Other Documents'), false);
  assert.equal(corp.includes('Other Documents'), false);
  assert.equal(sol.includes('Other Documents'), false);
  assert.ok(getAvailableDocumentKeys('Supplier', 'Local').includes('Other Documents'));
  assert.ok(getRequiredDocumentKeys('Courier', undefined).includes('Other Documents'));
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
  assert.deepEqual(FOREIGN_SUPPLIER_REQUIREMENTS.map((item) => item.key), ['SIF', 'AFS', 'Certificate of Incorporation', 'Articles of Incorporation', 'Business Permit/License', "Owner's ID", 'Product Profile']);
  for (const name of ['SIF', 'AFS', 'Certificate of Incorporation', 'Articles of Incorporation', 'Business Permit/License', "Owner's ID", 'Product Profile']) {
    assert.ok(foreign.includes(name), `${name} remains required`);
  }
  assert.equal(foreign.length, 7);
  assert.deepEqual(getAvailableDocumentKeys('Supplier', 'Foreign'), FOREIGN_SUPPLIER_REQUIREMENTS.map((item) => item.key));
  assert.equal(getRequiredDocumentKeys('Supplier', 'Foreign').includes('BIR2303'), false);
  assert.equal(getRequiredDocumentKeys('Supplier', 'Foreign').includes('Confidentiality and Non-Disclosure Agreement'), false);
  assert.equal(foreign.includes('GIS (Corp)'), false);
  assert.equal(foreign.includes('SEC (Corp)'), false);
  assert.equal(foreign.includes('DTI (Sole)'), false);
  assert.equal(foreign.includes("Sole Proprietorship (Owner's ID)"), false);
});

test('foreign validity rules match the reference and do not change local AFS renewal behavior', () => {
  const referenceDate = new Date('2026-11-05T00:00:00Z');
  assert.equal(isExpiryDocument('AFS', 'Supplier', 'Foreign'), true);
  assert.equal(isExpiryDocument('Business Permit/License', 'Supplier', 'Foreign'), true);
  assert.equal(isExpiryDocument("Owner's ID", 'Supplier', 'Foreign'), true);
  for (const name of ['SIF', 'Certificate of Incorporation', 'Articles of Incorporation', 'Product Profile']) {
    assert.equal(isExpiryDocument(name, 'Supplier', 'Foreign'), false, `${name} must not receive annual expiry rules`);
  }
  assert.equal(computeDocumentStatus({ provided: true, expiryDate: '2025-12-31' }, referenceDate, 'AFS', { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'For Update');
  assert.equal(computeDocumentStatus({ provided: true, expiryDate: '2027-12-31' }, referenceDate, 'AFS', { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'For Update');
  assert.equal(computeDocumentStatus({ provided: true, expiryDate: '2026-12-31' }, referenceDate, 'AFS', { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'Current');
  assert.equal(computeDocumentStatus({ provided: true, expiryDate: '2025-12-31' }, referenceDate, 'AFS', { type: 'Supplier', supplierOrigin: 'Local' }).status, 'Current');
  assert.equal(computeDocumentStatus({ provided: true }, referenceDate, 'SIF', { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'Current');
  assert.equal(computeDocumentStatus({ provided: true }, referenceDate, "Owner's ID", { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'Missing');
  assert.equal(computeDocumentStatus({ provided: true, expiryDate: '2027-12-31' }, referenceDate, "Owner's ID", { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'Current');
  assert.equal(computeDocumentStatus({ provided: true, expiryDate: '2026-10-31' }, referenceDate, "Owner's ID", { type: 'Supplier', supplierOrigin: 'Foreign' }).status, 'Expired');
  assert.match(FOREIGN_SUPPLIER_REQUIREMENTS[0].description, /Completed and signed form/);
  assert.match(FOREIGN_SUPPLIER_REQUIREMENTS[1].validity, /current fiscal or calendar year/);
  assert.match(FOREIGN_SUPPLIER_REQUIREMENTS[2].validity, /One-time submission/);
  assert.match(FOREIGN_SUPPLIER_REQUIREMENTS[5].validity, /valid at the time of submission/);
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
  for (const name of ['DTI (Sole)', 'GIS (Corp)', 'Business Permit']) {
    assert.equal(getRequiredDocumentKeys('Supplier', 'Foreign').includes(name), false, `${name} is not a Foreign requirement`);
    assert.equal(shouldShowHistoricalDocument(name, 'Supplier', 'Foreign', undefined), true, `${name} remains visible as saved history`);
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
