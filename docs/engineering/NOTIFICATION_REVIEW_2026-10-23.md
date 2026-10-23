# Notification functionality review and proposed fixes

Date: 2026-10-23. Reviewed local commit `f912ffd` on `second-branch`.
Status at review: investigation completed before implementation. The owner subsequently approved the proposal; implementation and current verification are recorded in [SECOND_BRAIN.md](SECOND_BRAIN.md#2026-10-23---form-specific-evaluation-reminders). The findings below preserve the pre-fix evidence and do not describe the current implementation.

## Result

The basic in-app reminder works: making a form Running produces a reminder for an employee with an accessible department/designation and pending companies. Paused and deadline-expired forms do not produce reminders. It does not guarantee a new unread notification every time Admin presses Send.

No application code, remote records, migrations, permissions, or deployment settings were changed during this review.

## Findings

| Finding | Evidence and impact | Proposed correction |
|---|---|---|
| High: noncountable answers hide reminders | Executed synthetic checks: all-N/A and blank responses remove the reminder while canonical completion remains zero. `employeeNotifications.ts` accepts any matching response row; `surveyCompletion.ts` requires `hasAnsweredItem`. | Reuse the canonical answered-item rule. Preserve numeric zero and meaningful remarks; exclude metadata-only, blank-only and all-N/A submissions. |
| High: another form's response hides a new form's reminder | Executed synthetic check: a response with an explicitly different `surveyId` still removes the current form's reminder. The existing `selectSurveyResponses` helper correctly excludes it. | Scope matching to the intended form/cycle and use the existing legacy response selector where applicable. Align completion and form-filling behavior before changing notifications alone. |
| Medium: company names substitute for stable identity | Executed synthetic checks: renaming a company generates a false pending reminder despite the same `companyId`; a response with a different company ID but identical name falsely clears the reminder. | Prefer stable company ID, use a conservative unambiguous name fallback only for legacy records without IDs, and apply the same rule to completion consumers. |
| Medium: resend does not create a fresh unread reminder | Executed identity check: reminder ID is always `reminder-${survey.id}`. Read/deleted state therefore also applies after resend. The Send handler can return Already Available without persisting any new distribution event. | For an explicit successful send/resend, persist a distribution revision with the form and include it in reminder identity. Retain existing read/deleted history and keep old IDs for forms without revision metadata. Resend must not erase evaluation completion. |
| Medium: read status is presented as evaluation completion | Source check: the employee bell tests `unreadCount === 0` before displaying No pending surveys and saying the employee is up to date. The full reminder page already distinguishes pending from unread. The bell also prints Today for every entry. | Use pending notification count for the empty state, preserve access to read pending reminders, and display an actual recorded date rather than a fixed Today label. |
| Medium: Admin logs fabricate missing respondent details | Executed isolated mapper check: a missing email becomes a preset employee email and a missing department becomes Logistics. Designation can also be overwritten based on a preset email. `NotificationLogsPage` displays these values. | Display source-backed details and a neutral unavailable label when absent. Preserve the recorded designation; never infer a person's identity from rank. Leave source records untouched. |
| Medium: reminder eligibility differs from actual access | Executed synthetic check: `getEligibleFormRecipients` excludes a category denied by explicit permissions, but `getEmployeePendingSurveys` still produces its reminder. App passes all surveys to reminder views. The bell also reads a cached profile and falls back to Logistics / Rank & File. | Pass the authenticated profile and already-authorized forms consistently to the bell and full page. Reuse existing access rules. This is a client consistency defect; the review does not establish a database authorization bypass. |
| Functional gap: frequency setting has no repository dispatch implementation | Searches found persistence, configuration UI and frequency text, but no worker/timer consuming the setting to dispatch recurring reminders. The bell claims the reminder is automatically dispatched every configured interval. | Correct the claim to describe current in-app reminders. Treat an actual recurring dispatcher as a separate product/operations decision; do not add a new scheduler silently. |

Paths above refer to:

- [Employee reminder generation](../../src/features/notifications/domain/employeeNotifications.ts)
- [Employee bell](../../src/features/notifications/components/EmployeeNotificationBell.tsx) and [reminder page](../../src/pages/EmployeeNotificationLogsPage.tsx)
- [Send handler](../../src/pages/SurveyFormsPage.tsx), [data hook and Admin mapper](../../src/hooks/useSurveyData.ts), and [App access wiring](../../src/App.tsx)
- [Completion rules](../../src/features/evaluations/domain/surveyCompletion.ts), [survey response selector](../../src/features/evaluations/domain/surveyResponses.ts), and [form recipient rules](../../src/features/evaluations/domain/formRecipients.ts)
- [Employee state persistence](../../src/features/notifications/services/employeeNotificationState.ts) and [frequency settings](../../src/features/notifications/services/reminderSettings.ts)

## Real-time assessment

Source wiring exists: Supabase Postgres Changes invalidates shared survey records, `useSurveyData` reloads the forms, and employee reminders derive from the updated state. This supports in-app updates while connected; it does not prove a timing guarantee, delivery to an offline employee, or recurring dispatch.

The reconnect callback explicitly reconciles survey responses. Survey distribution missed during disconnection needs a targeted reconnect test; this review has not reproduced that failure in a running client. Admin unread-badge handling for remotely submitted responses also needs a dedicated integration check: response refresh updates the notification list, while explicit unread insertion is visible in the local submission path.

Hosted publication, deployed RLS, network delivery, and two-session timing were not checked. Versioned migrations permit authenticated survey reads and owner-scoped notification state, but versioned policy definitions do not establish the target environment's applied state.

## Proposed implementation sequence

1. Add failing regression coverage for the confirmed defects before changing behavior. Use synthetic records only.
2. Align reminder matching with reusable answered-item, survey/cycle and company-identity rules. Update directly affected completion and fill-form consumers so the user does not see conflicting progress.
3. Use the same authenticated access scope in the bell and full page. Fix unread-versus-pending messaging and remove invented identities and fixed dates. Preserve the existing layout and styling.
4. Add an optional validated distribution revision to `CustomForm` and its persistence boundary. Record it only for an explicit successful send, use it for fresh unread reminders, and keep legacy state compatible. On save failure, do not report success or publish a successful send locally. Check the existing optimistic `updateSurvey` path as part of this boundary.
5. Exercise connected updates, missed changes/reconnection, per-user read state and Admin unread counts. Fix only demonstrated synchronization gaps through the existing shared subscription; do not add polling or a competing notification store.
6. Run focused tests, then `npm test`, `npm run lint` (TypeScript), `npm run build`, and `npm run test:e2e`. Inspect the final diff and update durable project documentation after the behavior is agreed and implemented.

Likely boundaries: notification domain/components/services; `App.tsx`; `useSurveyData.ts`; `SurveyFormsPage.tsx`; the directly affected survey completion/fill-form code; `CustomForm` and runtime survey validation; colocated tests and the existing E2E fixture. Reuse existing exports and fixtures; no new dependency is expected. A JSON-payload metadata extension does not currently appear to require a schema migration, but that must be verified before implementation.

## Acceptance criteria

- An eligible employee with unfinished work receives a reminder for the intended form and selected companies after Admin's successful send.
- Restricted accounts/categories receive no unusable reminder. Paused, ended, archived and expired forms remain excluded.
- Completion is consistent across the bell, logs, progress and fill-form views. Valid numeric zero remains countable; nonanswers do not complete work.
- Renaming a company does not reset completion; distinct company IDs do not share completion merely because names match.
- An explicit resend produces a fresh unread reminder only for employees with pending work. A rerender, reconnect, ordinary edit or duplicate event does not resend. Existing read/deleted data is retained.
- Reading a reminder never claims the evaluation is finished. Missing identity details remain visibly unavailable.
- Failed persistence reports failure without a false successful distribution. The same failure and retry do not duplicate a successful event.
- Desktop/mobile tests cover reminder opening, read/all filters and dismissal. A separate live Admin/Employee check must establish cross-device delivery before it is called verified real-time behavior.

## Decisions to settle before implementation

Recommended interpretation of the requested behavior: each newly distributed form has its own completion scope; an explicit resend renews unread status for pending work and does not require already-completed employees to evaluate again.

This differs from current category-level completion in `surveyCompletion.ts`, the form list and parts of `SurveyFillerPage.tsx`. Confirm that intended scope before applying a form-specific fix. Existing ID-less imported/legacy responses need a documented compatibility policy: reuse unambiguous mappings, preserve every record, and report ambiguous cases rather than silently assign them to a new form.

Scheduled reminders need a separate decision: in-app refresh while open versus durable dispatch while users are offline. No email, push delivery or background scheduling is included in the proposed defect fixes.

## Verification performed and rollback

- Fifteen existing focused tests passed: form recipients/distribution, survey status, survey response selection and notification read-state serialization.
- Nine additional temporary checks passed by confirming the observed behavior: publication/exclusions, nonanswers, wrong form, rename, colliding names, resend identity, category denial, bell source conditions and the isolated Admin mapper. These characterize current defects; passing them does not mean the defects are fixed. The bell check inspected source, not rendered interaction. The mapper check executed its extracted pure function, not the entire hook.
- Earlier calendar-boundary checks passed for document expiry today/yesterday, 30/31 days, invalid/missing dates and AFS fiscal years. They do not constitute exhaustive document-notification or live data verification.

No implementation rollback is needed for this report. Proposed fixes should be revertible without deleting evaluations or read-state records. Old clients must tolerate optional distribution metadata; reverting UI code would restore old reminder identity semantics. Do not push, merge, deploy, change remote records or apply migrations as part of the review.

Not run: full-suite/build/browser gates, rendered desktop/mobile comparison, live Supabase/RLS checks, cross-device delivery, offline/reconnect timing, or production verification. Remaining risk: current reminders can be missing, misleading or persistently read; a local code audit cannot certify hosted delivery.

## Approved implementation handoff

The subsequent approved change implements shared form/company completion, authenticated reminder access, successful-send revisions with legacy read-state compatibility, evidence-backed Admin identity display, read-versus-pending messaging, actual reminder dates, mobile dropdown positioning and form reconciliation on reconnect. The scheduling claim is corrected; no recurring dispatcher is introduced. See the linked second-brain entry for final verification and remaining live-environment limits.

Final local verification: 374 Node tests, TypeScript checks, production build and 12 desktop/mobile E2E tests passed. The mobile dropdown overflow regression was reproduced before its fix, then viewport assertions and final screenshots passed review. Synthetic service responses exercise local behavior; they do not prove live Supabase delivery or production timing. No changes were pushed or deployed.
