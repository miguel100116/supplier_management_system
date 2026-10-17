# Supplier Management System — Engineering Second Brain

Last verified: 2026-09-21

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
- `server/index.js` is a second, overlapping server implementation and should be treated as legacy until its consumers are verified.
- Main commands are declared in `package.json`: `dev`, `build`, `start`, `preview`, and `lint`.

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

### Authorization

- UI access is derived from role, designation, department, and overrides.
- Supabase password identity and session restoration are integrated in the frontend; localStorage is not trusted as identity when Supabase is configured.
- The applied database schema enables RLS. Shared reference records are readable by confirmed `@mgenesis.com` users; configuration/registry writes are role-restricted; users may insert only their own evaluations and permitted operational records; response reads are scoped by role, department, or ownership. Security-definer authorization helpers live in the unexposed `private` schema, and policy checks are consolidated to one policy per operation.
- `supabase/schema.sql` currently contains clearly labeled temporary anonymous response policies. They are a production blocker if enabled.

## Current repository health

Verified on 2026-09-21:

- `npm run lint` succeeds and runs TypeScript checks for both application and import scripts; ESLint is not configured.
- `npm test` covers focused domain, persistence-contract, import, mapping, and authorization helpers; broader component, integration, and end-to-end coverage is not yet established. Use the current command output as the source for the exact test count.
- No repository CI workflow is present.
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

Context: Analytics ranking logic was duplicated in the page, and the best/least-performing chart always used volume weighting even when users selected Pure Average. It could therefore sort by one value while displaying another.

Decision: Keep company-ranking preparation in `src/features/analytics/domain/rankings.ts`. Every ranking consumer must pass the selected ranking mode, and charts must display the same score used for ordering. Scope calculations to the already filtered response slice and exclude all-N/A composites from ranked results.

Consequences: Champion cards, leaderboards, and best/least-performing charts consistently honor survey filters and ranking mode. Focused domain tests cover pure versus weighted ordering, displayed score selection, active survey types, and ranking direction.

Evidence: `src/features/analytics/domain/rankings.ts`, `src/features/analytics/domain/rankings.test.ts`, `src/pages/AnalyticsPage.tsx`

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

Status: implemented locally; Supabase migration has not been applied

Decision: Store the original Supplier, Subcontractor, and Courier Microsoft Forms exports in the private `evaluation-import-archives` Storage bucket before committing parsed responses. Persist validated file metadata in Admin-only `evaluation_import_archive` application records and expose recent files with authenticated downloads on the Import Evaluation Responses page. Restrict files to 25 MB and the supported CSV/XLS/XLSX types; remove the uploaded object if metadata persistence fails.

Consequences: The import is stopped if the original file cannot be archived, preventing a successful response import without its source file. Migration `202609300001_evaluation_import_archives.sql` creates the private bucket, Admin-only object policies, and application-record type. Apply that reviewed migration to the intended Supabase environment before relying on this workflow; it has not been applied remotely.

Evidence: `src/features/evaluation-imports/`, `src/pages/ImportEvaluationsPage.tsx`, `src/services/applicationRepository.ts`, `src/services/applicationRecordSchemas.ts`, `supabase/migrations/202609300001_evaluation_import_archives.sql`.

### 2026-10-01 - Import all evaluation categories from one workbook

Status: implemented locally; production behavior has not been verified

Decision: The Admin import page accepts one `.xlsx` or `.xls` workbook and detects exactly one worksheet for each Supplier, Subcontractor, and Courier form by its official company-name header. It previews all categories together, reviews unmatched company decisions in one dialog, archives the workbook once as a Combined source file, and upserts all categorized response rows together. Each row must have its source `ID`; that ID plus survey type forms the stable response key. Company resolution continues to check the full Partner Registry, including archived and differently classified entries.

Consequences: Combined source archive metadata uses `surveyType: Combined` under the existing record type and private bucket; no database migration is required because the archive type is validated in the application payload. A failed/partial multi-request Supabase write is not a database transaction and can still require refresh/retry. CSV remains unsupported for combined workbooks.

Evidence: `src/pages/ImportEvaluationsPage.tsx`, `src/utils/rawEvaluationImport.ts`, `src/hooks/useSurveyData.ts`, `src/features/evaluation-imports/domain/importArchive.ts`.

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

### 2026-10-02 - Shared modal scroll behavior

Decision: Open dialogs registered through useModalEscape share a reference-counted document scroll lock. The lock fixes the body at its current scroll position, compensates for scrollbar width, and restores the original inline styles and position when the last dialog closes. Popovers can opt out; the employee notification dropdown does so. Modal content remains independently scrollable with overscroll containment in the Active Companies, Settings, and Modify Settings views.

Evidence: src/hooks/useModalScrollLock.ts, src/hooks/useModalEscape.ts, src/components/EmployeeNotificationBell.tsx, src/features/active-companies/components/ActiveCompaniesModal.tsx, src/App.tsx, src/pages/SurveyFormsPage.tsx, src/hooks/useModalScrollLock.test.ts.

