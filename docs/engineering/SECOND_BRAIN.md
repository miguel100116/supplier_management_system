# Supplier Management System — Engineering Second Brain

Last verified: 2026-10-12

This document preserves durable engineering context for maintainers and coding agents. It is a map, not a substitute for reading the relevant code. Verify details before making consequential changes.

## Product intent

The Supplier Management System is an internal application for evaluating and managing Couriers, Suppliers, and Subcontractors. It covers surveys, analytics, rankings, compliance documents, imports, report generation, feedback delivery, account access, and archiving.

Canonical product documentation:

- `README.md` — product scope, architecture, modules, setup, and known issues.
- `SYSTEM_TURNOVER.md` — operational handoff and current implementation status.
- `docs/Admin_Manual.docx` and `docs/Employee_Manual.docx` — role-specific user manuals.

## Verified system map

### Runtime

- React 18 and TypeScript frontend built with Vite 6.
- Tailwind CSS for styling and Recharts for analytics visuals.
- Thin Express host in `server.ts` for Vite development middleware, runtime public configuration, health checks, and production static serving.
- Client navigation maps `PageKey` values through `src/utils/pageRouting.ts` to canonical paths that match visible module names while accepting legacy route aliases. Direct paths and browser Back/Forward use the History API; selected survey IDs are carried in query parameters. `server.ts` and Vite already provide the SPA fallback. Browser Back and same-page survey switches during an in-progress evaluation keep the draft warning and restore the current state if the respondent cancels.
- Vercel static SPA deployments use the root `vercel.json` rewrite to serve `index.html` for frontend paths on direct requests and refreshes; `/api/*` is excluded and requires its own configured API host.
- `server/index.js` is a second, overlapping server implementation and should be treated as legacy until its consumers are verified.
- Main commands are declared in `package.json`: `dev`, `build`, `start`, `preview`, and `lint`.
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
- `npm test` covers focused domain, persistence-contract, import, mapping, and authorization helpers; broader component, integration, and end-to-end coverage is not yet established. Use the current command output as the source for the exact test count.
- CI correction (2026-10-06): `.github/workflows/verify.yml` runs on pushes and pull requests with Node 22, `npm ci`, explicit TypeScript checks, tests, a production build, dependency auditing, a separate secret scan, and build-artifact upload.
- The TypeScript source under `src/` is roughly 65,000 lines across about 100 files.
- Major concentration points include `src/hooks/useSurveyData.ts`, `src/App.tsx`, several page components above 1,000 lines, and a very large generated/static partner seed file.
- `.vite/` cache files are tracked despite being generated artifacts.
- Root-level extraction scripts, generated text, screenshots, forms, and data exports make source ownership and release contents less clear.
- The working tree contained pre-existing uncommitted application and configuration changes when these agent rules were added. Every task must refresh `git status` and preserve unrelated work.

## Architectural pressure points

1. **Migration completion** — production still requires an explicitly authorized migration/deployment and post-cutover reconciliation; staging alone is not production proof.
2. **Large orchestration units** — central hooks and pages mix state, business rules, persistence, and presentation, increasing regression risk.
3. **Business-rule duplication** — scoring, RBAC, filtering, reporting, and status rules need canonical domain modules.
4. **Boundary validation** — CSV/XLSX, browser storage, auth claims, Supabase rows, and API responses require runtime validation.
5. **Delivery confidence** — missing automated tests and CI leave type checking and manual testing as the primary gates.
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

Evidence: `src/features/feedback-hub/reporting/`, `src/utils/companyReportExport.ts`, `src/features/feedback-hub/reporting/companyReportData.test.ts`

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

Evidence: `src/services/applicationRepository.ts`, `src/hooks/useSurveyData.ts`, `src/App.tsx`, `src/utils/feedbackHubStore.ts`, `src/utils/documentNotificationSettings.ts`, `supabase/migrations/202609160002_application_persistence.sql`, `supabase/migrations/202609160003_secondary_shared_modules.sql`, `supabase/verification/application_persistence_checks.sql`

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

Evidence: `src/utils/notificationReadState.ts`, `src/services/applicationRepository.ts`, `src/hooks/useSurveyData.ts`, `supabase/migrations/202609170003_notification_read_state.sql`

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

