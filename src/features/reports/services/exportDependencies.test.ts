import assert from 'node:assert/strict';
import test from 'node:test';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';

test('the supported SheetJS package writes and reads an XLSX workbook', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Company', 'Score'],
    ['Example Supplier', 98],
  ]), 'Report');

  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const restored = XLSX.read(bytes, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(restored.Sheets.Report, { header: 1 });

  assert.deepEqual(rows, [['Company', 'Score'], ['Example Supplier', 98]]);
});

test('PptxGenJS produces a valid ZIP-based presentation buffer', async () => {
  // tsx's CommonJS compatibility transform wraps this package one level
  // deeper than Vite/Node ESM. Resolve either supported module shape here.
  const PptxConstructor = (
    PptxGenJS as unknown as { default?: typeof PptxGenJS }
  ).default ?? PptxGenJS;
  const presentation = new PptxConstructor();
  presentation.addSlide().addText('Supplier Management System', { x: 1, y: 1, w: 6, h: 1 });

  const output = await presentation.write({ outputType: 'nodebuffer' });
  const bytes = output as Buffer;

  assert.equal(Buffer.isBuffer(bytes), true);
  assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
  assert.ok(bytes.length > 1_000);
});
