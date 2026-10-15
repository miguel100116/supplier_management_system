# UI Refactor Plan

**Status:** Phase 0 audit complete; waiting for approval before Phase 1.

**Audit date:** 2026-10-12

**Scope:** Admin first, then Employee; presentation changes only.

## Goal and done criteria

Bring the Supplier Management System’s Admin and Employee screens into one visual language based on the supplied Microgenesis reference, while retaining every existing route, page key, prop contract, handler, permission check, data flow, and business rule.

The work is done when the Admin and Employee phases are each reviewed at 1440px, 1280px, and a mobile width; all requested states are handled; the browser baseline remains Safari 16.4+, Chrome 111+, and Firefox 128+; `npm run lint`, `npm test`, and `npm run build` pass; and screenshots are saved under `docs/ui-refactor/screens/` without new console errors.

## Phase 0 audit

### Evidence and repository state

- The repository is React 18 + TypeScript + Vite 6, Tailwind CSS 4, and a thin Express host. `src/main.tsx` loads `src/styles.css` and mounts `src/App.tsx`; `App.tsx` owns route composition, role-derived page visibility, and data wiring; `src/layouts/Shell.tsx` owns the shared navigation shell.
- The project scan helper was attempted, but Python is unavailable in this environment. Its documented fallback was used: `package.json`, README architecture/browser sections, the CI workflow, and focused source inspection.
- Current gates are `npm test` (Node’s test runner through `tsx`), `npm run lint` (four TypeScript project checks; ESLint is not configured), and `npm run build`. `.github/workflows/verify.yml` runs those gates plus dependency and secret scans on pushes and pull requests.
- The supplied screenshots show Employee Home, its available-evaluations list, and recent submissions at desktop size. No Admin reference screen was supplied. The Admin phase can share the same tokens and component language, but its dense page layouts cannot be pixel-matched to an Admin screenshot that is not present.
- The request names `DESIGN.md`, but no `DESIGN.md` exists in the repository. `docs/SYSTEM_DESIGN_CURRENT_STATE.md` and `docs/BRD_CURRENT_STATE.md` are present as untracked files in the current worktree and were read as the supplied behavior/role references. Source was checked for consequential claims.
- The local skills `design-taste-frontend` and `ui-craft` are not installed under the available Codex skills or plugin cache. The design principles included in the request (intent, hierarchy, complete states, form UX, restrained motion, and avoiding templated dashboard styling) will guide the work unless their skill files are supplied.
- Before edits, `git status --short` showed existing changes in `src/App.tsx`, `src/components/AccountMenu.tsx`, `src/components/NotificationBell.tsx`, and `src/layouts/Shell.tsx`, plus untracked `docs/BRD_CURRENT_STATE.md` and `docs/SYSTEM_DESIGN_CURRENT_STATE.md`. The existing UI diffs include role-specific Admin header/shell styling. Preserve and integrate these changes; do not replace or rewrite those files wholesale. This plan is the only new file in Phase 0.

### Current styling and reusable UI

- `tailwind.config.js` preserves the standard color, spacing, radius, and effect scales and adds `ink` (`#172033`), `steel` (`#40516d`), `azure` (`#2563eb`), `mint` (`#0f9f6e`), and `cloud` (`#f5f7fb`). `shadow-panel` is currently `0 12px 30px rgba(22, 32, 51, 0.08)`.
- `src/styles.css` contains global defaults and reusable `.panel`, nav, button, field, badge, and segmented-control styles, plus a mobile dialog rule. Most page styling is Tailwind utility classes in JSX; color, spacing, and card treatments also appear as page-local class strings. There is no separate page stylesheet system.
- The shared UI layer is `src/layouts/Shell.tsx` and `src/components/`: `AccountMenu`, `ChartCard`, `CompanyAnalysisPanel`, `CompanyLeaderboardPanel`, `CompletionStatusBar`, `EmployeeNotificationBell`, `FilterPanel`, `NotificationBell`, `PageDescription`, `PasswordInput`, `ResponseTable`, `SlideDeck`, `StatCard`, `StateMessage`, `SurveyPreviewModal`, and `TableFilterBar`.
- Feature UI components are grouped under `src/features/`: account management (`NewAccountPasswordField`); active companies (`ActiveCompaniesModal`, `ActiveCompanyUploadCards`); analytics (`AnalyticsDateRangeControls`, `AnalyticsSection`, `AnalyticsToolbar`, `ArchivedCompanyRankings`, `ChampionCard`, `CompanyCombobox`, `PerformanceHighlights`, `QuestionPerformanceRow`); evaluations (`EvaluationWorkspace`, `SurveyDatePicker`, `SurveyDateRangeQuestion`, `SurveyFormsToolbar`); partner companies (`PartnerCompaniesFilterToolbar`). Feedback Hub UI is under `src/components/feedback-hub/` (`BulkHiddenChartCapturer`, `CurrentFormsTab`, `PartnerDirectoryTab`, `PastResultsTab`, `ReturnReasonModal`, `SendToPartnerWizard`, `SentReportsTab`, `SurveyDetailModal`, `SurveyProgressModal`).
- `useModalEscape` is the shared modal lifecycle. New or restyled dialogs must keep its Escape, backdrop, nested-modal, scroll-lock, and focus-restoration behavior.
- The body declares an `Inter`/system fallback stack in `src/styles.css`, but `index.html` does not load a font and no font files are present. There is no heading/body pairing in the current tokens. The screenshot’s letterforms suggest the requested geometric-heading/humanist-body pairing, but the exact families cannot be verified from the raster references or repository documentation.

