import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResponseNotification } from '../../../types/survey';
import { AdminNotificationCenter } from '../../../pages/AdminNotificationCenter';
import { compareNotificationDates, isDocumentNotification, notificationAge, notificationDate, notificationWithinDateRange } from './notificationPresentation';
import { formatRelativeTime } from '../../../utils/time';

test('notification ages advance at minute/hour boundaries without 0m and normalize legacy timestamps', () => {
  const start = new Date('2026-11-04T00:00:00Z');
  for (const [seconds, expected] of [[0, 'just now'], [45, 'just now'], [59, 'just now'], [60, '1m ago'], [119, '1m ago'], [120, '2m ago'], [3600, '1h ago']] as const) {
    assert.equal(formatRelativeTime(start.toISOString(), new Date(+start + seconds * 1000)), expected);
  }
  assert.equal(notificationDate('11/04/2026 08:00:00'), start.toISOString());
  assert.equal(notificationDate('2026-11-01T00:05:00.179105+00:00'), '2026-11-01T00:05:00.179Z');
  assert.equal(notificationDate('02/30/2026 00:00:00'), '');
  assert.equal(notificationWithinDateRange('11/04/2026 08:00:00', '2026-11-03', '2026-11-05'), true);
  assert.equal(notificationWithinDateRange('', '2026-11-03', ''), false);
});

test('mixed legacy/ISO timestamps sort chronologically with unknown dates last in either direction', () => {
  const dates = ['2026-01-01T00:00:00Z', '', '07/23/2026 12:00:00', 'bad'];
  assert.deepEqual([...dates].sort((a,b) => compareNotificationDates(a,b)).slice(0,2), [dates[2], dates[0]]);
  assert.deepEqual([...dates].sort((a,b) => compareNotificationDates(a,b,'asc')).slice(0,2), [dates[0], dates[2]]);
});

test('persisted document reminders retain document classification and details; current status has no invented age', () => {
  const reminder: ResponseNotification = { id: 'reminder', company: 'Synthetic partner', surveyType: 'Supplier', respondentType: 'Document Expiring Soon', designation: 'Document Expiry Reminder', submissionDate: '2026-11-04T00:00:00Z', questionCount: 1, documentDetails: [{ documentName: 'Synthetic permit', status: 'Expiring Soon', expiryDate: '2026-12-31', daysLeft: 57 }] };
  assert.ok(isDocumentNotification(reminder));
  assert.equal(notificationAge({ ...reminder, submissionDate: '' }, new Date('2026-11-04T00:01:00Z')), 'Current status');
  assert.equal(notificationAge({ ...reminder, submissionDate: '' }, new Date('2026-12-04T00:01:00Z')), 'Current status');
  const previous = (globalThis as { React?: typeof React }).React;
  Object.assign(globalThis, { React });
  try {
    const html = renderToStaticMarkup(React.createElement(AdminNotificationCenter, { notifications: [reminder], unreadCount: 1, unreadNotificationIds: new Set(['reminder']), onMarkRead: () => {}, onMarkUnread: () => {}, onMarkAllRead: () => {} }));
    assert.ok(html.includes('Synthetic permit'));
    assert.ok(!html.includes('question answered'));
  } finally { Object.assign(globalThis, { React: previous }); }
});
