# Supplier Management System — Engineering Second Brain

Last verified: 2026-10-29

### 2026-10-29 - Standard company letterhead for every PDF export

Owner requested standard company formatting on every PDF, then clarified that SMPESA branding should be removed. Shared `src/features/reports/services/pdfBranding.ts` embeds only the existing Microgenesis asset, with no SMPESA image, fallback text or creator metadata, supplies report/company context, brand-blue rules, document metadata and a confidentiality footer with Page X of Y. Quick/archive exports, detailed Summary/Company/Question/Executive builders, raw responses and presentation PDFs all use it; slides use a compact header and Executive reports retain Strictly Confidential. Missing logo assets retain readable text branding. Existing body layouts, covers, scoring/data scope, selected paper sizes/orientations and non-PDF exports remain. Existing History files keep their exact bytes; regeneration gets the new format. Rollback is a code revert; no remote writes or migration changes are involved.

Table pagination reserves header/footer space, including Executive overflow pages. Raw exports wrap full company names and preserve the question key above landscape tables. Real-PDF tests cover the company logo on every continuation page at all four paper sizes, reusable image resources, metadata, totals and missing-asset fallback. Synthetic summary, raw, company and presentation PDFs were rendered with PDF.js and visually inspected, including continuation pages. TypeScript checks, all 442 Node tests and production build passed; existing bundle-size warnings remain. The initial letterhead implementation passed all 46 desktop/mobile browser cases. Following the requested Microgenesis-only correction, all 442 Node tests, TypeScript checks, production build and all six affected desktop/mobile PDF download cases passed again; regenerated PDFs were visually inspected. Lossless logo compression and resource reuse keep file sizes bounded without image resizing. Native Microsoft/Adobe printing was not checked.

### 2026-10-29 - Compliance import and reminder failure corrections

Master List merges now use canonical legal-document validation to add factual pending-verification notes for missing required CORP/SOL documents on matched companies, retaining existing remarks/history and provided flags. The import hook publishes its registry/cache only after persistence succeeds. Reminder refreshes retain successful results on failure, coalesce reads, expose an independent retryable Admin error, and cancel publication when the account lifecycle changes. Missing maintenance seed/RPC errors identify required database setup rather than silently assuming successful default settings. See [root-cause report and recovery plan](COMPLIANCE_FIX_REPORT.md).

After initial read-only staging discovery confirmed the missing migrations, the owner explicitly authorized their application. Staging now has `202610280001`, `202610290001` and advisor-driven `20261029095047` (restrict direct execution of the internal audit-trigger function). The original two migrations were applied unchanged; tool-generated ledger versions were aligned with repository filenames. PGlite rehearsal with synthetic Auth/cron fixtures passed validation, delegated RPCs, rejection cases, audits and reminder deduplication. Live checks verified settings, triggers, grants, RLS and pg_cron 1.6.4 with one active GMT 00:05 daily job (08:05 Singapore). All 1,143 partner payloads retained the same aggregate checksum. No business-data reminder run was triggered manually. Real signed-in staging writes and the first scheduled job execution remain unobserved. Production and unrelated migrations were untouched; no push/deployment occurred. Recovery metadata is retained in the local temporary file `supplier-compliance-baseline-20261029.json`; platform backups were not verified. See the report for advisor triage and rollback. TypeScript checks, 439 Node tests, production build and all 44 desktop/mobile browser cases passed for the code fixes; existing build warnings and manual visual-comparison limits remain.

### 2026-10-29 - Local regoris integration into second-branch

The owner authorized pulling `regoris` into local `second-branch`. Integrated remote head `d990881` with the existing `02aee6d` work; application files merged automatically and the second-brain conflict retains both branches' entries. The Dashboard and Reports feature files remain identical to the pre-merge local head. Recovery branch: `backup/second-branch-before-regoris-20261029-02aee6d`. No push, deployment, or database migration was authorized or performed.

TypeScript checks, all 434 Node tests, production build and diff whitespace checks passed. Existing bundle-size warnings remain. The import/required-remarks compatibility risk and silent reminder-read failure identified during static review remain unresolved; these checks do not verify live database migrations, RLS or scheduled delivery. All 42 desktop/mobile Playwright cases also passed against synthetic services; no manual visual comparison or live database verification was performed.

### 2026-10-29 - Independent document remarks writes

Document tracker remarks now use a dedicated `update_partner_document_remarks` RPC with the same permission, branch/document validation, optimistic concurrency, required-remark rules, and audit trail; renewal remains limited to its existing provided/expiry fields. The tracker reads persisted remarks from the returned partner record and keeps them in the shared partner cache. Migration `202610290001_partner_document_remarks.sql` must be applied before this UI can use the new RPC in a deployed database. No remote migration was applied. Evidence: `src/pages/DocumentRegisterPage.tsx`, `src/services/applicationRepository.ts`, `src/hooks/useSurveyData.ts`, and `supabase/migrations/202610290001_partner_document_remarks.sql`. TypeScript checks and `git diff --check` passed; tests and browser visual checks were not run.

### 2026-10-29 - Document maintenance workspace

The document maintenance control opens a centered, content-sized responsive dialog capped at 900px, with separate reminder schedule, validity periods, and category alert views. Only the validity list uses a bounded internal scroll area. All controls are drafts until **Save changes**; Escape, close, and backdrop dismissal ask before discarding. Global schedule chips and custom intervals save with the daily reminder window; validity rules use years and remain pending until an admin confirms them against authority guidance. DTI stays unset and pending verification. Restore defaults stages the 60/30/day-30 schedule, unconfigured validity values, and default category alerts, then requires an explicit save. Settings writes are awaited and errors preserve edits; if the separate maintenance and category-alert writes partially succeed, the interface reports which portion needs retry. No saved expiry date or reminder history is rewritten. Evidence: `src/pages/DocumentRegisterPage.tsx`, `src/features/notifications/services/documentMaintenanceSettings.ts`, and `src/features/notifications/services/documentNotificationSettings.ts`.

### 2026-10-28 - Partner registry upload safeguards

Partner registration now validates Master List workbooks as non-empty `.xlsx`/`.xls` files up to 25 MB and detects repeated filenames or equivalent parsed row content within one selected batch. A review dialog lets admins cancel or continue with only the first copy; uploaded Master List source files are not retained, so older workbook replacements cannot be compared. Empty replacement results are blocked, and replacing the registry requires a final confirmation showing the current and resulting record counts. Courier, Supplier, and Subcontractor snapshot uploads also have a 25 MB limit and warn when a saved snapshot for the same type matches by filename or company list; explicit confirmation adds another dated snapshot rather than replacing history. Evidence: `src/features/partner-companies/services/masterListImport.ts`, `src/pages/PartnerCompaniesPage.tsx`, and `src/features/active-companies/`. App TypeScript checking and production build passed. Full `npm run lint` is currently blocked because `@playwright/test` is missing from `node_modules`; automated tests and browser rendering were not run. No migration or remote data change is involved.

### 2026-10-28 - Expandable partner compliance register

Supplier (Local), Supplier (Foreign), Courier, and Subcontractor detail views use a company-centered expandable list with one entry per BP-code branch. The 2026-10-28 follow-up adds an adaptive document grid, compact status popovers, Other documents, and visible historical requirements. Requirement definitions and status calculations remain centralized; category navigation, search, filters, sorting, pagination, permissions, rank/branch status, and audit paths remain in use. All Categories analytics remain unchanged.

CORP/SOL is stored as an optional legal classification. Unset or malformed legacy values are treated as unclassified; GIS/SEC apply only to CORP, DTI only to SOL, and other classification records remain visible as inactive history. Missing active DTI/GIS/SEC records require remarks in the UI and database trigger/RPC. A false `provided` value computes as Missing while retaining its prior expiry date. Master List refreshes merge explicit imported values while retaining existing remarks and documents omitted from the sheet. The new unapplied migration seeds an admin-only database config record, adds audit entries, and schedules a daily `pg_cron` job that stores reminder deliveries with a unique record ID per company/branch/document/expiry/milestone; the admin notification bell reads these rows. DTI validity is unset and pending verification. Config changes do not rewrite existing expiry dates; only verified configured validity years suggest dates on new renewals. If rollback is needed after migration, revert application code and unschedule the cron job; keep configuration, delivery, and audit records intact.

Evidence: `src/pages/DocumentRegisterPage.tsx`, `src/pages/PartnerCompaniesPage.tsx`, document-tracker domain tests, and `supabase/migrations/202610280001_partner_document_compliance_rules.sql`. The migration is not applied; target Supabase `pg_cron` availability and live RLS/notification delivery are unverified. Focused 36-test suite and app TypeScript check passed. Full `npm run lint` remains blocked because `@playwright/test` is missing from `node_modules`; no browser was connected for 1280/1440/mobile visual inspection. No remote data change was performed.

### 2026-10-28 - Selectable report paper sizes

Reports expose A4, Letter, Legal and Long Bond for PDF/Word downloads through shared `PaperSizeSelect` and canonical `domain/paperSize.ts` dimensions. Detailed builders, archived builders, quick exports and raw exports pass the selection to their existing exporters; report contents and permissions stay unchanged. Main builders default to A4; raw exports default to Long Bond with landscape PDF orientation. Shared DOCX and company DOCX sections set explicit page sizes. Wide raw PDF columns scale to the available width.

Optional validated `ReportParameters.paperSize` retains builder choices for History > Regenerate; older recipes remain compatible and exact-file downloads are unchanged. CSV/Excel have no paper dimensions. No schema migration or remote changes; rollback is a code revert. Real PDF/DOCX tests verify all four sizes, data retention and saved recipes; desktop/mobile archive journeys cover selection and regeneration. Native document-reader/printer rendering still requires manual verification.

Verification: 417 Node tests, TypeScript checks, production build and all 42 desktop/mobile browser cases passed. Desktop/mobile archive screenshots were inspected. Existing build chunk-size warnings remain.

### 2026-10-28 - Restore compact report export presentation

Owner requested the old export format with the latest report changes retained. The archived PDF exporter again delegates to the compact shared table-first layout used at `263e7b8`, replacing the separate logo/cover-page presentation added in `69c7d92`. The selected item/category, complete current tables, truthful archive-data description, scoring and filters, saved recipe, retry/error handling and History behavior remain intact. Shared Word table exports now match the legacy PDF's 22-point blue title, 14-point dark section headings, compact body text/margins, generated-date/confidentiality metadata and striped blue-header tables. These shared Word exports were introduced in the newer commit, so this is a matching presentation rather than a claimed restoration of an older DOCX implementation. Existing detailed report-builder PDF layouts and company-specific Word exports are retained.

Historical saved files are not rewritten; Download again returns the original bytes, and Regenerate/new downloads use the restored presentation with current authorized data. No remote data, schema, export permissions, or persistence format changed. Rollback is a code revert. Evidence: `archivedReportExport.ts`, `exporters.ts`, the real PDF/DOCX assertions in `exportHistory.test.tsx`, and the archived download browser journeys. The generic PDF exporter keeps its other callers' original introduction unless an archive-specific description is supplied.

Verification: all 417 Node tests, TypeScript checks, production build, and all 42 desktop/mobile browser cases passed. Real-file tests verify a one-page compact archived fixture without a cover/logo, retained current tables/scope and History recipe, valid DOCX output, escaped content, and the compact style settings. Native PDF/Word visual inspection was unavailable; document-reader pagination/appearance remains a manual review limit. Existing build chunk-size warnings remain.

### 2026-10-28 - Dashboard assignment employee breakdown

Admin form-row Evaluation Progress opens the read-only `AssignmentCompletionModal` without changing the prior Dashboard layout, scores, or count labels. It opens even when no official response has been received. Employee email, department, designation, completed/required counts, and expandable completed/pending company lists come from the same Dashboard snapshot and canonical assignment rules as the clicked total; inaccessible accounts and unassigned companies are excluded. The snapshot reuses `getPendingEvaluationCompanies` for company status and exposes no new data fetch or persistence path. Unknown account data is distinct from no eligible employees. Imported respondents who are not current eligible employees are not presented as assigned employees.

The dialog registers with `useModalEscape` for Escape/backdrop dismissal, scroll locking and trigger-focus restoration, focuses Close on open, and cycles Tab within visible controls. It has no completion, save, or mutation action. Existing Recent submissions links still open submission records. No Supabase records, schema, or authorization policy changed; rollback is a code revert. Evidence: `src/features/dashboard/components/AssignmentCompletionModal.tsx`, its stylesheet and component tests, Dashboard snapshot tests, and the desktop/mobile assignment-dialog journey.

Verification: 417 Node tests, TypeScript checks, production build, and all 42 desktop/mobile browser cases passed. After shortening the company-details label without repeating employee emails visually, the 24 focused Dashboard tests, TypeScript checks, build, and both assignment-dialog browser cases passed again. Light/dark desktop/mobile screenshots were inspected. Coverage includes eligible versus excluded employees, reconciling employee/company counts, pending/completed assignments, zero completion, unavailable/empty data, keyboard focus cycling, inside pointer-down, Escape/backdrop/Close dismissal, focus restoration, viewport bounds, and preserving stored evaluations. Shared modal priority tests remain part of the Node suite. Authenticated hosted rendering was not checked; existing bundle-size warnings remain.

### 2026-10-28 - Dashboard audit corrections

The local accuracy follow-up fixes the page-access omission found in the staging audit below. `getEligibleFormRecipients` now reuses `getProfilePermissions` and `hasPageAccess('fill-form')`, honors department page ceilings as well as survey types, and excludes forms hidden from employees by the existing test-title rule. Dashboard targets and Send Form recipients share this rule. A read-only staging configuration check executed through the corrected local selector (using anonymized profiles and company counts) returns required targets Courier 1, Supplier 273, Subcontractor 20; imported respondents still do not match current Employee profiles, so current assignment completion remains zero. The Dashboard form section displays the internal Running status as Active, including its count and empty-state copy; status persistence and other module labels are unchanged. Both form-row Evaluation Progress and the category Current-round completion column show these live values in Current, All-Time, and Custom reporting views; changing the score/submission reporting scope never hides or reinterprets current-round progress.

Recent submissions reuse `selectSurveyResponses` to resolve a missing form ID only when one authorized known form matches; ambiguous and explicit unknown IDs are not guessed or rewritten. `submissionTimestamp.ts` strictly parses supported source dates, treating legacy offset-free timestamps as UTC+08:00 and respecting explicit ISO offsets; sorting is independent of browser time zone, invalid dates remain unavailable, and displayed times use the viewing locale. The original persisted timestamps and rubric scores are unchanged.

Admin result rows show a separate classification count for countable official submissions linked to Uncategorized partners. All such evaluations remain included in counts/scores. The two affected partner classifications are unresolved; no remote records were rewritten. Historical/per-resend assignment targets remain unavailable. Tests cover the actual Executive account pattern, account and department page denials, safe legacy attribution, unclassified-count preservation, and date parsing/sorting across UTC, Singapore, and New York.

Final verification: 414 Node tests, TypeScript checks, production build, all 40 desktop/mobile browser cases, and diff whitespace checks passed. The expanded Dashboard browser fixture combines an inaccessible Executive, a legacy submission without a form ID, and an Uncategorized evaluated partner; both viewports verify the corrected target, resolved form labels, and separate classification note. Synthetic current/historical screenshots were inspected; dark-mode visuals and authenticated hosted rendering were not checked. Read-only staging input checks verified the corrected targets without copying personal identities or changing records. Existing build chunk-size warnings remain. Earlier browser failures were text-locator mismatches after adding secondary metadata; the final full suite passed with locators asserting the full accessible cell content.

Reporting-scope display follow-up: fresh read-only staging queries confirm 0/1 Courier, 0/273 Supplier, and 0/20 Subcontractor completed/required assignments. Current-round completion now stays visible in All-Time/Custom as well as Current; it is never relabeled as historical completion. Zero completion is explicitly covered by presentation regressions, and the All-Time browser journey checks that current progress remains present. The follow-up passed all 414 Node tests, TypeScript checks, build, and all 40 browser cases; desktop/mobile All-Time screenshots were inspected. No remote data was changed.

### 2026-10-28 - Read-only staging Dashboard accuracy audit

Verified the connected staging project against the local Dashboard code, with no remote writes or application changes. Independent aggregation of both `application_records` and the normalized import tables agrees on Courier 30 countable / 30 scored / 83.69, Supplier 178 countable / 178 scored / 87.02 (185 source submissions; seven blank/N/A-only), and Subcontractor 65 countable / 63 scored / 78.41. All 45 scored-question weights match local rubric definitions. The latest five official records without filters are Supplier submissions dated 2026-07-23; source completion dates agree with the stored application dates in the Asia/Singapore time zone. These checks establish data/formula agreement, not rendered hosted behavior or another user's filtered/RLS-scoped view.

Confirmed defect at audit time (subsequently fixed locally above): `getEligibleFormRecipients` checked survey-type permissions but not the `survey-forms` page permission. The Executive employee was included in every form's assignment target although `hasPageAccess` blocked that account from filling forms. Pre-fix required counts were Courier 2, Supplier 546, Subcontractor 40; excluding this inaccessible employee reduces them to 1, 273, 20 respectively. Earlier passing Dashboard tests did not cover this page-permission case. No official imported submission matches a current Employee profile email, so zero current assignment completion does not mean no evaluations exist.

Data inconsistencies/gaps: one Uncategorized partner is referenced by five countable Courier submissions and another by seven countable Supplier submissions. Those records contribute to survey-type scores but their companies are excluded from category-specific assignment pools and visible partner lists. All 30 official Courier submissions lack `surveyId`, although their questions map to the single existing Courier form; At audit time Recent submissions labeled their form unavailable; the local correction above now reuses the existing unambiguous legacy matching rule. Correct classifications and any backfill need a separately scoped change; do not infer approval to rewrite records from this audit. Historical targets remain unavailable. Persisted date formats remain mixed; the local correction above fixes Dashboard recent sorting without rewriting stored data or auditing other date consumers.

### 2026-10-28 - Dashboard reporting and assignment alignment

Approved count meaning: completed employee/company assignments out of required assignments, separate from received submissions and scored submissions. `src/features/dashboard/domain/dashboardSnapshot.ts` prepares the three Admin Dashboard tables from caller-authorized responses, filtering official provenance consistently. Form and category current-round completion reuse `getEligibleFormRecipients` (form, account and department type permissions) and `getSurveyCompletionSummary`; repeated submissions complete each employee/company/form once, and the category total sums non-archived forms. Zero requirements have no completion percentage. Unassigned/unattributable imports remain in official reporting but do not complete an assignment. No records are deleted or rewritten.

Evaluation results show the unchanged normalized average rubric score, its scored-submission count, total submissions, and a separate completion column. Recent submissions show the latest five countable official submissions from the same reporting scope and filters, with form/respondent details, normalized scores out of 100, and explicit missing/inferred metadata. Loading/errors hide the result table instead of presenting empty/zero success. Reporting uses the authorized Current/All-Time/Custom Analytics cohort; completion remains current-round and ignores reporting search/rating filters. Scrollable tables support keyboard focus. Evidence: the Dashboard feature tests, `src/pages/DashboardPage.tsx` and its tests, `src/App.tsx`, and the desktop/mobile browser journey.

Limits: historical assignment targets and immutable per-resend round assignments are not stored. Historical completion is not inferred; the always-visible current-round column follows live assignments and non-archived responses, matching the existing completion boundary. The subsequent read-only audit above verified the saved 83.69 score; hosted rendering remains unverified. No migration or remote changes are needed; rollback is a code revert.