Evidence: `src/App.tsx`, `src/pages/LoginPage.tsx`, `src/hooks/useSurveyData.ts`, `src/utils/feedbackHubStore.ts`, `src/pages/PartnersFeedbackHubPage.tsx`, `.env.example`

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

Evidence: `src/components/TableFilterBar.tsx`, `src/utils/tableFilters.ts`, operational table consumers under `src/pages/` and `src/components/feedback-hub/`

### 2026-09-22 - Analytics ranking consistency boundary

Status: accepted

Context: Analytics ranking logic was duplicated in the page, and the best/least-performing chart could sort by one value while displaying another. The ranking-mode behavior documented in this historical entry was superseded on 2026-10-09.

Decision: Keep company-ranking preparation in `src/features/analytics/domain/rankings.ts`. At the time of this entry, ranking consumers passed the selected ranking mode and charts displayed the same score used for ordering. Current rankings use volume-weighted scores only. Scope calculations to the already filtered response slice and exclude all-N/A composites from ranked results.

Consequences: Champion cards, leaderboards, and best/least-performing charts consistently honor survey filters and use the same ranking score. Focused domain tests cover volume-weighted ordering, displayed score selection, active survey types, and ranking direction.

Evidence: `src/features/analytics/domain/rankings.ts`, `src/features/analytics/domain/rankings.test.ts`, `src/pages/AnalyticsPage.tsx`

Correction (2026-10-06): Analytics' Company Leaderboard had drifted back to grouping submissions by display name and recalculating ranking scores in the page. It now uses canonical company aggregation, stable company identity grouping, and displays the selected ranking score. All-N/A companies remain outside scored Analytics ranks. Separate partner-type lists are normalized when the All categories view combines them. Evidence: `getAnalyticsCompanyRankings` in `src/features/analytics/domain/rankings.ts` and its consumer in `src/pages/AnalyticsPage.tsx`.

Correction (2026-10-07, superseding the prior benchmark-5 note): Analytics volume-weighted scores use Bayesian confidence weighting. For each scored peer group, `C` is the unweighted mean of peer company averages and `m` is the median peer response count, with a minimum of 3; the score is `(R × v + C × m) / (v + m)`. Analytics current, archived, and performance rankings use the canonical `computeRankScore` path. Evidence: `src/utils/analytics.ts`, `src/utils/scoring.ts`, and `src/features/analytics/domain/rankings.ts`.

Correction (2026-10-09): Pure Average ranking has been removed. Analytics current-period, archived-period, performance, and standalone company leaderboard rankings now use volume-weighted scores only; raw composite averages remain available for score and reporting metrics. Evidence: `src/features/analytics/domain/rankings.ts`, `src/utils/scoring.ts`, `src/pages/AnalyticsPage.tsx`, and `src/components/CompanyLeaderboardPanel.tsx`.

Correction (2026-10-09): Reports now use `getAnalyticsCompanyRankings` for volume-weighted company ordering and score display, with the same official, globally filtered response slice supplied to Analytics. Company report summaries and PDF/DOCX exports label the adjusted value as Volume-Weighted Score; rubric-based `compositeScore` remains unchanged for score breakdowns. Evidence: `src/App.tsx`, `src/pages/ReportsPage.tsx`, report builders, `src/features/feedback-hub/reporting/companyReportData.ts`, and `src/utils/companyReportExport.ts`.

Correction (2026-10-06): Survey Forms → Modify → Ended now remains Completed even when its deadline is in the future, saves the status, and archives the active response rows for each ended partner type under a dated archive series. The Analytics Company Leaderboard Archives tab lists each category-period; selecting one opens a modal with its canonical company ranking. The same response rows are visible in Archive Center and remain restorable there. On remote persistence failure, the modal stays open with a retry message; the category archive is idempotent for that dated series. No partner registry records or database schema are changed. Evidence: `getSurveyStatus`, `SurveyFormsPage`, `archiveResponsesForSurveyTypes`, and `ArchivedCompanyRankings`.

Correction (2026-10-08): Count a unique submission only when at least one evaluation rating or designated remark has a real answer. Numeric zero counts; blank, N/A, none, dash, and nil markers do not. Metadata such as Period Covered never counts. Meaningful text in unscored answer fields qualifies; explanatory comment details on a scored N/A do not. Imported Subcontractor matrix remarks qualify even though the importer stores them on matrix rating rows. Blank/N/A-only submissions are excluded from totals and completion progress, while numeric score averages continue to use numeric ratings. Period response counts and report/dashboard evaluation counts use the same rule. Evidence: `hasAnsweredItem` and `submissionCount` in `src/utils/analytics.ts`, plus `src/utils/scoring.ts`, `src/utils/surveyCompletion.ts`, and their UI consumers.

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

