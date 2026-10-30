import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { applyPdfBranding, loadPdfBranding, PDF_CONTENT_TOP, PDF_CONTENT_BOTTOM } from './pdfBranding';
import { paperSizePoints } from '../domain/paperSize';

test('only the company logo appears on every page at every supported paper size', async t => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = String(input);
    requests.push(path);
    const bytes = await readFile(new URL(`../../../../public${path}`, import.meta.url));
    return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
  });
  const branding = await loadPdfBranding();
  assert.deepEqual(requests, ['/microgenesis_logo.png']);
  assert.ok(branding.companyLogo?.startsWith('data:image/png;base64,'));
  for (const size of ['a4', 'letter', 'legal', 'long-bond'] as const) {
    const doc = new jsPDF({ unit: 'pt', format: paperSizePoints(size) });
    autoTable(doc, { startY: PDF_CONTENT_TOP, head: [['Partner', 'Score']],
      body: Array.from({ length: 100 }, (_, i) => [`Synthetic partner ${i}`, String(i)]),
      margin: { top: PDF_CONTENT_TOP, bottom: PDF_CONTENT_BOTTOM },
    });
    const pages = doc.getNumberOfPages();
    assert.ok(pages > 1);
    applyPdfBranding(doc, branding, { title: 'Standard evaluation report' });
    const pdf = doc.output();
    assert.equal((pdf.match(/\/I\d+ Do/g) ?? []).length, pages, 'Only the company logo must be drawn on every continuation page');
    const imageObjects = (pdf.match(/\/Subtype \/Image/g) ?? []).length;
    const alphaMasks = (pdf.match(/\/SMask \d+ 0 R/g) ?? []).length;
    assert.equal(imageObjects - alphaMasks, 1, 'Reuse the company logo across pages; PNG alpha masks are separate image objects');
    assert.doesNotMatch(pdf, /SMPESA/);
    assert.ok(doc.output('arraybuffer').byteLength < 2_000_000, 'Compress full-resolution logos so branding does not dominate the report file');
    assert.match(pdf, /Synthetic partner 99/);
    assert.match(pdf, /\/Author \(Microgenesis\)/);
    for (let page = 1; page <= pages; page++) assert.ok(pdf.includes(`Page ${page} of ${pages}`));
  }
});

test('unavailable logo assets retain readable branding and report contents', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const branding = await loadPdfBranding();
  const doc = new jsPDF({ unit: 'pt' });
  doc.text('Retained evaluation data', 40, PDF_CONTENT_TOP);
  applyPdfBranding(doc, branding, { title: 'A long report title '.repeat(30), subject: 'A long partner name '.repeat(30), confidentiality: 'Strictly Confidential' });
  const pdf = doc.output();
  assert.doesNotMatch(pdf, /SMPESA/);
  assert.match(pdf, /Microgenesis/);
  assert.match(pdf, /Retained evaluation data/);
  assert.match(pdf, /Strictly Confidential/);
  assert.match(pdf, /Page 1 of 1/);
});

test('landscape presentation branding preserves slide text with the compact letterhead', () => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.text('Slide title', 48, 82);
  applyPdfBranding(doc, { companyLogo: null }, { title: 'Presentation', compact: true, margin: 48 });
  assert.match(doc.output(), /Slide title/);
  assert.match(doc.output(), /Microgenesis/);
  assert.doesNotMatch(doc.output(), /SMPESA/);
});