Verification: 407 Node tests, TypeScript checks, production build, all 40 desktop/mobile browser cases, and diff whitespace checks passed. The 15 focused Dashboard domain/presentation tests cover canonical score agreement, duplicate/repeat submissions, official provenance, permission ceilings, assigned companies, ambiguous legacy attribution, reporting scopes, empty/loading/error states, and missing metadata. Current/historical synthetic desktop/mobile screenshots were inspected; browser coverage checks normalized scores, completion versus submission counts, provenance exclusion, and keyboard scrolling without viewport overflow. Dark-mode visuals and live hosted data were not verified. The existing build chunk-size warning remains.

### 2026-10-27 - Branded archived PDF exports (superseded by compact restoration above)

Archived Survey, Response, and Company PDFs now use the configured Report Library's A4 cover, Microgenesis logo, selected-item/category metadata, running page header, and numbered confidentiality footer. The complete archived tables and saved History recipe are unchanged; Word, Excel, and CSV already use the shared report exporters. The previous generic PDF introduction claimed broad analytics content that archived single-item reports do not contain. Evidence: `src/features/reports/services/archivedReportExport.ts`, `src/features/reports/components/ArchivedReportBuilder.tsx`, and the desktop/mobile archived download journeys. TypeScript checks, production build, and four focused desktop/mobile browser cases passed. Visual inspection in a native PDF reader and hosted downloads remain unverified.

### 2026-10-26 - Admin-managed evaluation period

Courier and Supplier surveys share one `periodCovered` setting, synchronized across their existing survey records to preserve the current persistence model. Admins can change it directly in any survey preview or in single-form **Workspace → Manage Access → Schedule & Notifications**; preview changes save immediately across Courier and Supplier forms. New forms inherit the configured value. Employee forms display the saved value read-only and use it for the submitted Period Covered answer, even when resuming an older draft. Legacy forms default to `1st Half`. Evidence: `src/types/survey.ts`, `src/pages/SurveyFormsPage.tsx`, `src/pages/SurveyFillerPage.tsx`, and `src/hooks/useSurveyData.ts`.

Verification on 2026-10-26: `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check` passed. Automated tests and rendered browser comparison were not run; no database migration or remote changes are needed because survey configuration is already stored in the shared survey record.

### 2026-10-26 - Bounded application reads and module-scoped shared data

`applicationRepository.ts` now walks `application_records` by `(record_type, record_id)` cursor instead of increasing offsets and up to six concurrent full-payload pages. It continues through short server-capped pages, validates every returned record, and supports aborting reads when `useSurveyData` is disposed. Initial hydration and subscription reconciliation no longer run competing full response reads. Changed-submission reads use the same cursor and preserve full answer sets. Reconnect requests authoritative refreshes for active shared stores; canceled or failed reads do not replace cached state.

`sharedStoreHydration.ts` loads notification settings at startup and reads History, document histories, Feedback Hub, and Admin activity only when their page opens. Completed page loads are reused until a matching Realtime change; concurrent refreshes are coalesced. Module data loading has a visible loading/error/retry state. Import file inspection computes batch counts from the complete response set already held by the import screen. The existing metadata-only History reader remains in place and now uses a cursor.

The unapplied `202610260001_application_record_lookup_indexes.sql` proposes partial indexes for owner-scoped History and submission-ID refreshes; the existing primary key already supports full response cursors. `application_record_read_performance.sql` contains read-only index, payload-size, activity and plan checks for the actual affected database and signed-in RLS context. No timeout, RLS policy or business record changed. Code rollback is a revert; the proposed indexes have no effect until reviewed and applied.

Read-only staging REST probes with a server key (which bypasses user RLS) saw the first 1,000 response rows in 989 ms and 20 lightweight History rows in 1,017 ms. Three paired 488-row late-page probes were 1,316/312/485 ms with an offset and 737/343/209 ms with a cursor; the medians were 485 and 343 ms. These short samples include network/cache variation and cannot confirm signed-in or hosted timeout resolution. A live authenticated plan, active-lock check, and migration-state audit remain necessary before claiming the database cause is fully resolved.

Final local review on 2026-10-27: Admin Settings now waits for its activity store before showing the snapshot, with an in-dialog retry on failure. All 396 Node tests, TypeScript checks, production build, dependency audit (zero vulnerabilities), and the desktop/mobile Settings loading/failure/retry browser case passed. The full browser run passed 35/36 cases; its sole desktop Directory row-readiness timeout passed unchanged on a focused desktop/mobile rerun. The existing large-bundle warning remains. The proposed lookup indexes were not applied, and signed-in hosted performance and RLS plans remain unverified.

### 2026-10-26 - Word exports, descending rankings and lightweight History refresh

Reports export menus now include editable Word tables through the installed `docx` package and shared `exportTablesAsWord` adapter; Summary, Executive, Question, raw-data and archived flows retain selected table content. The existing specialized Company Word export remains in place. Summary, executive and quick company ranking exports include every scored company in canonical descending leaderboard order, replacing separate top/bottom sections. Report count labels use Responses without changing domain calculations. Legacy `showBottomCompanies` recipes remain valid and map to the single Summary ranking.

The report library allows dropdowns to extend beyond its border; clipping overflow hid the lower Question Report export choices, including Word. A desktop/mobile browser regression exercises the quick Question Report Word download and verifies its DOCX content.

Rendered mobile coverage found the existing sticky Question/Company export footers beneath the fixed 64 px navigation bar. Those two footers now use an 80 px bottom offset only at the shell's matching 560 px mobile breakpoint; desktop positioning is unchanged. Geometry and normal-click browser checks cover both. Summary/Executive/Question CSV writers use the existing formula-escaping option, with a formula-like company name covered in a real Summary download.

The reported `export_history` statement timeout exposed an expensive read path: every startup/Realtime refresh selected whole payloads, including retained base64 files, in pages up to 1,000 rows. `exportHistoryRepository.ts` now selects owner-filtered metadata in bounded sequential pages, separately checks file existence without returning bytes, and fetches one complete owner-filtered record only for Download again. Required metadata is validated during listing; retained file MIME/base64/size and metadata are validated before downloading. An active-account change aborts re-download; errors remain visible and retryable. No RLS, schema, retained record or timeout configuration was changed. Rollback is a code revert; no migration is needed.

A read-only audit matched localhost's configured staging target and initially found 16 History entries and 11 retained copies. Metadata and existence queries succeeded in about 1.4 s and 0.2 s respectively without printing identifiers, file contents or credentials. A later read through the actual metadata adapter validated 19 entries and 14 available copies, loading zero retained file bytes; the live inventory changed between reads, and this work did not write remote records. JSON projections preserve metadata types for runtime validation. The user's signed-in hosted timeout and live RLS timing were not reproduced; production was not checked. Regression coverage simulates the original bulk-read statement timeout, a two-megabyte retained file, small server row caps, owner isolation, invalid metadata/files, retry, real DOCX packaging/escaping, and more than ten companies. No deployment or remote data writes are part of this change.

Verification: all 396 Node tests, TypeScript checks, production build and all 32 desktop/mobile browser cases passed; dependency audit reported zero vulnerabilities. Browser coverage includes actual Word downloads from quick company, Summary, Executive, Question, raw and archived reports, retained-file byte equality, all-company descending order, CSV formula escaping, file-read retry and mobile footer geometry. Early browser failures identified a test count that needed to include the added Word file and the real mobile footer overlap; both were corrected before the complete successful run. Desktop/mobile screenshots were inspected. Word is verified as an editable DOCX package with expected XML content; rendering in installed Microsoft Word and automated pixel comparison were not checked. The existing bundle-size warning remains.

After the final JSON-type-preserving projection adjustment, eight History boundary tests, the configured-project adapter read, TypeScript/build and two desktop/mobile History smoke cases passed. Local `/reports` returned HTTP 200 and its served modules contain the Word option and metadata-only loader. This work remains local and uncommitted; the hosted site requires a subsequent authorized publication/deployment.

### 2026-10-26 - Review and publish the current second-branch work

The owner authorized committing and pushing the reviewed local work to `second-branch`: single-item archive reporting and download fixes, compatible saved-export reading with strict writes, the `body-parser` security patch, and the previously merged `regoris` notification update. Targeted fetches confirmed the remote target has no commits missing locally. Full fetch encountered the Windows case-insensitive ref collision between `regoris` and `Regoris/Testing`; no unrelated refs were pruned. The existing pre-push hook verifies the clean committed tree before sending it. Recovery stash `codex-before-pull-regoris-20261026` is retained. Hosted Verify and deployment status must be checked for the pushed commit; Vercel contributor access remains a separate hosting concern. No database migration or remote business-data change is part of this publication.

The first pre-push run on `263e7b8` passed TypeScript, 394 Node tests and the build, but stopped the push after a five-second mobile Workspace table-readiness timeout (29/30 browser cases passed). The shared browser login helper previously returned as soon as the submit click finished, allowing subsequent navigation before authentication settled. It now waits for the signed-in `main` or login error `alert`; successful and rejected-login assertions, test deadlines and retry settings remain unchanged. Six focused desktop/mobile Workspace and rejected-login cases passed afterward. This is test synchronization only, with no application UI or authorization change.

### 2026-10-26 - Pull regoris into local second-branch

Fetched `origin/regoris` at `be98af9` (Admin notification views) and merged it into local `second-branch` as `3ef8ac8`. The branches had diverged, so this required a merge rather than a fast-forward. Restored all 21 existing local changed/new files from a named backup stash; contents were verified against that snapshot, including the unchanged local App patch after automatic merge. No conflicts remain. TypeScript checks and all ten focused notification-domain tests passed. Full Node/build/browser gates were not rerun for this Git integration. The recovery stash is retained; no push or deployment occurred.

### 2026-10-26 - PR 63 dependency-audit failure