Evidence: `package.json`, `package-lock.json`, `src/utils/exportDependencies.test.ts`, `.nvmrc`, `.github/workflows/verify.yml`, `docs/engineering/DEPENDENCY_SECURITY.md`.

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

Evidence: `src/pages/ImportEvaluationsPage.tsx`, `src/utils/rawEvaluationImport.ts`, `src/hooks/useSurveyData.ts`, `src/features/evaluation-imports/domain/importArchive.ts`.

### 2026-10-06 - Isolated evaluation test imports and removal

The Admin import page offers Test import with a unique `test-workbook:<uuid>` batch per selected source file. Test mode accepts single-category CSV exports or Excel workbooks with one or more recognized Supplier, Subcontractor, and Courier forms, including several files per category. Extensionless files with recognized CSV/XLSX MIME types receive the matching extension before archiving. Missing form categories are skipped only when their headers do not match; malformed recognized forms fail the preview. Test `client_csv` responses enter Analytics using `TESTIMPORT-*` IDs, preserving existing source-ID rows. Unmatched companies created for the test carry `testImportBatchId`, remain archived, and are excluded from subsequent company matching. Stored Source Files separates Active Imports from Import History. Active imports have an archive action that preserves their stored file and response data. Permanent removal is available only in History: ordinary imports lose only the selected stored source file and archive record, while test imports also delete tagged responses and temporary partners. Test cleanup rejects identity mismatches and partners referenced by other evaluations. Realtime invalidation refreshes Analytics. Test deletion spans multiple Supabase requests and is not atomic; a failed step leaves the archive entry available for retry. The archive migration is applied in staging; the multi-file test-import journey has not yet been verified there.

Evidence: `src/features/evaluation-imports/domain/testImport.ts`, `evaluationFilePreview.ts`, their workbook/CSV/cleanup tests, `src/utils/rawEvaluationImport.ts`, `src/features/evaluation-imports/services/evaluationImportArchiveService.ts`, and `src/pages/ImportEvaluationsPage.tsx`.

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

Decision: Group existing `survey-forms`, `explorer`, and `pending-review` routes under one Admin sidebar destination with Forms, Responses, and Coverage view buttons. Retain the existing route keys and authorization checks. Evaluation Settings reuses `categories-manager` with a Category Labels section; archive/import remain separate. This is a navigation change, with existing response matching and coverage rules retained.

Evidence: `src/App.tsx`, `src/features/evaluations/components/EvaluationWorkspace.tsx`, `src/pages/CategoriesManagerPage.tsx`.

### 2026-10-02 - Survey deadline status

Decision: For a survey with a valid deadline, status remains Running or Paused through the deadline day and becomes Completed afterward; Archived always stays Archived. A future deadline supersedes a stale Completed value. Surveys without a valid deadline retain their saved manual status. The Forms page refreshes at the deadline boundary, and changing a deadline through Modify Settings reconciles the saved status.

Evidence: src/utils/surveyStatus.ts, src/pages/SurveyFormsPage.tsx, src/utils/surveyCompletion.ts, src/utils/employeeNotifications.ts, src/utils/surveyStatus.test.ts.


### 2026-10-02 - Survey response review and export

Decision: The Evaluation Workspace Responses tab lists current, access-scoped submissions for a selected survey without dashboard filters. Explicit survey IDs take precedence; legacy rows without IDs match only when their question IDs uniquely identify a survey of that type. Email search filters the list, while Excel export offers all or filtered submissions. Workbook creation runs in a browser worker. Archived responses remain in Archive Center.

Evidence: src/App.tsx, src/pages/SurveyExplorerPage.tsx, src/features/evaluations/domain/surveyResponses.ts, src/features/evaluations/workers/surveyResponsesExport.worker.ts.

### 2026-10-07 - Evaluation import responsiveness