### 2026-10-16 - Task-focused admin navigation

Status: superseded by the URL-backed navigation decision dated 2026-10-17.

Decision: The Admin sidebar exposes seven direct destinations: Dashboard, Partners, Evaluations, Analytics, Reports, Users & Access, and Archive. Related existing routes remain unchanged and are presented as contextual module views: partner directory/compliance/ranking/feedback, evaluation forms/responses/coverage/import/settings, and report creation/presentations/export history. Sidebar, page-heading, and account-permission terminology now use the same module names. Employee navigation is unchanged.

Consequences: Primary Admin modules require one sidebar click instead of expanding a group first. Existing authorization and persistence boundaries are unchanged, and secondary route keys remain available for compatibility. The shared `ModuleWorkspace` presentation keeps concise contextual navigation consistent across workflows without repeating each view's function above the page content.

Evidence: `src/App.tsx`, `src/components/ModuleWorkspace.tsx`, `src/features/evaluations/components/EvaluationWorkspace.tsx`, `src/pages/AccountManagementPage.tsx`, and focused navigation tests. All 131 tests, TypeScript checks, and the production build passed locally on 2026-10-16.

### 2026-10-16 - Centralized application design system

Status: implemented locally; rendered browser comparison remains pending.

Decision: Standardize the interactive application on local Inter typography and semantic Tailwind tokens for the approved brand, surface, text, border, and status palette. Shared panels, buttons, fields, badges, tabs, page descriptions, KPI cards, chart cards, empty states, filter labels, and shell page headings now own the common visual contract. Existing dark mode, responsive behavior, chart/category colors, navigation, permissions, and persistence behavior remain in place.

Consequences: The primary brand color and hover color are consistent across application and export surfaces, the shell uses the approved 28px page heading, shared KPI values use 30px bold type, and modules can migrate away from one-off utility combinations incrementally. Inter is bundled locally through `@fontsource-variable/inter`; no runtime font service is required.

Evidence: `tailwind.config.js`, `src/styles.css`, `src/main.tsx`, `src/layouts/Shell.tsx`, shared presentation components under `src/components/`, analytics presentation components, and the repository-wide primary-color migration.

### 2026-10-16 - Centralized navigation terminology and page hierarchy

Status: superseded in part by the canonical terminology and route hierarchy dated 2026-10-17.

Decision: Keep existing route and permission keys while centralizing primary navigation labels, workspace view labels, page titles, breadcrumbs, and parent-sidebar selection in `src/navigation/navigationConfig.ts`. Use Dashboard as the page H1 with the personalized welcome as supporting text. Use semantic breadcrumbs for Admin workspace and Evaluation detail views, and use New Evaluation consistently for employee form entry.

Consequences: Partner, Evaluation, and Report subviews now identify the current view in the H1 while retaining their parent sidebar selection. Create, edit, view, and Admin fill-form routes select Evaluations. User-visible legacy names such as Document Tracker, Account Management, Archive Center, and Survey Forms tab were updated without renaming internal route keys, persistence keys, or components.

Evidence: `src/navigation/navigationConfig.ts`, `src/App.tsx`, `src/layouts/Shell.tsx`, `src/features/evaluations/components/EvaluationWorkspace.tsx`, focused navigation tests, `README.md`, and `SYSTEM_TURNOVER.md`.

### 2026-10-17 - Canonical URL-backed module navigation

Status: implemented locally; rendered desktop/mobile browser comparison and hosted Vercel verification remain pending.

Decision: Retain the existing `PageKey`, permission, component, and persistence contracts while making browser paths canonical through `src/routes/paths.ts` and `src/routes/appRouter.ts`. The Admin shell groups Partners (Directory, Documents, Feedback), Evaluations (Workspace, Archive, Import Responses), and Reports (Generate, Present, Export History); Dashboard, Analytics, and Users remain direct destinations, with Notifications and Settings pinned at the bottom. Employees use Home, Assigned Evaluations, My Submissions, Notifications, and Profile. History API synchronization supplies deep links, back/forward behavior, role guards, and centralized redirects without adding a routing dependency.

Consequences: User-visible terminology is Evaluation and Partner while legacy internal identifiers remain stable. Unauthenticated application paths resolve to `/login`; authenticated employees cannot enter `/admin/*`. Express 4 and Vercel serve `index.html` for client routes while excluding `/api`, and Vite emits root-relative assets. Existing Supabase RLS remains the authorization boundary; client guards are a usability layer.

Evidence: `src/routes/paths.ts`, `src/routes/appRouter.ts`, `src/config/navigation.ts`, `src/layouts/Shell.tsx`, `src/layouts/WorkspaceLayout.tsx`, `src/App.tsx`, `server.ts`, `vite.config.ts`, `vercel.json`, and focused route/fallback tests.
