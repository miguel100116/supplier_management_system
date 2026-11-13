import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/202610280001_partner_document_compliance_rules.sql', import.meta.url), 'utf8');
const remarksMigration = readFileSync(new URL('../../supabase/migrations/202610290001_partner_document_remarks.sql', import.meta.url), 'utf8');
const sharedBranchDocumentsMigration = readFileSync(new URL('../../supabase/migrations/202611130001_share_trade_nontrade_compliance_documents.sql', import.meta.url), 'utf8');

test('Trade and Non-Trade company documents synchronize before compliance validation', () => {
  assert.match(sharedBranchDocumentsMigration, /create or replace function public\.share_trade_nontrade_partner_documents/i);
  assert.match(sharedBranchDocumentsMigration, /branch\.value ->> 'businessType' in \('Trade', 'Non-Trade'\)/i);
  assert.match(sharedBranchDocumentsMigration, /~\* '-NT\$'/i);
  assert.match(sharedBranchDocumentsMigration, /changed_count = 1[\s\S]*?v_document := v_branches/i);
  assert.match(sharedBranchDocumentsMigration, /order by coalesce\(\(candidate\.value ->> 'provided'\)::boolean, false\) desc/i);
  assert.match(sharedBranchDocumentsMigration, /before insert or update of payload/i);
  assert.match(sharedBranchDocumentsMigration, /application_records_00_share_trade_nontrade_documents/i);
  assert.match(sharedBranchDocumentsMigration, /update public\.application_records company\s+set payload = payload/i);
  assert.doesNotMatch(sharedBranchDocumentsMigration, /delete from public\.application_records|delete from storage\.objects/i);
});

test('document remarks RPC has the frontend-compatible signature, admin permission guard, and authenticated-only execution', () => {
  assert.match(remarksMigration, /create or replace function public\.update_partner_document_remarks\(\s*p_company_id text,\s*p_branch_id text,\s*p_document_name text,\s*p_expected_document jsonb,\s*p_remarks text\s*\)/i);
  assert.match(remarksMigration, /security definer\s+set search_path = ''/i);
  assert.match(remarksMigration, /role = 'Admin' or 'renew-documents' = any/i);
  assert.match(remarksMigration, /v_current_document is distinct from p_expected_document/i);
  assert.match(remarksMigration, /jsonb_set\(v_current_document, '\{remarks\}', to_jsonb\(p_remarks\), true\)/i);
  assert.match(remarksMigration, /insert into public\.application_records\(record_type, record_id, payload, owner_id\)/i);
  assert.match(remarksMigration, /revoke all on function public\.update_partner_document_remarks\(text, text, text, jsonb, text\) from public, anon/i);
  assert.match(remarksMigration, /grant execute on function public\.update_partner_document_remarks\(text, text, text, jsonb, text\) to authenticated/i);
});

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
