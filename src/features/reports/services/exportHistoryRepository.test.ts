import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadExportHistoryMetadata, loadSavedExportFile } from './exportHistoryRepository';

test('History refresh reads all lightweight owner metadata under small server caps; files are fetched individually and validated', async () => {
  const records = Array.from({ length: 105 }, (_, index) => ({
    record_id: `history-${index}`, owner_id: 'owner', payload: {
      id: `history-${index}`, title: `Report ${index}`, format: 'pdf', filename: `${index}.pdf`, exportedAt: '2026-10-26',
      ...(index === 0 ? { fileDataUrl: 'data:application/pdf;base64,JVBERi10ZXN0' } : {}),
      ...(index === 1 ? { fileDataUrl: `data:application/pdf;base64,${'A'.repeat(2_000_000)}` } : {}),
      ...(index === 2 ? { recipe: { kind: 'future-report', parameters: {} } } : {}),
    } as Record<string, unknown>,
  }));
  records[3].payload.exportedAt = 'invalid';
  records[4].payload.id = 'mismatched-id';
  records[5].payload.title = { unexpected: 'object' };
  records[6].payload.format = ['pdf'];
  records.push({ ...records[0], record_id: 'foreign', owner_id: 'other', payload: { ...records[0].payload, id: 'foreign' } });
  const before = JSON.stringify(records);
  const requests: URL[] = [];
  let transferred = 0;
  let rejectFile = false;
  const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      assert.equal(init?.method ?? 'GET', 'GET');
      const url = new URL(String(input));
      requests.push(url);
      assert.equal(url.searchParams.get('owner_id'), 'eq.owner');
      assert.equal(url.searchParams.get('record_type'), 'eq.export_history');
      let rows = records.filter(row => row.owner_id === 'owner');
      const id = url.searchParams.get('record_id');
      if (id?.startsWith('eq.')) rows = rows.filter(row => row.record_id === id.slice(3));
      if (id?.startsWith('in.')) rows = rows.filter(row => id.slice(4, -1).split(',').map(value => value.replace(/"/g, '')).includes(row.record_id));
      if (id?.startsWith('gt.')) rows = rows.filter(row => row.record_id > id.slice(3));
      if (url.searchParams.has('order')) rows.sort((a, b) => a.record_id.localeCompare(b.record_id));
      const select = url.searchParams.get('select') ?? '';
      if (select.includes(',payload') && (!id?.startsWith('eq.') || rejectFile)) {
        return new Response(JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }), { status: 500 });
      }
      if (url.searchParams.has('payload->>fileDataUrl')) rows = rows.filter(row => row.payload.fileDataUrl != null);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      rows = rows.slice(offset, offset + Math.min(3, Number(url.searchParams.get('limit') ?? 1000)));
      const result = select.includes('title:payload') ? rows.map(row => ({ record_id: row.record_id,
        ...Object.fromEntries(['id', 'title', 'format', 'filename', 'exportedAt', 'recipe'].map(key => [key, row.payload[key] ?? null])),
      })) : select === 'record_id' ? rows.map(row => ({ record_id: row.record_id })) : rows;
      const json = JSON.stringify(result);
      transferred += json.length;
      return new Response(json, { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const oldBulkRead = await client.from('application_records').select('record_id,payload,created_at').eq('record_type', 'export_history').eq('owner_id', 'owner');
  assert.equal(oldBulkRead.error?.code, '57014');
  requests.length = 0;
  const entries = await loadExportHistoryMetadata('owner', client);
  assert.equal(entries.length, 101, 'all pages are read; invalid dates, IDs and metadata types remain quarantined');
  assert.ok(entries.every(entry => entry.fileDataUrl === undefined));
  assert.equal(entries.filter(entry => entry.hasSavedFile).length, 2);
  assert.equal(entries.find(entry => entry.id === 'history-2')?.recipeUnavailable, true);
  assert.ok(transferred < 40_000, 'refresh must not transfer the two-megabyte file copy');
  assert.ok(requests.every(url => !url.searchParams.get('select')?.includes(',payload')));
  assert.equal(JSON.stringify(records), before, 'loading never rewrites or deletes History');

  assert.equal((await loadSavedExportFile('history-0', 'owner', client)).fileDataUrl, records[0].payload.fileDataUrl);
  await assert.rejects(loadSavedExportFile('foreign', 'owner', client), /no longer available/);
  rejectFile = true;
  await assert.rejects(loadSavedExportFile('history-0', 'owner', client), /statement timeout/);
  rejectFile = false;
  assert.ok((await loadSavedExportFile('history-0', 'owner', client)).fileDataUrl, 'a failed file fetch can be retried');
  records[0].payload.fileDataUrl = 'data:text/html;base64,PHNjcmlwdD4=';
  await assert.rejects(loadSavedExportFile('history-0', 'owner', client), /Invalid saved export file/);
});