Read-only GitHub inspection of PR [63](https://github.com/miguel100116/supplier_management_system/pull/63), `regoris` into `second-branch`, found Verify run [40276265728](https://github.com/miguel100116/supplier_management_system/actions/runs/40276265728) failed only at the high/critical dependency audit. TypeScript, Node tests, build, desktop/mobile browser tests and secret scanning passed. The same head commit had an earlier successful run; security advisory changes can change audit results without a code change. This failure is separate from the archived-report reader/deployment issue.

The local lockfile updates only Express's transitive `body-parser` from 1.20.8 to patched 1.20.9 for [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), preserving the existing supported range, application code and audit gate. README now explains clean installation and verification after pulls/merges, committing lockfile fixes, and requiring current PR/merge checks. Rollback is reverting the lockfile entry, which reintroduces the known vulnerability; no migration is involved. No PR writes, pushes, merges, deployments or remote-data changes are included.

The same PR head also has a separate failed Vercel commit status: Git author `cosmospaces` must have access to the Vercel project to create deployments. Cloudflare Pages passed. The project owner must resolve Vercel contributor access and deployment eligibility; the dependency fix cannot clear that status. Do not bypass verification or rewrite commit authors to conceal a hosting-permission failure.

Local verification: a clean `npm ci`, all 394 Node tests, TypeScript checks, the production build and `npm audit --audit-level=high` passed (zero vulnerabilities). The full browser run passed 26/30; four page/table-readiness assertions timed out at five seconds and all four passed unchanged with `--last-failed`. Consequently the aggregate `npm run verify` initially exited at E2E; its final audit was run separately and passed. Existing bundle-size warning remains. Verification used Windows/Node 24.20.0; hosted CI remains pinned to Node 22 and awaits a pushed fix. Local dev servers were stopped to release a Windows native-module file lock during clean installation; localhost was subsequently confirmed available with HTTP 200. Existing archive-report work was preserved.

### 2026-10-26 - Export-history recipe compatibility and strict writes

The owner reported one quarantined `export_history` row with `Invalid report recipe`. A read-only recipe-shape audit of the configured staging project, matched to localhost's runtime URL, found six History rows: five without recipes and one valid `archived-responses` recipe. No malformed present recipe or explicit null recipe was found. The pre-archive five-kind validator rejects that one new kind, consistent with an older loaded reader or a warning retained from an earlier refresh; the signed-in browser itself was not inspected. No file contents, credentials, personal data, or record IDs were printed, and no remote records were changed. Production was not checked.

`applicationRecordSchemas.ts` now validates required History metadata and retained file data before optional recipes. Read-time incompatible/malformed recipes disable regeneration using a computed `recipeUnavailable` flag while preserving the entry and original file; stored JSON is untouched. History explains the unavailable options and keeps valid-file re-download available. `upsertApplicationRecords` explicitly requests write validation, so invalid new recipes are rejected before any request. File MIME/base64, size, date and record-ID checks remain strict. This replaces the one-off retired-archive exception with one read-compatibility rule; it does not suppress required-data validation warnings. Rollback is a code revert; no migration is needed.

Verification: all 394 Node tests, TypeScript checks and the production build passed; service/parser regressions cover strict writes and unsafe-file rejection. Six focused desktop/mobile archive and History journeys passed, including exact saved-file bytes and incompatible options. The full browser run passed 28 of 30 cases; unrelated Analytics and Directory checks timed out while showing `Loading page...` at their five-second assertion deadlines, then both passed unchanged with `--last-failed`. History screenshots were inspected at desktop/mobile sizes. The existing bundle-size warning remains. No deployment, production verification, signed-in live-browser check or remote data changes were performed.

### 2026-10-26 - Archive visibility and download correction

The owner reported an archive visible in Archive Center but absent from Reports. The report selector incorrectly applied official-Analytics provenance filtering, excluding staging/test and legacy records that Archive Center retains. `archivedReports.ts` now uses all authorized stored rows for the selected item and separately labels stored submissions, answer rows, countable evaluations and provenance. Official Analytics is unchanged. Valid empty survey/company reports and blank/N/A response archives remain exportable. The builder opens the first available category/item, shows category item counts, and pins that selection after loading rather than silently following later archive reordering.

Shared table exporters return the existing download promise so the archived builder can await failures, show an error, re-enable retry and prevent duplicate clicks while downloading. Report filenames and history IDs share a cryptographic fallback for HTTP hosts without `randomUUID`. Permission checks, archive identities, saved-file validation, existing records and remote business data are unchanged. Regression coverage includes a single staging-only Supplier archive verified from Archive Center through all three downloaded formats, blank/N/A counts, missing `randomUUID`, failed-download retry and History regeneration. Browser inventory was empty, so the owner's signed-in browser was unavailable; verification uses synthetic records against the real local application.

Verification: all 391 Node tests, four TypeScript projects and the production build passed. Four focused desktop/mobile archive journeys passed with actual PDF, Excel and CSV downloads; the single-archive case compares Archive Center with Reports, validates saved answers and exercises failure/retry and history IDs without `randomUUID`. The full browser run passed 27 of 28 cases; an existing Workspace table-readiness timeout passed unchanged with `--last-failed`. Desktop/mobile screenshots were inspected manually. Local `/reports` returned HTTP 200. Live session/RLS, deployment and automated pixel comparison were not checked; the existing bundle-size warning remains.

### 2026-10-26 - Single-item archived report builders

The owner replaced the earlier combined archive-report proposal with three independent entries in Reports: Archived Survey, Archived Response, and Archived Company. The previous implementation was removed and the clean working tree verified before implementing this flow. `src/features/reports/components/ArchivedReportBuilder.tsx` follows the Company Report layout: category and one item on the left, live document content and export on the right. There is no all-items fallback. `domain/archivedReports.ts` requires an actual archived survey/company or one response archive entry; category and missing/restored-item checks fail closed. Survey reporting keeps all related companies, prefers original response survey IDs over archive metadata, and uses all known forms for conservative legacy attribution. Company history uses stable IDs and rejects ambiguous legacy company names. Source records supplied by App retain existing access filters. Archive reports include saved staging/test and legacy rows with provenance counts; official Analytics filtering remains unchanged.

Archive Center and response reporting share the existing series/legacy event identity through `src/features/archives/domain/archiveResponseGroup.ts`; its UI and restore behavior are unchanged. The existing PDF/Excel/CSV exporters and per-user export history remain the I/O boundary, with single-item recipes and readable saved labels. CSV formulas are escaped. Comments are opt-in, identities omitted, and empty company profiles export without invented scores. Preview is capped at 50 rows per section; downloads retain all rows. These are current-data/current-rubric reports, not immutable archive-time snapshots. No migrations, business-data writes, archive restoration or deployment are introduced. Rollback is a code revert; retain a compatible client for the new history recipe kinds.

The export-history decoder retains validated file copies when older/unsupported regeneration options cannot be used, leaving stored JSON untouched; the old combined builder and selection handlers are absent. New supported archive kinds are `archived-survey`, `archived-responses`, and `archived-company`, each requiring one item ID and category.

Local verification: all 388 Node tests, all four TypeScript projects, production build, and all 26 desktop/mobile Chromium journeys passed. The new journey covers separate library entries, one-item scoping across all three builders, category reset, live preview, missing-selection guards, empty company profiles, real PDF/Excel/CSV downloads, formula escaping, History persistence/regeneration and unchanged archive status. Light/dark desktop/mobile screenshots were inspected manually; no automated pixel comparison was performed. Live Supabase/RLS and hosting were not checked. The existing bundle-size warning remains.

### 2026-10-23 - Workspace category and status badge consistency

Forms table category/status badges share 12px semibold uppercase typography, line height, padding, pill shape, and border geometry in `src/pages/SurveyFormsPage.tsx`. Both use the existing soft category/status colors and thin borders; status calculation, labels, filters, and actions remain unchanged. The browser regression checks Courier/Supplier/Subcontractor and Active/Paused/Ended in both themes on desktop/mobile. Rollback is a presentation-code revert; no persistence change is involved.

Local verification: 376 Node tests, TypeScript checks, production build, and 22 desktop/mobile browser journeys passed in an isolated checkout; the applied workspace files matched that checkout. The browser regression reproduced the previous 9px/12px text and badge-geometry mismatch. Light/dark desktop and mobile screenshots were inspected using synthetic forms. Hosted rendering was not checked; the existing bundle-size warning remains. No deployment or remote data changes occurred.

### 2026-10-23 - Leaderboard rating-scale disclosure

Analytics keeps the rating-scale explanation behind a 13px Info icon beside the last color-legend label (Unsatisfactory for the shared percentage scale). The native disclosure supports click/tap and Enter/Space, closes on Escape or focus leaving, and bounds its explanation to the legend width for mobile. Category-specific rating text still comes from the existing canonical bands/range formatter; scores, filters and persistence are unchanged. Evidence: `src/pages/AnalyticsPage.tsx` and the compact legend browser journey in `tests/e2e/application.spec.ts`. Rollback is a presentation-code revert.

Verification: 376 Node tests, all four TypeScript projects, production build and 22 desktop/mobile browser journeys passed. Screenshots were inspected at both viewports; the new journey checks icon size/placement, initially hidden content, viewport bounds and keyboard dismissal/toggling. Dark-mode visuals and hosted rendering were not checked; the existing bundle-size warning remains. No push or deployment was performed.

### 2026-10-23 - Consistent Admin module headers

The Admin Shell matches the Partner directory's 22px/600 heading and 14px subtitle, with a 4px title-to-subtitle gap. `PageDescription` uses a Shell-provided portal target to place existing introductory copy below the title; outside that context it stays inline. Evaluation Workspace supplies its own header copy and keeps nested category explanations local. Header actions retain their existing handlers and wrap below the text on narrow screens. Dashboard and Employee layouts retain their existing presentation. Dark headings/subtitles use the shared theme tokens.

Evidence: `src/layouts/Shell.tsx`, `src/components/PageDescription.tsx`, `src/adminRedesign.css`, Evaluation Workspace, and the module-header browser journey in `tests/e2e/application.spec.ts`. Rollback is a revert of these presentation changes; no persistence or migration is involved.

Local verification: all 376 Node tests, TypeScript checks, production build, twenty desktop/mobile browser journeys, and Git diff whitespace checks passed. The header regression reproduced the previous Documents typography mismatch. Screenshots were inspected at desktop, small-laptop, and mobile widths with synthetic records, including dark mode. Hosted rendering was not checked; the existing bundle-size warning remains. No deployment or remote data changes were performed.

### 2026-10-23 - Notification and Feedback release review

Integrated `origin/regoris` at `53fd9db` into local `second-branch` by fast-forward, preserving the notification fixes, Feedback progress dialog and UI/UX agent rules. Both documentation additions were retained during stash restoration; the browser journeys merged without conflicts. The combined tree passed 376 Node tests, all four TypeScript projects, production build and 18 desktop/mobile browser journeys, including the Feedback dialog under the new desktop scale. The dependency audit reported zero vulnerabilities. The owner authorized committing and pushing this reviewed work to `second-branch`; the local pre-push hook reruns verification against the commit. No migration or deployment is included. Hosted delivery timing and dark-mode visual review remain unverified; the existing bundle-size warning remains.

### 2026-10-23 - Directory trailing-column spacing

The desktop Directory keeps Document health and partner actions at compact fixed widths in `src/adminRedesign.css`; partner names use the remaining space. The same sizing applies when archived partners add the Archived column, which reserves enough width for its date/time without touching Branch status. Existing mobile cards, row padding, actions, filters, and persistence are retained. The Directory E2E journey checks the visible health-to-action gap, action bounds, and archived-date separation at 1280px and 1920px before and after archiving. Its new spacing assertion reproduced the previous 232px wide-screen gap. Rollback is a stylesheet revert.

Local verification: 366 Node tests, TypeScript checks, production build, and the twelve-case browser suite passed. After the archived-date refinement, all seven focused presentation tests, the final build, and both Directory browser journeys passed. Screenshots were inspected at both desktop widths and mobile using synthetic records; hosted rendering was not checked. The existing bundle-size warning remains.

### 2026-10-23 - Compact desktop workspace scale

Desktop Admin and Employee workspaces above 800 CSS pixels use one document-level 90% scale in `src/styles.css`, matching the approved zoomed-out references while including body portals. Both shells compensate their minimum viewport height so short pages still fill the window; Admin consumes the shared height variable in `src/adminWorkspace.css`. Mobile, login, print, and manual browser zoom retain their existing behavior. No data, permissions, or persistence contracts changed. `tests/e2e/application.spec.ts` covers desktop/mobile scale, sidebar bounds, horizontal overflow, Admin archive-dialog dismissal, Employee navigation, and quick-guide bounds/dismissal using synthetic records. Rollback is a stylesheet revert.

Local verification: 366 Node tests, all four TypeScript projects, production build, and twelve desktop/mobile browser tests passed. The Employee scale regression failed against the previous build and passed after the shared rule was applied; both focused Employee cases also passed after screenshot stabilization. Rendered Admin/Employee screenshots were inspected at 1280px, 1024px, and mobile widths with synthetic records; live hosted rendering was not checked. The existing bundle-size warning remains.

### 2026-10-23 - Courier feedback progress dialog

Enhanced the ongoing-card popup used by Courier Satisfaction Survey through the existing shared `SurveyProgressModal`. The compact summary separates submitted evaluation counts from companies in scope instead of presenting submissions/company count as completion. Employee coverage remains based on the canonical completion summary; accessible tables and native progress indicators expose the existing employee/response data. Scores, eligibility, persistence and the Admin completion callback are unchanged. The header/footer stay visible around one scrollable details region; opening focus moves to the Close control after the shared modal lifecycle captures the trigger for restoration. The shared Feedback backdrop clears inherited tab spacing so direct pointer-down at the viewport edge dismisses correctly. The owner's restrained-color follow-up adds a pale brand-blue header and table-heading tint, a thin blue top accent and blue count/score values; these CSS rules are scoped to the progress dialog and blend existing theme tokens.

Evidence: `src/features/feedback-hub/components/SurveyProgressModal.tsx`, `src/feedbackHub.css`, the Feedback Hub presentation tests and the Courier card browser journey. Desktop/mobile baseline screenshots were captured; both baseline browser tests reproduced the backdrop edge defect. Verification: all 376 Node tests, all four TypeScript projects, production build and all 14 desktop/mobile E2E tests passed. Baseline and enhanced desktop/mobile screenshots were compared manually. The new journey checks viewport bounds, overflow, accessible employee coverage, records scrolling, focus restoration, Escape, inside pointer-down and direct backdrop dismissal without completing the survey. Empty and non-Admin states have component coverage. Dark-mode visuals and live hosted data were not checked; the existing bundle-size warning remains. Rollback is a code/CSS revert; no data migration, remote write or deployment is involved.

### 2026-10-23 - Form-specific evaluation reminders

The owner approved implementing the notification review. `evaluationProgress.ts` now supplies shared form-specific, countable-answer and stable-company-ID completion to reminders, employee pending lists, the form list/filler and Feedback Hub completion. It reuses `selectSurveyResponses`: ID-less legacy answers need unambiguous known-form question ownership and a unique company-name match; ambiguity never rewrites or deletes source data. Notification callers receive authorized forms and the full known-form list separately so inaccessible forms still prevent ambiguous legacy attribution.

Explicit successful Send/Resend persists optional `distributionId` and `lastDistributedAt` on the existing survey JSON record. Runtime validation requires both together. A revision renews unread identity only for pending work; ordinary edits retain metadata, and legacy forms retain old reminder IDs/read history. Single-form updates upsert only that form and update local state after persistence. No SQL migration or competing notification store is introduced. Code-revert rollback preserves stored evaluations and read-state records; old clients ignore optional distribution metadata but use old reminder identities.

The employee bell uses the signed-in profile and authorized forms, keeps read pending reminders visible, uses recorded dates, and keeps the header dropdown within the mobile viewport. Admin response logs no longer fabricate missing identities/departments. Admin unread counts derive from displayed notifications and persisted read IDs, including remotely loaded submissions. The existing shared subscription also reconciles forms on subscription/reconnect. Frequency settings are retained for compatibility, but UI/docs explicitly state scheduled dispatch is unavailable; no email, push, background dispatcher or polling was added.

Evidence: `src/features/evaluations/domain/evaluationProgress.ts`, `src/features/notifications/`, `src/pages/SurveyFormsPage.tsx`, `src/hooks/useSurveyData.ts`, `src/services/applicationRepository.ts`, and [review and proposal](NOTIFICATION_REVIEW_2026-10-23.md). Verification: all 374 Node tests, all four TypeScript projects, production build and all 12 desktop/mobile E2E tests passed. Browser coverage includes send/resend, rejected-write retry without local publication, employee read persistence and revision renewal, Admin read persistence for loaded submissions, and dropdown viewport bounds. The mobile bounds regression failed at x = -71 before the positioning fix; final desktop/mobile screenshots were inspected. No full automated screenshot comparison was run. The existing large-bundle warning remains; dependency audit was not rerun because dependencies did not change. Hosted RLS/publication, two-live-session timing and production delivery remain unverified; no remote records, migrations, push or deployment are authorized by this implementation task.

### 2026-10-23 - Earlier verification and browser regression coverage

`npm test` now discovers `.test.ts`, `.test.tsx`, and `.test.mjs` files under `src/`, `server/`, and `scripts/`, avoiding omissions from the former explicit package-script list. `test:unit` selects domain/utils; `test:integration` selects the remaining boundary, presentation, import, and tooling tests. A real Express HTTP integration test checks missing authentication, Employee rejection, malformed JSON, payload limits, and no-store errors. Playwright runs the built app and Express host with synthetic Supabase data on desktop/mobile Chromium: signed-out deep links, rejected passwords, role mismatch, and Directory filtering/archive dismissal/archive persistence. Test configuration clears server credentials and blocks external browser requests; this does not verify live Supabase, RLS, Microsoft, email, all critical journeys, or hosted behavior. Runtime application code is unchanged.

`npm run verify` runs TypeScript, Node tests, build, E2E, and dependency audit. `.github/workflows/verify.yml` uses the same gates with Node 22 and a clean install, retaining the existing application check name and secret scan. Failure-only browser diagnostics contain synthetic records. `.githooks/pre-push` is executable, uses LF endings, rejects dirty trees and outgoing commits other than HEAD, and propagates verification failures; `npm run hooks:install` enables it per checkout and has been run locally. CI remains authoritative because hooks are opt-in and bypassable. Hook behavior is tested in a disposable Git repository without network pushes. DOMPurify's existing transitive dependency was patched from 3.4.16 to 3.4.17 after the current audit reported critical/high advisories; the audit then reported zero vulnerabilities. See [README verification instructions](../../README.md#before-pushing).

Read-only GitHub evidence separates deployment and code failures: `regoris` at `bec4e6a` had successful Verify, secret scan, and Cloudflare checks, but Vercel reported **Deployment was blocked**. [The older failed Verify run](https://github.com/miguel100116/supplier_management_system/actions/runs/39536333373) failed its dependency-audit step. Vercel account/plan/author access remains unverified and unchanged; test changes cannot grant that access. No branch protection, remote data, deployment configuration, or commit author was changed. The owner separately authorized committing and pushing these testing changes to `second-branch` on 2026-10-23. Rollback is a code revert and `git config --local --unset core.hooksPath` to remove the checkout hook setting.

Local verification on 2026-10-23: `npm run verify` passed with 366 Node tests, eight desktop/mobile browser tests, all four TypeScript projects, production build, and zero audit vulnerabilities. All 69 previously listed test files remain covered; discovery finds 72 files (29 domain/utils and 43 remaining tests). Git diff checks passed. The existing bundle-size warning remains. Hosted CI, clean Linux installation, live integrations, and Vercel deployment have not been verified for these local changes.

### 2026-10-23 - UI branch integration

Integrated `ui-changes` at `176d205` with `second-branch` at `b0c6f87` on a temporary integration branch before advancing local `second-branch`. The package-script conflict retains both parents' tests, including the incremental-ranking, debounce, date-picker, and new Feedback Hub presentation tests. The latest evaluation synchronization, Dashboard/Analytics alignment, document-header offsets, and navigation colors are preserved. No dependencies, database schema, remote data, or deployment configuration changed.

The imported Directory UI combines active and archived partners, replaces separate status views with category tabs and document filters, fixes pagination at ten, and groups partner details into Overview, Branches & documents, and Performance. Active Companies can combine saved uploads and includes repository seed snapshots whose IDs are absent from stored history. These are behavior changes from the UI branch, not new integration rules. Evidence: `src/pages/PartnerCompaniesPage.tsx`, its presentation tests, and `src/features/active-companies/services/activeCompanySnapshotService.ts`.

Verification: all 363 tests, all four TypeScript projects, production build, and Git diff whitespace checks passed on the integration branch. The existing large-bundle warning remains. Browser inventory was empty, so rendered desktop/mobile and live authenticated interactions remain unverified. Rollback is a merge revert; `backup/second-branch-before-ui-20261023` preserves the original local target. No push or deployment is part of this local integration.

### 2026-10-22 - Reject stale evaluation refreshes

Local implementation: all evaluation state writes in `useSurveyData` now update the response ref and invalidate older refresh revisions synchronously. Initial hydration and background response refreshes check their captured revision after asynchronous loading/deduplication. Stale results never replace response state/cache; they request a full background reconciliation through the existing coalesced runner, without an added timer or polling. Delayed initial notification/cache work reads the latest response ref. The existing authoritative reconciliation still removes deleted records; no union merge, scoring/formula change, database migration, or new loading screen was introduced.

Regression coverage in `src/utils/coalescedTask.test.ts` exercises overlapping saves, edits, deletions, competing refreshes, cancellation, failed retries/recovery, and the hook's shared write/refresh boundaries. The current view stays visible while retrying; network/database latency still determines completion time. Live two-session timing and browser verification remain pending. No remote data, commit, push, or deployment was changed.

Verification: all 354 tests, all four TypeScript projects, production build, and final diff checks passed. The existing bundle-size warning remains. Rollback is a code revert; no data or schema rollback is required.

### 2026-10-22 - Dashboard, Analytics, and generated report alignment

Dashboard evaluation results and history-style widgets now receive `analyticsFilteredResponses`, the same access-scoped official response cohort used by Analytics and generated report summaries/rankings. This corrects Dashboard's prior inclusion of test records, omission of non-category filters, and coercion of Custom scope to Current. Operational completion/open-form/recent-submission inputs remain current-round records; raw audit exports retain their separate authorized raw-response input. The Dashboard period button is labeled Current Period; a selected Analytics custom date range remains identified as Custom date range. Dashboard category-average scores now use the shared two-decimal truncating formatter. Rubric weights, submission-average formulas, company-ranking formulas, and the separate legacy confidence-weighted widget computation were not changed.

Read-only Supabase-to-reference-CSV checks verified Current and All-Time counts and average normalized submission scores across Dashboard, Analytics, and report KPIs: Courier 30 / 83.69, Supplier 178 / 87.02, Subcontractor 65 / 78.41 (scores out of 100; Supplier CSV has 185 source rows, seven noncountable). These are category/submission averages, not individual company leaderboard scores. Company report classification blockers from the audit remain unresolved; no partner classifications or remote data were changed. Regression tests cover shared App wiring, Current/All-Time/Custom and archive-series scope, category/company/question/rating/search filters, blank/test exclusion, numeric zero, empty results, and score display. Evidence: `src/App.tsx`, `src/pages/DashboardPage.tsx`, and `src/pages/DashboardPage.test.tsx`. Browser rendering and deployed behavior remain unverified.

Verification: all 347 tests, all four TypeScript projects, production build, and final diff checks passed. The existing bundle-size warning remains. No deployment was performed.

### 2026-10-22 - Functional readiness audit

Read-only local/backend audit: 345 tests, all four TypeScript projects, production build, and dependency audit passed. All 7,822 inspected application records across 20 types passed runtime validation; anonymous application/profile reads and unauthenticated account creation were denied. Hosted `renew_partner_document` is visible through OpenAPI, superseding older claims that it is absent, but delegated writes and authenticated role/RLS behavior remain unverified. No browser was connected. Local Microsoft configuration is absent. Two scored companies reference Uncategorized partner records, blocking their category-specific reports; 37 of 39 company reports match Analytics. Source/stubbed checks also found the misleading Dashboard Custom label, unawaited PowerPoint export completion, and missing Admin quick-guide scroll wrapper. No shared data or application behavior was changed by the audit. See [the full audit](SYSTEM_FUNCTIONAL_AUDIT_2026-10-22.md) for provisional module ratings, evidence, fixes, and acceptance gaps. Local and deployed state are distinct.

### Owner instruction - meaning of "clean the DB" (2026-10-22)

Approved standing procedure: when the owner requests "clean the DB," perform the CSV-based duplicate/test-import cleanup described below. Use the evaluation CSVs in `reference-materials/source-data` as the comparison reference, verify the actual Supabase target, inspect current records and uploaded source contents, and save recoverable rows/files privately outside Git before deleting confirmed duplicate evaluations and redundant test/source uploads. Keep one canonical official source per category and preserve genuine evaluations, including new submissions beyond the reference CSV totals, legitimate archive periods, partners, forms, accounts, permissions, scoring, and unrelated records. The historical counts below are verification evidence, not deletion limits or a permanent allowlist. Do not infer duplication from filenames, labels, matching scores, or category counts alone; compare submission identity, completion dates, company, answers, and source contents, and preserve uncertain records. Verify retained records/files and Analytics counts/scores afterward and report the result. This request authorizes that bounded cleanup without an additional confirmation once the target and duplicate selection are verified; it does not authorize a database reset, schema changes, migrations, deployment, or deletion of all test records. Clarify only genuinely ambiguous targets or records.

### 2026-10-22 - CSV-based duplicate cleanup in Supabase

The owner authorized removing duplicate test data using `reference-materials/source-data` as the reference. The database was matched to the running localhost configuration before mutation. The three stored official CSVs match the repository CSVs after BOM/newline normalization. Removed six redundant source uploads (two identical older CSV copies and four Supplier workbooks whose rows match or are a subset of the Supplier CSV) and the older archived copy of 30 Courier evaluations (540 answer rows). The current Courier upload was retained, including its source remarks. Recovery rows, source bytes, checksums, and read-back evidence were saved privately outside Git before deletion.

Read-back verified 30 Courier, 185 Supplier, and 65 Subcontractor source evaluations remain. Analytics counts 30, 178, and 65 respectively; seven Supplier forms are noncountable under the existing answer rules. Courier All-Time no longer doubles the same 30 evaluations. Current company scores/rankings, every other response row, partner records, forms, and the remaining three CSV objects were preserved. Existing unrelated archived test submissions remain excluded from official Analytics. No scoring, provenance, schema, RLS, application code, or deployment was changed; the protected Vercel preview's database configuration was not independently verified.

Verification: exact before/after record comparisons, stored-file checksum checks, canonical Analytics count/ranking assertions, and the focused CSV import, provenance, ranking, and test-import regression tests passed.

### 2026-10-21 - Restore official Courier view after local testing

The owner explicitly authorized deleting the two test submissions used for the local check and restoring the latest archived official Courier batch. The running localhost project was matched before the operation; only those complete test groups were deleted and only the selected recent official batch had `archived` set to false. A recovery backup was saved outside Git before mutation. Read-back verified 540 restored answer rows, preserved answers/ownership, zero remaining targeted tests, and an official Current leaderboard of 30 evaluations across 7 companies. Older archives and unrelated tests were retained. No record provenance or scoring formula changed.

The temporary localhost test preview and its label were removed. Analytics again filters official records on every host; the Realtime implementation below remains. The data restoration was separately authorized after implementation and did not change publication, policies, schema or deployment. All 341 tests, all four TypeScript projects, production build and diff checks passed; the existing bundle-size warning remains.

### 2026-10-21 - Realtime Company Leaderboards (implemented locally; live verification pending)

Status: implementation authorized on 2026-10-21 by the owner's request to implement the previously saved Realtime plan. Remote migrations, pushes, merges, and deployment still require separate authorization. The agreed scope is preserved below; H1/H2 remains a proposal, not a new filter.

- Update Company Leaderboards automatically after an individual evaluation is successfully submitted and saved, and after evaluation imports finish. Aim for 1-2 seconds across authorized tabs/devices under a healthy connection; verify this live rather than assume it.
- Extend the existing shared Supabase Postgres Changes subscription on `application_records` (`record_type = survey_response`) for INSERT/UPDATE and supported DELETE handling. No polling, duplicate subscription, or restoration of the removed Company-wide Analytics API. Verify actual publication, RLS, event delivery, and DELETE/replica-identity behavior first.
- Preserve canonical scoring, weights, ranking/tiebreakers, two-decimal formatting, CSV identity deduplication, official-data provenance, and counting rules. Reuse `src/features/analytics/domain/analytics.ts`, `rankings.ts`, `src/features/evaluations/domain/scoring.ts`, and `src/features/evaluation-imports/services/rawEvaluationImport.ts`. All-N/A, blank-only, and metadata-only forms do not count; numeric zero and existing qualifying real answers retain their current meaning.
- Count only finished individual evaluations, not drafts/in-progress work. Survey-period Running/Completed status is a different lifecycle. Await successful persistence; establish reliable submission/import completion boundaries so other devices do not rank partial writes. Handle failures without false success or silently discarding historical imports. Imported missing-completion timestamps currently use fallbacks and need an explicit compatibility policy.
- Reconcile complete affected submissions, recompute affected companies using stable company IDs and existing formulas, then re-sort. Update other rows where displayed ranks shift; keep the page mounted and preserve filters, pagination, and unrelated row references where possible. Batch/debounce import events to avoid repeated intermediate renders.
- Apply the same authorized response scope and selected filters as a full reload. Account/permission changes must invalidate relevant cached state. Reconnect triggers a reconciliation refetch of missed changes, without polling. Clean up subscriptions and pending batches; reuse a small quiet connection indicator only when actually disconnected. Preserve current screen styling; no heavy rank animations.
- Verify submission/import INSERT/UPDATE/DELETE, all-N/A/metadata-only/zero answers, drafts, filter transitions, duplicate events/re-imports, partial failures, bulk batching, reconnect gaps, cleanup, unchanged formula results, and equality with full reload. Run repository tests, all TypeScript checks, and production build, plus a live two-session/device check before claiming the timing criterion.

Open product decision: **H1/H2 must mean either the stored "Period Covered" answer or the submission-date range; these can differ.** Current Analytics exposes Current/All-Time/Custom dates and archive series, not an independent H1/H2 coverage filter. Confirm the meaning before implementing new period behavior; do not invent it or silently change existing filters.

Pre-implementation findings (superseded where described below): drafts stay in browser storage; submission success precedes remote persistence; the existing shared subscriber batches changed-record refetches at 100 ms but response-array changes rebuild the full Analytics snapshot; reconnect clears the warning without a response reconciliation; bulk imports write multiple chunks. These observations do not establish the precise deployed cause of the manual-refresh symptom. The original planning pass changed no application code.

Implementation evidence (2026-10-21): the existing shared subscription now accepts INSERT/UPDATE/DELETE without a server-side filter that would exclude DELETE, ignores callbacks after disposal, and requests response reconciliation on subscription/reconnection. Versioned migrations publish `application_records`; its composite primary key contains the record type and row ID, so DELETE invalidation needs no payload or replica-identity expansion. Actual hosted publication and RLS were not inspected in this implementation pass. The response refresh batches events at 500 ms with a 1.5-second maximum delay, fetches whole affected submissions through RLS with capped-page handling, and retains unchanged row references. There is no polling or extra Analytics subscription.

Submission success awaits persistence, blocks duplicate submission/navigation while pending, and retains drafts on failure. Response upserts use one atomic PostgREST statement instead of concurrent chunks; raw imports publish after the save, and archive imports upsert only newly imported rows rather than replace the shared response store. Other record types keep bounded chunking. Existing missing-completion-date fallbacks for historical imports are retained; drafts remain local and are never published as submissions. Single-file raw imports reuse the batch workflow. Large batches are subject to the deployed API request/transaction limits; rejected writes surface errors and do not publish optimistic scores. Registry additions are saved separately and can remain after a failed evaluation import.

`incrementalRankings.ts` reuses the canonical stable-ID/legacy-name grouping, scoring, and ordering rules; only changed leaderboard company groups are scored again. React memoization preserves unaffected leaderboard rows, including score-neutral edits and out-of-filter events. Summary charts and peer-dependent analysis still reconcile from the authorized filtered response scope. Existing formulas, counting rules, official provenance, two-decimal truncation, CSV deduplication and pagination are unchanged. The separate Dashboard accuracy findings were not changed.

Verification: all 341 repository tests, all four TypeScript projects, production build and final diff checks passed. The existing large-bundle warning remains. Regression coverage includes INSERT/UPDATE/DELETE/replay, full-reload equality, stable IDs/renames/legacy ambiguity, metadata/all-N/A/remarks/zero forms, scope changes, batch/deadline/cleanup, capped submission reads, atomic write validation/rejection, reconnects and pending/failed submission behavior. Live two-session submission/import/reconnect checks, large-import deployment limits, desktop/mobile rendering, and the 1-2 second target remain unverified. No remote records, publication, RLS, migration, commit, push or deployment was changed. Rollback is a code revert; no schema/data migration is required.

### 2026-10-21 - Legacy Employee login compatibility

Read-only diagnosis first matched the deployed frontend's public Supabase project to the configured diagnostic project, then confirmed that the affected account had an existing Employee profile with a null `user_id`. No credentials, identities, or business rows were logged or changed. The 2026-10-20 explicit-login guard rejected this nullable legacy state after successful identity verification. The versioned `202609160002_application_persistence.sql` permits null links, and `202609300002_cache_startup_rls_helpers.sql` authorizes own-profile reads by JWT email.

`signInForRole` now accepts an existing Employee profile with an explicitly null link only after verifying a confirmed company Auth identity and an exact profile-email match. A non-null link must still match the Auth user ID; Admin profiles still require a matching link. No role is inferred, and no profile/password or database policy is changed. Missing profiles, invalid roles, missing link fields, mismatched emails/IDs, lookup failures, and wrong account-type selections still block login and clear the local session. New regression tests reproduce the prior rejection and verify compatibility and denied cases. Live password login remains unverified until deployment; this is a client compatibility fix with code-revert rollback.

Verification: the regression failed before the fix; all 37 focused tests and the full 326-test suite then passed, along with all four TypeScript projects, production build, and diff whitespace checks. The existing large-bundle warning remains. No UI layout changed. The fix targets second-branch; deployment and live authenticated verification remain pending.

### 2026-10-21 - Requested rollback of Company-wide Analytics

The owner requested undoing only the 2026-10-20 Company-wide Analytics work after the deployed API returned 404 and then 500. App again passes its authorized, official, scope-filtered loaded responses to AnalyticsPage. There is no aggregate fetch, account-wide preload, polling hook, Express Analytics endpoint, Vercel Analytics Function, or API-specific build. The pure local snapshot builder remains shared with rendering and CSV regression checks. Raw-response RLS, shared permissions, scoring, two-decimal formatting, CSV deduplication, reports, login, form distribution, and the Vite security patch are preserved. Lower-rank Analytics now reflects the existing permitted response scope, not company-wide totals. No remote data or database migration is involved.

Evidence: `src/App.tsx`, `src/pages/AnalyticsPage.tsx`, `src/features/analytics/domain/analyticsSnapshot.ts`, Analytics presentation and CSV regression tests, `server.ts`, `package.json`, and `vercel.json`. Live signed-in rendering remains unverified; browser inventory was empty. Rollback of this change is a code revert. Deployment remains a separate authorized action.

Local verification: 46 focused tests and the complete 319-test suite passed, along with all four TypeScript projects, the production build, and diff whitespace checks. API-only tests were removed with their deleted feature; local rendering tests verify supplied response rows and category filtering without an aggregate fetch. The existing large-bundle warning remains. The rollback targets second-branch; deployment and live authenticated verification remain pending.

### 2026-10-21 - Vite dependency audit patch

The merge verification audit reported high-severity launch-editor advisories against locked Vite 6.4.3. `package.json` now requires `vite: ^6.4.4`, and `package-lock.json` resolves 6.4.4 with its registry integrity hash. This is a patch within Vite 6; no audit exclusions or workflow changes were added. The [upstream advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm) identifies 6.4.4 as patched. A live `npm audit --audit-level=high` reports zero vulnerabilities. All 338 tests, all four TypeScript projects, the production build, and diff whitespace checks passed locally. Tests and build required execution outside the sandbox because subprocess creation was blocked with `spawn EPERM`. The existing large-bundle warning remains. Hosted verification still requires a pushed commit; no push, merge, or deployment was performed.

This document preserves durable engineering context for maintainers and coding agents. It is a map, not a substitute for reading the relevant code. Verify details before making consequential changes.

Analytics and generated reports display scores to exactly two decimal places, truncating extra digits without rounding up (89.999 becomes 89.99; 1.569 becomes 1.56). Shared rubric composites, section/peer results, question averages and trends retain full precision before display. Ratings compare unrounded scores: Subcontractor uses native 0 to 2 thresholds at 1.5, 1.0 and 0.5; Courier/Supplier keep 0 to 100 thresholds at 95, 89 and 80. Shared rating-range labels use exclusive upper bounds so fractional values have no gaps. Evidence: `src/utils/formatUnroundedNumber.ts`, `src/features/analytics/domain/rankings.ts`, `analytics.ts`, `src/features/evaluations/domain/scoring.ts`, and report data/export consumers. No database records or scoring weights were changed. Compare Analytics and reports within the same category, period and authorized data scope; Analytics and reports now use their authorized loaded response scope after the Company-wide Analytics rollback.

Verification for the two-decimal update (2026-10-20): all 338 tests, all four TypeScript projects, production build and diff whitespace checks passed. Tests cover truncation/binary/exponent edge cases, rating thresholds, reference CSV scores, and actual in-memory company PDFs for all three categories. Browser rendering and live client data remain unverified; no browser was connected. The existing large-bundle build warning remains. No remote records, migrations, commits or pushes were performed.

## Product intent

### Send Form Courier and Supplier Top 20 selection (2026-10-20)

Courier and Supplier forms show individual company-name checkboxes in Workspace > Send Form. Admins choose any nonempty subset of their category's Top 20 list; Select top 20 couriers/suppliers checks the entire list and can be refined by unchecking companies. Candidates reuse `getEvaluationLeaderboardTopTwenty`, the existing Manage Access preset: up to 20 active registered partners of that type in official evaluation confidence-weighted leaderboard order, then alphabetic unscored active partners fill remaining slots. This existing preset is distinct from the rubric score now displayed by the Analytics leaderboard; no ranking formula was changed for this selector. `requiresDistributionCompanySelection` centralizes which form types require this choice; Subcontractor retains its previous Send Form flow.

Checkboxes only prepare a draft. Confirm & Save Selection opens a final in-app approval popup showing the form/category, company count and eligible recipient count. Only Yes, proceed invokes the save callback; Go back, Escape or direct backdrop dismissal returns to the review without sending or losing the selection. The confirmation uses shared modal priority 90 above the review at 80; pending saves prevent dismissal and duplicate approval. Save errors appear within the popup and preserve the draft. Cancelling a changed selection uses the shared UnsavedChangesDialog instead of native browser confirmation. Approval atomically saves explicit `evaluationCompanyIds` alongside form availability through the existing awaited update callback, including for an already-running form. Courier and Supplier forms require at least one checked company; an untouched/null or empty selection cannot fall back to every registered company. New openings start unselected and keep stored assignments unchanged unless the Admin confirms a new choice. Selecting all currently available companies still saves explicit IDs, so future partners are not automatically included. Fewer than 20 available companies produces that smaller candidate list; none disables the action. Over-20, missing, archived, reclassified, wrong-category, or unsupported form selections fail before saving. Existing access, deadline and recipient checks remain. Cancellation, Escape and backdrop use the same guarded close callback; draft changes require discard confirmation. Saving failures leave the draft available for correction/retry. The confirmation panel can scroll within the viewport to accommodate the company and recipient lists. No form was actually distributed during implementation.

Evidence: `src/pages/SurveyFormsPage.tsx`, `src/features/evaluations/components/SendFormCompanySelection.tsx`, `src/features/evaluations/domain/formDistribution.ts`, existing `leaderboardSelection.ts`, `SendFormConfirmation.tsx`, and modal interaction tests in `src/components/UnsavedChangesDialog.test.tsx` alongside tests in `formRecipients.test.ts` / `SurveyFormsPage.test.tsx`. No migration or data cleanup is required. No browser was connected for desktop/mobile visual or real interaction verification.

The focused checkbox and selection tests cover individual checking/unchecking, refining the select-all preset, exact employee company scope, mandatory nonempty Courier/Supplier selection, cross-category rejection, busy/empty states, and the shared confirmation/dismissal wiring. No form was sent, and no remote data, commit, push, or deployment was performed.

Verification after the Courier extension: all 334 tests, all four TypeScript projects, production build, and diff whitespace checks passed. The updated localhost company selector module returned HTTP 200. The existing large-bundle warning remains; real browser interaction and desktop/mobile rendering remain unverified.

### Generated report content checks (2026-10-20)

Generate Report now uses its authorized official ranking cohort for summary totals, survey averages, question tables, and report builders; Raw Data Export retains its original raw input. This prevents official leaderboard rows and test-inclusive report totals from appearing in the same generated report. No access boundary is expanded. Company preview scoring, questions, comments, and trends use the same stable-ID selection as exports, so historical names and same-name partners in other categories do not change report ownership. The standalone builder explicitly includes archived rows already present in the selected input scope; Feedback Hub and existing callers retain the current-only default through `includeArchived=false`.

New executive reports start with blank custom notes instead of invented claims about Courier consistency and Subcontractor documentation. Explicit saved/client notes are preserved. Automated recommendations require numeric scored data, ignore unscored/absent categories, and describe the current average without claiming a historical drop. Question and detailed executive reports list only companies with real answered evaluations, resolving saved company IDs to current names. A single scored company is no longer omitted by the quick ranking export's split calculation. Scoring formulas and client-entered business records are unchanged.

Evidence: `src/pages/ReportsPage.tsx`, company/executive/question report builders, `src/features/reports/domain/reportContent.ts`, and `src/features/feedback-hub/reporting/companyReportData.ts`. Regression tests first reproduced fabricated empty-report findings, registry-only evaluated partners, and archived export omissions. The full 324-test suite passed; expanded CSV assertions then verified scores, counts, formatted values, and bands for all 39 scored reference companies. Actual in-memory PDFs for all three categories passed company/period/score/rating text assertions in `exportDependencies.test.ts`. TypeScript checking, production build, and diff whitespace checks passed. No live client records, downloaded document visual layout, or browser interaction was verified. No database changes, commits, pushes, or deployment were performed.

### Analytics CSV identity and report agreement (2026-10-20)

Local reference checks found 30 Courier, 185 Supplier, and 65 Subcontractor source submissions with unique IDs. Existing answered-item rules count 30, 178, and 65 respectively; the Subcontractor leaderboard contains 64 scored submissions because one countable submission has remarks without a numeric score. These are reference baselines, not caps: additional client evaluations must remain intact. Live client records were not inspected.

The original normalized import uses deterministic UUID v5 submission IDs, while UI re-uploads use `IMPORT-{TYPE}-{source ID}`. Both copies previously survived ID-only replacement. `createImportedResponseFilter` now recognizes that exact identity relationship and prefers the UI copy only when company, submission timestamp, respondent email, form, archive state, and series agree. It does not merge distinct source IDs, new live evaluations, different timestamps/respondents, test records, or separate reporting periods. The filter runs in the protected Analytics API, client hydration/realtime merge, and local import projection. Original database rows remain stored; no deletion or migration is performed. Import rollback restores locally hidden originals if saving fails.

Generated company, summary, and executive reports now share Analytics score formatting and rating bands; company report preview/export uses the Analytics rubric score instead of the separate confidence-weighted `getLeaderboard` value. Subcontractor uses two decimal places without rounding up on the native 0–2 scale and Top/Good/Marginal/Poor Performer bands, including the PDF rating legend. The leaderboard's existing arithmetic is preserved. Labels now describe Rubric Score / Leaderboard Score. Report filters and scope still apply: compare the same category, period, companies, and authorized data set. Existing lower-role raw-response RLS remains unchanged; the company-wide aggregate API was subsequently removed.

Evidence: `src/features/evaluation-imports/services/importedResponseIdentity.ts`, `src/hooks/useSurveyData.ts`, `server/analytics.ts`, `src/features/analytics/domain/rankings.ts`, `src/features/feedback-hub/reporting/companyReportData.ts`, and report pages/exporter. Reference-CSV regression tests in `scripts/supabase-import/importPlan.test.ts` reproduce doubled UUID/UI counts and verify deduplicated scores; service/API tests cover new client evaluations and report agreement. No browser or live database reconciliation was available.

Verification: all 318 tests, all four TypeScript projects, production build, and diff whitespace checks passed. Final built report text was checked after correcting a local text-encoding issue; the existing large-bundle warning remains. The CSV files were unchanged. No remote data mutation, migration, commit, push, or deployment was performed. Timestamp mismatches are conservatively retained rather than guessed to be duplicates; live counts still need a same-scope check against the client's current records.

### Login audience headings (2026-10-20)

The login page has an Admin / Employee switch, defaulting to Employee. Admin displays Vendor Management System; Employee displays Vendor Performance Evaluation in both responsive hero headings. Explicit sign-in now requires the selected type to match the confirmed Supabase user's persisted `app_profiles` role. A mismatch, missing or conflicting profile, invalid identity, or lookup failure blocks entry and signs out the new local Supabase session. App suppresses auth-driven session adoption during the attempt, preventing credential acceptance from bypassing role validation. Password login, configured Microsoft login, and immediately authenticated staging signup use the same gate; signup requiring confirmation stays on login. Account-type and competing authentication buttons are disabled while submitting. The selector never changes stored roles or RLS permissions; existing valid-session restoration and password recovery remain separate flows.

Evidence: `src/pages/LoginPage.tsx`, `src/services/authBridge.ts`, `src/App.tsx`, runtime service tests in `src/services/supabasePasswordAuth.test.ts`, and the UI/source-contract regression in `src/layouts/Shell.test.ts`. No migration or remote record change is required. No browser was connected for desktop/mobile visual or click verification. Existing accounts require a valid persisted profile; the 2026-10-21 compatibility fix accepts exact-email Employee profiles with an explicitly null link, while Admins and non-null links still require the matching Auth user ID. No fallback role is inferred.

Verification: all 311 tests, all four TypeScript projects, production build, and diff whitespace checks passed. The existing large-bundle warning remains. Live sign-in and Microsoft tenant configuration were not verified. The legacy `supabase/seed_admins.sql` writes `accounts`, not the required `app_profiles`; README now states that distinction. No commit, push, deployment, or migration was performed.

### Azure migration request (2026-10-20; preparation only)

The owner requested replacing the live database/hosting with Azure using their personal Azure account, free services only, and Microsoft SSO restricted to company `@mgenesis.com` users. [AZURE_MIGRATION.md](AZURE_MIGRATION.md) records the proposed boundaries, free-tier constraints, acceptance criteria, and rollback. Azure access, company tenant consent, live-source identity, quota fit, and archive storage remain unverified; the current Supabase implementation remains authoritative until a validated cutover.

The Supplier Management System is an internal application for evaluating and managing Couriers, Suppliers, and Subcontractors. It covers surveys, analytics, rankings, compliance documents, imports, report generation, feedback delivery, account access, and archiving.

Canonical product documentation:

- `README.md` — product scope, architecture, modules, setup, and known issues.
- `SYSTEM_TURNOVER.md` — operational handoff and current implementation status.
- `docs/Admin_Manual.docx` and `docs/Employee_Manual.docx` — role-specific user manuals.

## Verified system map

### Feature directory organization (2026-10-19)

Verified: 52 existing files were relocated into their owning feature modules, including analytics panels, evaluation/scoring helpers, Feedback Hub components and types, notification state, report exporters, presentation generation, archive transfer, and partner/compliance helpers. Imports, the import CLI dependency, package test paths, and source-file test references use the new locations. Executable code, JSX, styles, storage keys, and database contracts are preserved. Shared pages, controls, hooks, authentication, and application persistence retain their existing ownership. See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the current directory and module map. This is a file-organization pass; splitting large mixed-responsibility modules remains separate work.

Verification on 2026-10-19: all 241 tests passed before and after the moves; TypeScript checks and the production build passed. A comparison of 265 source files confirmed equivalent executable syntax and JSX after normalizing relocated references, and compiled CSS matched the baseline byte for byte. Browser comparison was unavailable because the browser automation tool failed to initialize.

### Reference material organization (2026-10-19)

The root `reference-materials/` folder now contains seven legacy utilities in `scripts/`, seven extracted text/JSON files in `extracted/`, and the four reviewed CSVs in `source-data/`. Existing material was moved without regenerating the data. The normalized import planner and active-company seed test use the new CSV directory; original source filenames, reviewed hashes, and import identities are retained. The importer also accepts a direct CSV directory through its existing project-root parameter. Legacy utilities are still run from the repository root, with output/question paths pointing into `reference-materials/extracted/`. See [the reference README](../../reference-materials/README.md) for utility side effects and current paths. No import, source patching, or API extraction is performed by the folder moves.

Verification: all 243 tests, TypeScript checks, and the production build passed after grouping the reference material. Tests include equivalent import plans for repository/direct CSV directories and patcher execution against synthetic files in a disposable workspace. All seven legacy utilities passed syntax checks; every moved data file retained its exact bytes.

### Runtime

- React 18 and TypeScript frontend built with Vite 6.
- Tailwind CSS for styling and Recharts for analytics visuals.
- Thin Express host in `server.ts` for Vite development middleware, runtime public configuration, health checks, and production static serving.
- Client navigation maps `PageKey` values through `src/utils/pageRouting.ts` to stable canonical paths while accepting legacy route aliases. Admin sidebar labels were shortened on 2026-10-19: Partners (Directory, Documents, Feedback), Evaluations (Workspace, Archive, Import Responses), Reports (Reports, Present; Generate/History tabs within Reports), and Users. Labels are independent of the existing URLs and access permissions. Direct paths and browser Back/Forward use the History API; selected survey IDs are carried in query parameters. `server.ts` and Vite already provide the SPA fallback. Browser Back and same-page survey switches during an in-progress evaluation keep the draft warning and restore the current state if the respondent cancels.
- Vercel static SPA deployments use the root `vercel.json` rewrite to serve `index.html` for frontend paths on direct requests and refreshes; `/api/*` is excluded and requires its own configured API host.
- `server/index.js` is a second, overlapping server implementation and should be treated as legacy until its consumers are verified.
- Main commands are declared in `package.json`: `dev`, `build`, `start`, `preview`, and `lint`.
- Evaluation form headings/actions use Create Evaluation Form, Edit Evaluation Form, Evaluation Details, and Fill Out Evaluation Survey as of 2026-10-19; selected form headings prefix the saved title with Evaluation. The company report builder's display title is Partners Report Builder. The company-picker preset displays Active Partners while retaining its existing `active-companies` stored value and selection behavior.
- Modal lifecycle behavior is centralized in `src/hooks/useModalEscape.ts`: dialogs register Escape handling, backdrop dismissal, nested priority, scroll lock, and focus restoration there. Escape and direct backdrop pointer-downs invoke the same request-close callback for every modal; dirty editors use guarded callbacks, confirmation dialogs only dismiss, and pointer-downs inside dialog content do not close it. New modal implementations must use this hook.

### External boundaries

- Supabase email/password authentication is active for staging. Microsoft Entra ID code remains present but is unavailable without Azure tenant access.
- Microsoft Graph delegated email sending.
- Supabase client, canonical application repository, SQL migrations, seed administration, Realtime invalidation, and row-level-security policies.
- Supabase CLI local configuration is initialized in `supabase/config.toml` and linked to the dedicated `supplier-management-staging` project (`adxwaxhnqxpmgjvsxgug`). The additive normalized migration and reviewed data import were applied there on 2026-09-16. Remote lint passed; repeat import and reconciliation preserved the expected counts with zero duplicates and zero broken relationships. A 2026-09-18 read-only audit confirmed that all four repository CSV hashes, normalized counts, imported company identities, and imported response values match staging and its UI-facing application records; 86 later non-CSV response rows remain preserved. On 2026-09-21 the shared-state and consolidated-RLS migrations were applied without changing imported row counts; `application_records` and `app_profiles` are now in the Realtime publication. Production remains untouched.
- CSV/XLSX imports and PDF, PPTX, Word, CSV, and spreadsheet exports.

### Current persistence model

- Authenticated staging users load and save profiles, permissions, surveys, Partner Companies/documents, responses, archives, category labels, Feedback Hub data, notification/reminder configuration, compliance snapshots, ranking/activity/modification/export history, and employee notification state through Supabase.
- Imported normalized tables remain the immutable source/audit layer. `app_profiles` and per-entity `application_records` are the canonical editable frontend store.
- Analytics provenance is explicit as of 2026-09-22: client CSV rows use `dataSource=client_csv`, approved live form submissions use `production_submission`, and staging form submissions use `test_submission`. Official Analytics includes only the first two. Legacy normalized/default-form and UI-import IDs are recognized as client data; legacy pre-production `RESP-*` rows remain stored but are classified as test data. `VITE_DEPLOYMENT_ENV` defaults to staging and must be set to production only for the approved live deployment.
- Browser `localStorage` remains an authenticated startup cache and stores intentionally device-specific drafts/preferences. Eligible historical browser records are uploaded once when the remote set is empty; remote empty sets are authoritative after migration.
- Supabase Realtime events invalidate the relevant client store and cause an RLS-protected refetch; event payloads are not trusted as application data.
- Application-record reads select explicit columns and use ordered 1,000-row ranges. Later pages are discovered in bounded batches of six to avoid exact-count scans under response RLS. Realtime listens only to UI-consumed record types; a changed response row is re-read by ID and merged through the same RLS boundary, while bulk/local invalidations and profile changes trigger full refreshes. Migration `202610070001_optimize_application_response_reads.sql` adds partial indexes for response visibility branches and evaluates stable RLS helpers per statement; it must be applied to each target environment before those database optimizations take effect.

### Authorization

- UI access is derived from role, designation, department, and overrides.
- Supabase password identity and session restoration are integrated in the frontend; localStorage is not trusted as identity when Supabase is configured.
- The applied database schema enables RLS. Shared reference records are readable by confirmed `@mgenesis.com` users; configuration/registry writes are role-restricted; users may insert only their own evaluations and permitted operational records; response reads are scoped by role, department, or ownership. Security-definer authorization helpers live in the unexposed `private` schema, and policy checks are consolidated to one policy per operation.
- `supabase/schema.sql` currently contains clearly labeled temporary anonymous response policies. They are a production blocker if enabled.

## Current repository health

Verified on 2026-09-21:

- Verification correction (2026-10-06): root `tsc --noEmit` does not traverse frontend project references. `npm run lint` now explicitly checks the frontend, Vite configuration, scripts, and Express server projects. The 13 frontend type errors were corrected without changing the UI or the ES2020 target. ESLint is not configured.
- Testing correction (2026-10-23): discovered Node tests cover focused domain, persistence-contract, import, mapping, authorization, HTTP, and presentation checks; Playwright adds a bounded desktop/mobile suite with synthetic backend responses. Coverage is not repository-wide; live integrations remain unverified. Use current command output for exact counts.
- CI correction (2026-10-06): `.github/workflows/verify.yml` runs on pushes and pull requests with Node 22, `npm ci`, explicit TypeScript checks, tests, a production build, dependency auditing, a separate secret scan, and build-artifact upload.
- Secret-scan permission correction (2026-10-20): [PR #49's failed run](https://github.com/miguel100116/supplier_management_system/actions/runs/39356209026) loaded the pinned action but failed in Gitleaks `ScanPullRequest` with HTTP 403 (`Resource not accessible by integration`) before scanning. The private repository's secret-scan job now declares `contents: read` and `pull-requests: read` so Gitleaks can list PR commits; other jobs retain the workflow's read-only contents permission. The action pin and scan settings are unchanged. Local tests, TypeScript checks, and build pass; a hosted rerun remains unverified. The configured Git remote still names the previous repository; authenticated API checks found the matching current commit under `miguel100116/supplier_management_system`.
- The TypeScript source under `src/` is roughly 65,000 lines across about 100 files.
- Major concentration points include `src/hooks/useSurveyData.ts`, `src/App.tsx`, several page components above 1,000 lines, and a very large generated/static partner seed file.
- `.vite/` cache files are tracked despite being generated artifacts.
- Historical extraction scripts, generated text/JSON, reviewed CSV sources, original screenshots, and the project charter are grouped under `reference-materials/`. Screenshot readers use `reference-materials/source-data/screenshots/`; the existing corrupted charter is preserved at `reference-materials/source-data/EFAS_Project_Charter.docx`.
- The working tree contained pre-existing uncommitted application and configuration changes when these agent rules were added. Every task must refresh `git status` and preserve unrelated work.

## Architectural pressure points

1. **Migration completion** — production still requires an explicitly authorized migration/deployment and post-cutover reconciliation; staging alone is not production proof.
2. **Large orchestration units** — central hooks and pages mix state, business rules, persistence, and presentation, increasing regression risk.
3. **Business-rule duplication** — scoring, RBAC, filtering, reporting, and status rules need canonical domain modules.
4. **Boundary validation** — CSV/XLSX, browser storage, auth claims, Supabase rows, and API responses require runtime validation.
5. **Delivery confidence** — CI and focused automated tests exist, but live integration coverage and full critical-journey coverage remain incomplete.
6. **Repository hygiene** — generated artifacts, large data files, and duplicate server entry points obscure the deployable product.

## Target direction

These are engineering guidelines, not a completed design decision:

- Move incrementally toward feature-oriented modules under `src/features/`.
- Keep pure domain rules independent of React and infrastructure.
- Put external systems and browser APIs behind typed adapters.
- Keep Supabase as the single durable source for shared data and restrict browser persistence to cache/device-only state.
- Establish a test pyramid using a TypeScript-compatible unit/component runner plus a small end-to-end suite.
- Establish pull-request CI with clean install, type check, lint, tests, production build, and security checks.
- Remove generated caches and sensitive/business exports from source control, with curated anonymized fixtures where tests require data.

## Modernization sequence

Use small vertical slices; preserve working behavior throughout.

1. Establish baseline tests around scoring, RBAC, imports, compliance dates, and the most critical user journeys.
2. Add reproducible quality scripts and pull-request CI.
3. Define typed repository interfaces around current persistence and external services.
4. Extract pure domain logic from `useSurveyData`, `App.tsx`, and large pages behind characterization tests.
5. Move one feature at a time into feature modules, keeping public APIs small.
6. Migrate to one backend source of truth with tested data migration and rollback.
7. Harden RLS, remove temporary anonymous access, and validate authorization at the data boundary.
8. Consolidate the server entry point and clean generated or obsolete repository artifacts.

This order may change when product risk or user priorities justify it. Record an approved change below.

## Decision log

Use short entries with this shape:

```text
YYYY-MM-DD — Decision title
Status: proposed | accepted | superseded
Context: why a decision was needed
Decision: the chosen direction
Consequences: tradeoffs and follow-up work
Evidence: links to code, issue, PR, or ADR
```

### 2026-09-10 — Repository-wide agent operating agreement

Status: accepted

Context: The project needs consistent agent behavior for safe refactoring, modular design, testing, CI/CD, security, and durable context retention.

Decision: Use the root `AGENTS.md` as the authoritative repository rule set and this document as maintained project memory.

Consequences: Agents must follow the engineering loop, preserve unrelated work, verify changes proportionately, and keep this document current when durable project facts change.

Evidence: `AGENTS.md`

### 2026-09-10 — Preserve the existing UI during modular refactoring

Status: accepted

Context: Modularization is intended to improve internal maintainability without changing the established user experience.

Decision: Refactoring tasks must preserve the rendered UI and interaction behavior. Any redesign or visible change requires separate, explicit user authorization and visual verification.

Consequences: Agents should baseline relevant desktop and mobile states before UI-adjacent refactors, retain existing markup and styling where practical, and report the visual comparison performed.

Evidence: `AGENTS.md`, section "Refactoring rules"

### 2026-09-11 - Canonical Feedback Hub company-report boundary

Status: accepted

Context: Feedback Hub PDF generation previously selected companies by display name and assembled report data in multiple UI paths, which could mix companies or survey templates.

Decision: Use `src/features/feedback-hub/reporting/` as the typed source for survey-template mapping, company-ID resolution, response scoping, category metrics, rating bands, and report DTO construction. New response and queued-report records retain both survey and company IDs; ambiguous legacy name-only rows must stop report generation.

Consequences: Preview, print, queue, revision, and bulk generation share one report-data contract. The Word files remain visual references only; generated PDFs use current application data. Any future template or scoring change should update this module and its focused tests.

Evidence: `src/features/feedback-hub/reporting/`, `src/features/reports/services/companyReportExport.ts`, `src/features/feedback-hub/reporting/companyReportData.test.ts`

### 2026-09-15 - Additive normalized CSV import boundary

Status: accepted for local preparation; not applied to Supabase

Context: The four production CSV files and the accessible live PostgREST schema do not fit the legacy one-table response mirror or the stale draft schema without losing Master List document fields and canonical question relationships.

Decision: Keep the live `suppliers` and `survey_responses` tables untouched. Prepare additive normalized company, branch, document, form, question, submission, and answer tables in `supabase/migrations/202609150001_normalized_business_data.sql`. Import through deterministic IDs and UPSERTs, with a mandatory dry run and human-reviewed resolutions for unresolved company names. A reviewed resolution may target an existing Master List BP Code or preserve a genuinely distinct evaluation-only company without inventing a BP Code.

Consequences: The import is repeatable and preserves raw source values alongside parsed fields. The reviewed local resolution file is ignored by Git and produces a zero-blocker dry run. The normalized schema is present only in the dedicated staging project; no production database or UI source-of-truth change occurs until staging import and reconciliation are completed and followed by authenticated RLS policies and application service cutover.

Evidence: `scripts/supabase-import/`, `supabase/verification/normalized_import_checks.sql`, `docs/engineering/SUPABASE_NORMALIZED_IMPORT.md`

### 2026-09-16 - Supabase password-auth staging connection

Status: accepted for staging

Context: The team cannot access the Microsoft Azure tenant, so Entra authentication cannot be completed. The application also contained a local environment configuration that pointed to production and placed a service-role credential in a browser-facing variable.

Decision: Use Supabase email/password authentication for staging, restricted to `@mgenesis.com`. Point the local browser build to the dedicated staging project through an ignored `.env.local` containing only the staging publishable key. Grant authenticated read-only RLS access to normalized company/form reference tables and load Partner Companies through a typed adapter. Keep raw evaluators, submissions, answers, and all backend write paths locked pending role and write-policy design.

Consequences: Staging login and Partner Company reads no longer depend on Azure. The former demo login was removed on 2026-09-18. Shared feature state now persists through the staging application repository, while Microsoft Graph mail remains unavailable without Azure configuration. The production service-role credential found in `.env` must be rotated; it is not present in the generated staging build.

Evidence: `src/services/supabasePasswordAuth.ts`, `src/services/normalizedPartnerCompanies.ts`, `supabase/migrations/202609160001_staging_email_auth_read_access.sql`

### 2026-09-16 - Canonical editable application records in staging

Status: accepted for staging

Context: Partner edits, evaluation submissions, surveys, profiles, permissions, archives, and category changes were still browser-local after the initial read-only connection.

Decision: Keep normalized import tables immutable and seed a per-entity `application_records` store for the frontend contract. Store account authorization in `app_profiles`. Use Supabase as the authenticated source of truth with local storage only as an authenticated cache. Enforce profile-scoped response reads, own-submission inserts, and Admin-only shared registry/configuration writes through RLS.

Consequences: The main shared business modules, Feedback Hub records, and document-notification rules now persist across devices in staging. Device drafts/preferences and lightweight audit/export logs remain local. A confirmed user must exist before authenticated writes can be tested, and an approved profile must be promoted to Admin before shared registry/configuration edits can succeed.

Evidence: `src/services/applicationRepository.ts`, `src/hooks/useSurveyData.ts`, `src/App.tsx`, `src/features/feedback-hub/services/feedbackHubStore.ts`, `src/features/notifications/services/documentNotificationSettings.ts`, `supabase/migrations/202609160002_application_persistence.sql`, `supabase/migrations/202609160003_secondary_shared_modules.sql`, `supabase/verification/application_persistence_checks.sql`

### 2026-09-17 - Canonical Document Tracker labels at the application boundary

Status: accepted for staging

Context: The normalized import intentionally stores stable source keys such as `local.business_permit`, while Document Tracker reads human-readable labels such as `Business Permit`. The editable application seed copied source keys verbatim, so populated database documents rendered as missing without producing an error. Local and Foreign source blocks also share labels such as `AFS` and must be resolved by branch category.

Decision: Keep stable dotted keys in the immutable normalized tables. Map them to Document Tracker labels in `normalizedPartnerCompanies.ts`, select only the category-applicable Local or Foreign block, and store canonical labels in editable `partner_company` application records. The staging migrations preserve later canonical edits and correct only values proven to match the non-applicable source block.

Consequences: Authenticated Document Tracker views now resolve imported document values and expiry dates. Future normalized adapters must use the same mapping boundary; new source document keys require a mapping entry and a regression test.

Evidence: `src/services/normalizedPartnerCompanies.ts`, `src/services/normalizedPartnerCompanies.test.ts`, `supabase/migrations/202609170001_document_tracker_key_mapping.sql`, `supabase/migrations/202609170002_document_tracker_category_collision_fix.sql`

### 2026-09-17 - Per-user notification read state

Status: accepted; applied to staging on 2026-09-18

Context: Admin notification read/unread choices existed only in React memory. Logging out and back in regenerated document alerts and marked them unread again, so the badge returned even after "Mark all as read."

Decision: Persist a bounded, timestamped set of read notification IDs per authenticated user as an owner-scoped `notification_read_state` application record. Retain the same record in local storage as an authenticated cache, choose the newest valid copy during login, and serialize remote writes so rapid read/unread actions cannot arrive out of order.

Consequences: Read state survives same-browser sessions and synchronizes across authenticated staging devices. Notification content remains derived from response and document records; no notifications are duplicated into the state record. The linked migration history confirmed `202609170003` locally and remotely after the push.

Evidence: `src/features/notifications/domain/notificationReadState.ts`, `src/services/applicationRepository.ts`, `src/hooks/useSurveyData.ts`, `supabase/migrations/202609170003_notification_read_state.sql`

### 2026-09-18 - Inactivity-based session logout

Status: accepted

Context: Manual logout correctly cleared the local identity and signed out Supabase and Microsoft sessions, but an unattended authenticated browser remained usable until the provider session ended.

Decision: Apply an account-specific 30-minute inactivity limit in the application, show a five-minute accessible warning, and synchronize activity timestamps across browser tabs. Reuse the existing provider logout path when the limit expires; do not store tokens or credentials in the idle-session state.

Consequences: Authenticated sessions now close after inactivity, while active work in any open tab refreshes the deadline. Supabase token expiry and database RLS remain the authoritative authentication and authorization boundaries.

Evidence: `src/hooks/useIdleSessionTimeout.ts`, `src/utils/sessionTimeout.ts`, `src/utils/sessionTimeout.test.ts`, `src/App.tsx`

### 2026-09-18 - Remove frontend mock business data

Status: accepted

Context: The frontend still contained quick-login identities, a placeholder employee roster, a bundled Partner Company snapshot, generated evaluation responses, simulated time, sample Feedback Hub contacts, and email paths that could display a successful send without calling Microsoft Graph.

Decision: Remove the demo authentication and Database Simulator paths, generated response and bundled company datasets, simulated clock, placeholder data service, and sample Feedback Hub contacts. Keep the real survey templates and authenticated local cache. Require a real authentication provider, hydrate shared business records from Supabase, and never mark an email sent unless Microsoft Graph reports success.

Consequences: A new browser no longer invents companies, accounts, evaluations, contacts, dates, or delivery results. Without configured authentication the app remains at the login screen. Clearing the local cache rehydrates shared records after the next authenticated load; CSV import/audit tables and staging application records are unchanged.

Evidence: `src/App.tsx`, `src/pages/LoginPage.tsx`, `src/hooks/useSurveyData.ts`, `src/features/feedback-hub/services/feedbackHubStore.ts`, `src/pages/PartnersFeedbackHubPage.tsx`, `.env.example`

### 2026-09-21 - Complete shared-state cutover and Realtime invalidation

Status: accepted and applied to staging

Context: Several operational stores still wrote only to browser storage, category labels could diverge between cache and remote data, empty remote sets were not always treated as authoritative, and clients did not learn about writes made by another session.

Decision: Persist all shared business/configuration/history state in typed `application_records`; retain local storage only as an authenticated cache or for device-only state. Migrate eligible legacy cache records once when the remote set is empty. Publish the two canonical application tables to Realtime and refetch through RLS on change. Consolidate RLS to one policy per operation and move security-definer authorization helpers to the unexposed `private` schema. Supply public Supabase runtime configuration through the Express `/api/config` endpoint when available.

Consequences: Staging sessions converge on Supabase values across devices, including operational histories and notification settings. An empty remote set can clear stale cache data. Realtime messages are invalidation signals rather than trusted record payloads. The two migrations preserved normalized and application record counts. The remaining Supabase security advisor item is leaked-password protection, a hosted Auth option requiring Pro or above. Production was not changed.

Evidence: `src/services/applicationRepository.ts`, `src/services/sharedStoreHydration.ts`, `src/hooks/useSurveyData.ts`, `src/App.tsx`, `server.ts`, `supabase/migrations/20260921011822_centralize_shared_state.sql`, `supabase/migrations/20260921013124_consolidate_application_rls.sql`

### 2026-09-22 - Shared module back navigation

Status: accepted

Context: Detail, create, edit, and form-filling views previously inferred navigation history after rendering, so a Back action could lose its origin and fall through to Dashboard.

Decision: Route module changes through one in-memory navigation boundary in `App.tsx`. Page-level Back and Cancel controls use the same history and explicit survey-module fallback where required. Internal wizard-step controls remain local to their current module.

Consequences: Back returns users to the immediately preceding module instead of Dashboard. Navigation history is session-local and deliberately resets at login or an authorization redirect.

Evidence: `src/App.tsx`

### 2026-09-22 - Shared operational table filters

Status: accepted

Context: Operational tables used unrelated search and sort controls, and several had no alphabetical or date filtering. Document expiration is meaningful only where compliance documents exist.

Decision: Use `TableFilterBar` and the pure helpers in `tableFilters.ts` for operational listing tables. Each table exposes only fields present in its data: alphabetical and date sorting/date ranges where applicable, plus document-expiration states in Partner Companies. Document Tracker retains its more detailed field/condition/value filter builder, including document status and days-left conditions. Generated report previews, survey rating matrices, and fixed ranking-slot grids are not treated as filterable record lists.

Consequences: Table controls now share responsive styling, reset behavior, local-date range semantics, and result counts without inventing expiration filters for tables that do not contain document data.

Evidence: `src/components/TableFilterBar.tsx`, `src/utils/tableFilters.ts`, operational table consumers under `src/pages/` and `src/features/feedback-hub/components/`

### 2026-09-22 - Analytics ranking consistency boundary

Status: accepted

Context: Analytics ranking logic was duplicated in the page, and the best/least-performing chart could sort by one value while displaying another. The ranking-mode behavior documented in this historical entry was superseded on 2026-10-09.

Decision: Keep company-ranking preparation in `src/features/analytics/domain/rankings.ts`. At the time of this entry, ranking consumers passed the selected ranking mode and charts displayed the same score used for ordering. Current rankings use volume-weighted scores only. Scope calculations to the already filtered response slice and exclude all-N/A composites from ranked results.

Consequences: Champion cards, leaderboards, and best/least-performing charts consistently honor survey filters and use the same ranking score. Focused domain tests cover volume-weighted ordering, displayed score selection, active survey types, and ranking direction.

Evidence: `src/features/analytics/domain/rankings.ts`, `src/features/analytics/domain/rankings.test.ts`, `src/pages/AnalyticsPage.tsx`

Correction (2026-10-06): Analytics' Company Leaderboard had drifted back to grouping submissions by display name and recalculating ranking scores in the page. It now uses canonical company aggregation, stable company identity grouping, and displays the selected ranking score. All-N/A companies remain outside scored Analytics ranks. Separate partner-type lists are normalized when the All categories view combines them. Evidence: `getAnalyticsCompanyRankings` in `src/features/analytics/domain/rankings.ts` and its consumer in `src/pages/AnalyticsPage.tsx`.

Correction (2026-10-07, superseding the prior benchmark-5 note): Analytics volume-weighted scores use Bayesian confidence weighting. For each scored peer group, `C` is the unweighted mean of peer company averages and `m` is the median peer response count, with a minimum of 3; the score is `(R × v + C × m) / (v + m)`. Analytics current, archived, and performance rankings use the canonical `computeRankScore` path. Evidence: `src/features/analytics/domain/analytics.ts`, `src/features/evaluations/domain/scoring.ts`, and `src/features/analytics/domain/rankings.ts`.

Correction (2026-10-09): Pure Average ranking has been removed. Analytics current-period, archived-period, performance, and standalone company leaderboard rankings now use volume-weighted scores only; raw composite averages remain available for score and reporting metrics. Evidence: `src/features/analytics/domain/rankings.ts`, `src/features/evaluations/domain/scoring.ts`, `src/pages/AnalyticsPage.tsx`, and `src/features/analytics/components/CompanyLeaderboardPanel.tsx`.

Correction (2026-10-09): Reports now use `getAnalyticsCompanyRankings` for volume-weighted company ordering and score display, with the same official, globally filtered response slice supplied to Analytics. Company report summaries and PDF/DOCX exports label the adjusted value as Volume-Weighted Score; rubric-based `compositeScore` remains unchanged for score breakdowns. Evidence: `src/App.tsx`, `src/pages/ReportsPage.tsx`, report builders, `src/features/feedback-hub/reporting/companyReportData.ts`, and `src/features/reports/services/companyReportExport.ts`.

Correction (2026-10-06): Survey Forms → Modify → Ended now remains Completed even when its deadline is in the future, saves the status, and archives the active response rows for each ended partner type under a dated archive series. The Analytics Company Leaderboard Archives tab lists each category-period; selecting one opens a modal with its canonical company ranking. The same response rows are visible in Archive Center and remain restorable there. On remote persistence failure, the modal stays open with a retry message; the category archive is idempotent for that dated series. No partner registry records or database schema are changed. Evidence: `getSurveyStatus`, `SurveyFormsPage`, `archiveResponsesForSurveyTypes`, and `ArchivedCompanyRankings`.

Correction (2026-10-08): Count a unique submission only when at least one evaluation rating or designated remark has a real answer. Numeric zero counts; blank, N/A, none, dash, and nil markers do not. Metadata such as Period Covered never counts. Meaningful text in unscored answer fields qualifies; explanatory comment details on a scored N/A do not. Imported Subcontractor matrix remarks qualify even though the importer stores them on matrix rating rows. Blank/N/A-only submissions are excluded from totals and completion progress, while numeric score averages continue to use numeric ratings. Period response counts and report/dashboard evaluation counts use the same rule. Evidence: `hasAnsweredItem` and `submissionCount` in `src/features/analytics/domain/analytics.ts`, plus `src/features/evaluations/domain/scoring.ts`, `src/features/evaluations/domain/surveyCompletion.ts`, and their UI consumers.

### 2026-09-22 - Analytics presentation hierarchy

Status: accepted

Context: Analytics exposed useful information but presented overview metrics, detailed company tools, trends, and question breakdowns with similar visual weight. The ordering made the page harder to scan and left the response total and performance extremes isolated in full-width rows.

Decision: Preserve the existing analytics data and interactions while organizing the page into four presentation groups: Overview, Trends & Comparisons, Company Exploration, and Question Detail. Keep period/ranking controls in a labeled toolbar, balance the primary partner summary with response and range cards, and use responsive grids that collapse to one column without fixed-width content.

Consequences: The same analytics remain available with clearer progressive disclosure, less unused space, and more consistent control labeling. Presentation components live under `src/features/analytics/components/`; calculation ownership remains unchanged in the Analytics domain and utility layers.

Evidence: `src/pages/AnalyticsPage.tsx`, `src/features/analytics/components/AnalyticsSection.tsx`, `src/features/analytics/components/AnalyticsToolbar.tsx`, `src/features/analytics/components/PerformanceHighlights.tsx`

### 2026-09-23 - Versioned active-company snapshots

Status: accepted and applied to staging on 2026-09-23

Context: Partner Companies needs an Admin-only view of the companies present in each official Courier, Supplier, and Subcontractor evaluation export. This list is distinct from the Partner Companies master-list registry and from calculated leaderboard rankings.

Decision: Store each category upload as an immutable `active_company_snapshot` application record containing its source filename, upload timestamp, actor, and deduplicated company names. Seed the first three snapshots from the repository's official Microsoft Forms CSV exports. New CSV/Excel uploads append snapshots independently per survey type; the latest timestamp is current while older snapshots remain selectable.

Consequences: Admins upload the three files from Partner Companies → Register New Partner → Upload Master List, then inspect and backtrack the lists from the Partner Companies action bar. The existing consolidated application-record RLS keeps this record type Admin-only because it is not included in any employee-readable exception. Migration `202609230001_active_company_snapshots.sql` is applied to staging; production remains unchanged and requires separate authorization.

Evidence: `src/features/active-companies/`, `src/pages/PartnerCompaniesPage.tsx`, `supabase/migrations/202609230001_active_company_snapshots.sql`

### 2026-09-23 - Frontend–Supabase semantic alignment audit

Status: structurally aligned with documented production blockers

Context: The frontend persistence paths, application-record types, Realtime invalidation, and database RLS needed one verified map after shared-state centralization and the Active Companies relocation.

Decision: Treat `docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md` as the canonical connection map. Export one runtime `APPLICATION_RECORD_TYPES` tuple and test it against the latest versioned database constraint. Refresh department permissions and active-company snapshots on their Realtime invalidation events.

Consequences: Record-type drift now fails a focused test, and those two stores converge across open clients. Three authorization gaps remain explicit production blockers: secure company-wide aggregate Analytics for lower ranks, delegated document renewal, and non-Admin archive mutations. Do not weaken raw-row RLS to solve them.

Evidence: `docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md`, `src/services/applicationRepository.ts`, `src/services/applicationRepository.test.ts`, `src/App.tsx`, `src/features/active-companies/components/ActiveCompaniesModal.tsx`

### 2026-09-24 - Repository authorization stabilization boundaries

Status: partially implemented and locally verified; the database migration is pending commit and unapplied

Decision: Keep Archive Center Admin-only. Permit delegated document renewal only through a field-limited, optimistic-concurrency RPC that writes the modification audit entry in the same transaction. Company-wide lower-rank Analytics remains unresolved and must not widen raw-response RLS.

Consequences: `202609240001_delegated_document_renewal.sql` requires separate staging authorization and database-backed role tests. Until applied, delegated renewal remains unavailable. Production remains untouched.

Evidence: `src/utils/rbac.ts`, `src/hooks/useSurveyData.ts`, `supabase/migrations/202609240001_delegated_document_renewal.sql`, and its focused tests.

### 2026-10-01 - Restricted modules are disabled and route-guarded

Decision: Treat department permissions as the maximum module set for Employee accounts in the account editor, sidebar, and route guard. Admin accounts retain full module access regardless of designation or department settings.

Evidence: `src/pages/AccountManagementPage.tsx`, `src/layouts/Shell.tsx`, `src/App.tsx`, and `src/utils/rbac.ts`.

### 2026-10-01 - Escape closes the topmost open modal

Decision: Modal dialogs register a shared Escape action; Escape closes only the topmost open dialog so nested confirmations do not close their parent at the same time. The active-company dialog uses the same stack as page and shell dialogs.

Evidence: `src/hooks/useModalEscape.ts` and modal callers across `src/`.

### 2026-09-24 - Runtime record validation and rejected-write recovery

Status: accepted and locally verified in the working tree

Decision: Parse every one of the 19 `application_records` payload types at the repository boundary with bounded IDs, enums, dates, arrays, text, and numeric values. Quarantine malformed rows while retaining valid neighbors. Await authorization-sensitive writes before success and emit authoritative invalidation after any rejected read/write/reconciliation step.

Consequences: Corrupt remote rows fail closed and are reported without leaking payload content. A partially completed replace operation converges through RLS-protected refetch and is safe to retry because stable IDs and the computed stale-ID set make the operations idempotent.

Compatibility note: repository validation runs before hook normalization. It therefore owns the known response migrations (`Contractor` to `Courier`, `General` to `Overall`, missing respondent type to `Unspecified`, and missing legacy rating/comment values to `N/A`/empty text). Missing completion dates are recovered in evidence order from `startTime`, the timestamp embedded in a legacy `RESP-*` ID, then immutable `application_records.created_at`; `submissionDateInferredFrom` preserves that distinction. Supplied malformed dates still fail closed. The archive importer now rejects rows with no recoverable date instead of persisting another incomplete response. Quarantine notifications aggregate sanitized validation reasons and never include response payloads or record identifiers.

Evidence: `src/services/applicationRecordSchemas.ts`, `src/services/applicationRepository.ts`, `src/services/applicationRepository.test.ts`, `src/services/clientSecurityRegression.test.ts`.

### 2026-09-24 - Authentication recovery and provider bridge

Status: repository implementation complete; hosted settings and production-provider approval pending

Decision: Support Supabase password reset/recovery with a forced fresh sign-in after password update. Treat Microsoft-to-Supabase token exchange as mandatory before establishing the application identity. Keep lifecycle and emergency procedures in `AUTH_OPERATIONS.md`.

Consequences: Microsoft bridge failure no longer leaves an MSAL-only identity attempting RLS-backed operations. Exact redirect URLs, leaked-password protection, provider selection, revocation, and disabled-account behavior still require environment-owner configuration and staging tests.

Evidence: `src/pages/LoginPage.tsx`, `src/pages/PasswordRecoveryPage.tsx`, `src/services/supabasePasswordAuth.ts`, `src/services/authBridge.ts`, `src/App.tsx`, `docs/engineering/AUTH_OPERATIONS.md`.

### 2026-09-24 - Dependency remediation and reproducible verification

Status: locally verified in the working tree; hosted CI has not run

Decision: Resolve the 11 clean-install advisories without forced upgrades, use official SheetJS CE 0.20.3, pin patched `image-size`, test spreadsheet/PPTX exports, and document the bounded `core-js` and `esbuild` install hooks. Pin Node 22 and immutable third-party action commits in a pull-request verification workflow.

Consequences: Local `npm audit` is clean. The workflow performs clean install, TypeScript checks, tests, build, dependency audit, secret scan, and build-artifact upload, but branch protection and a hosted run require a later authorized push and repository-owner configuration.

Evidence: `package.json`, `package-lock.json`, `src/features/reports/services/exportDependencies.test.ts`, `.nvmrc`, `.github/workflows/verify.yml`, `docs/engineering/DEPENDENCY_SECURITY.md`.

### 2026-09-24 - Response provenance execution readiness

Status: runbook and read-only verification complete; migration remains unapplied

Decision: Explain the 6,355 pending rows as the exact normalized-answer seed set awaiting provenance classification. Use deterministic exact-ID/payload matching, protect already classified rows, and require the documented backup, thresholds, reconciliation, and recovery decision before any staging execution.

Consequences: Courier 540, Subcontractor 1,560, Supplier 4,255, and total 6,355 are the expected post-migration exact counts when the preflight has zero conflicts. No migration was executed; staging approval and production review remain independent blockers.

Evidence: `docs/engineering/RESPONSE_PROVENANCE_RUNBOOK.md`, `supabase/verification/response_provenance_readiness.sql`, `supabase/migrations/202609220001_response_provenance.sql`, `src/services/sharedPersistenceMigration.test.ts`.

## Active modernization state

### 2026-09-30 - Timestamp archived Partner Companies

Status: accepted and locally verified

Decision: Partner Company archive mutations record the current ISO timestamp in `archivedAt`; restoring a company clears that field. The Archived registry displays the timestamp in the user's local date/time format and leaves legacy records without a timestamp as `N/A`.

Evidence: `src/types/survey.ts`, `src/services/applicationRecordSchemas.ts`, `src/pages/PartnerCompaniesPage.tsx`, `src/features/partner-companies/components/partnerCompaniesPresentation.test.ts`.

### 2026-09-30 - Archive source files for evaluation imports

Status: implemented locally; migration `202609300001` applied and verified in staging `adxwaxhnqxpmgjvsxgug` on 2026-10-06. Production has not been verified.

Decision: Store the original Supplier, Subcontractor, and Courier Microsoft Forms exports in the private `evaluation-import-archives` Storage bucket before committing parsed responses. Persist validated file metadata in Admin-only `evaluation_import_archive` application records and expose recent files with authenticated downloads on the Import Evaluation Responses page. Restrict files to 25 MB and the supported CSV/XLS/XLSX types; remove the uploaded object if metadata persistence fails.

Consequences: The import is stopped if the original file cannot be archived, preventing a successful response import without its source file. Migration `202609300001_evaluation_import_archives.sql` creates the private bucket, Admin-only object policies, and application-record type. Staging Management API checks confirmed the recorded migration version, private bucket with a 25 MB limit and CSV/XLS/XLSX MIME types, all three Admin object policies, and the archive record type. An authenticated Admin upload and Analytics refresh still need an end-to-end check.

Evidence: `src/features/evaluation-imports/`, `src/pages/ImportEvaluationsPage.tsx`, `src/services/applicationRepository.ts`, `src/services/applicationRecordSchemas.ts`, `supabase/migrations/202609300001_evaluation_import_archives.sql`.

### 2026-10-01 - Import all evaluation categories from one workbook (expanded to batches 2026-10-06)

Status: implemented locally; production behavior has not been verified

Decision: The Admin import page accepts one or more `.csv`, `.xlsx`, or `.xls` exports, including several files for the same category. It detects each recognized Supplier, Subcontractor, and Courier form by its official company-name header, previews category totals, reviews unmatched company decisions in one dialog, archives each source file, and upserts all categorized response rows together. A combined workbook remains supported. Each row must have its source `ID`; that ID plus survey type forms the stable response key. Overlapping source IDs within a category are rejected before archiving so no selected file silently replaces another. Company resolution continues to check the full Partner Registry, including archived and differently classified entries.

Consequences: Combined source archive metadata uses `surveyType: Combined` under the existing record type and private bucket; no new database migration is required. The archive phase rolls back earlier files if a later source cannot be stored; a failed/partial multi-request response write is not a database transaction and can still require refresh/retry. Multiple new-partner matches across normal files reconcile to one partner. CSV files each represent one recognized form.

Evidence: `src/pages/ImportEvaluationsPage.tsx`, `src/features/evaluation-imports/services/rawEvaluationImport.ts`, `src/hooks/useSurveyData.ts`, `src/features/evaluation-imports/domain/importArchive.ts`.

### 2026-10-06 - Isolated evaluation test imports and removal

The Admin import page offers Test import with a unique `test-workbook:<uuid>` batch per selected source file. Test mode accepts single-category CSV exports or Excel workbooks with one or more recognized Supplier, Subcontractor, and Courier forms, including several files per category. Extensionless files with recognized CSV/XLSX MIME types receive the matching extension before archiving. Missing form categories are skipped only when their headers do not match; malformed recognized forms fail the preview. Test `client_csv` responses enter Analytics using `TESTIMPORT-*` IDs, preserving existing source-ID rows. Unmatched companies created for the test carry `testImportBatchId`, remain archived, and are excluded from subsequent company matching. Stored Source Files separates Active Imports from Import History. Active imports have an archive action that preserves their stored file and response data. Permanent removal is available only in History: ordinary imports lose only the selected stored source file and archive record, while test imports also delete tagged responses and temporary partners. Test cleanup rejects identity mismatches and partners referenced by other evaluations. Realtime invalidation refreshes Analytics. Test deletion spans multiple Supabase requests and is not atomic; a failed step leaves the archive entry available for retry. The archive migration is applied in staging; the multi-file test-import journey has not yet been verified there.

Evidence: `src/features/evaluation-imports/domain/testImport.ts`, `evaluationFilePreview.ts`, their workbook/CSV/cleanup tests, `src/features/evaluation-imports/services/rawEvaluationImport.ts`, `src/features/evaluation-imports/services/evaluationImportArchiveService.ts`, and `src/pages/ImportEvaluationsPage.tsx`.

Ordinary source removal is history-only and deletes just the selected Storage object and `evaluation_import_archive` record. It never deletes linked ordinary responses, so removing an archived duplicate cannot remove the active copy or its current response data. The isolated test-import permanent-removal action deletes its tagged responses and temporary partners, and is likewise available only after archival. The client rechecks the stored archive identity before deletion, and Supabase Admin policies enforce access at the database and Storage boundaries. Test cleanup spans multiple Supabase requests and can require a retry after partial failure. This lifecycle is implemented locally and has not been exercised in an authenticated staging session.

### 2026-09-30 - Lazy-load authenticated application pages

Status: accepted and locally verified; production web-vitals measurement remains pending

Context: `src/App.tsx` eagerly imported every route-level page, including charting and export-heavy modules, so the main browser bundle was approximately 4.75 MB before gzip.

Decision: Keep authentication and the application shell available in the initial bundle, load route pages through `React.lazy`, and render them inside a route-level `Suspense` fallback. Unselected page elements remain unmounted, so their dynamic imports are not requested during startup.

Consequences: The production main `App` chunk measured approximately 1.51 MB after the change, while heavy pages are emitted as separate route chunks. First navigation to a page may show the existing lightweight loading state while that route chunk downloads; application behavior and Supabase hydration boundaries remain unchanged.

Evidence: `src/App.tsx`; `npm run lint`, `npm test` (110 tests), and `npm run build` passed on 2026-09-30.

### 2026-09-30 - Prioritize post-login primary data

Status: implemented and locally verified; real-user latency measurement remains pending

Decision: After authorization, wait for partner companies, surveys, and evaluation responses before removing the content loading state. Hydrate archive series, category labels, and notification read state in the background. Defer notification grouping and compressed response-cache serialization until after the first paint. Request up to 1,000 rows per page, continue at the first missing offset if the hosted API truncates a page, and use up to 12 bounded parallel follow-up requests. The additive startup-RLS migration wraps stable, row-independent authorization helpers in scalar selects; its access predicates are regression-tested against the applied policy.

Consequences: Supporting settings and notification hydration no longer extend the dashboard's initial loading screen. The documented 6,355-row response dataset fits in one parallel follow-up batch after the first page and uses six page requests instead of twelve at the configured limit. A lower hosted API limit causes contiguous follow-up reads rather than silently omitting rows. The RLS optimization must be applied to the intended Supabase environment before it affects hosted queries; it has not been applied remotely. Core records still come from Supabase, and real staging/production latency remains unmeasured.

Evidence: `src/hooks/useSurveyData.ts`, `src/services/applicationRepository.ts`, `src/services/applicationRepository.test.ts`, `src/services/sharedPersistenceMigration.test.ts`, `supabase/migrations/202609300002_cache_startup_rls_helpers.sql`; 115 tests, TypeScript checks, and production build passed locally on 2026-09-30. Hosted query latency is not yet measured.

### 2026-10-01 - Avoid exact-count scans during employee response loading

Status: implemented locally; hosted query behavior has not been verified

Context: An Employee session reported `canceling statement due to statement timeout` while loading `survey_response` records. The initial repository request asked Postgres for an exact count under response RLS before returning its first page.

Decision: Load the first page without requesting an exact count, then continue from the number of rows actually received. This leaves the RLS policy unchanged and avoids requiring a full visible-row count just to begin hydration.

Consequences: Follow-up pages are requested sequentially when the server does not return an exact count. The existing startup-RLS helper migration `202609300002_cache_startup_rls_helpers.sql` is still needed in the target Supabase environment for its planned per-statement authorization-helper optimization; this workspace could not verify remote migration state or hosted latency.

Evidence: `src/services/applicationRepository.ts`, `supabase/migrations/202609300002_cache_startup_rls_helpers.sql`.

### 2026-09-25 - Non-blocking authenticated startup hydration

Status: accepted and locally verified; staging latency has not been measured in this workspace

Decision: Keep profiles and department permissions behind the post-login full-screen authorization gate. Once that boundary is ready, render the application shell while shared business records hydrate in the content area. Fetch counted `application_records` pages in bounded parallel batches instead of waiting for every 500-row page sequentially.

Consequences: Navigation and authenticated account context become available sooner without rendering routes from unverified permissions. Large response datasets require fewer sequential network round trips, while validation, quarantine reporting, record ordering, and the sequential fallback for backends without exact counts remain intact.

Evidence: `src/App.tsx`, `src/services/applicationRepository.ts`, `src/services/applicationRepository.test.ts`.

### 2026-09-24 - Remove browser-side shared administrative passcodes

Status: accepted and locally verified in the working tree

Context: Partner deletion and survey archive/reset dialogs embedded shared passcode values in browser source. Those values were visible to every client and could not provide an authorization boundary, even though the corresponding controls were Admin-only and Supabase RLS remained authoritative.

Decision: Remove the shared passcodes and password inputs. Retain explicit destructive-action confirmation, Admin-only rendering, and database authorization. Add a focused source regression test preventing these pages from reintroducing browser-side shared passcodes.

Consequences: Destructive actions no longer imply that a bundled passcode provides security. Any stronger reauthentication requirement must be implemented through the authenticated provider and server/database boundary rather than a client constant.

Evidence: `src/pages/PartnerCompaniesPage.tsx`, `src/pages/SurveyFormsPage.tsx`, `src/services/clientSecurityRegression.test.ts`; `npm run lint`, 74 tests, and `npm run build` passed on 2026-09-24.

### 2026-09-24 - Validate profile authorization payloads at runtime

Status: accepted and locally verified in the working tree

Context: `loadProfiles()` trusted database strings and cast permission arrays directly to TypeScript types. A malformed role, designation, department, page key, or survey type could therefore reach authorization and navigation logic without runtime rejection.

Decision: Parse profiles at the application repository boundary on both load and save. Accept only the supported company email domain, roles, designations, departments, page-module keys, and survey types; normalize email casing and duplicate permission entries; reject unsupported values with a field-specific error.

Consequences: Profile and permission corruption now fails closed before reaching RBAC consumers. Other `application_records` payload types still require their own runtime schemas and remain tracked separately.

Evidence: `src/services/applicationRepository.ts`, `src/services/applicationRepository.test.ts`; `npm run lint`, 76 tests, and `npm run build` passed on 2026-09-24.

- Agent governance: established by `AGENTS.md`.
- Automated test harness: focused Feedback Hub company-report and Analytics ranking tests established; repository-wide coverage remains incomplete.
- CI/CD workflow: repository workflow established with pinned Node/actions; hosted execution and branch protection are not established.
- Feature-module refactor: started incrementally for Feedback Hub reporting and Analytics ranking/presentation seams; large legacy pages remain.
- Backend source-of-truth migration: complete for shared state in staging; production migration/deployment still requires explicit authorization and environment-specific verification.
- Repository artifact cleanup: tracked `.vite` cache and obsolete root extraction/patch outputs removed; `.vite/` is ignored.

### 2026-10-02 — Analytics Custom date range

Status: implemented locally; deployment not verified.

Custom Analytics uses submission-date calendars across active and archived records, with inclusive local calendar boundaries and optional archived-series narrowing. Empty matches retain all controls; invalid or reversed ranges show validation and produce no results. Access filtering and official-response provenance still apply before rendering. Current and All-Time scope semantics are unchanged.

Evidence: `src/features/analytics/domain/dateRange.ts`, `src/features/analytics/components/AnalyticsDateRangeControls.tsx`, `src/App.tsx`, `src/pages/AnalyticsPage.tsx`, and focused date-range/presentation tests.

### 2026-10-02 — SMS-74 survey date pickers

Status: implemented locally; deployment not verified.

All survey `date-range` questions use the same typed `dd/mm/yyyy` picker with month/year calendar navigation. Both dates are required; To cannot precede From. Calendar selection and typed values share validation and preserve the existing `From: dd/mm/yyyy To: dd/mm/yyyy` answer-comment format consumed by persistence and exports. No database migration is required.

Evidence: SMS-74 in the Notion ticket database, `src/features/evaluations/components/SurveyDatePicker.tsx`, `src/features/evaluations/domain/surveyDates.ts`, and `src/pages/SurveyFillerPage.tsx`.

### 2026-10-02 — SMS-75 employee test-form visibility

Status: implemented locally; deployment not verified.

Employee survey availability excludes legacy titles beginning with a standalone Test/Tests label, including numbered and separated variants. Admins retain those forms. Existing department, designation, and survey-type rules still apply. New Evaluation resolves hidden/stale form IDs to an available form, and survey details use the same accessible list. This is UI availability filtering; stored forms and evaluations are retained and no database migration is required.

Evidence: SMS-75 in Notion, `src/features/evaluations/domain/surveySelection.ts`, focused selection/presentation tests, `src/App.tsx`, and `src/pages/SurveyFillerPage.tsx`.

### 2026-10-02 — Test evaluation cleanup SQL commands

`db:cleanup:tests:preview` and `db:cleanup:tests:sql` generate reviewable SQL without connecting to Supabase or changing files/data. Preview rolls back and exposes full candidate rows for a private recovery export; deletion SQL commits only whole test response groups, protects CSV/production provenance and normalized submission identities, and locks selection through deletion. Other record types and imported tables are preserved. Real evaluations may have staging provenance; review is required before executing the generated SQL in the intended environment. Remote execution has not been verified.

Evidence: `scripts/database-cleanup/testEvaluationsSql.ts`, its safety tests, `package.json`, and README cleanup instructions.

### 2026-10-02 — Connected CSV cleanup verification

Read-only Supabase checks against the configured staging project `adxwaxhnqxpmgjvsxgug` confirmed all four source hashes match a fresh local import plan. Normalized/editable records contain 1,140 matching companies, all 280 CSV evaluations, and 6,355 answer rows with no missing/extra responses or differing company/question/rating/comment values against the versioned seed mapping. Only the three default forms remain; known sample feedback IDs and top-level references to the four previously removed test forms are absent. No further deletion was needed or performed. Operational histories/settings and active-company snapshots were retained; their nested contents, browser caches, and a separate production environment were not classified. Explicit `dataSource` is absent on these imported answers, so legacy imported-identity recognition remains relevant.

Evidence and verification limits: [CSV data audit live follow-up](audits/2026-10-02-csv-data-context-audit.md#live-follow-up--2026-10-02), `supabase/verification/csv_company_reconciliation.sql`, and `supabase/verification/csv_data_audit.sql`.

### 2026-10-06 — Admin-created account passwords

Implemented locally: Add Account generates a 20-character cryptographic password and lets the Admin reveal, copy, regenerate, or replace it with a custom password of at least 16 characters (maximum 72 UTF-8 bytes). `POST /api/admin/accounts` verifies the Supabase identity and its current Admin profile, creates an unconfirmed Auth user, saves the access profile, then confirms the login. It rejects existing profiles/logins without resetting credentials and attempts cleanup after known partial failures. The Admin verifies the employee's email; no invitation email is sent. Passwords remain outside profiles, application storage, and logs. The shared profile parser now lives in the pure account-management domain and is re-exported by the application repository.

Requires the Express host and server-only `SUPABASE_SECRET_KEY` (or the import CLI's `SUPABASE_SERVICE_ROLE_KEY`) plus the matching project URL. Configuration fix on 2026-10-06: Express loads Vite's env files before constructing the account endpoint; deployment/shell values remain authoritative, and `/api/config` uses an explicit public allowlist. The user configured the local staging server key on 2026-10-06. A read-only Supabase Auth Admin API check succeeded; reloading the existing development watcher changed the local account endpoint from missing-key 503 to the expected 401 for an invalid test token. The running public config endpoint was also verified to exclude the secret. No migration or remote provisioning was performed. Tests exercise env loading and the HTTP boundary with a mocked Supabase provider; live staging creation/sign-in remains unverified. See [account operations](AUTH_OPERATIONS.md) for setup and partial-failure recovery. Evidence: `src/features/account-management/`, `src/pages/AccountManagementPage.tsx`, `server/createAccount.ts`, `server/environment.ts`, their tests, and `.env.example`.

### 2026-10-06 — Import removal concurrency regression

Ordinary import removal now requires the record ID, import batch, and `client_csv` provenance to match in the database DELETE. A response overwritten by a newer batch between selection and deletion is preserved. Counts come from returned deleted IDs; the source file is retained if responses still belong to its batch after deletion. No schema or RLS change is required. The workflow still uses separate database and Storage requests and reports partial failures. Evidence: `deleteImportedSurveyResponses` in `src/services/applicationRepository.ts`, `src/features/evaluation-imports/services/evaluationImportArchiveService.ts`, and `src/services/importResponseDeletion.test.ts` (actual Supabase SDK with a simulated provider, including concurrent replacement and chunk failures).

Local verification on 2026-10-06: all 194 tests, the explicit four-project TypeScript check, the production build, and `git diff --check` passed. Live account creation/sign-in remains unverified; these checks do not establish production readiness.

### 2026-10-06 - Dependency audit failure and Tailwind compatibility

The push and pull-request checks for `a2a72a8` passed TypeScript checks, tests, build, and secret scanning but failed dependency auditing with nine findings. Patched transitive `proxy-addr` to 2.0.8 and `source-map-js` to 1.2.2. Tailwind 3 depended on vulnerable, unpatched `braces`; upgrading Tailwind and its PostCSS integration to 4.3.3 removes that dependency chain rather than suppressing the audit gate.

The original v3 palette and effect scales remain explicit in `tailwind.config.js`. `src/styles.css` retains the original cascade and preflight defaults, while `scripts/tailwindCompatibility.mjs` restores sibling spacing/dividers and accessible outline behavior. The actual stylesheet pipeline regression test covers colors, effects, responsive/dark selectors, spacing, dividers, and outlines. Four synthetic shared-control screenshots (desktop/mobile, light/dark) matched the baseline byte for byte; this is representative visual evidence, not an exhaustive application journey check. Tailwind 4 requires Safari 16.4+, Chrome 111+, or Firefox 128+; see the [official requirements](https://tailwindcss.com/docs/upgrade-guide#browser-requirements).

Local verification on 2026-10-06: 195 tests, all four TypeScript projects, and the production build passed; an online `npm audit --audit-level=high` reported zero vulnerabilities. The existing bundle-size warning remains. Hosted verification must be checked for the pushed commit.

Evidence: `package-lock.json`, `postcss.config.js`, `tailwind.config.js`, `src/styles.css`, `scripts/tailwindCompatibility.test.mjs`, and the [failed push run](https://github.com/miguel100116/supplier_management_system_bermejo-tolentino/actions/runs/37426378828). Rollback is a commit revert, which also restores the vulnerable dependency chain; no database changes are involved.

## Handoff template

Add a temporary handoff only for substantial unfinished work, then remove it when resolved:

```text
Task:
Outcome/acceptance criteria:
Files intentionally changed:
Checks run and results:
Decisions made:
Known risks or blockers:
Exact next step:
```

### 2026-10-01 - Admin evaluation workspace navigation

Decision: Group existing `survey-forms`, `explorer`, `pending-review`, and `categories-manager` routes under one Admin sidebar destination with Forms, Responses, Coverage, and Category Labels view buttons. Retain the existing route keys and authorization checks; archive/import remain separate. This is a navigation change, with existing response matching and coverage rules retained.

Evidence: `src/App.tsx`, `src/features/evaluations/components/EvaluationWorkspace.tsx`, `src/pages/CategoriesManagerPage.tsx`.

### 2026-10-02 - Survey deadline status

Decision: For a survey with a valid deadline, status remains Running or Paused through the deadline day and becomes Completed afterward; Archived always stays Archived. A future deadline supersedes a stale Completed value. Surveys without a valid deadline retain their saved manual status. The Forms page refreshes at the deadline boundary, and changing a deadline through Modify Settings reconciles the saved status.

Evidence: src/features/evaluations/domain/surveyStatus.ts, src/pages/SurveyFormsPage.tsx, src/features/evaluations/domain/surveyCompletion.ts, src/features/notifications/domain/employeeNotifications.ts, src/features/evaluations/domain/surveyStatus.test.ts.


### 2026-10-02 - Survey response review and export

Decision: The Evaluation Workspace Responses tab lists current, access-scoped submissions for a selected survey without dashboard filters. Explicit survey IDs take precedence; legacy rows without IDs match only when their question IDs uniquely identify a survey of that type. Email search filters the list, while Excel export offers all or filtered submissions. Workbook creation runs in a browser worker. Archived responses remain in Archive Center.

Evidence: src/App.tsx, src/pages/SurveyExplorerPage.tsx, src/features/evaluations/domain/surveyResponses.ts, src/features/evaluations/workers/surveyResponsesExport.worker.ts.

### 2026-10-07 - Evaluation import responsiveness

Decision: Archive selected evaluation source files with at most three concurrent uploads. Once archiving succeeds, apply imported responses and any new partner records to the current client state immediately, then persist them to Supabase. On persistence failure, restore unsaved IDs and rely on the repository's Realtime invalidation/refetch to reconcile partial writes. Application-record upserts send at most four 300-row chunks concurrently; newly created partner records remain saved before responses that may reference them.

Evidence: `src/features/evaluation-imports/domain/evaluationBatch.ts`, `src/hooks/useSurveyData.ts`, and `src/services/applicationRepository.ts`. This improves perceived latency and reduces sequential round trips; single-file transfer time remains dependent on file size and network throughput.

### 2026-10-12 - Evaluation source import classification

Evaluation source archives may carry explicit `importStatus` metadata after a confirmed normal replacement or user archival. The old archive is marked historical after replacement only when its batch ID is unique and no client CSV responses remain linked; its Storage object is retained and the new archive remains a separate record. User archival marks an active import historical while preserving its file and responses. As of 2026-10-19, Stored Source Files requires current `client_csv` responses in the file's import batch linked to an existing Active Workspace form (`Running`, using `getSurveyStatus` for deadlines and manual endings). Explicit response `surveyId` wins; imports without one belong only to `DEFAULT_SURVEY_IDS`, shared with import reactivation. Legacy compatibility: the newest standard `Microgenesis <category> Evaluation Form.csv` qualifies for its active default Workspace form when its batch has no response records. Explicit historical state, test imports, older copies, and batches with archived or deleted-form response links do not qualify. This is a filename-based compatibility rule until explicit archive/form links are stored. A different active form of the same category cannot activate that file. Deleted forms and batches with archived response links do not qualify; fully missing legacy batch provenance cannot distinguish deleted responses from absent old import metadata. Combined files require an active form in their own batch. Explicitly archived/replaced files remain in History until restored, and restoration requires that same current batch/form link. App passes its canonical surveys, active responses, and archived responses to the import page; the page refreshes deadline status at local midnight. Identical stored copies sharing a batch ID follow the same batch/form state; source archive records have no individual form ID. It shows Active Imports and Import History counts and offers permanent removal only in History. Explicit archival remains available for inactive files before test-import cleanup. Removing an ordinary historical archive removes only that archive's Storage object and metadata, preserving response rows and other copies even when the batch ID is shared. Bulk download uses the existing per-file download mechanism for each selected source. Status and category tabs share a muted selected style; active rows use a green status badge.

Evidence: `src/features/evaluation-imports/domain/importArchive.ts`, `services/evaluationImportArchiveService.ts`, `hooks/useEvaluationImportArchives.ts`, and `src/pages/ImportEvaluationsPage.tsx`.

### 2026-10-02 - Shared modal scroll behavior

Decision: Open dialogs registered through useModalEscape share a reference-counted document scroll lock. The lock fixes the body at its current scroll position, compensates for scrollbar width, and restores the original inline styles and position when the last dialog closes. Popovers can opt out; the employee notification dropdown does so. Modal content remains independently scrollable with overscroll containment in the Active Companies, Settings, and Modify Settings views.

Evidence: src/hooks/useModalScrollLock.ts, src/hooks/useModalEscape.ts, src/features/notifications/components/EmployeeNotificationBell.tsx, src/features/active-companies/components/ActiveCompaniesModal.tsx, src/App.tsx, src/pages/SurveyFormsPage.tsx, src/hooks/useModalScrollLock.test.ts.

### 2026-10-09 - Evaluation company selection presets

Decision: The Admin company picker offers active companies only. “Within the Top 20” is available for Courier, Supplier, and Subcontractor surveys. It follows the selected category's current official, volume-weighted Analytics leaderboard, then fills remaining spots with active unscored companies (alphabetically) until 20 companies are selected or the active registry is exhausted. “Active Partners” selects the full active list. The standalone Supplier Ranking module and curated `evaluationRank` fallback were removed. Surveys without a saved company selection include all active companies of their survey type. Explicit selections gate employee evaluation through `getSurveyEvaluationCompanies`; the leaderboard preset is saved as an ID snapshot so later score changes do not silently shift an active survey's company list.

Evidence: `src/features/evaluations/domain/leaderboardSelection.ts`, `src/pages/SurveyFormsPage.tsx`, `src/features/analytics/domain/analytics.ts`, `src/pages/SurveyFillerPage.tsx`.

### 2026-10-12 - Document expiry notification accuracy

Decision: Expiry status uses local calendar dates and the shared compliance calculator. Company summaries inspect each branch independently and retain exact affected document details. Missing or invalid dates for expiry-bearing document types are Missing; AFS continues to use its fiscal-year `For Update` rule and is reported separately from a date-expired document. The admin header bell and Notification Logs include document, branch, due date, and configured early-milestone details. The status calculation refreshes every minute while the app is open.

Evidence: `src/features/document-tracker/domain/compliance.ts`, `src/hooks/useSurveyData.ts`, `src/features/notifications/components/NotificationBell.tsx`, and `src/pages/NotificationLogsPage.tsx`.

### 2026-10-12 - Backdrop dismissal shares the modal Escape callback

Decision: Every modal registered with `useModalEscape` closes through the same request-close callback when Escape is pressed or a pointer-down directly targets its backdrop. Clicks inside dialog content are ignored. Confirmation dialogs dismiss without invoking the confirmation action; nested dialogs use the existing priority stack.

Evidence: `src/hooks/useModalEscape.ts`, `src/hooks/modalDismissal.ts`, and modal registrations across `src/`.

### 2026-10-14 - Employee experience UI replacement

Decision: Employee Home, Evaluations, and My submissions use the Figma-generated presentation in `src/features/employee-experience/`; the existing App data, access-scoped survey/partner/response inputs, route state, and submission handlers remain the source of behavior. The shared survey filler opts into the Figma wizard only for Employee sessions; Admin keeps its existing presentation. New employee dialogs register with `useModalEscape`.

Evidence: `src/features/employee-experience/components/EmployeeExperienceShell.tsx`, `EmployeeWorkspacePage.tsx`, `employeeExperience.css`, `src/App.tsx`, and `src/pages/SurveyFillerPage.tsx`.

### 2026-10-15 - Shared dark theme tokens

Decision: `src/darkTheme.css` is the semantic token layer for dark mode. It loads after the shared Tailwind styles and employee workspace stylesheet, maps the existing dark utility classes to a neutral charcoal surface hierarchy, and supplies semantic status colors. `App.tsx` mirrors the active theme class onto `body` so portals rendered outside the application wrapper inherit the same tokens. The employee workspace keeps its existing layout and uses dark-only component overrides; light token values preserve its current palette. Primary filled actions use a deeper brand-blue shade for white-text contrast, while brighter blue is reserved for restrained accents.

Evidence: `src/darkTheme.css`, `src/main.tsx`, and the `darkMode: 'class'` wrapper in `src/App.tsx`. Browser review on 2026-10-15 covered employee Home, Evaluations, setup, and questions views in both themes at desktop size, plus responsive Home at mobile size. Review used temporary local fixture data because the browser session was not authenticated.

### 2026-10-19 - SMS-14 unified Reports and retained exports

Implemented locally; hosted staging and cross-device operation not verified. Reports uses `/reports` with Generate/History tabs. `/generate-report` remains an alias; `/export-history` resolves to Reports and replaces the URL with `?tab=history`. Present remains separate. Existing report layouts and export permissions are retained.

The existing `export_history` application-record path now retains report files as validated base64 data URLs (15 MB binary limit) plus typed builder options. Download again returns the saved bytes and original filename; Regenerate reopens the corresponding builder with saved options and current authorized data/filters. Shared filenames use report name, UTC timestamp, and a random suffix. The browser download succeeds independently of history persistence; failures raise the existing persistence error event. History uses an in-memory view refreshed from Supabase, explicitly filters reads/deletes by owner even for Admin sessions, and resets on account changes. Existing database RLS and owner writes are reused; no migration is needed. Admin database access remains administrative under existing RLS.

Legacy server entries remain readable, with unavailable saved-file/options actions disabled. Unattributed legacy localStorage logs are left untouched rather than automatically assigned to the current user. Clear log confirms first and preserves visible entries on failure. Retained copies are removed with the log. Large/report-heavy usage should move file bytes to private object storage instead of expanding the JSON-record limit.

Evidence: `src/features/reports/domain/reportHistory.ts`, `services/exportHistory.ts`, focused service/presentation tests, `src/pages/ReportsPage.tsx`, report builders, and application repository/schema validation. Browser comparison was unavailable: the computer-use inventory reported no connected browsers.

Local verification for SMS-14 on 2026-10-19: the full 257-test suite passed; the final 10 focused Reports/routing tests passed after the legacy-route and parameter-label review; all four TypeScript projects and the production build passed. The existing large-bundle warning remains. No deployment, migration, or live cross-device check was performed.

### 2026-10-19 - SMS-7 unsaved changes and SMS-15 document category entry

Form-builder and category-editor browser confirmations use `UnsavedChangesDialog`, registered with the shared modal lifecycle. Continue Editing (including Escape/backdrop) preserves edits; Discard explicitly permits leaving. Form saves validate and await persistence before accepting the pending destination, retaining edits on failure. App guards sidebar and browser-history exits from the standalone builder. Evaluation draft dialogs retain their existing persistence with matching action labels. Closing import matching review keeps its decisions, so it no longer asks about discarding them. Category saves retain their impact confirmation and existing background remote persistence; remote category failure remains subject to the shared persistence error event rather than an awaited dialog result.

Document Tracker defaults to All Categories, including its compliance overview, breakdown and attention summaries. Category definitions and nonarchived company filtering live in `src/features/document-tracker/domain/documentCategories.ts`. Valid `category` URL values select a category; invalid or absent values select all. Manual tabs replace the URL parameter; ordinary navigation away removes it, so returning resets to all. Browser history and explicit deep links retain their requested category. Category-specific document review uses the company-centered expandable list; All Categories analytics remain unchanged.

Evidence: `src/components/UnsavedChangesDialog.tsx` and interaction tests, `src/pages/CreateSurveyPage.tsx`, `src/App.tsx`, `src/hooks/useSurveyData.ts`, and Document Tracker domain/presentation tests. Implemented locally; browser visual and live remote-persistence verification were unavailable. No deployment or migration was performed.

Local verification: all 268 tests, all four TypeScript projects, production build, and Git diff whitespace checks passed. The existing large-bundle warning remains.

### 2026-10-19 - SMS-16 module names and SMS-13 workspace tabs

App derives module titles from the existing visible sidebar leaves instead of overriding Directory, Documents, Users, and Import Responses with older names. All four Admin evaluation views resolve to the Workspace sidebar entry. The shared Shell sets the browser title to the current module name plus Supplier Management System, restoring the prior title on unmount. Existing page descriptions, registry subtitle, employee navigation/breadcrumb names, canonical routes, and access checks remain intact.

EvaluationWorkspace uses one grouped tab container for Forms, Responses, Coverage, and Category Labels. Coverage no longer renders a separate outlined-button layout. Buttons share padding, font weight, and colors across views, with a distinct active state and wrapping for narrow screens. Evidence: `src/App.tsx`, `src/layouts/Shell.tsx`, `src/features/evaluations/components/EvaluationWorkspace.tsx`, and focused layout/navigation tests. Browser visual comparison was unavailable because no browser was connected; no deployment or remote data change was performed beyond the authorized ticket statuses.

Local verification: 16 focused tests and the full 270-test suite passed, along with all four TypeScript projects, the production build, and Git diff whitespace checks. The existing large-bundle warning remains.

### 2026-10-19 - Employee UI as Admin visual reference

Decision: The existing Employee workspace implementation is the visual authority for the Admin redesign. Admin reuses its font pair, palette, neutral surfaces, borders, selected-state colors, spacing, and responsive shell proportions while adapting navigation and page layouts to Admin workflows. Existing Admin routes, permissions, data, and interactions remain the behavior source of truth. `src/layouts/Shell.tsx` adapts the shared shell to Admin route groups; `src/adminWorkspace.css` applies the Employee tokens and Admin-specific layouts. No Employee UI redesign is part of this decision.

Evidence: `src/features/employee-experience/components/EmployeeExperienceShell.tsx`, `src/features/employee-experience/components/employeeExperience.css`, `src/adminWorkspace.css`, `src/layouts/Shell.tsx`, and the Admin pages. Browser comparison of authenticated Admin routes was unavailable in the local environment.

### 2026-10-19 - Admin Dashboard reference composition

Decision: Admin Dashboard uses the shared `WorkspaceWelcomeBanner` rendered on Employee Home, the Employee heading and navigation sizing, and shared workspace color/font tokens. Its operational content is ordered as Document Follow-up, Forms in Progress, Evaluation Snapshot, and Recent Submissions. It maps live records through `computeCompanyDocumentSummary`, existing survey status and response selectors, and the canonical 0–100 submission scoring helper. Current / All-Time applies to the snapshot; open forms and recent submissions stay current. Optional dashboard widgets remain collapsed below the main sections. Extracting the banner preserves the Employee's existing copy, action, illustration, and styling.

Evidence: `src/components/WorkspaceWelcomeBanner.tsx`, `src/features/employee-experience/components/EmployeeWorkspacePage.tsx`, `src/features/employee-experience/components/employeeExperience.css`, `src/pages/DashboardPage.tsx`, `src/adminWorkspace.css`, and `src/layouts/Shell.tsx`. Dashboard presentation and navigation tests are in `src/pages/DashboardPage.test.tsx`; browser screenshot comparison was unavailable.


### 2026-10-20 - Company-wide Analytics aggregate boundary (reverted 2026-10-21)

The protected aggregate API and per-category preload implementation were removed at the owner's request. Analytics now uses the authorized loaded response store. See the 2026-10-21 rollback entry for current behavior; do not deploy the removed API or broaden raw-response RLS.

### 2026-10-20 - Consistent Manage Access form status

Manage Access renders its status through `SurveyAccessStatus` and the canonical `getSurveyStatus`, matching the main Forms table, employee pending evaluations, and import classification. It no longer displays raw saved `Completed`/`Running` values independently of deadlines and manual endings. Existing label colors and layout are retained; Running is labeled Active and Completed is labeled Ended. The Feedback Hub manual-completion callback now records `manuallyEndedAt`, preserving any existing end timestamp, so a future deadline cannot reopen that explicit ending.

The underlying status rule is unchanged: Archived remains Archived; an explicitly recorded manual ending remains Completed; otherwise a valid deadline determines completion, with a future deadline superseding a stale saved Completed value. No historical end timestamps are invented and no remote records are changed. A legacy ending without a marker and with a future deadline requires an explicit Ended save if the owner intends it closed. Focused regression tests compare the rendered picker badge and main table for future/stale, expired, paused, undated, and manually ended forms. No browser was connected for visual comparison; live Courier status remains unverified.

Evidence: `src/features/evaluations/components/SurveyAccessStatus.tsx`, `src/pages/SurveyFormsPage.tsx`, `src/pages/SurveyFormsPage.test.tsx`, `src/features/evaluations/domain/surveyStatus.test.ts`, and the Feedback Hub callback in `src/App.tsx`.

Local verification: the regression failed before the status resolver fix; all 22 focused tests then passed. The full 289-test suite, all four TypeScript projects, production build, and Git diff whitespace checks passed. The existing large-bundle warning remains. No deployment, migration, or remote data change was performed.


### 2026-10-20 - Analytics consistency audit: observations pending client confirmation

Read-only source/calculation audit; live data and browser rendering were not verified. The 43 focused Analytics/scoring/API/provenance/date tests pass, and additional assert-backed synthetic examples reproduce the calculation differences below. The owner clarified afterward that the client requested different computations for some Analytics metrics. Numeric differences alone are therefore not confirmed defects: validate each metric against its client-approved formula, scope, and label before changing behavior. No scoring formula or business record was changed during this audit.

- Ranking contract distinction (clarified by the 2026-10-20 report-alignment fix below): Analytics uses normalized rubric composites, while `getLeaderboard` also computes a separate confidence-weighted score for other consumers. Analytics now labels its existing computation Rubric Score. Generated company reports use the Analytics score/bands/formatting rather than mixing that score with the confidence-weighted report value. Neither underlying scoring formula was changed.
- Mixed-category questions: `averageByQuestion` in `analytics.ts` groups by question text and normalizes the pooled ratings by the first row's maximum. Identical text with Courier 15/15 and Supplier 4/4 produces 63.3 in All Categories although each category reports 100. Confirm whether these are distinct criteria or an intentionally pooled client measure, and which normalization the client approved.
- Renamed-company details: the canonical leaderboard groups by stable company ID, while `analyticsSnapshot.ts` lowest questions and `getCompanyTrend`/`getCompanyTrendBySeries` still filter by display name. Two evaluations for the same ID under old/new names at 50 and 100 produce a 75-point summary but a 100-point monthly detail and lowest-question score. Name-based peer exclusion can also retain the company's old name as a peer.
- Annual charts: CompanyAnalysisPanel averages monthly means equally, while the main yearly trend averages submissions. One January evaluation at 100 and nine February evaluations at zero produce 50 in the company panel and 10 in the main yearly chart for the same company/scope. Confirm the intended annual aggregation and labeling for each chart; equally weighted monthly means and submission-weighted annual means may intentionally serve different purposes.

Evidence: `src/features/analytics/domain/rankings.ts`, `rankings.test.ts`, `analytics.ts`, `analyticsSnapshot.ts`, `src/features/evaluations/domain/scoring.ts`, and `src/features/analytics/components/CompanyAnalysisPanel.tsx`. These observations do not establish whether the calculations meet the client requirements. Passing current tests is not a substitute for the client-approved metric definitions; do not standardize formulas merely to make different charts match.


### 2026-10-20 - Analytics loading performance (API work reverted 2026-10-21)

The account-level aggregate hook, polling/invalidation requests, and bounded parallel server reader were removed with the Company-wide Analytics rollback. Pure local snapshot computation and the safe missing-localStorage guard remain. Existing store hydration and Realtime refresh supply Analytics response rows.

### 2026-10-21 - Admin experience composition redesign

The Admin dashboard keeps the greeting and welcome banner fixed. Below it, a compact operational summary leads into a full-width action-first ledger for document follow-up, active evaluation forms, evaluation results, and recent submissions; the ledger sections use subtle bordered surfaces, compact actions, and the existing dashboard data and destinations. The Admin desktop sidebar follows Employee rail proportions, stays expanded, and scrolls as one region when its longer navigation exceeds the viewport; the Dashboard footer follows the Employee footer treatment with Admin-specific text. Directory removes its duplicate page title, Evaluation Workspace uses an in-context tab rail, and Response Explorer keeps form selection beside response review. Admin-only layout rules align page spacing, controls, tables, and dialogs with Employee typography and brand tokens. The partner record dialog uses a wider, responsive record layout with a persistent identity header and actions. Employee routes/styles, business rules, permissions, scoring, persistence, and integrations remain unchanged.

Evidence: `src/adminRedesign.css`, `src/adminWorkspace.css`, `src/layouts/Shell.tsx`, `src/features/employee-experience/components/EmployeeExperienceShell.tsx`, `src/features/evaluations/components/EvaluationWorkspace.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/SurveyExplorerPage.tsx`, and `src/pages/PartnerCompaniesPage.tsx`. On 2026-10-21, all 331 tests, all four TypeScript projects, production build, and `git diff --check` passed. No browser tooling was available, so desktop and smaller-viewport render checks were not performed; no deployment or remote data change occurred.

### 2026-10-22 - Feedback Hub workflow presentation

Feedback Hub keeps its three lifecycle tabs and existing survey, scoring, report, queue, timer, delivery, and permission behavior. Its tab rail, unified result/log filters, proportioned tables, category labels, and active-form cards use the Admin workspace tokens. Active cards are keyboard operable; past-result titles open the existing detail view; the Sent Reports Log distinguishes first-use empty from filtered-empty. Survey analytics and progress dialogs use neutral shared chrome, stable headers/footers, and one vertical scroll region; analytics uses aligned category measures and a respondent table. Queue review, return, audit, and timer dialogs follow the same surface treatment. No records or business rules changed.

Evidence: `src/feedbackHub.css`, `src/pages/PartnersFeedbackHubPage.tsx`, and Feedback Hub tab/modal components. On 2026-10-22, all 332 tests, TypeScript checks, the production build, and `git diff --check` passed. No connected browser was available for rendered viewport and interaction review; no deployment or remote data change occurred.
