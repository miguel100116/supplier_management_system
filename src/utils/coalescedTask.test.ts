import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createCoalescedTaskRunner, createRefreshGuard } from './coalescedTask';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('coalesces same-key bursts into one follow-up run', async () => {
  const firstRun = deferred();
  const calls: string[] = [];
  const run = createCoalescedTaskRunner(async (key: string) => {
    calls.push(key);
    if (calls.length === 1) await firstRun.promise;
  });

  const initial = run('responses');
  await Promise.resolve();
  const duplicateOne = run('responses');
  const duplicateTwo = run('responses');
  assert.deepEqual(calls, ['responses']);

  firstRun.resolve();
  await Promise.all([initial, duplicateOne, duplicateTwo]);
  assert.deepEqual(calls, ['responses', 'responses']);
});

test('runs different keys independently', async () => {
  const calls: string[] = [];
  const run = createCoalescedTaskRunner(async (key: string) => { calls.push(key); });

  await Promise.all([run('survey'), run('response')]);
  assert.deepEqual(calls.sort(), ['response', 'survey']);
});

test('clears a failed task so a later call can retry', async () => {
  let attempts = 0;
  const run = createCoalescedTaskRunner(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary failure');
  });

  await assert.rejects(run('responses'), /temporary failure/);
  await run('responses');
  assert.equal(attempts, 2);
});

test('does not replay pending work after cancellation', async () => {
  const firstRun = deferred();
  let cancelled = false;
  let attempts = 0;
  const run = createCoalescedTaskRunner(async () => {
    attempts += 1;
    if (attempts === 1) await firstRun.promise;
  }, () => cancelled);

  const initial = run('responses');
  await Promise.resolve();
  const pending = run('responses');
  cancelled = true;
  firstRun.resolve();
  await Promise.all([initial, pending]);
  assert.equal(attempts, 1);
});

for (const change of ['save', 'edit', 'delete'] as const) {
  test(`an overlapping ${change} stays visible until a fresh authoritative refresh completes`, async () => {
    const guard = createRefreshGuard();
    const first = deferred();
    const second = deferred();
    const initial = [{ id: 'one', value: 1 }];
    let visible = initial;
    let cache = visible;
    let remote = initial;
    let runs = 0;
    let publications = 0;
    const refresh = createCoalescedTaskRunner(async (key: string) => {
      const isCurrent = guard.start();
      const snapshot = remote;
      const run = ++runs;
      await (run === 1 ? first.promise : second.promise);
      if (!isCurrent()) { void refresh(key); return; }
      guard.invalidate();
      visible = cache = snapshot;
      publications++;
    });
    const pending = refresh('responses');
    await Promise.resolve();
    remote = change === 'save' ? [...initial, { id: 'two', value: 2 }]
      : change === 'edit' ? [{ id: 'one', value: 3 }] : [];
    guard.invalidate();
    visible = cache = remote;
    first.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(runs, 2, 'one immediate coalesced retry, without polling or a delay');
    assert.equal(publications, 0, 'the stale snapshot is never published');
    assert.equal(visible, remote);
    assert.equal(cache, remote);
    second.resolve();
    await pending;
    assert.equal(publications, 1);
    assert.deepEqual(visible, remote);
    assert.deepEqual(cache, remote, 'authoritative deletions are not restored by a union merge');
  });
}

test('overlapping initial and background refreshes accept only the first current result', async () => {
  const guard = createRefreshGuard();
  const initial = guard.start();
  const background = guard.start();
  assert.equal(background(), true);
  guard.invalidate();
  assert.equal(initial(), false);
  const retry = guard.start();
  assert.equal(retry(), true);
});

test('a failed stale-refresh retry preserves the visible state and allows a later retry', async () => {
  const guard = createRefreshGuard();
  const wait = deferred();
  let visible = 'saved';
  let attempts = 0;
  const refresh = createCoalescedTaskRunner(async (key: string) => {
    const isCurrent = guard.start();
    attempts++;
    if (attempts === 1) await wait.promise;
    else if (attempts === 2) throw new Error('offline');
    if (!isCurrent()) { void refresh(key); return; }
    visible = 'fresh';
  });
  const pending = refresh('responses');
  await Promise.resolve();
  guard.invalidate();
  wait.resolve();
  await assert.rejects(pending, /offline/);
  assert.equal(visible, 'saved');
  await refresh('responses');
  assert.equal(visible, 'fresh');
});

test('cancellation prevents a pending stale refresh from publishing or requesting another fetch', async () => {
  const guard = createRefreshGuard();
  const wait = deferred();
  let cancelled = false;
  let calls = 0;
  let published = false;
  const refresh = createCoalescedTaskRunner(async (key: string) => {
    const isCurrent = guard.start();
    calls++;
    await wait.promise;
    if (cancelled) return;
    if (!isCurrent()) { void refresh(key); return; }
    published = true;
  }, () => cancelled);
  const pending = refresh('responses');
  await Promise.resolve();
  guard.invalidate();
  cancelled = true;
  wait.resolve();
  await pending;
  assert.equal(calls, 1);
  assert.equal(published, false);
});

test('response writes share one synchronous revision boundary and both refresh paths reject stale snapshots', () => {
  const source = readFileSync(new URL('../hooks/useSurveyData.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/setResponsesState\(/g) ?? []).length, 1);
  assert.equal((source.match(/responsesRef\.current =/g) ?? []).length, 1);
  assert.match(source, /responseRefreshGuard\.invalidate\(\);\s*responsesRef\.current = next;\s*setResponsesState\(next\)/);
  assert.equal((source.match(/const isCurrent = responseRefreshGuard\.start\(\)/g) ?? []).length, 2);
  assert.match(source, /if \(isCurrent\(\)\) \{[\s\S]*?setResponses\(normalizedResponses\)/);
  assert.match(source, /if \(!isCurrent\(\)\) \{\s*refreshAllSurveyResponses = true;\s*runHydration\(true, 'survey_response'\);\s*return;/);
  assert.match(source, /groupResponsesToNotifications\(responsesRef\.current\)/);
});
