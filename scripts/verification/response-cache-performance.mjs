// Synthetic response-load benchmark; never reads customer records or writes Supabase.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createResponseCacheHandler } from '../../server/responseCache.ts';
import { loadServerEnvironment } from '../../server/environment.ts';

const live = process.argv.includes('--live-redis');
assert.ok(process.argv.slice(2).every(arg => arg === '--live-redis'), 'Only --live-redis is supported.');
const settings = live ? loadServerEnvironment('development') : {
  UPSTASH_REDIS_REST_URL: 'https://benchmark-redis.invalid', UPSTASH_REDIS_REST_TOKEN: 'synthetic-token',
};
assert.ok(settings.UPSTASH_REDIS_REST_URL && settings.UPSTASH_REDIS_REST_TOKEN, 'Redis settings are required for live mode.');
const project = 'https://benchmark-' + randomUUID() + '.invalid';
const rows = Array.from({ length: 6488 }, (_, index) => ({
  record_id: 'benchmark-' + String(index).padStart(5, '0'),
  created_at: '2026-11-06T00:00:00.000Z', updated_at: '2026-11-06T00:00:00.000Z',
  payload: {
    responseId: 'synthetic-' + Math.floor(index / 20), questionId: 'Q' + index % 20,
    surveyType: 'Courier', company: 'Synthetic company ' + index % 100, companyId: 'synthetic-' + index % 100,
    respondentType: 'Employee', submissionDate: '2026-11-06T00:00:00.000Z',
    questionNumber: index % 20 + 1, question: 'Synthetic question', questionCategory: 'Delivery',
    rating: index % 5, comment: 'Synthetic benchmark text. '.repeat(20),
  },
}));
let counters;
const reset = () => { counters = { auth: 0, metadata: 0, payload: 0, redis: 0 }; };
reset();
const keys = new Set();
const writes = new Set();
const cache = new Map();
const request = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== project) {
    counters.redis++;
    const command = JSON.parse(init.body);
    if (command[0] === 'SET') keys.add(command[1]);
    if (!live) {
      if (command[0] === 'GET') return Response.json({ result: cache.get(command[1]) ?? null });
      cache.set(command[1], command[2]); return Response.json({ result: 'OK' });
    }
    const operation = fetch(input, init);
    if (command[0] === 'SET') {
      writes.add(operation);
      void operation.finally(() => writes.delete(operation)).catch(() => {});
    }
    return operation;
  }
  // Equal controlled network RTT for both paths, not a claim about live Supabase latency.
  await delay(25);
  if (url.pathname === '/auth/v1/user') {
    counters.auth++;
    return Response.json({ id: 'synthetic-user', email: 'benchmark@mgenesis.com', email_confirmed_at: '2026-01-01' });
  }
  const payload = url.searchParams.get('select').includes('payload');
  counters[payload ? 'payload' : 'metadata']++;
  const cursor = url.searchParams.get('record_id')?.slice(3);
  const matching = cursor ? rows.filter(row => row.record_id > cursor) : rows;
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const page = matching.slice(offset, offset + Number(url.searchParams.get('limit')));
  return Response.json(payload ? page : page.map(({ payload: _, ...version }) => version), {
    headers: { 'Content-Range': offset + '-' + (offset + page.length - 1) + '/' + matching.length },
  });
};
const env = { ...settings, VITE_SUPABASE_URL: project, VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key' };
const app = express();
app.get('/snapshot', createResponseCacheHandler(env, request));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const digest = values => createHash('sha256').update(JSON.stringify(values.map(row => [row.record_id, row.payload]))).digest('hex');
const expected = digest(rows);
const client = createClient(project, 'synthetic-public-key', { auth: { persistSession: false }, global: { fetch: request } });
const direct = async () => {
  const all = []; let cursor;
  while (true) {
    let query = client.from('application_records').select('record_id,payload,created_at').eq('record_type', 'survey_response').order('record_id').limit(1000);
    if (cursor) query = query.gt('record_id', cursor);
    const { data, error } = await query;
    assert.equal(error, null);
    if (!data.length) return all;
    all.push(...data); cursor = data.at(-1).record_id;
  }
};
const snapshot = async (path = '/snapshot') => {
  const response = await fetch(base + path, { headers: { Authorization: 'Bearer synthetic-token' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(digest(body.rows), expected);
  return { tier: response.headers.get('x-cache-tier'), wireBytes: Number(response.headers.get('content-length')) };
};
const measured = async operation => {
  reset(); const started = performance.now(); const result = await operation();
  return { ms: Math.round(performance.now() - started), calls: { ...counters }, ...result };
};
try {
  const cold = await measured(snapshot);
  await Promise.allSettled([...writes]);
  app.get('/other-instance', createResponseCacheHandler(env, request));
  const shared = await measured(() => snapshot('/other-instance'));
  if (shared.tier === 'redis') {
    assert.equal(shared.calls.payload, 0);
    assert.equal(shared.calls.redis, 1);
  } else {
    assert.equal(shared.tier, 'database');
    assert.equal(shared.calls.payload, 7, 'A slow shared cache permits exactly one bounded full payload fill.');
  }
  if (!live) assert.equal(shared.tier, 'redis', 'The fast controlled cache must avoid payload reads.');
  const baseline = [], warm = [];
  for (let index = 0; index < 5; index++) {
    baseline.push(await measured(async () => { assert.equal(digest(await direct()), expected); return {}; }));
    const sample = await measured(snapshot);
    assert.equal(sample.tier, 'memory'); assert.equal(sample.calls.auth, 1);
    assert.equal(sample.calls.payload, 0); assert.equal(sample.calls.redis, 0);
    warm.push(sample);
  }
  const median = samples => samples.map(sample => sample.ms).sort((a, b) => a - b)[2];
  const rawBytes = Buffer.byteLength(JSON.stringify({ rows }));
  assert.ok(warm[0].wireBytes < rawBytes / 3, 'Snapshots must substantially reduce transfer size.');
  assert.ok(median(warm) < median(baseline), 'Warm caching must beat direct reads in the controlled benchmark.');
  console.log(JSON.stringify({
    scope: '6488 synthetic rows, controlled 25ms upstream RTT; not a real-user reload measurement',
    liveRedis: live, rows: rows.length, rawBytes, compressedWireBytes: warm[0].wireBytes,
    directMedianMs: median(baseline), warmMedianMs: median(warm), cold, crossInstance: shared,
    directSamples: baseline, warmSamples: warm,
  }, null, 2));
} finally {
  await Promise.allSettled([...writes]);
  if (live) for (const key of keys) {
    const response = await fetch(settings.UPSTASH_REDIS_REST_URL, {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + settings.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(['DEL', key]),
    });
    assert.ok(response.ok, 'Synthetic Redis entry cleanup failed; TTL remains 60 seconds.');
  }
  await new Promise(resolve => server.close(resolve));
}