### Reference spec and proposed token roles

The reference uses a white, full-height left rail (about 265px at the shown desktop width), with the logo lockup, a tracked section label, quiet icon navigation, a pale-blue active item and right-side dot, and a lower guidance card. The top bar begins beside the rail and carries breadcrumbs, help, avatar/name/designation, and menu. The main area uses a pale neutral canvas, an uppercase tracked eyebrow, a dark large heading with a muted supporting line, a soft-blue hero with right-side illustration, then a wide content column and narrow right rail. Cards have white surfaces, fine borders, generous corners, and very little shadow. Lists use airy rows, icon tiles, subtle type badges, outlined arrow actions, and hairline dividers. The voice is brief and warm on Employee screens; Admin copy remains concise and functional.

Use semantic token roles in Phase 1, then sample their actual values from the supplied images before implementing them. Do not guess numeric values where no image pixels are available:

| Token role | Reference use | Current evidence / gap |
|---|---|---|
| `app-canvas`, `surface`, `surface-subtle`, `surface-selected` | Tinted canvas, white cards/sidebar, soft-blue active state | Existing `cloud`, white, and Tailwind blue scales are available; selected fill needs image sampling. |
| `brand`, `text-primary`, `text-secondary`, `border`, `focus` | Links/actions, heading/body hierarchy, hairlines, keyboard ring | Existing `#0063a9`, `azure`, `ink`, slate, and blue ring are in use; the screenshot’s exact values are not established. |
| `type-courier`, `type-subcontractor`, `type-supplier` | Muted type badges and icon tiles | Courier blue and Subcontractor lilac are specified by the brief; Supplier needs a quiet, consistent variant. |
| `status-current`, `status-expiring`, `status-expired`, `status-missing` | Document status treatments with text/icon as well as color | Keep the existing distinct labels and meanings; do not merge them into color-only states. |
| `font-display`, `font-body`, type scale | Geometric display headings, humanist body, tracked eyebrows | Current UI has a single undeclared Inter/system stack and no loaded display font. `DESIGN.md` and font assets are absent. |
| spacing, radius, border, shadow, motion | Compact enterprise layout; rounded cards; restrained effects | Tailwind scales exist, but `.panel` currently applies a more visible shadow than the reference appears to use. Measure and adjust only in the UI phase. |

The screenshots are available inline in this conversation but are not stored as repository image files. Exact color/font sampling therefore remains unverified in this audit. If pixel-level sampling is required, keep accessible reference image files for Phase 1; do not invent a font pairing from appearance alone.

### Screen inventory and visual gaps

**Admin navigation and screens** (source: `adminNavItems` and the page composition in `src/App.tsx`):

