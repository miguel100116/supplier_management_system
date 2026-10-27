import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedStoreHydrator } from './sharedStoreHydration';
import type { ApplicationRecordType } from './applicationRepository';

test('shared stores load when needed, reuse completed reads, and coalesce Realtime refreshes', async () => {
  const reads: ApplicationRecordType[] = [];
  let releaseHistory: (() => void) | undefined;
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve; });
  const stores = createSharedStoreHydrator(
    { userEmail: 'admin@mgenesis.com', isAdmin: true, canUseFeedbackHub: true },
    async type => { reads.push(type); if (type === 'export_history' && reads.filter(item => item === type).length === 1) await historyGate; },
  );
  await stores.loadStartup();
  assert.deepEqual(reads, ['document_notification_rule', 'reminder_settings', 'employee_notification_state']);
  await stores.loadPage('dashboard');
  assert.equal(reads.length, 3, 'dashboard never fetches unopened report, document, or feedback stores');
  const history = stores.loadPage('reports');
  await Promise.resolve();
  const sameHistory = stores.loadPage('reports');
  assert.equal(reads.filter(type => type === 'export_history').length, 1);
  releaseHistory!();
  await Promise.all([history, sameHistory]);
  assert.equal(stores.isPageReady('reports'), true);
  await stores.loadPage('dashboard');
  await stores.loadPage('reports');
  assert.equal(reads.filter(type => type === 'export_history').length, 1, 'return navigation uses the completed read');
  await stores.refresh('export_history');
  assert.equal(reads.filter(type => type === 'export_history').length, 2, 'Realtime invalidates an opened store');
  await stores.refresh('feedback_contact');
  assert.equal(reads.filter(type => type === 'feedback_settings').length, 0, 'unopened stores stay lazy');
  await stores.loadPage('partners-feedback-hub');
  assert.equal(reads.filter(type => type === 'feedback_settings').length, 1);
  stores.dispose();
});

test('failed module loads remain retryable and a disposed account stops further reads', async () => {
  let attempts = 0;
  const stores = createSharedStoreHydrator(
    { userEmail: 'admin@mgenesis.com', isAdmin: true, canUseFeedbackHub: true },
    async type => { if (type === 'export_history' && ++attempts === 1) throw new Error('timed out'); },
  );
  await assert.rejects(stores.loadPage('reports'), /timed out/);
  assert.equal(stores.isPageReady('reports'), false);
  await stores.loadPage('reports');
  assert.equal(attempts, 2);
  stores.dispose();
  await assert.rejects(stores.refresh('export_history'), /abort/i);
});
