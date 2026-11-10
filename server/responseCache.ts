import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import type { RequestHandler } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_REDIS_BYTES = 8 * 1024 * 1024;
const MEMORY_BYTES = 16 * 1024 * 1024;
const CACHE_TTL_SECONDS = 60;

export function responseCacheConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

interface VersionedRow { record_id: string; updated_at: string; created_at: string; payload?: unknown }
interface Snapshot { body: Buffer; version: string; expires: number; tier: 'memory' | 'redis' | 'database' }

function versions(value: unknown, payload = false): value is VersionedRow[] {
  return Array.isArray(value) && value.length <= MAX_ROWS && value.every(row =>
    row && typeof row.record_id === 'string' && typeof row.updated_at === 'string'
    && typeof row.created_at === 'string' && (!payload || (row.payload && typeof row.payload === 'object'
      && !Array.isArray(row.payload)))) && new Set(value.map(row => row.record_id)).size === value.length;
}

function fingerprint(rows: VersionedRow[]): string {
  return createHash('sha256').update(JSON.stringify(rows.map(row =>
    [row.record_id, row.updated_at, row.created_at]))).digest('hex');
}

/** The first page gives the exact RLS-scoped count and actual server row cap. */
async function readRows(client: SupabaseClient, columns: string, owner?: string): Promise<VersionedRow[]> {
  const page = (offset: number, size: number, count = false) => {
    let query = client.from('application_records').select(columns, count ? { count: 'exact' } : {})
      .eq('record_type', 'survey_response');
    if (owner) query = query.eq('owner_id', owner);
    return query.order('record_id').range(offset, offset + size - 1);
  };
  const first = await page(0, PAGE_SIZE, true);
  const count = first.count;
  if (first.error || !versions(first.data) || count === null || !Number.isInteger(count)
    || count < first.data.length || count > MAX_ROWS || (count > 0 && first.data.length === 0)) throw new Error('Invalid response page.');
  const rows = first.data;
  if (count === 0) return rows;
  const size = rows.length;
  const pages: VersionedRow[][] = [];
  let next = 1;
  const pageCount = Math.ceil(count / size);
  await Promise.all(Array.from({ length: Math.min(4, pageCount - 1) }, async () => {
    while (next < pageCount) {
      const index = next++;
      const result = await page(index * size, size);
      if (result.error || !versions(result.data)) throw new Error('Invalid response page.');
      pages[index - 1] = result.data;
    }
  }));
  const all = [...rows, ...pages.flat()];
  if (all.length !== count || !versions(all, columns.includes('payload'))) throw new Error('Response scope changed during read.');
  return all;
}

