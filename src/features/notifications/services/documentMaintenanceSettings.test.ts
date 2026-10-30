import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadDocumentMaintenanceSettings } from './documentMaintenanceSettings';

test('missing database seed is an actionable setup failure, not successful default settings', async () => {
  const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }) },
  });
  await assert.rejects(loadDocumentMaintenanceSettings(undefined, client), /202610280001 and 202610290001/);
});
import { DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, DocumentMaintenanceSettings, validateDocumentMaintenanceSettings } from './documentMaintenanceSettings';

test('validity periods are unset until an administrator configures them', () => {
  assert.equal(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.validityYears['DTI (Sole)'], null);
  assert.ok(Object.values(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.validityYears).every((period) => period === null));
  assert.equal('validityPendingVerification' in DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, false);
});

test('validates bounded, unique reminder intervals and validity periods', () => {
  assert.equal(validateDocumentMaintenanceSettings(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS), null);
  assert.match(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, reminderDays: [30, 30] }) ?? '', /unique/);
  assert.match(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, reminderDays: [0] }) ?? '', /whole days/);
  assert.match(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, reminderDays: Array.from({ length: 21 }, (_, index) => index + 1) }) ?? '', /up to 20/);
  assert.match(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, validityYears: { 'DTI (Sole)': 0 } }) ?? '', /validity/);
  assert.match(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, validityYears: { 'DTI (Sole)': 1.5 } }) ?? '', /whole number/);
  assert.match(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, validityYears: { Unknown: 3 } as DocumentMaintenanceSettings['validityYears'] }) ?? '', /not a supported/);
  assert.equal(validateDocumentMaintenanceSettings({ ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, validityYears: { 'DTI (Sole)': 3 } }), null);
  assert.equal(validateDocumentMaintenanceSettings(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS), null);
});
