import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { describeReportParameters, reportFilename, validateReportRecipe } from '../domain/reportHistory';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

test('filenames share one safe convention and distinguish repeated exports', () => {
  const date = new Date('2026-10-19T08:09:10.123Z');
  assert.equal(reportFilename('Company / Example', 'excel', date, '12345678-abcd'), 'sms_company-example_2026-10-19T08-09-10-123Z_12345678.xlsx');
  assert.notEqual(reportFilename('Report', 'pdf', date), reportFilename('Report', 'pdf', date));
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
      return new Response(JSON.stringify(init?.method === 'GET' ? matching.slice(Number(url.searchParams.get('offset') ?? 0), Number(url.searchParams.get('offset') ?? 0) + Number(url.searchParams.get('limit') ?? 1000)) : null), { headers: { 'Content-Type': 'application/json' } });
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
  service.downloadExportAgain(service.getExportHistory()[0]);
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
  authChanged('SIGNED_OUT', null);
  assert.equal(service.getExportHistory().length, 0);
  createUrl.mock.restore();
  mock.restoreAll();
});
