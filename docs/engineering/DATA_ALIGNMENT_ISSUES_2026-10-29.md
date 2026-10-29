# Six reported data-alignment issues

Date: 2026-10-29

Status: Open; documentation only

The owner supplied six findings described as confirmed by ChatGPT Desktop. The review below found supporting code paths, but it was interrupted before independent reproductions and end-to-end verification were completed. Treat these as reported issues with static evidence, not six independently verified failures in the deployed environment.

No fixes for these six findings have been implemented. Proposed corrections and acceptance criteria below are follow-up work, not authorization to change application code or remote data. Existing unrelated working changes are preserved.

## 1. Analytics groups imported dates incorrectly

**Reported behavior:** valid imported submissions can appear under incorrect month/year labels or split into separate date groups.

**Code evidence:** `monthlyTrend` and `yearlyTrend` slice the original `submissionDate` string using `slice(0, 7)` and `slice(0, 4)`. Those expressions assume ISO date strings. For example, `7/23/2026 09:33:28` produces `7/23/20` and `7/23`, rather than `2026-07` and `2026`.

**Sources:** [Analytics domain](../../src/features/analytics/domain/analytics.ts), [timestamp parser already used by Dashboard](../../src/features/dashboard/domain/submissionTimestamp.ts).

**Verification needed:** exercise equivalent legacy and ISO timestamps through the actual Analytics input path. Confirm which imported formats reach the trend functions without prior normalization, including month/year boundaries in the source time zone.

**Proposed correction:** use one strict timestamp/calendar-date interpretation for grouping. Preserve source timestamps and keep invalid dates distinguishable from valid groups.

**Acceptance:** equivalent dates share the correct month/year bucket; totals are retained; invalid values do not create misleading calendar labels; boundary cases have regression coverage.

## 2. Presentation date filters omit valid imported submissions

**Reported behavior:** a valid imported submission disappears when a custom or rolling date filter is selected.

**Code evidence:** `filterByDateRange` compares `submissionDate.slice(0, 10)` lexically with ISO date bounds. A legacy value such as `7/23/2026` does not sort like `2026-07-23`. `describeDateRange` also slices and sorts raw strings for its All Time label.

**Source:** [Presentation domain](../../src/features/presentation/domain/presentation.ts).

**Verification needed:** select July 23, 2026 as both custom bounds and compare equivalent legacy/ISO rows. Test rolling windows with a controlled clock and verify the displayed range label.

**Proposed correction:** reuse the agreed date parser and date-boundary semantics from issue 1 for filtering and labels.

**Acceptance:** valid equivalent timestamps are included consistently; start/end dates are inclusive; rolling windows and labels agree; unsupported dates are handled explicitly.

## 3. Company Analysis can mix namesakes or lose history after renaming

**Reported behavior:** distinct companies sharing a name can have mixed details, while one renamed company's historical evaluations can disappear from its analysis.

**Code evidence:** the leaderboard groups responses by stable company ID, but `buildCompanyAnalysis` drops that ID from its output and filters question/trend data by company-name strings. The panel's selection and comparison controls also use names and `.find(...)`. Trend helpers filter using `r.company === company`.

**Sources:** [Analytics snapshot](../../src/features/analytics/domain/analyticsSnapshot.ts), [Company Analysis panel](../../src/features/analytics/components/CompanyAnalysisPanel.tsx), [company grouping and trends](../../src/features/evaluations/domain/scoring.ts).

**Verification needed:** create two synthetic companies with different IDs but the same name, then one company with a stable ID and evaluations under old/new names. Compare the leaderboard, selected detail, lowest questions and trend history.

**Proposed correction:** carry stable IDs through analysis output, selection, comparison and trend preparation. Apply the existing conservative legacy-name fallback only when attribution is unambiguous.

**Acceptance:** namesakes remain separate; renaming retains ID-linked history; peer calculations exclude only the intended company; ambiguous legacy rows are not silently reassigned.

## 4. Feedback and Dashboard count eligible employees differently

**Reported behavior:** the same form shows different employee targets or completion percentages between Feedback and Dashboard.

**Code evidence:** Dashboard first calls `getEligibleFormRecipients`, which checks page access, survey-type permissions, department limits, designation and form visibility. Feedback's current-form and progress views call `getSurveyCompletionSummary` with their account list directly. That function uses `getSurveyEligibleEmployees`, which checks non-Admin status, department and designation, but does not itself enforce page or survey-type permissions.

