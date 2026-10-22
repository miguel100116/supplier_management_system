# System functional audit — 2026-10-22

Overall provisional readiness rating: **7/10**. The system passes its automated checks, but this is not an end-to-end or production acceptance sign-off.

## Scope and rating method

Reviewed the local working tree based on `4bf33d9`, including its unpublished changes, and made read-only checks against the Supabase project matched to the running localhost configuration. No browser or native application session was connected. The deployed application may differ from this working tree; deployed configuration was not independently verified. No real accounts, permissions, documents, imports, submissions, or email deliveries were changed to test a workflow.

Scores are engineering judgments of current functional readiness, considering observed behavior, regression coverage, configuration, and known problems. They are not percentages of passing functions. An 8 means strong checks with live acceptance still pending; 6–7 means usable evidence with concrete gaps; 3 means a central part of the workflow is unavailable. No module receives a 9 or 10 without browser and authenticated workflow verification.

## Verified evidence

- `npm test`: **345 passed**, zero failures. These are focused domain, component, source-contract, and mocked-boundary tests, not comprehensive browser coverage.
- `npm run lint`: all four TypeScript projects passed; this command is type checking, not ESLint.
- `npm run build`: passed; the existing large-chunk warning remains.
- `npm audit --json`: zero reported vulnerabilities at every severity at audit time.
- Local `/api/health`: HTTP 200. Anonymous POST to `/api/admin/accounts`: HTTP 401, without creating an account.
- Public runtime configuration used its known public-key allowlist and did not contain the configured server credentials.
- Valid anonymous requests to hosted `app_profiles` and `application_records` were rejected with HTTP 401 / PostgreSQL code `42501`. The public Auth settings endpoint responded successfully. This is not a complete authenticated role/RLS test.
- **7,822 application records across 20 record types** passed the current runtime payload validators. This checks shape/identity, not every cross-record relationship.
- Official Analytics counts: Courier **30**, Supplier **178 countable / 185 source submissions**, Subcontractor **65**. Current and All-Time counts agree after the separately authorized duplicate cleanup.
- Offline company-report checks using the privately retained, same-day verified data snapshot: **37 of 39 scored companies** produced scores matching Analytics; two failed the category contract described below. No matching report had a score discrepancy.
- Presentation data generation passed eight scenarios: each of seven topics separately, then all topics together. Single-topic runs produced five slides each; the combined run produced eleven. No non-finite numbers were found. Empty future-date filtering returned no responses.
- Hosted OpenAPI exposes `renew_partner_document`. Its actual delegated-role authorization and successful mutation were not exercised.

## Module ratings

| Module / function | Rating | What was checked and what remains |
|---|---:|---|
| Password login, access rules, session handling | 8/10 | Auth/RBAC/session regression tests and anonymous rejection checks pass. Real sign-in, password recovery email, logout across actual tabs, and authenticated role-based database access remain unverified. Microsoft login is unavailable locally. |
| Admin Dashboard | 7/10 | Rendering/status/navigation tests pass. The reporting-period label is misleading; see F2. Different metrics must still be assessed against their approved client definitions. |
| Employee Home, Evaluations, My Submissions | 8/10 | Pending-selection, rendered views, draft/leave guards, and submission-state regression coverage pass. Real employee navigation and submission remain unverified. |
| Evaluation Workspace / form builder / Manage Access | 8/10 | Date validation, company presets, distribution confirmation, status resolution, unsaved changes, and permissions tests pass. Actual publish/edit/end journeys and persistence were not performed. |
| Response Explorer | 7/10 | Relevant selection and table/pagination contracts pass; persisted responses validate. Actual search/filter/export interactions require browser testing. |
| Analytics and Company Leaderboard | 8/10 | CSV regression, scoring, official provenance, deduplication, incremental rankings, and date-range tests pass; live stored counts checked. Two cross-category registry references affect reports. Cross-device Realtime timing and chart rendering remain unverified. |
| Partner Directory and Active Companies | 7/10 | Registry records and snapshot/import/presentation tests pass. Two Uncategorized partners have scored evaluations under other categories; see F1. Real create/edit/archive and file-upload journeys were not performed. |
| Document Tracker and renewals | 8/10 | Filters, category entry, keyboard controls, compliance presentation, migration contracts, and sticky-strip regression checks pass; hosted renewal RPC exists. Real renewal, concurrent edits, scroll rendering, and delegated-role enforcement remain unverified. |
| Notifications | 8/10 | Read-state and document-status domain tests pass; stored rules/state validate. Actual alert delivery, role visibility, time rollover, and cross-device read state remain unverified. |
| Import Responses | 8/10 | CSV/XLSX mapping, duplicate detection, classification, isolated-test cleanup, and batch/atomic-write regressions pass. The three retained source archives were verified during cleanup. No new live import was performed in this audit. |
| Archive Center | 7/10 | Archive presentation/import/restore boundary tests pass; 24 stored archive-series records validate. Real restoration/deletion was not performed. |
| Reports and History | 6/10 | Company report/PDF, XLSX, saved-file/recipe, owner-history and failure-path tests pass. Of 39 scored companies, 37 match Analytics and two cannot produce a company report; see F1. Browser downloads, complete Word layouts, and live cross-device history remain unverified. |
| Present | 7/10 | All presentation topics build from the verified data snapshot; package-level PPTX generation regression passes. Asynchronous export completion is defective; see F3. Actual deck controls, fullscreen, and downloaded layout remain unverified. |
| Feedback Hub / send report to partner | 3/10 | Reporting preparation and store tests pass, but local Microsoft configuration is absent, leaving actual email delivery unavailable. No external message was sent. |
| Users / Account Management | 7/10 | Provisioning validation, authorization rejection, provider rollback, passwords, and account-filter tests pass. New-user creation and permission changes were not performed. Static deployment requires a configured API host; its hosted account endpoint was not verified. |
| Category Labels | 8/10 | Save/leave validation, impact confirmation, and persistence contracts pass. Live category edits were not performed. |
| Settings / Profile | 6/10 | Source and profile/session presentation reviewed. Admin Settings currently offers snapshot, account, appearance, and session sections. Clear Local Cache and Recent Activity were removed by the merged workspace changes; older descriptions are stale. Browser controls were not exercised. |
| Navigation and dialogs | 7/10 | Routing, Shell, shared modal lifecycle, nested dismissal, and unsaved-edit tests pass. Admin quick guide has a scroll-container mismatch; see F4. Responsive appearance and actual focus restoration need browser checks. |

