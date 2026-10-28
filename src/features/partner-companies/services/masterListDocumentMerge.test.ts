import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExistingDocuments } from './masterListImport';

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
