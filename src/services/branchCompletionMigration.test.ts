import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/202611050001_enforce_completed_partner_branch_status.sql', import.meta.url), 'utf8');
const foreignRulesMigration = readFileSync(new URL('../../supabase/migrations/202611090001_foreign_supplier_document_files_and_rules.sql', import.meta.url), 'utf8');
const currentForeignRulesMigration = readFileSync(new URL('../../supabase/migrations/202611090003_foreign_supplier_requirement_rules.sql', import.meta.url), 'utf8');
const optionalSupportingDocumentsMigration = readFileSync(new URL('../../supabase/migrations/202611090004_supplier_optional_supporting_documents.sql', import.meta.url), 'utf8');

test('branch completion is enforced on shared partner records and restores saved manual status', () => {
  assert.match(migration, /before insert or update of payload on public\.application_records/i);
  assert.match(migration, /new\.record_type <> 'partner_company'/i);
  assert.match(migration, /branch->>'manualStatus'/i);
  assert.match(migration, /branch := jsonb_set\(branch, '\{status\}', '"Completed"'::jsonb, true\)/i);
  assert.match(migration, /branch := branch - 'manualStatus'/i);
  assert.match(migration, /days_left <= 30/i);
  assert.match(migration, /cron\.schedule\('partner-branch-completion-refresh', '10 0 \* \* \*'/i);
  assert.match(migration, /set payload = payload/i);
});

test('Foreign Supplier branch completion uses only mandatory Foreign requirements and current-year AFS', () => {
  assert.match(foreignRulesMigration, /foreign_documents text\[\] := array\[[\s\S]*?'SIF'[\s\S]*?'Product Profile'\s*\n\s*\];/i);
  assert.doesNotMatch(foreignRulesMigration.match(/foreign_documents text\[\] := array\[([\s\S]*?)\];/i)?.[1] ?? '', /Other Documents|Confidentiality and Non-Disclosure Agreement/);
  assert.match(foreignRulesMigration, /extract\(year from expiry_date\) < extract\(year from current_date\) then branch_complete := false/i);
  assert.match(foreignRulesMigration, /local_documents text\[\] := array\[[\s\S]*?'Other Documents'/i);
  assert.match(foreignRulesMigration, /private\.is_confirmed_mgenesis_user\(\)/i);
  assert.match(foreignRulesMigration, /Document file uploaded:/i);
});

test('latest Foreign completion rule uses the exact seven requirements and preserves legacy documents', () => {
  const foreignRequirements = currentForeignRulesMigration.match(/foreign_documents text\[\] := array\[([\s\S]*?)\];/i)?.[1] ?? '';
  assert.deepEqual([...foreignRequirements.matchAll(/'((?:''|[^'])+)'/g)].map((match) => match[1].split("''").join("'")), [
    'SIF', 'AFS', 'Certificate of Incorporation', 'Articles of Incorporation',
    'Business Permit/License', "Owner's ID", 'Product Profile',
  ]);
  assert.match(currentForeignRulesMigration, /extract\(year from expiry_date\) <> extract\(year from current_date\)/i);
  assert.match(currentForeignRulesMigration, /Owner''s ID[\s\S]*?if days_left < 0 then/i);
  assert.match(currentForeignRulesMigration, /local_documents text\[\] := array\[[\s\S]*?'GIS \(Corp\)'[\s\S]*?'DTI \(Sole\)'[\s\S]*?'Business Permit'/i);
  assert.doesNotMatch(currentForeignRulesMigration, /delete from public\.application_records|delete from storage\.objects/i);
});

test('Supplier supporting documents are optional and removable only through an authorized audited RPC', () => {
  const localRequirements = optionalSupportingDocumentsMigration.match(/local_documents text\[\] := array\[([\s\S]*?)\];/i)?.[1] ?? '';
  assert.match(localRequirements, /Other Documents/);
  assert.match(optionalSupportingDocumentsMigration, /if company_type = 'Supplier' then\s+required_documents := array_remove\(required_documents, 'Other Documents'\);/i);
  assert.match(optionalSupportingDocumentsMigration, /create or replace function public\.remove_supplier_supporting_document/i);
  assert.match(optionalSupportingDocumentsMigration, /role = 'Admin' or 'renew-documents' = any/i);
  assert.match(optionalSupportingDocumentsMigration, /coalesce\(v_payload ->> 'supplierOrigin', 'Local'\) not in \('Local', 'Foreign'\)/i);
  assert.match(optionalSupportingDocumentsMigration, /v_current_document is distinct from coalesce\(p_expected_document, '\{\}'::jsonb\)/i);
  assert.match(optionalSupportingDocumentsMigration, /insert into public\.application_records\(record_type, record_id, payload, owner_id\)/i);
  assert.doesNotMatch(optionalSupportingDocumentsMigration, /delete from public\.application_records|delete from storage\.objects/i);
});
