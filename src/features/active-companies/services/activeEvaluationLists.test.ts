import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createActiveEvaluationListRefresh, loadActiveEvaluationLists } from './activeEvaluationLists';
import { loadActiveCompanySnapshots } from './activeCompanySnapshotService';

test('reads only the authenticated projection, validates external lists, and makes failures visible', async () => {
  let payload: unknown = [{ survey_type: 'Supplier', companies: ['Supplier One'] }];
  let status = 200;
  const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/get_active_evaluation_lists');
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  assert.deepEqual(await loadActiveEvaluationLists(undefined, client), [{ surveyType: 'Supplier', companies: ['Supplier One'] }]);
  for (const invalid of [null, {}, [{ survey_type: 'Other', companies: [] }], [{ survey_type: 'Supplier', companies: [null] }],
    [{ survey_type: 'Supplier', companies: [''] }], [{ survey_type: 'Supplier', companies: [] }, { survey_type: 'Supplier', companies: [] }]]) {
    payload = invalid;
    await assert.rejects(loadActiveEvaluationLists(undefined, client), /Invalid active evaluation list/);
  }
  payload = []; assert.deepEqual(await loadActiveEvaluationLists(undefined, client), []);
  status = 500; payload = { message: 'Unavailable' };
  await assert.rejects(loadActiveEvaluationLists(undefined, client), /Unable to load/);
  status = 404; payload = { code: 'PGRST202', message: 'Function missing' };
  await assert.rejects(loadActiveEvaluationLists(undefined, client), /migration 202610300001/);
});

test('overlapping list invalidations publish in order, expose failures, retry, and stop after account disposal', async () => {
  const controller = new AbortController();
  let release: (() => void) | undefined;
  let reads = 0;
  let fail = false;
  const published: string[][] = [];
  const errors: Array<string | null> = [];
  const refresh = createActiveEvaluationListRefresh(async () => {
    const current = ++reads;
    if (current === 1 || current === 5) await new Promise<void>(resolve => { release = resolve; });
    if (fail) throw new Error('List read failed');
    return [{ surveyType: 'Supplier', companies: [`Supplier ${current}`] }];
  }, lists => published.push(lists.flatMap(list => list.companies)), error => errors.push(error), controller.signal);
  const first = refresh();
  await Promise.resolve();
  const overlapping = refresh();
  assert.equal(reads, 1, 'Both event types share one in-flight read');
  release!();
  await Promise.all([first, overlapping]);
  assert.equal(reads, 2);
  assert.deepEqual(published, [['Supplier 1'], ['Supplier 2']]);
  fail = true; await refresh();
  assert.deepEqual(published.at(-1), []);
  assert.equal(errors.at(-1), 'List read failed');
  fail = false; await refresh();
  assert.equal(errors.at(-1), null);
  const stopped = refresh();
  await Promise.resolve();
  const before = published.length;
  controller.abort(); release!(); await stopped; await refresh();
  assert.equal(published.length, before);
  assert.equal(reads, 5);
});

test('an empty stored Active Companies history stays empty instead of reviving bundled company lists', async () => {
  const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('record_type'), 'eq.active_company_snapshot');
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  assert.deepEqual(await loadActiveCompanySnapshots(client), []);
});
