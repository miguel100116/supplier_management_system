import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  createActiveCompanySnapshot,
  parseActiveCompanySnapshot,
  parseActiveCompanyWorkbook,
  snapshotsBySurveyType,
} from './activeCompanySnapshots';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Responses');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

test('extracts, trims, deduplicates, and sorts companies from an official form column', () => {
  const header = Array.from({ length: 9 }, () => '');
  header[8] = 'Supplier Name:';
  const first = Array.from({ length: 9 }, () => '');
  first[8] = '  Zebra Supply  ';
  const duplicate = Array.from({ length: 9 }, () => '');
  duplicate[8] = 'Zebra Supply';
  const second = Array.from({ length: 9 }, () => '');
  second[8] = 'Alpha Supply';

  assert.deepEqual(
    parseActiveCompanyWorkbook(workbookBuffer([header, first, duplicate, second]), 'supplier.xlsx', 'Supplier'),
    ['Alpha Supply', 'Zebra Supply'],
  );
});

test('finds a generic company-name column anywhere in a workbook', () => {
  assert.deepEqual(
    parseActiveCompanyWorkbook(
      workbookBuffer([
        ['Reference', 'Status', 'Company Name'],
        ['001', 'Active', 'Second Supplier'],
        ['002', 'Active', 'First Supplier'],
      ]),
      'active-suppliers.xlsx',
      'Supplier',
    ),
    ['First Supplier', 'Second Supplier'],
  );
});

test('accepts a plain one-column file even when it has no header', () => {
  assert.deepEqual(
    parseActiveCompanyWorkbook(
      workbookBuffer([['Zeta Courier'], ['Alpha Courier'], ['Alpha Courier']]),
      'couriers.csv',
      'Courier',
    ),
    ['Alpha Courier', 'Zeta Courier'],
  );
});

test('rejects an ambiguous multi-column file without a company header', () => {
  assert.throws(
    () => parseActiveCompanyWorkbook(
      workbookBuffer([['Code', 'Status'], ['001', 'Active']]),
      'suppliers.xlsx',
      'Supplier',
    ),
    /Could not find a company-name column/,
  );
});

test('keeps immutable snapshots ordered newest first for each partner type', () => {
  const older = createActiveCompanySnapshot('Courier', 'old.csv', ['Old Co'], 'admin@mgenesis.com', '2026-09-01T00:00:00.000Z', 'old');
  const newer = createActiveCompanySnapshot('Courier', 'new.csv', ['New Co'], 'admin@mgenesis.com', '2026-09-20T00:00:00.000Z', 'new');
  const supplier = createActiveCompanySnapshot('Supplier', 'supplier.csv', ['Supplier Co'], 'admin@mgenesis.com', '2026-09-10T00:00:00.000Z', 'supplier');

  assert.deepEqual(snapshotsBySurveyType([older, supplier, newer], 'Courier').map((snapshot) => snapshot.id), [newer.id, older.id]);
  assert.deepEqual(parseActiveCompanySnapshot(newer), newer);
});

test('active-list ordering uses actual timestamps and deterministic IDs, matching the employee projection', () => {
  const first = createActiveCompanySnapshot('Supplier', 'first.csv', ['First'], 'admin@mgenesis.com', '2026-10-30T08:00:00+08:00', 'first');
  const later = { ...first, id: 'z', uploadedAt: '2026-10-30T01:00:00Z' };
  const equalTime = { ...later, id: 'a' };
  assert.deepEqual(snapshotsBySurveyType([first, equalTime, later], 'Supplier').map(item => item.id), ['z', 'a', first.id]);
});
