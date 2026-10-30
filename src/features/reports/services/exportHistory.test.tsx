import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { createReportId, describeReportParameters, reportFilename, validateReportRecipe } from '../domain/reportHistory';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

function historyRows(rows: Array<{ record_id: string; owner_id?: string; payload: Record<string, unknown> }>, url: URL) {
  let result = rows.filter(row => !row.owner_id || `eq.${row.owner_id}` === url.searchParams.get('owner_id'));
  const id = url.searchParams.get('record_id');
  if (id?.startsWith('eq.')) result = result.filter(row => row.record_id === id.slice(3));
  if (id?.startsWith('in.')) result = result.filter(row => id.slice(4, -1).split(',').map(value => value.replace(/"/g, '')).includes(row.record_id));
  if (id?.startsWith('gt.')) result = result.filter(row => row.record_id > id.slice(3));
  if (url.searchParams.has('order')) result.sort((a, b) => a.record_id.localeCompare(b.record_id));
  if (url.searchParams.has('payload->>fileDataUrl')) result = result.filter(row => row.payload.fileDataUrl != null);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  result = result.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000));
  if (url.searchParams.get('select')?.includes('title:payload')) return result.map(row => ({ record_id: row.record_id,
    ...Object.fromEntries(['id', 'title', 'format', 'filename', 'exportedAt', 'exportedBy', 'recipe'].map(key => [key, row.payload[key] ?? null])) }));
  if (url.searchParams.get('select') === 'record_id') return result.map(row => ({ record_id: row.record_id }));
  return result;
}

test('filenames share one safe convention and distinguish repeated exports', () => {
  const date = new Date('2026-10-19T08:09:10.123Z');
  assert.equal(reportFilename('Company / Example', 'excel', date, '12345678-abcd'), 'sms_company-example_2026-10-19T08-09-10-123Z_12345678.xlsx');
  assert.notEqual(reportFilename('Report', 'pdf', date), reportFilename('Report', 'pdf', date));
});

test('report filenames and history IDs work when randomUUID is unavailable on an HTTP host', () => {
  const ownDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  try {
    assert.match(createReportId(), /^[a-f0-9]{32}$/);
    assert.notEqual(createReportId(), createReportId());
    assert.match(reportFilename('Archive report', 'pdf'), /^sms_archive-report_.*_[a-f0-9]{8}\.pdf$/);
  } finally {
    if (ownDescriptor) Object.defineProperty(crypto, 'randomUUID', ownDescriptor);
    else Reflect.deleteProperty(crypto, 'randomUUID');
  }
});

test('persisted report options and file copies reject malformed external input', () => {
  const entry = { id: 'one', title: 'Report', filename: 'report.pdf', exportedAt: '2026-10-19', format: 'pdf' };
  assert.doesNotThrow(() => parseApplicationRecordPayload('export_history', entry, 'one'));
  assert.doesNotThrow(() => validateReportRecipe({ kind: 'executive', parameters: { questionThreshold: 85, showKpis: false } }));
  for (const parameters of [{ showKpis: 'false' }, { category: 'Other' }, { questionThreshold: Infinity }, { selectedTypes: {} }, { unknown: true }]) {
    assert.throws(() => validateReportRecipe({ kind: 'summary', parameters }));
  }
  for (const fileDataUrl of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'data:application/pdf;base64,%%%']) {
    assert.throws(() => parseApplicationRecordPayload('export_history', { ...entry, fileDataUrl }, 'one'));
  }
  assert.match(describeReportParameters({ kind: 'summary', parameters: { showKpis: false } }), /KPIs: Excluded/);
});

