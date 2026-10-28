import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/202610280001_partner_document_compliance_rules.sql', import.meta.url), 'utf8');

test('database enforces CORP/SOL applicability and remarks for missing applicable documents', () => {
  assert.match(migration, /v_class is not null and v_class not in \('CORP', 'SOL'\)/i);
  assert.match(migration, /foreach v_doc_name in array[\s\S]*?GIS \(Corp\)[\s\S]*?DTI \(Sole\)/i);
  assert.match(migration, /requires remarks while it is missing or not provided/i);
  assert.match(migration, /not applicable to the current CORP\/SOL classification/i);
  assert.match(migration, /v_current_document is distinct from coalesce\(p_expected_document/i);
});

test('reminder delivery is durable and deduplicated for each expiry interval, with database scheduling', () => {
  assert.match(migration, /create or replace function public\.run_document_expiry_reminders/i);
  assert.match(migration, /on conflict \(record_type, record_id\) do nothing/i);
  assert.match(migration, /md5\(v_company\.record_id[^;]*v_milestone\)/i);
  assert.match(migration, /v_days = any\(array\(select jsonb_array_elements_text/i);
  assert.match(migration, /v_days between 0 and coalesce\(\(v_settings ->> 'dailyFinalDays'\)/i);
  assert.match(migration, /coalesce\(v_company\.payload ->> 'businessClassification', ''\) <> 'SOL'/i);
  assert.match(migration, /coalesce\(v_company\.payload ->> 'businessClassification', ''\) <> 'CORP'/i);
  assert.match(migration, /cron\.schedule\('partner-document-expiry-reminders', '5 0 \* \* \*'/i);
  assert.match(migration, /validity periods and reminder schedule/i);
});

test('maintenance changes and business classifications write to modification history', () => {
  assert.match(migration, /create or replace function public\.audit_partner_document_configuration/i);
  assert.match(migration, /'document_modification'/i);
  assert.match(migration, /Business classification changed from/i);
  assert.match(migration, /Created document maintenance settings/i);
  assert.match(migration, /create or replace function public\.validate_document_maintenance_payload/i);
  assert.match(migration, /Reminder intervals must be unique/i);
  assert.match(migration, /Validity periods must be whole years from 1 to 50 or unset/i);
  assert.doesNotMatch(migration, /validityPendingVerification|pending-verification|DTI validity cannot be marked verified/i);
});
