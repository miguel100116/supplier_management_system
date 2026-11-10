import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { createResponseCacheHandler } from './responseCache';

const env = {
  VITE_SUPABASE_URL: 'https://synthetic.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
  UPSTASH_REDIS_REST_URL: 'https://synthetic.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'synthetic-redis-secret',
};
const row = (id: string, updated = '2026-11-06T00:00:00Z') => ({
  record_id: id, updated_at: updated, created_at: '2026-11-01T00:00:00Z', payload: { value: updated },
});

async function fixture(t: TestContext, settings = env) {
  const state = {
    rows: [row('a'), row('b')], payloadReads: 0, versionReads: 0, identities: 0,
    cache: new Map<string, { value: string; expires: number }>(), commands: [] as (string | number)[][],
    cacheFailure: false, databaseFailure: false, invalidUser: false, concurrentEdit: false,
    cap: 1, delay: 0, activeVersions: 0, maxActiveVersions: 0, missingCount: false, invalidPage: false,
    holdWrite: undefined as Promise<void> | undefined,
    holdRead: undefined as Promise<void> | undefined,
  };
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', ...headers },
    });
    if (url.hostname === 'synthetic.upstash.io') {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-redis-secret');
      assert.ok(init?.signal, 'Redis requests must have a timeout');
      if (state.cacheFailure) throw new Error('Redis unavailable with sensitive details');
      const command = JSON.parse(String(init?.body)) as (string | number)[];
      state.commands.push(command);
      const [operation, key, value] = command;
      if (operation === 'GET') {
        if (state.holdRead) await state.holdRead;
        const stored = state.cache.get(String(key));
        return json({ result: stored && stored.expires > Date.now() ? stored.value : null });
      }
      assert.deepEqual(command.slice(3), ['EX', 60]);
      if (state.holdWrite) await state.holdWrite;
      state.cache.set(String(key), { value: String(value), expires: Date.now() + 60_000 });
      return json({ result: 'OK' });
    }
    assert.equal(url.hostname, 'synthetic.supabase.co');
    assert.equal(new Headers(init?.headers).get('apikey'), 'public-key');
    const token = new Headers(init?.headers).get('Authorization')!;
    assert.match(token, /^Bearer token-/);
    if (url.pathname === '/auth/v1/user') {
      state.identities++;
      return state.invalidUser ? json({ message: 'Invalid token' }, 401) : json({
        id: token.replace('Bearer token-', 'user-'), email: 'synthetic@mgenesis.com', email_confirmed_at: '2026-01-01',
      });
    }
    assert.equal(url.pathname, '/rest/v1/application_records');
    assert.equal(url.searchParams.get('record_type'), 'eq.survey_response');
    assert.equal(url.searchParams.get('order'), 'record_id.asc');
    if (state.databaseFailure) return json({ message: 'Sensitive database error' }, 500);
    const payloadRead = url.searchParams.get('select')!.includes('payload');
    if (payloadRead) state.payloadReads++; else {
      state.versionReads++; state.activeVersions++;
      state.maxActiveVersions = Math.max(state.activeVersions, state.maxActiveVersions);
    }
    try {
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.concurrentEdit && payloadRead) state.rows = [row('a', '2026-11-07T00:00:00Z')];
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit')), state.cap);
      const visible = state.rows.slice(offset, offset + limit);
      if (url.searchParams.has('owner_id')) assert.equal(url.searchParams.get('owner_id'), 'eq.user-one');
      const result = payloadRead ? visible : visible.map(({ payload: _, ...version }) => version);
      return json(state.invalidPage && offset > 0 ? [] : result, 200, state.missingCount ? {} : {
        'Content-Range': offset + '-' + (offset + visible.length - 1) + '/' + state.rows.length,
      });
    } finally { if (!payloadRead) state.activeVersions--; }
  };
  const app = express();
  app.get('/api/survey-responses', createResponseCacheHandler(settings, request));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const reader = (path: string) => (query = '', token = 'token-one', headers: Record<string, string> = {}) => fetch(base + path + query, {
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
  });
  let instance = 0;
  return {
    state, read: reader('/api/survey-responses'),
    newInstance: () => {
      const path = '/instance-' + (++instance);
      app.get(path, createResponseCacheHandler(settings, request));
      return reader(path);
    },
  };
}

test('one compressed snapshot rechecks caller Auth/RLS but avoids all warm payload and Redis reads', async t => {
  const { read, state } = await fixture(t);
  const first = await read();
  assert.equal(first.headers.get('x-cache'), 'MISS');
  assert.equal(first.headers.get('content-encoding'), 'gzip');
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.match(first.headers.get('server-timing')!, /auth;dur=.*versions;dur=/);
  assert.deepEqual((await first.json()).rows, state.rows);
  const commands = state.commands.length;
  const payloadReads = state.payloadReads;
  const second = await read();
  assert.equal(second.headers.get('x-cache'), 'HIT');
  assert.equal(second.headers.get('x-cache-tier'), 'memory');
  assert.deepEqual((await second.json()).rows, state.rows);
  assert.equal(state.payloadReads, payloadReads);
  assert.equal(state.commands.length, commands);
  assert.equal(state.versionReads, 4, 'two RLS metadata pages per complete snapshot');
  assert.equal(state.identities, 2, 'one identity check per full request');
  assert.ok(state.commands.every(command => !String(command[1]).includes('user-one')));
  assert.equal((await read('', 'token-two')).headers.get('x-cache'), 'MISS');
});