Decision: Archive selected evaluation source files with at most three concurrent uploads. Once archiving succeeds, apply imported responses and any new partner records to the current client state immediately, then persist them to Supabase. On persistence failure, restore unsaved IDs and rely on the repository's Realtime invalidation/refetch to reconcile partial writes. Application-record upserts send at most four 300-row chunks concurrently; newly created partner records remain saved before responses that may reference them.

Evidence: `src/features/evaluation-imports/domain/evaluationBatch.ts`, `src/hooks/useSurveyData.ts`, and `src/services/applicationRepository.ts`. This improves perceived latency and reduces sequential round trips; single-file transfer time remains dependent on file size and network throughput.

### 2026-10-12 - Evaluation source import classification

Evaluation source archives may carry explicit `importStatus` metadata after a confirmed normal replacement or user archival. The old archive is marked historical after replacement only when its batch ID is unique and no client CSV responses remain linked; its Storage object is retained and the new archive remains a separate record. User archival marks an active import historical while preserving its file and responses. Stored Source Files classifies unmarked legacy archives from response rows still linked to their import batch, shows Active Imports and Import History counts, and offers permanent removal only in History. Removing an ordinary historical archive removes only that archive's Storage object and metadata, preserving response rows and other copies even when the batch ID is shared. Bulk download uses the existing per-file download mechanism for each selected source. Status and category tabs share a muted selected style; active rows use a green status badge.

Evidence: `src/features/evaluation-imports/domain/importArchive.ts`, `services/evaluationImportArchiveService.ts`, `hooks/useEvaluationImportArchives.ts`, and `src/pages/ImportEvaluationsPage.tsx`.

### 2026-10-02 - Shared modal scroll behavior

Decision: Open dialogs registered through useModalEscape share a reference-counted document scroll lock. The lock fixes the body at its current scroll position, compensates for scrollbar width, and restores the original inline styles and position when the last dialog closes. Popovers can opt out; the employee notification dropdown does so. Modal content remains independently scrollable with overscroll containment in the Active Companies, Settings, and Modify Settings views.

Evidence: src/hooks/useModalScrollLock.ts, src/hooks/useModalEscape.ts, src/components/EmployeeNotificationBell.tsx, src/features/active-companies/components/ActiveCompaniesModal.tsx, src/App.tsx, src/pages/SurveyFormsPage.tsx, src/hooks/useModalScrollLock.test.ts.

### 2026-10-09 - Evaluation company selection presets

Decision: The Admin company picker offers active companies only. “Within the Top 20” is available for Courier, Supplier, and Subcontractor surveys. It follows the selected category's current official, volume-weighted Analytics leaderboard, then fills remaining spots with active unscored companies (alphabetically) until 20 companies are selected or the active registry is exhausted. “Active Companies” selects the full active list. The standalone Supplier Ranking module and curated `evaluationRank` fallback were removed. Surveys without a saved company selection include all active companies of their survey type. Explicit selections gate employee evaluation through `getSurveyEvaluationCompanies`; the leaderboard preset is saved as an ID snapshot so later score changes do not silently shift an active survey's company list.

Evidence: `src/features/evaluations/domain/leaderboardSelection.ts`, `src/pages/SurveyFormsPage.tsx`, `src/utils/analytics.ts`, `src/pages/SurveyFillerPage.tsx`.

### 2026-10-12 - Document expiry notification accuracy

Decision: Expiry status uses local calendar dates and the shared compliance calculator. Company summaries inspect each branch independently and retain exact affected document details. Missing or invalid dates for expiry-bearing document types are Missing; AFS continues to use its fiscal-year `For Update` rule and is reported separately from a date-expired document. The admin header bell and Notification Logs include document, branch, due date, and configured early-milestone details. The status calculation refreshes every minute while the app is open.

Evidence: `src/utils/compliance.ts`, `src/hooks/useSurveyData.ts`, `src/components/NotificationBell.tsx`, and `src/pages/NotificationLogsPage.tsx`.

### 2026-10-12 - Backdrop dismissal shares the modal Escape callback

Decision: Every modal registered with `useModalEscape` closes through the same request-close callback when Escape is pressed or a pointer-down directly targets its backdrop. Clicks inside dialog content are ignored. Confirmation dialogs dismiss without invoking the confirmation action; nested dialogs use the existing priority stack.

Evidence: `src/hooks/useModalEscape.ts`, `src/hooks/modalDismissal.ts`, and modal registrations across `src/`.
