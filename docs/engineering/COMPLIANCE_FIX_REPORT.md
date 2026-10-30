# Compliance integration fixes

Date: 2026-10-29. Scope: the three issues identified after merging `regoris` into `second-branch`.

## 1. Classified partner imports

**Root cause:** `mergeRowsIntoCompanies` adds or refreshes workbook branches without supplying remarks. The workbook has no remarks column, while `validate_partner_document_compliance` requires remarks for missing applicable CORP/SOL legal documents on every branch of a company being saved. New branches and refreshed records can therefore be rejected. The import hook also published browser state before the remote save succeeded.

**Fix:** after merging the reviewed rows, check matched companies using the canonical `companyDocumentRemarksError` rule. Where a required legal document lacks remarks, add the factual note: “Master List import: required document or expiry date is missing; pending verification.” Preserve existing remarks, expiry history, classification and provided flags. Do not mark documents provided, infer a classification or relax database validation. Untouched companies remain unchanged. Preview operates on cloned records; cancellation makes no writes. Publish the imported registry and browser cache only after persistence succeeds.

**Coverage:** CORP and SOL branch additions, required-note coverage across existing/new branches, retained remarks/history, unchanged input and untouched companies. Existing import parsing and merge tests remain in the full suite.

**Limit:** the existing registry replacement adapter performs multiple requests. This change does not make a large import transactional; a remote partial write still requires an authoritative refresh/reconciliation.

## 2. Hidden reminder-read failures

**Root cause:** both initial reads and Realtime refreshes caught all failures and replaced deliveries with `[]`. This made a timeout indistinguishable from no reminders. The effect depended only on Admin status, so switching between Admin identities did not restart its lifecycle.

**Fix:** serialize/coalesce refreshes using the existing task runner, retain the last successful delivery list on failure, and display a dedicated error with Retry reminders. Clear the error after a successful retry. Scope the effect to the signed-in identity as well as Admin status; cancel old reads and prevent disposed results from publishing. No browser-only reminder source or authorization bypass was added.

**Coverage:** failure before/after successful reads, preserved prior results, successful retry and disposed lifecycle. Browser regression exercises missing setup, a subsequent failed reminder read and a successful retry at desktop/mobile sizes.

## 3. Missing database migrations

**Root cause confirmed by the initial read-only staging inspection:** Git integration did not apply SQL migrations. Before rollout, the staging migration ledger lacked `202610280001` and `202610290001`; their new functions and the maintenance seed were absent. `pg_cron` was available but not installed. Production was not inspected.

**Code mitigation:** missing maintenance settings now raise an actionable setup error instead of returning successful defaults. Reminder loading checks the settings first. A missing remarks RPC produces an explicit migration instruction. No direct-write fallback bypasses the protected RPC.

**Applied with owner authorization on 2026-10-29** to **supplier-management-staging**, in this order:

1. [202610280001_partner_document_compliance_rules.sql](../../supabase/migrations/202610280001_partner_document_compliance_rules.sql): record types, seed settings, compliance rules, renewal function, audit triggers and scheduled reminders.
2. [202610290001_partner_document_remarks.sql](../../supabase/migrations/202610290001_partner_document_remarks.sql): scoped remarks RPC with optimistic concurrency and audit history.
3. [20261029095047_restrict_document_audit_execution.sql](../../supabase/migrations/20261029095047_restrict_document_audit_execution.sql): a follow-up prompted by the security advisor, removing default public/anonymous/signed-in direct execution of the internal security-definer audit-trigger function. Audit triggers remain enabled. The two guarded user-facing RPC grants remain intentional.

The first two files were applied unchanged. The Supabase tool assigned execution timestamps; their ledger entries were subsequently aligned, with guarded metadata-only updates, to the actual repository migration versions so future CLI deployments do not replay them. The proposed lookup-index migration is unrelated and was not applied.

**Rehearsal:** installed PGlite 0.5.13 in a temporary directory, outside the repository, and executed all three migration bodies against a disposable PostgreSQL instance. Synthetic identity helpers and a scheduler fixture substitute for Supabase Auth and the pg_cron worker; only `CREATE EXTENSION pg_cron` was omitted locally. Passed: required legal remarks; Admin versus Employee settings visibility; unauthorized RPC denial; delegated renewal/remarks; stale-write and classification rejection; maintenance validation; restricted reminder execution; synthetic due-document delivery and repeat-run deduplication; audit writes after grant restriction; scheduler-registration SQL. This is executable PL/pgSQL evidence, not proof of actual Supabase Auth or cron worker behavior.

**Staging verification:** all three canonical ledger versions are present; pg_cron 1.6.4 is installed; exactly one active job runs at `5 0 * * *` in GMT (08:05 Asia/Singapore daily). The default settings record, RLS, validation/audit triggers and empty function search paths are installed. Anonymous RPC execution is denied, signed-in renewal/remarks execution is permitted with in-function authorization, and reminder execution is restricted to privileged service access. Both RPCs rejected no-identity calls inside a read-only transaction. All 1,143 partner payloads retained the same aggregate checksum before and after rollout. No partner data was rewritten and the reminder function was not manually run against business records.

**Remaining verification:** a real signed-in staging renewal/remarks journey and the first scheduled cron execution have not been observed. A clean local application response does not establish those live behaviors. The security advisor no longer flags the audit-trigger function; it still flags the two intentionally guarded signed-in RPCs, existing policy-free RLS tables, and disabled leaked-password protection. See [RPC advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Unrelated security configuration was not changed.

**Recovery:** pre-migration renewal-function definition, constraints and table metadata were saved to the local temporary file `supplier-compliance-baseline-20261029.json`. No platform backup was created or verified. If rollback is needed, stop rollout, unschedule the new job, restore the prior renewal behavior via a reviewed forward recovery migration, and revert the dependent application release. Retain configuration, delivery and audit records; do not delete business data or reset staging. Code-only fixes can be reverted independently.

## Verification

439 Node tests, TypeScript checks and production build passed for the code fixes. All 44 desktop/mobile Playwright cases passed, including the new setup/failure/retry journey. Browser tests mock external services and do not verify live RLS or cron. Migration rollout adds the disposable PostgreSQL rehearsal and live checks above. Existing build bundle-size warnings remain. No application deployment, push or commit was performed; only staging schema/configuration and migration-history metadata changed. Production was untouched. Native/manual visual inspection was not performed.

Schema and application promotion are separate steps; see [Supabase migration guidance](https://supabase.com/docs/guides/local-development/declarative-database-schemas).
