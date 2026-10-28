import assert from 'node:assert/strict';
import test from 'node:test';
import { documentRemarksError } from './documentValidation';

test('requires remarks for missing applicable DTI, GIS, and SEC records', () => {
  for (const docName of ['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)']) {
    const classification = docName === 'DTI (Sole)' ? 'SOL' : 'CORP';
    assert.ok(documentRemarksError(docName, { provided: false }, classification));
    assert.equal(documentRemarksError(docName, { provided: false, remarks: 'Awaiting renewal' }, classification), null);
  }
});

test('does not require remarks for non-applicable classification documents', () => {
  assert.equal(documentRemarksError('DTI (Sole)', { provided: false }, 'CORP'), null);
  assert.equal(documentRemarksError('GIS (Corp)', { provided: false }, 'SOL'), null);
  assert.equal(documentRemarksError('SEC (Corp)', { provided: false }, 'SOL'), null);
  assert.equal(documentRemarksError('DTI (Sole)', { provided: false }, 'SOL', true), null);
});

test('a provided DTI or GIS without its expiry date requires a remark', () => {
  assert.ok(documentRemarksError('DTI (Sole)', { provided: true }, 'SOL'));
  assert.ok(documentRemarksError('GIS (Corp)', { provided: true }, 'CORP'));
  assert.equal(documentRemarksError('SEC (Corp)', { provided: true }, 'CORP'), null);
});
