import type { SupabaseClient } from '@supabase/supabase-js';

export interface CachedResponseRow {
  record_id: string;
  created_at: string;
  payload: unknown;
}

/** Unavailable cache hosts fall back to the existing RLS-protected Supabase reader. */
export async function loadCachedResponses(
  client: SupabaseClient,
  ownRecords?: boolean,
  signal?: AbortSignal,
  request = fetch,
): Promise<CachedResponseRow[] | null> {
  try {
    signal?.throwIfAborted();
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) return null;
    const query = new URLSearchParams();
    if (ownRecords) query.set('own', 'true');
    const response = await request(`/api/survey-responses?${query}`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || !Array.isArray(body.rows) || body.rows.length > 50_000
      || !body.rows.every((row: CachedResponseRow) => row && typeof row.record_id === 'string'
        && typeof row.created_at === 'string' && row.payload && typeof row.payload === 'object'
        && !Array.isArray(row.payload))) return null;
    if (new Set(body.rows.map((row: CachedResponseRow) => row.record_id)).size !== body.rows.length) return null;
    return body.rows;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}