- Dashboard — `src/pages/DashboardPage.tsx` (also used by Employees; currently a configurable metrics/widget workspace).
- Partner Companies group — registry `src/pages/PartnerCompaniesPage.tsx`; document register `src/pages/DocumentRegisterPage.tsx`; Feedback Hub `src/pages/PartnersFeedbackHubPage.tsx`.
- Evaluations group — workspace tabs in `src/features/evaluations/components/EvaluationWorkspace.tsx`; forms `src/pages/SurveyFormsPage.tsx`; responses `src/pages/SurveyExplorerPage.tsx`; coverage `src/pages/OutstandingEvaluationsPage.tsx`; create/edit `src/pages/CreateSurveyPage.tsx`; detail `src/pages/SurveyDetailsPage.tsx`.
- Evaluation operations — Archive Center `src/pages/ArchivePage.tsx`; imports/source-file history `src/pages/ImportEvaluationsPage.tsx`; Evaluation Settings/category labels `src/pages/CategoriesManagerPage.tsx`.
- Analytics — `src/pages/AnalyticsPage.tsx`, with presentation components in `src/features/analytics/components/` and shared leaderboard/chart components under `src/components/`.
- Reports & Exports — `src/pages/ReportsPage.tsx`, which composes `SummaryReportBuilderPage.tsx`, `CompanyReportBuilderPage.tsx`, `QuestionReportBuilderPage.tsx`, `ExecutiveSummaryReportBuilderPage.tsx`, and `RawDataExportPage.tsx`; plus `src/pages/PresentPage.tsx` and `src/pages/ExportHistoryPage.tsx`.
- Employees / Users — `src/pages/AccountManagementPage.tsx` and `src/features/account-management/components/NewAccountPasswordField.tsx`.
- Admin notification log — `src/pages/NotificationLogsPage.tsx`, opened through the header notification control; the route is not a top-level Admin sidebar item.
- Settings — `src/pages/SettingsPage.tsx`, opened from the account menu.

**Employee navigation and screens** (source: `employeeNavItems` and route map in `src/App.tsx`):

- Home — `src/pages/DashboardPage.tsx`; its current employee content includes progress gauges and configurable analytics widgets rather than the reference hero/list/right-rail composition.
- Evaluations — route key `fill-form`, rendered by `src/pages/SurveyFillerPage.tsx`; the current sidebar label is “New Evaluation.” The survey, partner, respondent, questions, review, and submit flow is in this component. The screenshot’s direct per-company “Start evaluation” rows are not a separate current page/route.
- My Submissions — route key `my-submissions`, `src/pages/MySubmissionsPage.tsx`.
- Employee notifications — header control `src/components/EmployeeNotificationBell.tsx` and `src/pages/EmployeeNotificationLogsPage.tsx`.
- Profile/session preferences — `src/pages/ProfilePage.tsx`, opened from the account menu.
- A Quick Guide screen or guide destination was not found in `src/`. The sidebar extension point `sidebarExtra` exists in `Shell`, but `App` does not pass it.

**Shared entry and non-nav screens:** login `src/pages/LoginPage.tsx`; password recovery `src/pages/PasswordRecoveryPage.tsx`; profile/settings and notification dialogs above. Shared evaluation/report views are listed under their Admin workflow owners because that is where they are composed today.

| Screen area | Gap against reference / plan |
|---|---|
| Shared shell | Current `Shell` places the logo block in the full-width top header and starts the sidebar below it; reference has a full-height rail with the top bar only in the remaining content area. Preserve Admin/Employee nav contracts, mobile menu behavior, and the existing uncommitted Admin appearance changes while changing presentation. |
| Admin pages listed above | No Admin screenshot is available. Keep their current data density and controls, then apply the reference’s surfaces, typography, hierarchy, table/filter/action patterns, and state treatments. Audit each screen against source before visual changes; do not invent Admin-specific layouts from the Employee screenshot. |
| Employee Home | Current progress gauges, widget catalog/customization, and analytics cards differ from the reference hero, ready-for-feedback list, stepper rail, and history card. Reuse current dashboard data and callbacks only; identify which existing values can populate each reference region before moving content. |
| Employee Evaluations | The reference’s list of partners with individual start actions is not a dedicated current screen. Preserve the `fill-form` route/handler and current survey/company selection behavior; do not add a new route or skip form steps without explicit approval. |
| Quick Guide | No in-app guide destination was found. The visual CTA’s destination/content needs an existing target or a product decision before adding behavior. |
| Forms, document tracker, imports, modals, reports | Reusable global controls exist, but page-local Tailwind variants remain. Restyle repeated patterns through shared components where repetition is real; retain existing page-specific controls and all empty/loading/error/disabled states. |

## Immutable behavior and boundary checks

