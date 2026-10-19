import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNotificationReadState,
  newestNotificationReadState,
  notificationReadStateUserKey,
  parseNotificationReadState,
} from './notificationReadState';

test('normalizes the user key and removes duplicate notification IDs', () => {
  const state = createNotificationReadState(' Admin@MGENESIS.com ', ['notification-1', 'notification-1', '', 'notification-2'], '2026-09-17T10:00:00.000Z');
  assert.equal(notificationReadStateUserKey(' Admin@MGENESIS.com '), 'admin@mgenesis.com');
  assert.deepEqual(state, {
    userEmail: 'admin@mgenesis.com',
    readNotificationIds: ['notification-1', 'notification-2'],
    updatedAt: '2026-09-17T10:00:00.000Z',
  });
});

test('rejects another user or malformed database payload', () => {
  assert.equal(parseNotificationReadState({ userEmail: 'other@mgenesis.com', readNotificationIds: [], updatedAt: '2026-09-17T10:00:00.000Z' }, 'admin@mgenesis.com'), null);
  assert.equal(parseNotificationReadState({ userEmail: 'admin@mgenesis.com', readNotificationIds: 'notification-1', updatedAt: 'invalid' }, 'admin@mgenesis.com'), null);
});

test('chooses the newest local or database read state so unread toggles are not resurrected', () => {
  const remote = createNotificationReadState('admin@mgenesis.com', ['notification-1'], '2026-09-17T10:00:00.000Z');
  const local = createNotificationReadState('admin@mgenesis.com', [], '2026-09-17T10:05:00.000Z');
  assert.equal(newestNotificationReadState(remote, local), local);
  assert.equal(newestNotificationReadState(local, remote), local);
});