test('retired combined archive exports retain their exact files without restoring the old builder', () => {
  const entry = { id: 'old-archive', title: 'Archived Survey Report', filename: 'archive.pdf', exportedAt: '2026-10-26', format: 'pdf',
    recipe: { kind: 'archive', parameters: { archiveReportType: 'survey', archiveSurveyId: 'former-survey' } }, fileDataUrl: 'data:application/pdf;base64,JVBERi10ZXN0' };
  const before = JSON.stringify(entry);
  const parsed = parseApplicationRecordPayload('export_history', entry, entry.id) as Record<string, unknown>;
  assert.equal(parsed.fileDataUrl, entry.fileDataUrl);
  assert.equal(parsed.recipe, undefined);
  assert.equal(parsed.recipeUnavailable, true);
  assert.equal(JSON.stringify(entry), before);
  assert.throws(() => parseApplicationRecordPayload('export_history', { ...entry, fileDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, entry.id));
});

test('saved files survive unsupported or invalid optional recipes while new writes and file validation stay strict', () => {
  const entry = { id: 'history', title: 'Saved report', filename: 'saved.pdf', exportedAt: '2026-10-26', format: 'pdf', fileDataUrl: 'data:application/pdf;base64,JVBERi10ZXN0' };
  for (const recipe of [null, [], 'old recipe', {}, { kind: 'future-report', parameters: {} },
    { kind: 'summary', parameters: null }, { kind: 'summary', parameters: { showKpis: 'yes' } },
    { kind: 'archived-responses', parameters: { category: 'Supplier' } }]) {
    const source = { ...entry, recipe };
    const before = JSON.stringify(source);
    const parsed = parseApplicationRecordPayload('export_history', source, entry.id) as Record<string, unknown>;
    assert.equal(parsed.recipe, undefined);
    assert.equal(parsed.recipeUnavailable, true);
    assert.equal(parsed.fileDataUrl, entry.fileDataUrl);
    assert.equal(JSON.stringify(source), before);
    assert.throws(() => parseApplicationRecordPayload('export_history', source, entry.id, { operation: 'write' }));
    assert.throws(() => parseApplicationRecordPayload('export_history', { ...source, fileDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, entry.id));
  }
  const current = { kind: 'archived-responses', parameters: { category: 'Supplier', archivedItemId: 'one-archive' } };
  const parsed = parseApplicationRecordPayload('export_history', { ...entry, recipe: current, recipeUnavailable: true }, entry.id) as Record<string, unknown>;
  assert.deepEqual(parsed.recipe, current);
  assert.equal(parsed.recipeUnavailable, undefined, 'Compatibility state is computed, not trusted from storage');
  assert.throws(() => parseApplicationRecordPayload('export_history', { ...entry, recipe: {}, exportedAt: 'invalid-date' }, entry.id));
  assert.throws(() => parseApplicationRecordPayload('export_history', { ...entry, recipe: {}, id: 'wrong-id' }, entry.id));
});

test('history persists per user, re-downloads exact bytes, survives refresh, and retains rows on failed clear', async () => {
  const browser = new EventTarget();
  Object.assign(browser, { atob, btoa, __SMS_RUNTIME_CONFIG__: { supabaseUrl: 'https://synthetic.supabase.co', supabasePublishableKey: 'synthetic-test-key' }, location: { search: '?tab=history', pathname: '/reports' } });
  Object.assign(globalThis, { window: browser, React });
  const { supabase } = await import('../../../services/supabaseClient');
  let userId = 'user-one';
  let authChanged: (event: string, session: unknown) => void = () => {};
  mock.method(supabase.auth, 'getUser', async () => ({ data: { user: { id: userId } }, error: null }));
  mock.method(supabase.auth, 'onAuthStateChange', (callback: typeof authChanged) => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; });
  const rows: Array<{ record_type: string; record_id: string; owner_id: string; payload: Record<string, unknown> }> = [];
  const requests: URL[] = [];
  let fail = false;
  const provider = createClient('https://synthetic.supabase.co', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      if (fail) return new Response(JSON.stringify({ message: 'Rejected' }), { status: 403 });
      if (init?.method === 'POST') rows.push(...JSON.parse(String(init.body)));
      const matching = rows.filter(row => `eq.${row.owner_id}` === url.searchParams.get('owner_id'));
      if (init?.method === 'DELETE') for (const row of matching) rows.splice(rows.indexOf(row), 1);
      return new Response(JSON.stringify(init?.method === 'GET' ? historyRows(rows, url) : null), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  mock.method(supabase, 'from', (name: string) => provider.from(name));
  const service = await import('./exportHistory');
  authChanged('SIGNED_IN', { user: { id: userId } });
  const recipe = { kind: 'summary' as const, parameters: { showKpis: false } };
  const fileDataUrl = 'data:application/pdf;base64,JVBERi10ZXN0';
  await service.logExport({ title: 'Summary', filename: 'summary.pdf', format: 'pdf', recipe, fileDataUrl });
  assert.equal(rows[0].owner_id, 'user-one');
  rows.push({ ...rows[0], record_id: 'other', owner_id: 'user-two', payload: { ...rows[0].payload, id: 'other' } });
  await service.hydrateExportHistoryFromSupabase();
  assert.equal(service.getExportHistory().length, 1);
  assert.deepEqual(service.getExportHistory()[0].recipe, recipe);
  assert.equal(requests.at(-1)?.searchParams.get('owner_id'), 'eq.user-one');

  let downloaded: Blob | undefined;
  const createUrl = mock.method(URL, 'createObjectURL', (blob: Blob) => { downloaded = blob; return 'blob:synthetic'; });
  mock.method(URL, 'revokeObjectURL', () => {});
  const anchor = { href: '', download: '', click() {}, remove() {} };
  Object.assign(globalThis, { document: { createElement: () => anchor, body: { appendChild() {} } } });
  await service.downloadExportAgain(service.getExportHistory()[0]);
  assert.equal(await downloaded!.text(), '%PDF-test');
  assert.equal(anchor.download, 'summary.pdf');

  // Load rendering libraries in their Node mode; restore the browser fixture for page rendering.
  Reflect.deleteProperty(globalThis, 'window');
  const { ReportsPage } = await import('../../../pages/ReportsPage');
  Object.assign(globalThis, { window: browser });
  const html = renderToStaticMarkup(React.createElement(ReportsPage, { responses: [], canExport: true }));
  assert.match(html, /aria-label="Reports"/);
  assert.match(html, /Download again/);
  assert.match(html, /Regenerate/);
  Object.assign(browser, { location: { search: '', pathname: '/export-history' } });
  const legacyRoute = renderToStaticMarkup(React.createElement(ReportsPage, { responses: [], canExport: true }));
  assert.match(legacyRoute, /aria-selected="true"[^>]*id="reports-history"/);
  assert.match(legacyRoute, /Download again/);
  assert.match(html, /KPIs: Excluded/);
  const restricted = renderToStaticMarkup(React.createElement(ReportsPage, { responses: [], canExport: false }));
  assert.match(restricted, /disabled=""[^>]*>Download again/);

  fail = true;
  await assert.rejects(service.clearExportHistory());
  assert.equal(service.getExportHistory().length, 1);
  let persistenceError = '';
  browser.addEventListener('supabase-persistence-error', event => { persistenceError = (event as CustomEvent).detail; });
  await service.logExport({ title: 'Failed', filename: 'failed.pdf', format: 'pdf' });
  assert.match(persistenceError, /could not be saved/);
  assert.equal(service.getExportHistory().length, 1);
  fail = false;
  await service.clearExportHistory();
  assert.equal(service.getExportHistory().length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_id, 'user-two');
  userId = 'user-two';
  authChanged('SIGNED_IN', { user: { id: userId } });
  assert.equal(service.getExportHistory().length, 0);
  await service.hydrateExportHistoryFromSupabase();
  assert.equal(service.getExportHistory()[0].id, 'other');
  Object.assign(globalThis, { FileReader: class {
    result = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`; this.onload?.(); }); }
  } });
  await service.saveReportDownload(new Blob(['csv bytes'], { type: 'text/csv;charset=utf-8' }), 'Raw Data', 'csv', { kind: 'raw', parameters: { category: 'Supplier' } });
  assert.match(service.getExportHistory()[0].filename, /^sms_raw-data_.*\.csv$/);
  assert.equal(service.getExportHistory()[0].fileDataUrl, 'data:text/csv;charset=utf-8;base64,Y3N2IGJ5dGVz');
  const { exportTablesAsCSV, exportTablesAsWord, exportTablesAsPDF } = await import('./exporters');
  await exportTablesAsWord('Editable report', [{ title: 'Company Rankings', columns: ['Company', 'Responses'], rows: [['A < B & C', 3], ['Other company', 2]] }], 'report', recipe);
  const XLSX = await import('xlsx');
  const archive = XLSX.CFB.read(Buffer.from(await downloaded!.arrayBuffer()), { type: 'buffer' });
  const document = XLSX.CFB.find(archive, '/word/document.xml');
  assert.ok(document, 'Word export must be a real DOCX package');
  const xml = Buffer.from(document.content as Uint8Array).toString('utf8');
  assert.match(xml, /Editable report/);
  assert.match(xml, /A &lt; B &amp; C/);
  assert.match(xml, /Other company/);
  assert.match(xml, /Generated on:/);
  assert.match(xml, /Confidential: For internal distribution only/);
  assert.match(xml, /w:top="800"/);
  const styles = XLSX.CFB.find(archive, '/word/styles.xml');
  assert.ok(styles);
  assert.match(Buffer.from(styles.content as Uint8Array).toString('utf8'), /w:sz w:val="44"/);
  assert.equal(service.getExportHistory()[0].format, 'docx');
  assert.match(service.getExportHistory()[0].filename, /\.docx$/);
  const { exportArchivedReportAsPDF } = await import('./archivedReportExport');
  await exportArchivedReportAsPDF('Archived Survey Report', 'Selected archive', 'Courier', [
    { title: 'Report scope', columns: ['Field', 'Value'], rows: [['Selected item', 'Selected archive'], ['Category', 'Courier']] },
    { title: 'Current results', columns: ['Answer'], rows: [['Latest saved answer']] },
  ], { kind: 'archived-survey', parameters: { category: 'Courier', archivedItemId: 'selected', includeComments: true } });
  const pdf = Buffer.from(await downloaded!.arrayBuffer()).toString('latin1');
  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /\/Count 1\b/, 'The compact fixture starts its tables on page one, without a cover');
  assert.match(pdf, /Latest saved answer/);
  assert.match(pdf, /Selected archive/);
  assert.match(pdf, /current rubric/);
  assert.match(pdf, /Supplier Management System/);
  assert.doesNotMatch(pdf, /MBS Partner Evaluation System/);
  assert.equal(service.getExportHistory()[0].recipe?.kind, 'archived-survey');
  for (const [paperSize, width, height] of [['a4', 595.28, 841.89], ['letter', 612, 792], ['legal', 612, 1008], ['long-bond', 612, 936]] as const) {
    const sizedRecipe = { kind: 'summary' as const, parameters: { paperSize } };
    validateReportRecipe(sizedRecipe);
    const tables = [{ title: 'Results', columns: ['Answer'], rows: [['Retained result']] }];
    await exportTablesAsPDF('Sized report', tables, 'sized', sizedRecipe);
    const sizedPdf = Buffer.from(await downloaded!.arrayBuffer()).toString('latin1');
    const mediaBox = sizedPdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(mediaBox);
    assert.ok(Math.abs(Number(mediaBox[1]) - width) < 0.02);
    assert.ok(Math.abs(Number(mediaBox[2]) - height) < 0.02);
    assert.match(sizedPdf, /Retained result/);
    await exportTablesAsWord('Sized report', tables, 'sized', sizedRecipe);
    const sizedArchive = XLSX.CFB.read(Buffer.from(await downloaded!.arrayBuffer()), { type: 'buffer' });
    const sizedXml = Buffer.from(XLSX.CFB.find(sizedArchive, '/word/document.xml')!.content as Uint8Array).toString();
    assert.match(sizedXml, new RegExp(`w:w="${Math.round(width * 20)}"`));
    assert.match(sizedXml, new RegExp(`w:h="${Math.round(height * 20)}"`));
    assert.equal(service.getExportHistory()[0].recipe?.parameters.paperSize, paperSize);
  }
  assert.throws(() => validateReportRecipe({ kind: 'summary', parameters: { paperSize: 'poster' } }), /Invalid paper size/);
  validateReportRecipe({ kind: 'summary', parameters: {} });
  createUrl.mock.restore();
  const rejectedDownload = mock.method(URL, 'createObjectURL', () => { throw new Error('Synthetic download blocked'); });
  await assert.rejects(exportTablesAsCSV([{ title: 'Archive', columns: ['Value'], rows: [['Saved answer']] }], 'archive'), /Synthetic download blocked/);
  rejectedDownload.mock.restore();
  authChanged('SIGNED_OUT', null);
  assert.equal(service.getExportHistory().length, 0);
  mock.restoreAll();
});

test('metadata refresh retains incompatible options without loading files; unsafe downloads are rejected', async (t) => {
  const browser = new EventTarget();
  Object.assign(browser, { __SMS_RUNTIME_CONFIG__: { supabaseUrl: 'https://synthetic.supabase.co', supabasePublishableKey: 'synthetic-test-key' } });
  Object.assign(globalThis, { window: browser });
  const { supabase } = await import('../../../services/supabaseClient');
  t.mock.method(supabase.auth, 'getUser', async () => ({ data: { user: { id: 'history-user' } }, error: null }));
  t.mock.method(supabase.auth, 'onAuthStateChange', () => ({ data: { subscription: { unsubscribe() {} } } }));
  const file = 'data:application/pdf;base64,JVBERi10ZXN0';
  const base = { title: 'Saved report', filename: 'saved.pdf', exportedAt: '2026-10-26', format: 'pdf', fileDataUrl: file };
  const records = [
    { record_id: 'future', payload: { ...base, id: 'future', recipe: { kind: 'future-report', parameters: {} } } },
    { record_id: 'current', payload: { ...base, id: 'current', recipe: { kind: 'archived-responses', parameters: { category: 'Supplier', archivedItemId: 'one-archive' } } } },
    { record_id: 'unsafe', payload: { ...base, id: 'unsafe', fileDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' } },
  ];
  const original = JSON.stringify(records);
  const alerts: string[] = [];
  browser.addEventListener('supabase-persistence-error', event => alerts.push((event as CustomEvent).detail));
  const provider = createClient('https://synthetic.supabase.co', 'synthetic-test-key', {
    auth: { storageKey: 'history-compatibility-test', persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      assert.equal(init?.method ?? 'GET', 'GET', 'History compatibility must never repair remote records implicitly');
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('owner_id'), 'eq.history-user');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      return new Response(JSON.stringify(historyRows(records, url)), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  t.mock.method(supabase, 'from', (name: string) => provider.from(name));
  const service = await import('./exportHistory');
  await service.hydrateExportHistoryFromSupabase();
  assert.equal(service.getExportHistory().length, 3);
  assert.ok(service.getExportHistory().every(entry => entry.fileDataUrl === undefined));
  assert.equal(service.getExportHistory().find(entry => entry.id === 'future')?.recipeUnavailable, true);
  assert.equal(service.getExportHistory().find(entry => entry.id === 'current')?.recipe?.kind, 'archived-responses');
  assert.deepEqual(alerts, []);
  await assert.rejects(service.downloadExportAgain(service.getExportHistory().find(entry => entry.id === 'unsafe')!), /Invalid saved export file/);
  assert.equal(JSON.stringify(records), original);
  records.pop();
  alerts.length = 0;
  await service.hydrateExportHistoryFromSupabase();
  assert.deepEqual(alerts, []);
  let downloaded: Blob | undefined;
  t.mock.method(URL, 'createObjectURL', (blob: Blob) => { downloaded = blob; return 'blob:history-test'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  Object.assign(globalThis, { document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } } });
  await service.downloadExportAgain(service.getExportHistory().find(entry => entry.id === 'future')!);
  assert.equal(await downloaded!.text(), '%PDF-test');
});
