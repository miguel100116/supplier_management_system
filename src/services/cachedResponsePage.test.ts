import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCachedResponses } from './cachedResponsePage';

const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) } } as unknown as SupabaseClient;
const row = { record_id: 'b', created_at: '2026-11-06T00:00:00Z', payload: { value: 1 } };

test('one snapshot request sends the session token and retains row validation at the repository', async () => {
  const rows = await loadCachedResponses(client, true, undefined, async (input, init) => {
    assert.equal(String(input), '/api/survey-responses?own=true');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-token');
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    return Response.json({ rows: [row] });
  });
  assert.deepEqual(rows, [row]);
});

test('API errors, static-host HTML and malformed or duplicate snapshots request direct Supabase fallback', async () => {
  for (const response of [
    new Response('', { status: 503 }), new Response('<html>SPA</html>'),
    Response.json({ rows: null }), Response.json({ rows: [null] }),
    Response.json({ rows: [{ ...row, payload: [] }] }),
    Response.json({ rows: [row, row] }),
  ]) {
    assert.equal(await loadCachedResponses(client, false, undefined, async () => response), null);
  }
  assert.equal(await loadCachedResponses(client, false, undefined, async () => { throw new Error('offline'); }), null);
  const signedOut = { auth: { getSession: async () => ({ data: { session: null } }) } } as unknown as SupabaseClient;
  assert.equal(await loadCachedResponses(signedOut, false, undefined, async () => { throw new Error('must not fetch'); }), null);
});

test('cancellation propagates instead of starting fallback reads', async () => {
  const controller = new AbortController();
  await assert.rejects(loadCachedResponses(client, false, controller.signal, async () => {
    controller.abort();
    throw controller.signal.reason;
  }), /abort/i);
});

test('a complete snapshot can exceed the old 1000-row page cap without another fetch', async () => {
  const rows = Array.from({ length: 1305 }, (_, index) => ({ ...row, record_id: 'row-' + index }));
  let requests = 0;
  const loaded = await loadCachedResponses(client, false, undefined, async () => {
    requests++; return Response.json({ rows });
  });
  assert.equal(loaded?.length, 1305);
  assert.equal(requests, 1);
});
