# Uploaded Active Companies and evaluation assignments

Approved rule, 2026-10-30: the latest admin-uploaded Active Companies list for each category limits employee assignments. The Partner Registry is not an assignment list. Existing per-form company selections can narrow the uploaded scope; they cannot expand it. Registry additions do not create new assignments. No list, an empty list, or no valid registry matches yields no assignments. Read failures show an unavailable state, rather than a successful empty count or the entire registry.

## Implementation

- `src/features/active-companies/domain/evaluationScope.ts` maps uploaded names to non-archived companies in the same category. It prefers a unique exact name, then the existing import normalization in `src/features/partner-companies/domain/companyName.ts`. No fuzzy matching, guessed classifications, or unrelated replacements are allowed. Unmatched and ambiguous names appear as a warning in the Admin company picker.
- `useSurveyData` reads the current lists during hydration and survey/snapshot reconciliation. It derives `activeEvaluationCompanyIds` for the existing shared assignment resolver; employee lists, forms, notifications, Dashboard targets and coverage therefore share the same upper bound. Runtime scope fields are stripped from survey persistence and browser caches. Answers, registry records and saved per-form selections are preserved.
- `supabase/migrations/202610300001_active_evaluation_lists.sql` provides `get_active_evaluation_lists()`. Confirmed company accounts can read only category and company names from the latest saved snapshot. Upload history, filenames and uploader identities remain protected by existing Admin-only RLS. No RLS policy is widened. Anonymous and unconfirmed access is denied; the internal trigger function is not directly executable by authenticated users.
- Snapshot changes touch the matching survey rows' `updated_at` timestamps so the existing shared Realtime channel prompts employees to reload the projection. No survey payload is rewritten. Admin history and employee selection use the same timestamp ordering and deterministic ID tie-break. Deleted lists are not resurrected from bundled seed data.

## Rollout and recovery

The owner explicitly authorized staging application on 2026-10-30. The migration is installed in `supplier-management-staging`, matched to localhost's runtime URL; production is untouched. Its generated ledger version was aligned to repository version `202610300001` so later CLI runs do not replay it. Missing RPC setup is surfaced as an assignment-specific error. Code compilation and synthetic tests do not prove live Realtime delivery.

1. Verify the target project and record the current schema/function/trigger inventory and list/survey payload checksums without logging confidential values. Follow the environment's backup procedure.
2. Apply the versioned migration, then verify anonymous denial, confirmed Employee access to the limited projection, private history remaining unreadable, and snapshot changes causing a signed-in employee refresh.
3. Promote the tested application. Check empty, failed-read and unresolved-name states as well as the configured active list. Do not repair business classifications or recreate partners automatically.
4. For rollback, revert the dependent application first, then drop `application_records_active_evaluation_list_change`, `notify_active_evaluation_list_change()` and `get_active_evaluation_lists()`. Keep all lists, registry entries, responses and survey payloads. Only survey invalidation timestamps are updated by the new trigger.

Read-only staging verification on 2026-10-30 matched localhost to `supplier-management-staging`. Its Supplier survey had no saved company subset and all 273 suppliers were unarchived; the uploaded Supplier list had 20 names. Existing normalization uniquely matched 19 of those names within Supplier. One listed supplier and one listed courier matched a registry entry in another category and require admin review; no classification was changed. All 13 listed subcontractors matched. Including existing per-form subsets, a read-only preview returned required company counts Courier 1, Supplier 19 and Subcontractor 13. These are dated observations, not hard-coded assignment counts.

After application, aggregate payload checksums matched for all 1,143 partners, 6,488 response rows, three forms and three upload snapshots; the RLS-policy checksum also matched. The projection and restricted invalidation trigger are installed with empty search paths. A read-only transaction using an existing confirmed Employee profile's claims under the actual `authenticated` database role returned the current category lists (7/20/13 names) while direct private-history reads returned zero rows. This verifies database-role/RLS behavior, not a real browser JWT transport. The live anonymous HTTP request returned 401. No business-data upload or response write was performed to test Realtime; live signed-in browser/Realtime verification remains unobserved because the computer-use browser/native hosts were unavailable.

The security advisor adds the expected notice for the intentionally authenticated `SECURITY DEFINER` read projection. Its exposure is limited to current category/company names, gated by the existing company-account helper, with anonymous execution revoked. The internal trigger remains non-executable by authenticated users. See [Supabase's advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Existing unrelated security/performance notices were recorded before rollout and were not changed.

Dashboard error handling now distinguishes record-loading failures from assignment setup/read failures. `useSurveyData` exposes the underlying data and assignment errors separately while retaining the combined error for employee task views. Admin Dashboard keeps loaded scores, document data, forms and recent submissions visible during an assignment error; assignment progress is unknown, never a successful zero. Other data-loading failures retain their existing unavailable states.

## Disposable PostgreSQL rehearsal

The optional test engine is installed only in an ignored local folder, with no project dependency/lockfile change:

```powershell
npm install --prefix .vite/active-evaluation-db --no-save --package-lock=false @electric-sql/pglite@0.3.14
node scripts/verification/active-evaluation-lists.rehearsal.mjs .vite/active-evaluation-db/node_modules/@electric-sql/pglite/dist/index.js
```

The rehearsal uses an in-memory PostgreSQL instance and synthetic confirmed-account/RLS fixtures. It verifies latest-list selection, equal-time ordering, anonymous/unconfirmed denial, employee privacy, insert/update/delete invalidation, missing lists and unchanged survey payloads. It never connects to Supabase or reads credentials. Run the normal `npm test`, `npm run lint`, `npm run build` and `npm run test:e2e` gates separately.

Initial local verification on 2026-10-30: all 451 Node tests, TypeScript checks and production build passed. All 48 desktop/mobile browser cases passed before the final ordered-refresh adjustment; all four affected employee-assignment/Admin-send browser cases passed again after rebuilding that adjustment. Desktop/mobile employee screenshots were reviewed. The database rehearsal passed. The Dashboard error-isolation follow-up passed all 452 Node tests, TypeScript checks, production build and four focused desktop/mobile Dashboard-recovery/employee-assignment cases. No production checks or business-data writes were performed; existing bundle-size warnings remain.

The follow-up full browser run passed 49/50. The desktop Analytics legend assertion reached its five-second timeout while the page still showed `Loading page...`; that case passed unchanged with `npm run test:e2e -- --last-failed`. Assertions, deadlines and retry configuration were retained. Desktop/mobile screenshots of the assignment-error Dashboard were inspected and localhost health returned HTTP 200. No automated pixel comparison or real signed-in browser inspection was available.
