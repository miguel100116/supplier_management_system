# Project directory map

Verified: 2026-10-19

The frontend groups feature-specific components, rules, file handling, and persistence adapters under `src/features/`. The October 2026 directory reorganization moves existing modules intact and updates references. It does not change business logic, UI markup, styles, routes, permissions, storage keys, or database contracts.

```text
src/
  App.tsx                     Application composition and shared handlers
  main.tsx                    Frontend entry point
  assets/                     Frontend assets
  layouts/                    Application shell
  pages/                      Route composition, layout, and workflow orchestration
  components/                 Shared presentation and controls
  hooks/                      Shared React lifecycle and data orchestration
  services/                   Shared auth, database, Graph, and hydration boundaries
  types/                      Shared survey, partner, and application contracts
  data/                       Reference questions, weights, categories, and seed data
  utils/                      Shared routing, permission, session, date, and table helpers
  features/
    account-management/
    active-companies/
    analytics/
    archives/
    document-tracker/
    employee-experience/
    evaluation-imports/
    evaluations/
    feedback-hub/
    notifications/
    partner-companies/
    presentation/
    reports/
```

Feature folders contain only the subdirectories they need. `components/` owns presentation, `domain/` owns business calculations, `services/` owns file or persistence I/O, and `hooks/` owns React orchestration. Tests remain beside their modules. This move preserves existing module dependencies and named imports rather than introducing barrels that could load unrelated UI or services.

## Module ownership

The modules below previously lived in shared `src/components/`, `src/utils/`, or `src/types/` folders.

| Feature | Existing modules now owned by the feature |
|---|---|
| Account management | `services/adminActivityLog.ts` |
| Analytics | `components/CompanyAnalysisPanel.tsx`, `CompanyLeaderboardPanel.tsx`, `radarChartLabels.tsx`; `domain/analytics.ts` |
| Archives | `services/archiveResponseTransfer.ts` and its test |
| Document tracker | `domain/compliance.ts`, `documentRequirements.ts`; `services/complianceHistory.ts`, `documentModificationLog.ts` |
| Evaluation imports | `services/rawEvaluationImport.ts` |
| Evaluations | `components/CompletionStatusBar.tsx`, `ResponseTable.tsx`, `SurveyPreviewModal.tsx`; `domain/scoring.ts`, `surveyCompletion.ts`, `surveyStatus.ts` and their existing tests |
| Feedback hub | All nine Feedback Hub components; `services/feedbackHubStore.ts` and its test; `types.ts` |
| Notifications | Both notification bells; `domain/employeeNotifications.ts`, `notificationReadState.ts` and its test; `services/documentNotificationSettings.ts`, `employeeNotificationState.ts`, `reminderSettings.ts` |
| Partner companies | `domain/categorySummary.ts`, `dataCompleteness.ts`; `services/masterListImport.ts` |
| Presentation | `components/SlideDeck.tsx`; `domain/presentation.ts`; `services/presentationPdf.ts`, `presentationPptx.ts` |
| Reports | `services/companyReportExport.ts`, `exporters.ts`, `exportHistory.ts`, `rawResponseExport.ts`, and the export dependency test |

Active Companies and Employee Experience already have feature folders. Their existing ownership remains in place.

## Reference materials at the repository root

The root `reference-materials/` folder groups seven historical utilities under `scripts/`, seven existing extracted text/JSON files under `extracted/`, and the four reviewed CSVs, original screenshots, and project charter under `source-data/`. See [its README](../../reference-materials/README.md) for filenames and usage. Root application entry points, package files, and build configuration stay at their existing paths.

The import planner and active-company seed tests read the relocated CSVs. Import plans retain the original source filenames and identities, and the importer still accepts an explicitly supplied directory containing CSVs directly. Legacy utilities retain their repository-root working directory; extraction output and question JSON paths now point into `reference-materials/extracted/`.

## Shared boundaries

- Pages remain in `src/pages/`, including the report builders. This pass does not split their rendering or orchestration logic.
- Shared controls such as `AccountMenu`, `PasswordInput`, `TableFilterBar`, `Pagination`, and `StateMessage` remain in `src/components/`.
- `src/hooks/useSurveyData.ts`, `src/App.tsx`, and shared storage hydration remain application orchestration. Existing mixed responsibilities are preserved for later, separately scoped refactors.
- `src/services/applicationRepository.ts`, authentication clients, and the Supabase client remain shared infrastructure. Feature services use the same repository and persistence records as before.
- Shared business contracts remain in `src/types/survey.ts`. Feedback Hub contracts are feature-owned in `src/features/feedback-hub/types.ts`.
- Canonical scoring is in `src/features/evaluations/domain/scoring.ts`; reporting and analytics use that same implementation. Reference weights remain in `src/data/questionWeights.ts`.
- `scripts/supabase-import/importPlan.ts` imports the relocated evaluation workbook definitions. Package scripts and test source-file references use the new paths.
- Database migrations, deployed routes, environment configuration, package versions, assets, and generated folders are not relocated by this frontend organization pass.

## Verification and rollback

Run `npm test`, `npm run lint` (TypeScript checking), and `npm run build`. The tests use the same cases as before the moves. Compare moved modules and callers with the original source to confirm that only paths changed; unchanged JSX and CSS are required.

Rollback consists of reversing the file moves and their import, script, and documentation updates together. There is no database migration or persisted-data conversion to reverse.
