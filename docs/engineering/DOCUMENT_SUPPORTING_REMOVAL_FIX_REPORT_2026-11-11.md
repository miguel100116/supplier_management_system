# Supporting-document removal: staging fix report

Verified: 2026-11-11. Target: `supplier-management-staging` (`adxwaxhnqxpmgjvsxgug`).

## Problem and root cause

Documents displayed `Could not find the function public.remove_supplier_supporting_document(...) in the schema cache` when removing an optional Supplier supporting document.

The frontend's RPC name and four named parameters match the versioned database contract. Staging had neither the function nor migration `202611090004_supplier_optional_supporting_documents.sql`. This was missing database setup, rather than an argument-order problem or merely a stale cache. Refreshing the cache alone could not create the missing function.

Call path: `DocumentRegisterPage` → `useSurveyData.removeSupplierSupportingDocument` → `partnerDocumentFiles.removeSupplierSupportingDocument` → the Supabase RPC. The UI updates its partner record only after the RPC succeeds.

## Approach and applied fix

1. Inspected the screen, service, RPC signature, authorization checks, migration history, and current staging catalog. Preserved existing workspace changes.
2. Added a disposable PostgreSQL rehearsal for the existing migration. It uses synthetic data and an already installed PGlite engine; it never connects to Supabase.
3. Saved the pre-install state, reviewed installation SQL and rollback SQL privately outside Git. Both functions supplied by the migration were absent before installation.
4. Applied the exact versioned migration and its migration-ledger entry atomically. It installs the removal RPC and defines the supporting-document completion helper. No additional pending migrations, completion triggers, scheduled jobs, or Storage buckets were installed.
5. Transaction guards verified unchanged business-table and Storage bucket/object counts and checksums, unchanged RLS policies, and unchanged unrelated public/private functions. The installed function bodies match the versioned SQL. Anonymous/public RPC execution remains denied; authenticated callers still need the function's Admin or document-renewal authorization.
6. Sent `NOTIFY pgrst, 'reload schema'` so Supabase can refresh its API schema cache.

No frontend change or application deployment was needed for this RPC setup fix. No actual customer document was removed during verification.

## Verification

- All four existing branch-completion/migration contract tests passed.
- The new disposable rehearsal passed authorized Admin and permitted-reviewer removal, anonymous/unconfirmed/unauthorized denial, required-document protection, stale expected-value and ambiguous-branch rejection, preservation of other documents/branches, correct audit ownership, and rollback when audit insertion fails.
- On staging, real confirmed Admin/Employee database roles were used with a synthetic partner inside a transaction that was rolled back. The Admin call used the same named parameters as the frontend and removed only the requested optional document. Anonymous/unauthorized callers, required-document removal, stale values, and an unknown branch were rejected. One correctly owned audit entry was verified before rollback.
- Post-check: zero synthetic partner/audit records remain; 1,146 partners, 6,355 answer rows, and 37 existing document-audit entries match the installation baseline. The migration and RPC are present with the expected parameter names.
- Git whitespace checks passed. Full application tests/build and browser suites were not repeated for this database-only installation; no application runtime code changed.

## Recovery and limits

Private rollback SQL removes only the two newly added functions and this migration-ledger entry, then requests a schema reload. It does not restore documents deliberately removed by users after rollout; restoring those would require a separately reviewed data recovery.

Refresh Documents and retry removal. The real browser/PostgREST transport was not exercised directly; verification covered the installed function, real database roles and named-parameter contract, plus an explicit cache-reload request.

The separate `partner-compliance-documents` Storage bucket and attachment RPC are still absent from staging. This fix enables removal of optional document records; it does not complete the separate file/image-upload setup. Production was not targeted.

## Reproduce the focused checks

```powershell
node --import tsx --test src/services/branchCompletionMigration.test.ts
node scripts/verification/supplier-supporting-documents.rehearsal.mjs .vite/active-evaluation-db/node_modules/@electric-sql/pglite/dist/index.js
```

The second command requires the existing local PGlite installation; it adds no project dependency and makes no hosted database connection.
