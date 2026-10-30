import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentReminderRefresh } from './documentReminderRefresh';

test('failed initial reads and refreshes are visible, retain prior data and recover on retry', async () => {
  let reminders = ['previous'];
  let failure = true;
  let error: string | null = null;
  const refresh = createDocumentReminderRefresh(async () => {
    if (failure) throw new Error('Synthetic timeout');
    reminders = ['new'];
  }, message => { error = message; }, new AbortController().signal);
  await refresh();
  assert.equal(error, 'Synthetic timeout');
  assert.deepEqual(reminders, ['previous']);
  failure = false;
  await refresh();
  assert.equal(error, null);
  assert.deepEqual(reminders, ['new']);
  failure = true;
  await refresh();
  assert.equal(error, 'Synthetic timeout');
  assert.deepEqual(reminders, ['new']);
});

test('disposed account refreshes never report errors or clear a newer account warning', async () => {
  const controller = new AbortController();
  let release!: () => void;
  let published = 0;
  const refresh = createDocumentReminderRefresh(() => new Promise<void>(resolve => { release = resolve; }), () => { published++; }, controller.signal);
  const pending = refresh();
  await Promise.resolve();
  controller.abort();
  release();
  await pending;
  assert.equal(published, 0);
  await refresh();
  assert.equal(published, 0);
});
