import assert from 'node:assert/strict';
import test from 'node:test';
import { getPartnerDocumentFileContentType, MAX_PARTNER_DOCUMENT_FILE_BYTES, validatePartnerDocumentFile } from './partnerDocumentFiles';

test('foreign supplier document uploads accept supported file types up to 10 MB', () => {
  assert.equal(getPartnerDocumentFileContentType('financials.PDF'), 'application/pdf');
  assert.equal(getPartnerDocumentFileContentType('company.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(validatePartnerDocumentFile({ name: 'permit.pdf', size: 12, type: 'application/pdf' }), null);
  assert.equal(validatePartnerDocumentFile({ name: 'permit.pdf', size: MAX_PARTNER_DOCUMENT_FILE_BYTES, type: 'application/pdf' }), null);
});

test('foreign supplier document uploads reject empty, oversized, unsupported, and mismatched files', () => {
  assert.match(validatePartnerDocumentFile({ name: 'empty.pdf', size: 0, type: 'application/pdf' }) ?? '', /between 1 byte and 10 MB/);
  assert.match(validatePartnerDocumentFile({ name: 'large.pdf', size: MAX_PARTNER_DOCUMENT_FILE_BYTES + 1, type: 'application/pdf' }) ?? '', /between 1 byte and 10 MB/);
  assert.match(validatePartnerDocumentFile({ name: 'script.exe', size: 10, type: 'application/octet-stream' }) ?? '', /Choose a PDF/);
  assert.match(validatePartnerDocumentFile({ name: 'misnamed.pdf', size: 10, type: 'image/png' }) ?? '', /does not match/);
  assert.match(validatePartnerDocumentFile({ name: 'x'.repeat(252) + '.pdf', size: 10, type: 'application/pdf' }) ?? '', /file name/);
});
