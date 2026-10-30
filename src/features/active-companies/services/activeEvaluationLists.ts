import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabaseClient';
import type { ActiveEvaluationList } from '../domain/evaluationScope';
import { createCoalescedTaskRunner } from '../../../utils/coalescedTask';

/** Survey and private-snapshot notifications share one ordered refresh. */
export function createActiveEvaluationListRefresh(
  load: () => Promise<ActiveEvaluationList[]>,
  publish: (lists: ActiveEvaluationList[]) => void,
  reportError: (message: string | null) => void,
  signal: AbortSignal,
): () => Promise<void> {
  const run = createCoalescedTaskRunner(async () => {
    try {
      const lists = await load();
      if (!signal.aborted) { publish(lists); reportError(null); }
    } catch (error) {
      if (!signal.aborted) {
        publish([]);
        reportError(error instanceof Error ? error.message : 'Unable to load active evaluation assignments.');
      }
    }
  }, () => signal.aborted);
  return () => signal.aborted ? Promise.resolve() : run('active-lists');
}

export async function loadActiveEvaluationLists(signal?: AbortSignal, client: SupabaseClient = supabase): Promise<ActiveEvaluationList[]> {
  const request = client.rpc('get_active_evaluation_lists');
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Active evaluation assignments require database migration 202610300001. Ask an administrator to complete setup.'
    : 'Unable to load the uploaded Active Companies lists. Please refresh to retry.');
  if (!Array.isArray(data) || data.length > 3) throw new Error('Invalid active evaluation lists.');
  const seen = new Set<string>();
  return data.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid active evaluation list.');
    const value = row as Record<string, unknown>;
    const type = value.survey_type;
    const companies = value.companies;
    if ((type !== 'Supplier' && type !== 'Courier' && type !== 'Subcontractor') || seen.has(type)
      || !Array.isArray(companies) || companies.length > 10_000
      || companies.some(name => typeof name !== 'string' || !name.trim() || name.length > 500)) {
      throw new Error('Invalid active evaluation list.');
    }
    seen.add(type);
    return { surveyType: type, companies: companies as string[] };
  });
}
