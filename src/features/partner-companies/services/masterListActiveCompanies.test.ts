import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import type { PartnerCompany } from '../../../types/survey';
import { activeListsFromRegistry } from '../../active-companies/domain/companyEligibility';
import { parseActiveCompanySnapshot } from '../../active-companies/domain/activeCompanySnapshots';
import { mergeMasterListSourceFiles, parseMasterListWorkbook, type MasterListSourceFile } from './masterListImport';

function workbook(v4: boolean, rows: Array<{ name: string; code: string; status: string; category: string }>) {
  const columns = v4 ? { status: 5, category: 6, code: 8, name: 9, sif: 22 } : { status: 2, category: 3, code: 5, name: 6, sif: 27 };
  const header: string[] = []; header[0] = '#'; header[columns.code] = 'BP Code'; header[columns.name] = 'BP Name';
  const sheet = XLSX.utils.aoa_to_sheet([['Legend'], header, ...rows.map((row, index) => {
    const cells: string[] = []; cells[0] = String(index + 1); cells[columns.status] = row.status;
    cells[columns.category] = row.category; cells[columns.code] = row.code; cells[columns.name] = row.name;
    cells[columns.sif] = 'Yes'; return cells;
  })]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Masterlist Database');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('standard and V4 masterlists derive category lists from branch status, not accreditation or documents', () => {
  for (const v4 of [false, true]) {
    const rows = parseMasterListWorkbook(workbook(v4, [
      { name: 'Mixed Partner', code: 'MIX', status: 'Inactive', category: 'Supplier-Local' },
      { name: 'Mixed Partner', code: 'MIX-NT', status: 'Pending', category: 'Supplier-Local-NT' },
      { name: 'Inactive Partner', code: 'INACTIVE', status: 'Inactive', category: 'Courier' },
      { name: 'Unclassified Partner', code: 'UNKNOWN', status: 'Accredited', category: '' },
      { name: 'Legacy Partner', code: 'LEGACY', status: '', category: 'Subcontructor' },
      { name: 'Incomplete Partner', code: 'INCOMPLETE', status: 'Incomplete', category: 'Supplier-Foreign' },
    ]));
    assert.equal(rows[0].sourceRow, 3);
    assert.equal(rows[0].bpName, 'Mixed Partner');
    assert.equal(rows[0].status, 'Inactive');
    const files: MasterListSourceFile[] = [{ id: 'file-0', fileName: 'master.xlsx', rows }];
    const result = mergeMasterListSourceFiles(files, [], []);
    assert.equal(result.companies[0].branches?.[0].documents?.SIF.provided, true);
    assert.deepEqual(activeListsFromRegistry(result.companies), [
      { surveyType: 'Courier', companies: [] },
      { surveyType: 'Supplier', companies: ['Incomplete Partner', 'Mixed Partner'] },
      { surveyType: 'Subcontractor', companies: ['Legacy Partner'] },
    ]);
    const withoutPendingBranch = mergeMasterListSourceFiles(files, ['file-0:4'], []);
    assert.deepEqual(activeListsFromRegistry(withoutPendingBranch.companies)[1].companies, ['Incomplete Partner']);
  }
});

test('merge retains existing eligible partners, replacement omits them, and archived partners stay excluded', () => {
  const existing: PartnerCompany[] = [
    { id: 'retained', name: 'Retained Partner', type: 'Supplier', createdAt: '2026-01-01' },
    { id: 'archived', name: 'Archived Partner', type: 'Courier', isArchived: true, createdAt: '2026-01-01' },
    { id: 'completed-inactive', name: 'Completed Inactive Partner', type: 'Courier', createdAt: '2026-01-01',
      branches: [{ id: 'completed-inactive-branch', bpCode: 'PAUSED', status: 'Completed', manualStatus: 'Inactive' }] },
  ];
  const original = structuredClone(existing);
  const files = [{ id: 'file-0', fileName: 'new.xlsx', rows: parseMasterListWorkbook(workbook(true, [
    { name: 'Added Partner', code: 'NEW', status: 'Outdated', category: 'Supplier-Local' },
  ])) }];
  assert.deepEqual(activeListsFromRegistry(mergeMasterListSourceFiles(files, [], existing).companies)[1].companies, ['Added Partner', 'Retained Partner']);
  assert.deepEqual(activeListsFromRegistry(mergeMasterListSourceFiles(files, [], []).companies)[1].companies, ['Added Partner']);
  assert.deepEqual(activeListsFromRegistry(existing)[0].companies, []);
  assert.deepEqual(existing, original);
});

test('unknown masterlist layouts fail before importing and an empty saved category clears prior assignments', () => {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Unexpected header'], ['value']]));
  assert.throws(() => parseMasterListWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })), /Unrecognized Master List layout/);
  assert.deepEqual(parseActiveCompanySnapshot({ id: 'empty', surveyType: 'Supplier', companies: [], uploadedAt: '2026-11-06', uploadedBy: 'admin@mgenesis.com', sourceFileName: 'master.xlsx' }).companies, []);
});
