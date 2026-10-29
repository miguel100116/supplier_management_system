import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExistingDocuments, mergeRowsIntoCompanies, type RawMasterListRow } from './masterListImport';
import type { PartnerCompany } from '../../../types/survey';
import { companyDocumentRemarksError } from '../../document-tracker/domain/documentValidation';

test('Master List refresh preserves remarks, old expiry data, and supplementary document records', () => {
  const merged = mergeExistingDocuments({
    'DTI (Sole)': { provided: true, expiryDate: '2027-06-30', remarks: 'Renewal submitted' },
    'Other: ISO 9001': { provided: true, description: 'ISO 9001', remarks: 'Verified by QA' },
  }, {
    'DTI (Sole)': { provided: false },
    AFS: { provided: true, expiryDate: '2027-12-31' },
  });

  assert.deepEqual(merged['DTI (Sole)'], { provided: false, expiryDate: '2027-06-30', remarks: 'Renewal submitted' });
  assert.deepEqual(merged['Other: ISO 9001'], { provided: true, description: 'ISO 9001', remarks: 'Verified by QA' });
  assert.deepEqual(merged.AFS, { provided: true, expiryDate: '2027-12-31' });
});

test('new and refreshed branches of classified companies satisfy required remarks without losing history', () => {
  for (const classification of ['CORP', 'SOL'] as const) {
    const company: PartnerCompany = { id: 'c1', name: 'Synthetic partner', type: 'Supplier', supplierOrigin: 'Local', businessClassification: classification,
      createdAt: '2026-01-01T00:00:00Z', branches: [{ id: 'old', bpCode: 'OLD', documents: {
        'DTI (Sole)': { provided: false, expiryDate: '2025-01-01', remarks: 'Awaiting original' },
      } }] };
    const original = structuredClone(company);
    const row: RawMasterListRow = { sourceRow: 21, status: '', category: '', supplierRank: '', bpCode: 'NEW', bpName: company.name,
      bpAddress: '', federalTaxId: '', industry: '', contactPerson: '', position: '', mobilePhone: '', email: '', dateAccredited: '', cells: [] };
    const result = mergeRowsIntoCompanies([row], [company]);
    const saved = result.companies[0];
    assert.equal(saved.businessClassification, classification);
    assert.equal(saved.branches?.length, 2);
    for (const branch of saved.branches ?? []) {
      for (const name of classification === 'CORP' ? ['GIS (Corp)', 'SEC (Corp)'] : ['DTI (Sole)']) {
        const doc = branch.documents?.[name] ?? {};
        assert.equal(companyDocumentRemarksError(saved, name, doc), null);
        assert.notEqual(doc.provided, true);
        assert.ok(doc.remarks);
      }
    }
    assert.equal(saved.branches?.[0].documents?.['DTI (Sole)'].remarks, 'Awaiting original');
    assert.deepEqual(company, original, 'preview must not mutate the loaded registry');
    assert.deepEqual(mergeRowsIntoCompanies([], [company]).companies, [company], 'untouched companies stay unchanged');
  }
});
