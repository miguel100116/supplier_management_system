import assert from 'node:assert/strict';
import test from 'node:test';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';
import { questionWeights } from '../../../data/questionWeights';
import type { SurveyType } from '../../../types/survey';
import { createCompanyReportData, getReportAverageText } from '../../feedback-hub/reporting/companyReportData';
import { exportCompanyReportAsPDF } from './companyReportExport';

test('generated company PDFs contain the verified score, rating and reporting period for every category', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  for (const type of ['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]) {
    const weight = questionWeights[type][0];
    const company = { id: 'partner', name: 'Reference Partner', type, createdAt: '2026-01-01' };
    const data = createCompanyReportData({ survey: { id: 'survey', title: 'Verified Reporting Period', surveyType: type },
      companyId: company.id, partnerCompanies: [company], includeComments: false,
      graphs: { bar: false, radar: false, trend: false, perQuestion: false },
      responses: [{ responseId: 'one', companyId: company.id, company: company.name, surveyId: 'survey', surveyType: type,
        respondentType: 'Employee', submissionDate: '2026-10-01', questionId: weight.questionId, questionNumber: 1,
        question: 'Reference criterion', questionCategory: weight.section, rating: weight.maxPoints * 0.78964, comment: '' }] });
    const uri = await exportCompanyReportAsPDF(data, undefined, false, true);
    assert.ok(uri);
    assert.notEqual(data.volumeWeightedScore, Number(data.volumeWeightedScore!.toFixed(1)));
    const pdf = Buffer.from(uri.split(',')[1], 'base64').toString('latin1');
    assert.ok(pdf.startsWith('%PDF-'));
    for (const value of ['Reference Partner', 'Verified Reporting Period', 'LEADERBOARD SCORE', getReportAverageText(data), data.volumeWeightedBand!.label]) {
      assert.ok(pdf.includes(value), `${type} PDF is missing ${value}`);
    }
  }
});

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
