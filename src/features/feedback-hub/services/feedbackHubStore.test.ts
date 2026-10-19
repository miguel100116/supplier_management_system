import assert from 'node:assert/strict';
import test from 'node:test';
import { getPartnerContacts, getSentReports } from './feedbackHubStore';
import type { QueuedReportEmail } from '../types';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

test.beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
});

test('starts with no placeholder partner contacts', () => {
  assert.deepEqual(getPartnerContacts(), []);
});

test('does not claim an expired queued report was sent', () => {
  const report: QueuedReportEmail = {
    id: 'report-real-1',
    surveyId: 'survey-1',
    surveyTitle: 'Supplier Performance Survey',
    companyId: 'company-1',
    companyName: 'Example Partner',
    surveyType: 'Supplier',
    periodCovered: '2026',
    recipientEmail: 'partner@example.com',
    ccEmails: [],
    subject: 'Performance report',
    body: 'Review attached report.',
    status: 'Queued',
    queuedAt: '2026-01-01T00:00:00.000Z',
    timerDurationMinutes: 30,
    expiresAt: '2026-01-01T00:30:00.000Z',
    queuedBy: 'admin@mgenesis.com',
    responseCount: 1,
    overallScore: 90,
    history: [],
  };
  localStorage.setItem('partner_feedback_sent_reports_v2', JSON.stringify([report]));

  const [stored] = getSentReports();

  assert.equal(stored.status, 'Queued');
  assert.equal(stored.sentAt, undefined);
});