The refactor must remain in presentation/layout code. Do not edit `src/services/**`, `src/utils/rbac.ts`, `src/utils/pageRouting.ts`, `src/types/**`, `src/features/**/domain/**`, `server.ts`, `supabase/**`, environment/config files, or persistence/auth/permission/scoring/import/provenance logic. Preserve handlers, keys, props, and data flows in `src/App.tsx` even where markup is reorganized.

Verified UI guardrails for later phases:

- `hasPageAccess` in `src/utils/rbac.ts` forces Archive Center to Admin-only even if an employee has a stale page override. Keep it hidden and inaccessible to non-Admins; an older table in `SYSTEM_TURNOVER.md` still describes Managerial/Director defaults, so the executable guard is the current evidence.
- `src/features/analytics/domain/responseProvenance.ts` distinguishes official (`client_csv`, `production_submission`) from test submissions. Keep test-vs-official labels and Analytics treatment clear. Do not change the documented lower-rank Analytics gap or broaden raw data access.
- `src/pages/DocumentRegisterPage.tsx` distinguishes Current, Expiring Soon, Expired, and Missing in text and presentation styles. Retain distinct status text/meaning and do not rely on color alone.
- `src/hooks/useIdleSessionTimeout.ts`, `src/utils/sessionTimeout.ts`, and the warning flow in `src/App.tsx` implement a 25-minute inactivity warning and 30-minute logout. Restyle only; retain timing and dismissal/session behavior.
- Keep modal lifecycle registration in `useModalEscape`; retain current responsive, dark-mode, keyboard, and dismissal behavior unless a specific visual change requires a separately tested presentation adjustment.

## Proposed implementation order

1. **Phase 1 — Foundation:** define measured semantic CSS/Tailwind tokens, then reshape the shared shell (full-height rail, content top bar, responsive collapse/mobile behavior). Preserve the existing Shell prop API, role-specific nav items, navigation handlers, and current user changes. Confirm the font family before loading a new font.
2. **Phase 2 — Shared components:** align/reuse nav item, eyebrow/page heading, cards, count/type badges, filter pills, outlined and text-arrow actions, icon tiles, helper notes, step rail, summary tiles, tables, fields, modal/toast/state patterns, and account menu. Extract only patterns used across multiple screens; do not add a speculative abstraction.
3. **Phase 3 — Admin:** Dashboard, Partner Registry, Document Tracker, Evaluation Workspace/forms/responses/coverage, Analytics, Reports/Exports/Present, Imports, Archive, Users, Feedback Hub, Settings, and notifications. Preserve each screen’s current hierarchy of controls and functional density while applying shared components.
4. **Phase 4 — Employee:** Home, Evaluations entry, My Submissions, the evaluation form flow, and guide affordance. Use the screenshot structure where existing state/data supports it; stop for a decision if matching it would require a new route, new data, or skipped evaluation steps.

## Files and verification plan

**Likely UI implementation files:** `tailwind.config.js`, `src/styles.css`, `src/layouts/Shell.tsx`, selected files in `src/components/` and `src/components/feedback-hub/`, relevant `src/features/*/components/`, and the page files listed above. `index.html` or a self-hosted font asset may be needed only after the font is identified. Add/update focused UI tests where existing coverage can protect observable behavior. Save requested captures under `docs/ui-refactor/screens/` with role/page/viewport names; do not commit unrelated generated artifacts.

**Deliberately untouched:** all immutable behavior/persistence boundaries listed above; `.env*`; route/page key definitions; user-created current-state docs; and the existing uncommitted source changes until they are reviewed and incorporated. No dependencies, libraries, or visual assets are to be added without a demonstrated need.

**Per-phase gate:** run `npm run lint`, `npm test`, and `npm run build`; manually check no console errors, direct navigation, keyboard/focus behavior, requested state variants, and screenshots at 1440px, 1280px, and mobile. Compare screenshots with the same route and state. Check responsive overflow and reduced-motion behavior. Report checks by their actual scope (`lint` is TypeScript checking, not ESLint).

**Rollback:** keep each phase a presentation-only, reviewable slice. Revert only that phase’s UI commit/diff if it fails, preserving the pre-existing worktree changes; no database migration, remote write, deploy, or route/data migration is part of this plan.

## Phase 0 result

Created this plan only. No application code, tests, screenshots, or business data were changed. No application gates were run for this documentation-only audit. Waiting for confirmation before Phase 1.
