import assert from 'node:assert/strict';
import test from 'node:test';
import { questionWeights } from '../../../data/questionWeights';
import type { CustomForm, SurveyResponse } from '../../../types/survey';
import { buildArchivedReport } from '../domain/archivedReports';
import { createArchivedSurveyPdf } from './archivedSurveyPdf';

const survey: CustomForm = { id: 'survey', title: 'Supplier Quality Survey', description: '', createdAt: '2025-01-01', archivedAt: '2026-11-12T12:46:00Z', status: 'Archived', surveyType: 'Supplier', questions: [] };
function report(companyCount = 25) {
  const responses: SurveyResponse[] = Array.from({ length: companyCount }, (_, index) => questionWeights.Supplier.map((question, questionIndex) => ({
    responseId: `form-${index}`, surveyId: survey.id, companyId: `company-${index}`, company: `Supplier Company ${String(index + 1).padStart(2, '0')}`,
    surveyType: 'Supplier' as const, respondentType: 'Employee', submissionDate: '2026-07-17T00:00:00Z',
    questionId: question.questionId, questionNumber: questionIndex + 1, question: `Evaluation question ${questionIndex + 1}`,
    questionCategory: question.section, rating: question.maxPoints * (1 - index / 50), comment: '', archived: true, dataSource: 'client_csv' as const,
  }))).flat();
  return buildArchivedReport({ responses, surveys: [survey], knownSurveys: [survey], companies: [], series: [] }, { kind: 'archived-survey', category: 'Supplier', itemId: survey.id, includeComments: false });
}

/** Read jsPDF's uncompressed text operators so assertions cover the printed geometry. */
function textRuns(pdf: string, height = 792) {
  return [...pdf.matchAll(/BT\n([\s\S]*?)\nET/g)].flatMap(match => {
    const font = match[1].match(/\/F\d+ ([\d.]+) Tf/);
    const position = match[1].match(/([-\d.]+) ([-\d.]+) Td/);
    const text = match[1].match(/\((.*)\) Tj/);
    return font && position && text ? [{ text: text[1], size: Number(font[1]), x: Number(position[1]), y: height - Number(position[2]) }] : [];
  });
}

test('Letter survey PDF matches measured reference typography and table coordinates, with Top 20 and full metrics', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const input = report();
  const before = JSON.stringify(input);
  const pdf = Buffer.from(await (await createArchivedSurveyPdf(input.title, input.itemLabel, 'Supplier', input.tables, input.analytics, 'letter')).arrayBuffer()).toString('latin1');
  assert.match(pdf, /\/MediaBox \[0 0 612\. 792\.\]/);
  assert.match(pdf, /\/Count 3\b/);
  const runs = textRuns(pdf);
  for (const [text, size, x, y] of [
    ['Archived Survey Report', 20, 49.2, 105.2], ['Report summary', 20, 49.2, 105.2], ['Question results', 20, 49.2, 105.2],
    ['Report details', 13, 49.2, 220.4], ['Item', 8, 52.8, 235.4], ['#', 8, 52.8, 143.2],
  ] as const) {
    const run = runs.find(run => run.text === text && run.size === size);
    assert.ok(run, `Missing ${size}pt ${text}`);
    assert.ok(Math.abs(run.x - x) < .05 && Math.abs(run.y - y) < .05, `${text}: expected ${x},${y}; got ${run.x},${run.y}`);
  }
  assert.ok(runs.some(run => run.text === '25' && run.size === 18), 'The complete cohort remains in the prominent summary figures');
  assert.ok(runs.some(run => run.text.startsWith('Supplier Company 20')));
  assert.ok(!runs.some(run => run.text.startsWith('Supplier Company 21')));
  assert.ok(!runs.some(run => run.text.startsWith('Answers')) , 'The reference question table has three columns');
  assert.match(pdf, /425 official; 0 staging\/test/);
  assert.equal(JSON.stringify(input), before);
});

test('empty surveys keep one compact reference page and explicit paper overrides remain available', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const input = report(0);
  for (const [size, width, height] of [['letter', 612, 792], ['legal', 612, 1008], ['a4', 595.28, 841.89], ['long-bond', 612, 936]] as const) {
    const pdf = Buffer.from(await (await createArchivedSurveyPdf(input.title, input.itemLabel, 'Supplier', input.tables, input.analytics, size)).arrayBuffer()).toString('latin1');
    assert.match(pdf, /\/Count 1\b/);
    const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
    assert.ok(Math.abs(Number(box[1]) - width) < .01 && Math.abs(Number(box[2]) - height) < .01);
    assert.match(pdf, /No Score Yet/); assert.match(pdf, /No response data/);
    assert.doesNotMatch(pdf, /Supplier Leaderboard/);
  }
});

test('long category labels expand the metric box before the detail table and comments start on a new page', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const input = report();
  input.analytics[0].summary.analysis[0].peerAverages = [{ section: 'Documentation', average: 95 }, { section: 'A very long category label needing wrapping', average: 50 }];
  input.tables.push({ title: 'Respondent comments', columns: ['Company', 'Question', 'Comment'], rows: [['Supplier Company 01', 'Remarks', 'Retained evaluation comment']] });
  const pdf = Buffer.from(await (await createArchivedSurveyPdf(input.title, input.itemLabel, 'Supplier', input.tables, input.analytics, 'letter')).arrayBuffer()).toString('latin1');
  const details = textRuns(pdf).find(run => run.text === 'Report details' && run.size === 13)!;
  assert.ok(details.y > 228, 'Wrapped metric labels must have their own height rather than overflow into the next section');
  assert.match(pdf, /\/Count 4\b/);
  assert.match(pdf, /Retained evaluation comment/);
});