test('another server instance reuses compressed Redis data without a database payload read', async t => {
  const { read, newInstance, state } = await fixture(t);
  await (await read()).json();
  const payloadReads = state.payloadReads;
  const response = await newInstance()();
  assert.equal(response.headers.get('x-cache-tier'), 'redis');
  assert.deepEqual((await response.json()).rows, state.rows);
  assert.equal(state.payloadReads, payloadReads);
});

test('edits, deletions, revoked visibility, expiry and identity failure never reuse stale data', async t => {
  const { read, state } = await fixture(t);
  await read();
  state.rows = [row('a', '2026-11-08T00:00:00Z')];
  assert.equal((await read()).headers.get('x-cache'), 'MISS');
  state.rows = [row('b')];
  assert.deepEqual((await (await read()).json()).rows, [row('b')]);
  state.rows = [];
  assert.deepEqual((await (await read()).json()).rows, []);
  state.rows = [row('a')];
  await read();
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 61_000);
  assert.equal((await read()).headers.get('x-cache'), 'MISS');
  state.invalidUser = true;
  assert.equal((await read()).status, 401);
});

test('small server caps preserve all rows and metadata fan-out never exceeds four requests', async t => {
  const { read, state } = await fixture(t);
  state.rows = Array.from({ length: 12 }, (_, index) => row(String(index).padStart(2, '0')));
  state.delay = 5;
  assert.deepEqual((await (await read('?own=true')).json()).rows, state.rows);
  assert.ok(state.maxActiveVersions > 1);
  assert.ok(state.maxActiveVersions <= 4);
});

test('cache corruption and Redis outages fall back; failed RLS reads cannot serve even warm memory', async t => {
  const { read, newInstance, state } = await fixture(t);
  await read();
  for (const key of state.cache.keys()) state.cache.set(key, { value: 'invalid-base64', expires: Date.now() + 60_000 });
  assert.equal((await newInstance()()).status, 200);
  for (const key of state.cache.keys()) state.cache.set(key, {
    value: gzipSync(JSON.stringify({ rows: [row('other-user-row')] })).toString('base64'), expires: Date.now() + 60_000,
  });
  assert.deepEqual((await (await newInstance()()).json()).rows, state.rows);
  state.cacheFailure = true;
  assert.equal((await newInstance()()).status, 200);
  state.databaseFailure = true;
  const failed = await read();
  assert.equal(failed.status, 502);
  assert.equal(JSON.stringify(await failed.json()).includes('Sensitive'), false);
});

test('concurrent edits cannot poison an older version and malformed page/count responses fall back', async t => {
  const { read, newInstance, state } = await fixture(t);
  state.concurrentEdit = true;
  assert.deepEqual((await (await read()).json()).rows, [row('a', '2026-11-07T00:00:00Z')]);
  assert.equal(state.cache.size, 0);
  state.concurrentEdit = false;
  state.missingCount = true;
  assert.equal((await newInstance()()).status, 502);
  state.missingCount = false;
  state.rows = [row('a'), row('b')]; state.invalidPage = true;
  assert.equal((await newInstance()()).status, 502);
});

test('concurrent loads share payload work and successful responses do not wait for Redis persistence', async t => {
  const { read, state } = await fixture(t);
  state.delay = 10;
  let finishWrite!: () => void;
  state.holdWrite = new Promise(resolve => { finishWrite = resolve; });
  try {
    const responses = await Promise.all(Array.from({ length: 6 }, () => read()));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(state.payloadReads, 2, 'one full two-page payload read across six requests');
    assert.equal(state.commands.filter(command => command[0] === 'GET').length, 1);
    assert.equal(state.cache.size, 0, 'all HTTP responses arrived while Redis SET is still pending');
    assert.equal(state.identities, 6, 'each concurrent caller is checked independently');
  } finally { finishWrite(); }
});

test('cache memory is bounded and clients without gzip support receive the same data', async t => {
  const { read, state } = await fixture(t);
  for (let i = 0; i < 9; i++) await read('', 'token-' + i);
  const response = await read('', 'token-0', { 'Accept-Encoding': 'identity' });
  assert.equal(response.headers.get('x-cache-tier'), 'redis', 'the oldest of nine snapshots was evicted from memory');
  assert.equal(response.headers.get('content-encoding'), null);
  assert.deepEqual((await response.json()).rows, state.rows);
});

test('a stalled Redis GET cannot delay a successful authoritative response', async t => {
  const { read, state } = await fixture(t);
  let finishRead!: () => void;
  state.holdRead = new Promise(resolve => { finishRead = resolve; });
  try {
    const response = await read();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).rows, state.rows);
    assert.equal(response.headers.get('x-cache-tier'), 'database');
  } finally { finishRead(); }
});

test('invalid requests and disabled configuration never contact external services', async t => {
  const { read, state } = await fixture(t);
  assert.equal((await read('', '')).status, 401);
  for (const query of ['?after=a', '?own=false', '?record_type=app_profiles', '?own=true&own=true']) {
    assert.equal((await read(query)).status, 400);
  }
  assert.equal(state.identities, 0);
  const disabled = await fixture(t, { ...env, UPSTASH_REDIS_REST_TOKEN: '' });
  assert.equal((await disabled.read()).status, 503);
  assert.equal(disabled.state.identities, 0);
});
