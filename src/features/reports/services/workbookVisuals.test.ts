import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { addWorkbookVisuals } from './workbookVisuals';
import { parseArchivedResponsesWorkbook } from '../../archives/services/archiveResponseTransfer';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO1sAAAAASUVORK5CYII=';

test('Excel visuals have complete drawing/media relationships and preserve re-importable response rows', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Courier Leaderboard']]), 'Courier Leaderboard');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['responseId', 'surveyType', 'company', 'questionId', 'rating', 'submissionDate'],
    ['archived-one', 'Courier', 'Original Partner', 'Q01', 15, '2026-07-01'],
  ]), 'Archived Responses');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Courier Overview']]), 'Courier Overview');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const output = addWorkbookVisuals(bytes, [
    { title: 'Courier Leaderboard', dataUrl: `data:image/png;base64,${png}`, width: 1080, height: 470, placement: 'before-tables', description: 'Rank 1: A & B' },
    { title: 'Courier Leaderboard', dataUrl: `data:image/png;base64,${png}`, width: 1080, height: 470, placement: 'before-tables', continuation: true },
    { title: 'Courier Overview', dataUrl: `data:image/png;base64,${png}`, width: 1080, height: 700 },
  ], [1, 1, 3]);
  const restored = XLSX.read(output, { type: 'array' });
  assert.deepEqual(restored.SheetNames, ['Courier Leaderboard', 'Archived Responses', 'Courier Overview']);
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets['Archived Responses']), XLSX.utils.sheet_to_json(workbook.Sheets['Archived Responses']));
  const parsed = parseArchivedResponsesWorkbook(output, 'archive.xlsx', []);
  assert.equal(parsed.length, 1, 'Image sheets must not create synthetic evaluations during re-import');
  assert.equal(parsed[0].raw.responseId, 'archived-one');
  const zip = XLSX.CFB.read(output, { type: 'array' });
  const xml = (path: string) => Buffer.from(XLSX.CFB.find(zip, path)!.content).toString();
  assert.match(xml('/xl/worksheets/sheet1.xml'), /r:id="rIdAnalytics"/);
  assert.match(xml('/xl/worksheets/_rels/sheet1.xml.rels'), /Target="..\/drawings\/archiveAnalytics1.xml"/);
  assert.match(xml('/xl/worksheets/_rels/sheet3.xml.rels'), /Target="..\/drawings\/archiveAnalytics3.xml"/);
  assert.match(xml('/xl/drawings/archiveAnalytics1.xml'), /cx="10287000" cy="4476750"/);
  assert.equal((xml('/xl/drawings/archiveAnalytics1.xml').match(/<xdr:oneCellAnchor>/g) ?? []).length, 2);
  assert.match(xml('/xl/drawings/archiveAnalytics1.xml'), /<xdr:row>25<\/xdr:row><xdr:rowOff>95250/);
  assert.match(xml('/xl/drawings/archiveAnalytics1.xml'), /descr="Rank 1: A &amp; B"/);
  assert.doesNotMatch(xml('/xl/worksheets/sheet2.xml'), /<drawing/);
  assert.match(xml('/xl/drawings/_rels/archiveAnalytics1.xml.rels'), /Target="..\/media\/archiveAnalytics1.png"/);
  assert.equal(Buffer.from(XLSX.CFB.find(zip, '/xl/media/archiveAnalytics1.png')!.content).toString('base64'), png);
  assert.match(xml('/[Content_Types].xml'), /Extension="png" ContentType="image\/png"/);
  assert.match(xml('/[Content_Types].xml'), /PartName="\/xl\/drawings\/archiveAnalytics1.xml"/);
});

test('invalid visual images fail visibly instead of producing a damaged workbook', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Analytics']]), 'Analytics');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  assert.throws(() => addWorkbookVisuals(bytes, [{ title: 'Bad', dataUrl: 'data:text/html;base64,PGh0bWw+', width: 1080, height: 700 }], [1]), /Invalid/);
  assert.throws(() => addWorkbookVisuals(bytes, [{ title: 'Bad', dataUrl: `data:image/png;base64,${png}`, width: 0, height: 700 }], [1]), /Invalid/);
  assert.throws(() => addWorkbookVisuals(bytes, [], [1]), /worksheet positions/);
});
