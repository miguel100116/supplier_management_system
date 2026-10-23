# System findings — October 22, 2026

Findings from the [functional audit](SYSTEM_FUNCTIONAL_AUDIT_2026-10-22.md). Status at audit time: four open issues and one local configuration gap. Update later on October 22: F2 is fixed locally as part of the Dashboard/Analytics/Reports alignment; F1, F3, F4, and C1 remain open. Deployment of the local fix has not been verified.

## Findings list

| ID | Module | Priority | Finding | Impact | Recommended fix |
|---|---|---|---|---|---|
| F1 | Partner Directory / Company Reports | High for reporting | Two scored partners are registered as Uncategorized, although their evaluations belong to Supplier or Courier. | Two of 39 scored companies cannot generate their category-specific company report. Their references cover seven Supplier and five Courier submissions. | Confirm the correct classifications against the master list, then correct the classifications or response mappings. Recheck all 39 reports without weakening category validation. |
| F2 | Admin Dashboard | Fixed locally | The Custom reporting-period button actually selected Current Period and provided no date selection. | Users could misunderstand which period the results represented. | Corrected to Current Period; existing Analytics custom-date scope is preserved and identified correctly. Dashboard evaluation summaries also share the official filtered Analytics/Reports cohort and two-decimal score formatting. |
| F3 | Present / PowerPoint Export | Medium | PowerPoint export starts the file write but does not return or await its completion. | Loading ends too early, repeated exports are possible, and delayed failures may go unreported. | Return and await the export Promise; keep the busy state until completion and show a recoverable error on failure. |
| F4 | Admin Quick Guide | Medium | The dialog lacks the inner scrolling container required by its shared styles. | Instructions and the Got it button can be clipped on short screens. | Add the same inner content wrapper used by the Employee guide; verify desktop, mobile, scrolling, and dismissal. |
| C1 | Microsoft Login / Feedback Hub | Configuration gap | The running local app has no Microsoft client/tenant configuration. | Microsoft sign-in and actual partner-email delivery are unavailable locally. | Configure the approved Azure integration, then verify sign-in and an authorized test email. |

## Evidence and verification

- **F1:** Read-only Supabase inspection and offline report preparation. The other 37 company reports matched Analytics scores exactly. The seven affected Supplier submissions must not be confused with the separate seven noncountable Supplier CSV forms.
- **F2:** Source review of [DashboardPage.tsx](../../src/pages/DashboardPage.tsx).
- **F3:** Source review and a stubbed-writer check confirmed that the file operation remains pending after the export function returns. See [presentationPptx.ts](../../src/features/presentation/services/presentationPptx.ts) and [SlideDeck.tsx](../../src/features/presentation/components/SlideDeck.tsx).
- **F4:** Source-confirmed markup/style mismatch; visual reproduction is pending. See [AdminQuickGuide.tsx](../../src/layouts/AdminQuickGuide.tsx) and [employeeExperience.css](../../src/features/employee-experience/components/employeeExperience.css).
- **C1:** Read-only local runtime-configuration check. This establishes local unavailability, not a defect in Microsoft Graph or the deployed configuration.

## Checks that passed

- All **345 automated tests**.
- All four TypeScript checks and the production build.
- Dependency audit: **zero reported vulnerabilities**.
- Runtime validation of **7,822 application records** across 20 record types.
- Official Analytics counts: **30 Courier, 178 countable Supplier, and 65 Subcontractor evaluations**.
- All seven presentation topics generated slide data individually and together without invalid numeric values.

## Checks still pending

- Authenticated browser journeys at desktop and mobile sizes; no browser session was connected during the audit.
- Live submission, import, renewal, account-management, and archive operations using approved isolated fixtures.
- Authenticated Admin/Employee role enforcement at the database boundary.
- Two-session Realtime updates, reconnect handling, and the requested 1–2 second timing.
- Actual browser downloads, complete document layouts, and live report-history persistence.
- Independent verification of the deployed application's configuration and behavior.

Shared data and application code were not modified during this audit. Existing local work was preserved.
