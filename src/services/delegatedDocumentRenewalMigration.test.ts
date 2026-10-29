import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/202609240001_delegated_document_renewal.sql', import.meta.url),
  'utf8',
);
const partnerPage = readFileSync(new URL('../pages/PartnerCompaniesPage.tsx', import.meta.url), 'utf8');
const documentPage = readFileSync(new URL('../pages/DocumentRegisterPage.tsx', import.meta.url), 'utf8');

test('delegated renewal is a narrow security-definer operation with optimistic concurrency', () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /'renew-documents' = any\(coalesce\(permission_pages/i);
  assert.match(migration, /key not in \('provided', 'expiryDate'\)/i);
  assert.match(migration, /v_current_document is distinct from coalesce\(p_expected_document/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /insert into public\.application_records[\s\S]*'document_modification'/i);
  assert.match(migration, /revoke all on function public\.renew_partner_document[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /create policy|alter table.*disable row level security/i);
});

test('delegated UI controls cannot change classification, contacts, branch status, or supplier rank', () => {
  assert.match(partnerPage, /disabled=\{!isAdmin\}[\s\S]*handleClassifyCompany/);
  assert.match(partnerPage, /if \(!selectedCompany \|\| !isAdmin\) return;/);
  assert.doesNotMatch(documentPage, /updateBranchStatus/);
  assert.match(documentPage, /aria-label=\{`Branch status: \$\{row\.branch\.status\}`\}/);
  assert.doesNotMatch(documentPage, /<select[^>]*aria-label=\{`Branch status:/);
  assert.match(documentPage, /const updateSupplierRank = \([\s\S]*?if \(!isAdmin\) return;/);
  assert.match(documentPage, /onRenewDocument\([\s\S]*expectedDocument|onRenewDocument\([\s\S]*branch\.documents/);
});