/** One compressed snapshot per load; caller Auth and current RLS versions remain authoritative. */
export function createResponseCacheHandler(env: NodeJS.ProcessEnv, request = fetch): RequestHandler {
  const projectUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const memory = new Map<string, Snapshot>();
  const pending = new Map<string, Promise<Snapshot>>();
  const redisReads = new Map<string, Promise<Snapshot | undefined>>();
  let memoryBytes = 0;
  let redisUrl: URL | undefined;
  try {
    const candidate = new URL(env.UPSTASH_REDIS_REST_URL ?? '');
    if (candidate.protocol === 'https:' && !candidate.username && !candidate.password
      && candidate.pathname === '/' && !candidate.search && !candidate.hash) redisUrl = candidate;
  } catch { /* Missing settings retain direct Supabase loading. */ }

  async function redis(command: (string | number)[]): Promise<unknown> {
    const response = await request(redisUrl!, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(800),
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error('Cache unavailable.');
    const body = await response.json();
    if (!body || typeof body !== 'object' || body.error) throw new Error('Cache unavailable.');
    return body.result;
  }

  function remember(key: string, snapshot: Snapshot) {
    if (snapshot.body.length > MEMORY_BYTES) return;
    const previous = memory.get(key);
    if (previous) { memoryBytes -= previous.body.length; memory.delete(key); }
    while (memory.size >= 8 || memoryBytes + snapshot.body.length > MEMORY_BYTES) {
      const oldest = memory.keys().next().value!;
      memoryBytes -= memory.get(oldest)!.body.length;
      memory.delete(oldest);
    }
    memory.set(key, snapshot);
    memoryBytes += snapshot.body.length;
  }

  function lookup(key: string): Promise<Snapshot | undefined> {
    const existing = redisReads.get(key);
    if (existing) return existing;
    const reading = (async () => {
      try {
        const cached = await redis(['GET', key]);
        if (typeof cached === 'string' && cached.length <= Math.ceil(MAX_REDIS_BYTES * 4 / 3) + 4
          && /^[A-Za-z0-9+/]*={0,2}$/.test(cached)) {
          const body = Buffer.from(cached, 'base64');
          const parsed = JSON.parse((await decompress(body, { maxOutputLength: MAX_SNAPSHOT_BYTES })).toString('utf8'));
          if (versions(parsed?.rows, true)) return {
            body, version: fingerprint(parsed.rows), expires: Date.now() + CACHE_TTL_SECONDS * 1000, tier: 'redis' as const,
          };
        }
      } catch { /* Failed cache reads fall back without delaying successful payload reads. */ }
      return undefined;
    })();
    redisReads.set(key, reading);
    return reading;
  }

  return async (req, res) => {
    const started = performance.now();
    let lookupKey: string | undefined;
    let sharedLookup: Promise<Snapshot | undefined> | undefined;
    res.setHeader('Cache-Control', 'no-store');
    res.vary('Accept-Encoding');
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in again.' }); return; }
    const own = req.query.own;
    if (Object.keys(req.query).some(key => key !== 'own') || (own !== undefined && own !== 'true')) {
      res.status(400).json({ error: 'Invalid response request.' }); return;
    }
    if (!projectUrl || !publicKey || !redisUrl || !responseCacheConfigured(env)) {
      res.status(503).json({ error: 'Response cache is unavailable.' }); return;
    }
    try {
      // Never use a service-role key: both metadata and payload reads enforce caller RLS.
      const client = createClient(projectUrl, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) =>
          request(input, { ...init, signal: AbortSignal.timeout(5000) }) },
      });
      const identity = await client.auth.getUser(token);
      const user = identity.data.user;
      if (identity.error || !user?.email_confirmed_at || !user.email?.toLowerCase().endsWith('@mgenesis.com')) {
        res.status(401).json({ error: 'Sign in with your confirmed company account.' }); return;
      }
      const authMs = performance.now() - started;
      const key = `sms:responses:v3:${createHash('sha256').update(JSON.stringify([
        projectUrl, user.id, own ?? '',
      ])).digest('hex')}`;
      let candidate = memory.get(key);
      if (candidate && candidate.expires <= Date.now()) {
        memoryBytes -= candidate.body.length; memory.delete(key); candidate = undefined;
      }
      if (candidate) candidate = { ...candidate, tier: 'memory' };
      let candidateReady = Boolean(candidate);
      // Overlap remote cache lookup with RLS checks instead of adding another serial network hop.
      if (!candidate) { lookupKey = key; sharedLookup = lookup(key); }
      const cached = candidate ? Promise.resolve(candidate) : sharedLookup!.then(result => {
        candidate = result; candidateReady = true; return result;
      });
      const visible = await readRows(client, 'record_id,updated_at,created_at', own === 'true' ? user.id : undefined);
      const versionsMs = performance.now() - started - authMs;
      const version = fingerprint(visible);
      if (!candidateReady) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Allow a nearly complete compressed read to finish without waiting on a slow cache.
        await Promise.race([cached, new Promise<void>(resolve => { timer = setTimeout(resolve, 50); })]);
        clearTimeout(timer);
      }
      let snapshot = candidateReady && candidate?.version === version ? candidate : undefined;
      if (!snapshot) {
        const pendingKey = key + ':' + version;
        let loading = pending.get(pendingKey);
        if (!loading) {
          loading = (async (): Promise<Snapshot> => {
            const rows = visible.length ? await readRows(client, 'record_id,payload,created_at,updated_at', own === 'true' ? user.id : undefined) : [];
            const json = JSON.stringify({ rows });
            if (Buffer.byteLength(json) > MAX_SNAPSHOT_BYTES) throw new Error('Snapshot exceeds cache size.');
            const body = await compress(json);
            const fresh: Snapshot = { body, version: fingerprint(rows), expires: Date.now() + CACHE_TTL_SECONDS * 1000, tier: 'database' };
            // A concurrent change must not be remembered under an older visibility/version key.
            if (fresh.version === version) {
              remember(key, fresh);
              if (body.length <= MAX_REDIS_BYTES) {
                // Redis persistence is best effort and must not delay a successful response.
                void redis(['SET', key, body.toString('base64'), 'EX', CACHE_TTL_SECONDS]).catch(() => {});
              }
            }
            return fresh;
          })();
          pending.set(pendingKey, loading);
          void loading.finally(() => pending.delete(pendingKey)).catch(() => {});
        }
        // Once the cache budget expires, finish one shared fill instead of starting speculative payload work.
        snapshot = await loading;
      }
      if (snapshot.tier === 'redis') remember(key, snapshot);
      res.setHeader('X-Cache', snapshot.tier === 'database' ? 'MISS' : 'HIT');
      res.setHeader('X-Cache-Tier', snapshot.tier);
      res.setHeader('Server-Timing', `auth;dur=${authMs.toFixed(1)}, versions;dur=${versionsMs.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`);
      res.type('json');
      if (req.acceptsEncodings('gzip')) {
        res.setHeader('Content-Encoding', 'gzip'); res.send(snapshot.body);
      } else res.send(await decompress(snapshot.body, { maxOutputLength: MAX_SNAPSHOT_BYTES }));
    } catch {
      res.status(502).json({ error: 'Unable to load responses. Retry using Supabase.' });
    } finally {
      if (lookupKey && redisReads.get(lookupKey) === sharedLookup) redisReads.delete(lookupKey);
    }
  };
}
