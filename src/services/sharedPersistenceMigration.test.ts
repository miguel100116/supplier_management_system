import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260921011822_centralize_shared_state.sql', import.meta.url),
  'utf8',
).toLowerCase();
const rlsMigration = readFileSync(
  new URL('../../supabase/migrations/20260921013124_consolidate_application_rls.sql', import.meta.url),
  'utf8',
).toLowerCase();
const startupRlsMigration = readFileSync(
  new URL('../../supabase/migrations/202609300002_cache_startup_rls_helpers.sql', import.meta.url),
  'utf8',
).toLowerCase();
const optimizedResponseReadsMigration = readFileSync(
  new URL('../../supabase/migrations/202610070001_optimize_application_response_reads.sql', import.meta.url),
  'utf8',
).toLowerCase();
const lookupIndexesMigration = readFileSync(
  new URL('../../supabase/migrations/202610260001_application_record_lookup_indexes.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('lookup indexes match owner-scoped History and submission refresh without weakening RLS', () => {
  assert.match(lookupIndexesMigration, /\(owner_id, record_id\)[\s\S]*?record_type = 'export_history'/);
  assert.match(lookupIndexesMigration, /payload ->> 'responseid'\), record_id\)[\s\S]*?record_type = 'survey_response'/);
  assert.doesNotMatch(lookupIndexesMigration, /\b(delete from|truncate table|drop table|disable row level security)\b/);
});
const provenanceMigration = readFileSync(
  new URL('../../supabase/migrations/202609220001_response_provenance.sql', import.meta.url),
  'utf8',
).toLowerCase();
const provenanceReadiness = readFileSync(
  new URL('../../supabase/verification/response_provenance_readiness.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('centralizes every formerly browser-only shared record type', () => {
  for (const recordType of [
    'admin_activity',
    'document_modification',
    'export_history',
    'supplier_ranking_history',
    'employee_notification_state',
    'reminder_settings',
    'compliance_snapshot',
  ]) {
    assert.match(migration, new RegExp(`'${recordType}'`));
  }
});

test('narrows Data API privileges and enables live table publication', () => {
  assert.match(migration, /revoke all on table public\.application_records from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.application_records to authenticated/);
  assert.match(migration, /revoke all on function public\.handle_application_auth_user\(\) from public, anon, authenticated/);
  assert.match(migration, /alter publication supabase_realtime add table public\.application_records/);
  assert.match(migration, /alter publication supabase_realtime add table public\.app_profiles/);
});

test('keeps the migration non-destructive to stored business rows', () => {
  assert.doesNotMatch(migration, /\b(delete from|truncate table|drop table)\b/);
  assert.doesNotMatch(rlsMigration, /\b(delete from|truncate table|drop table)\b/);
  assert.doesNotMatch(provenanceMigration, /\b(delete from|truncate table|drop table)\b/);
});

test('backfills provenance only for responses traceable to the normalized client import', () => {
  assert.match(provenanceMigration, /from public\.evaluation_submissions s/);
  assert.match(provenanceMigration, /join public\.import_source_files f on f\.id = s\.source_file_id/);
  assert.match(provenanceMigration, /'datasource', 'client_csv'/);
  assert.match(provenanceMigration, /payload ->> 'datasource' is null/);
  assert.doesNotMatch(provenanceMigration, /'test_submission'/);
});

test('provides read-only provenance reconciliation with exact identity and conflict counts', () => {
  assert.match(provenanceReadiness, /evaluation_answers/);
  assert.match(provenanceReadiness, /ar\.record_id = n\.response_id \|\| ':' \|\| n\.question_id/);
  assert.match(provenanceReadiness, /pending_rows/);
  assert.match(provenanceReadiness, /exact_provenance_rows/);
  assert.match(provenanceReadiness, /protected_nonmatching_rows/);
  const executableSql = provenanceReadiness.replace(/--.*$/gm, '');
  assert.doesNotMatch(executableSql, /\b(insert|update|delete|truncate|alter|drop|create)\b/);
});

test('keeps security-definer authorization helpers outside the Data API schema', () => {
  assert.match(rlsMigration, /create schema if not exists private/);
  assert.match(rlsMigration, /create or replace function private\.is_app_admin\(\)/);
  assert.match(rlsMigration, /drop function if exists public\.is_app_admin\(\)/);
});

test('consolidates application policies to one policy per operation', () => {
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(
      rlsMigration,
      new RegExp(`create policy "application_records_${operation}"[\\s\\S]*?for ${operation} to authenticated`),
    );
  }
});

test('caches startup RLS helpers without changing the existing select predicates', () => {
  const policy = (sql: string, name: string) => {
    const match = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`));
    assert.ok(match, `missing policy ${name}`);
    return match[0]
      .replace(/\(\s*select\s+((?:private|public)\.[a-z_]+\(\))\s*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim();
  };

  for (const name of ['app_profiles_select', 'application_records_select']) {
    assert.equal(policy(startupRlsMigration, name), policy(rlsMigration, name));
  }
  assert.match(startupRlsMigration, /\(select private\.is_app_admin\(\)\)/);
  assert.match(startupRlsMigration, /\(select private\.my_app_designation\(\)\)/);
  assert.match(startupRlsMigration, /\(select private\.my_app_department\(\)\)/);
  assert.match(startupRlsMigration, /\(select private\.my_app_email\(\)\)/);
  assert.match(startupRlsMigration, /\(select public\.is_confirmed_mgenesis_user\(\)\)/);
  assert.doesNotMatch(startupRlsMigration, /\b(delete from|truncate table|drop table|disable row level security)\b/);
});

test('optimizes response reads without changing select authorization or stored rows', () => {
  const policy = (sql: string, name: string) => {
    const match = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`));
    assert.ok(match, `missing policy ${name}`);
    return match[0]
      .replace(/\(\s*select\s+((?:private|public)\.[a-z_]+\(\))\s*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim();
  };

  assert.equal(
    policy(optimizedResponseReadsMigration, 'application_records_select'),
    policy(startupRlsMigration, 'application_records_select'),
  );
  assert.match(optimizedResponseReadsMigration, /create index if not exists application_records_response_department_order_idx[\s\S]*?where record_type = 'survey_response'/);
  assert.match(optimizedResponseReadsMigration, /create index if not exists application_records_response_email_order_idx[\s\S]*?where record_type = 'survey_response'/);
  assert.match(optimizedResponseReadsMigration, /create index if not exists application_records_response_owner_order_idx[\s\S]*?where record_type = 'survey_response' and owner_id is not null/);
  assert.doesNotMatch(optimizedResponseReadsMigration, /\b(delete from|truncate table|drop table|disable row level security)\b/);
});