**Sources:** [Dashboard snapshot](../../src/features/dashboard/domain/dashboardSnapshot.ts), [canonical recipients](../../src/features/evaluations/domain/formRecipients.ts), [survey completion](../../src/features/evaluations/domain/surveyCompletion.ts), [Feedback current forms](../../src/features/feedback-hub/components/CurrentFormsTab.tsx), [Feedback progress modal](../../src/features/feedback-hub/components/SurveyProgressModal.tsx).

**Verification needed:** trace the parent-provided accounts and department permissions end to end. Compare one form with an allowed employee, an employee denied form access, an employee denied the survey type, and a department-level restriction.

**Proposed correction:** have both workflows use the same recipient selector with equivalent access inputs before calculating completion.

**Acceptance:** the same form/data/access scope produces identical eligible employees, required assignments and completion totals in both modules. Restricted accounts never inflate the denominator.

## 5. Document aging can label missing documents as expired

**Reported behavior:** a document marked missing can still contribute to an expired aging bucket because its old expiry date is retained.

**Code evidence:** `computeDocumentStatus` correctly returns `Missing` when `provided === false`, while deliberately preserving calculated `daysLeft`. The register's aging aggregation buckets any numeric `daysLeft` without checking the derived status. Its `expired` bucket includes `daysLeft <= 0` and labels the bucket `Expired`.

**Sources:** [document status](../../src/features/document-tracker/domain/compliance.ts), [Document Register aging aggregation](../../src/pages/DocumentRegisterPage.tsx).

**Important distinction:** this finding concerns the aging summary, not proof that the primary document-status calculation still marks a missing document as expired. Expiry today also needs review: the aging bucket includes zero, while normal date-based status treats zero as expiring soon.

**Verification needed:** use a missing document with a retained past expiry, a genuinely expired provided document, an expiry today, and an AFS fiscal-year case. Compare the document cell, KPI and aging table.

**Proposed correction:** define which statuses belong in expiry aging and apply that rule consistently. Preserve old dates for history without treating missing documents as expired inventory.

**Acceptance:** missing documents do not inflate expired/current expiry buckets; day-zero and fiscal-year behavior follow the documented rule; retained history is unchanged.

## 6. Report question counts can exceed answered-submission totals

**Reported behavior:** a question's reported response count exceeds the number of answered submissions represented by the report.

**Code evidence:** the shared `averageByQuestion` groups by question text and sets `responses` to `scoredQuestionResponses.length`. That counts stored rows, including N/A rows for scored questions, rather than unique answered submissions. Meanwhile, report totals use `submissionCount`, which excludes blank/N/A-only forms. Identical question text across IDs or survey types can also combine rows in this shared grouping.

**Sources:** [question aggregation and submission totals](../../src/features/analytics/domain/analytics.ts), [Summary report consumer](../../src/pages/SummaryReportBuilderPage.tsx), [company report question rows](../../src/features/feedback-hub/reporting/companyReportData.ts).

**Important distinction:** detailed Question and Executive builders also have their own aggregation paths using `validRatings.length`; the exact affected report/count must be reproduced rather than assuming every report has the same defect. Summing counts across different questions can legitimately exceed a submission total and is not sufficient evidence by itself.

**Verification needed:** compare one numerically answered submission with one N/A-only submission for the same question. Separately test duplicate question text across IDs/types and repeated rows. Trace both the shared report path and the detailed builders.

**Proposed correction:** define whether each column means answered submissions or numeric ratings, use stable question identity and the appropriate unique-submission key, and retain intentional distinctions between countable remarks and scored answers.

**Acceptance:** each question's count agrees with its stated meaning and authorized report cohort; N/A-only forms do not inflate an answered-submission count; repeated wording does not merge unrelated questions; score calculations remain unchanged unless separately corrected and tested.

## Follow-up verification scope

Use synthetic fixtures first, with no customer data or remote writes. Add regression coverage at the relevant domain/component boundary and exercise affected desktop/mobile journeys after fixes. Run the repository's applicable gates (`npm test`, TypeScript checks via `npm run lint`, `npm run build`, and relevant Playwright cases). Existing passing tests do not establish that these six scenarios are covered or fixed.

This document does not establish production impact, data loss, or authorization bypass. It records the reported problems, supporting code evidence and the remaining work needed for a reliable conclusion.