## Findings

### F1 — Two partner classifications block company reports (priority 1 for the reporting workflow)

Observed from read-only stored data and an offline report-generation check: one scored Supplier partner and one scored Courier partner are registered as `Uncategorized`. These references cover seven Supplier submissions and five Courier submissions. This is separate from the seven noncountable Supplier forms; the quantities must not be conflated.

The company leaderboard can score those response groups, while `resolveReportCompany` rejects the registered category. In the company report page, the same selection cannot resolve an active partner of the requested category, leaving no exportable company record. The other 37 company scores match Analytics exactly.

Evidence: [companyReportData.ts](../../src/features/feedback-hub/reporting/companyReportData.ts), [CompanyReportBuilderPage.tsx](../../src/pages/CompanyReportBuilderPage.tsx), same-day read-only reference checks. No customer names or raw response contents are retained in this report.

Recommended fix: review the two registry classifications against the master list and approved partner categories, then correct their classification or response-to-partner mapping. Re-run all 39 company checks. Do not silently reclassify partners or weaken the report's category guard.

### F2 — Dashboard “Custom” selects the current period (priority 2)

The Admin Dashboard renders `DashboardDataScopeToggle` with `currentLabel="Custom"`. That button still dispatches `current`; it has no custom date range. A user can mistake current-period results for a chosen date window.

Evidence: [DashboardPage.tsx](../../src/pages/DashboardPage.tsx). Recommended fix: label the existing behavior Current Period, unless custom-date functionality is separately requested.

### F3 — PowerPoint export does not await completion or surface write rejection (priority 2)

`exportSlidesAsPPTX` starts `pres.writeFile(...)` and returns `undefined`. `SlideDeck.handleExport` calls the export without awaiting a completion result and clears its busy state immediately. A delayed failure can become an unhandled promise rejection; the control becomes available again before the write completes.

A stubbed-writer check confirmed the write starts, the service returns no Promise, and the write is still pending after the service returns. This check produced no file. A direct Node/tsx invocation initially hit the package's known CommonJS/default-export interoperability limitation; that is not evidence of a browser constructor failure. The completion-contract check therefore used a bundler with a stubbed writer.

Evidence: [presentationPptx.ts](../../src/features/presentation/services/presentationPptx.ts), [SlideDeck.tsx](../../src/features/presentation/components/SlideDeck.tsx). Recommended fix: return the write Promise, await it in the caller, and display a recoverable failure while preventing repeated exports.

### F4 — Admin quick guide can clip its content (priority 2; source-confirmed, visual reproduction pending)

Shared quick-guide CSS sets the outer dialog to `overflow: hidden; padding: 0` and places scrolling/padding on `.quick-guide-modal-content`. Employee guide markup supplies that wrapper; Admin guide markup does not. Short viewports can hide the lower instructions and Got it action.

Evidence: [AdminQuickGuide.tsx](../../src/layouts/AdminQuickGuide.tsx), [employeeExperience.css](../../src/features/employee-experience/components/employeeExperience.css). Recommended fix: use the same inner content wrapper as the Employee guide, preserving the shared modal lifecycle, then verify short/mobile viewports.

### Configuration gap — Microsoft login and Graph email unavailable locally

The running local public configuration has no Microsoft client/tenant configuration. No end-to-end Microsoft sign-in or partner-email delivery can pass in this configuration. This is a configuration dependency, not evidence that the Graph implementation itself is defective.

Evidence: [msalAuth.ts](../../src/services/msalAuth.ts), [graphMailService.ts](../../src/services/graphMailService.ts), read-only local runtime-config check. Restore the approved Azure configuration and exercise sign-in and one authorized test delivery before marking the workflow ready.

## Acceptance work still required

- Connect an authenticated browser; exercise Admin and Employee critical journeys at desktop and mobile widths, including keyboard, loading, empty, dirty, and failure states.
- Use approved isolated fixtures to test live submission/import/renewal/account/archive writes and their failure recovery, without altering official evaluations.
- Verify each authenticated role at the database boundary. Service-role inspection and anonymous denial do not prove Employee/department access isolation.
- Exercise two authenticated sessions for Realtime insertion, edits, deletion, reconnect, and the requested 1–2 second update target.
- Confirm the hosted application's configuration independently. Local passing checks do not prove deployed behavior.
- Resolve F1–F4 and verify the configured email workflow. No application or data fixes were applied during this audit.

Older operational documents still contain historical statements such as 19 record types, unapplied renewal RPC, and unavailable CI. Current code has 20 application-record types, the inspected host advertises the renewal RPC, and a Verify workflow exists. Historical deployment claims must remain distinct from today's limited hosted checks.
