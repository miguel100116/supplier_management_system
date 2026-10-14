# Supplier Management System — Current-State Business Requirements

| Document field | Value |
|---|---|
| Version | 0.1 (draft) |
| Baseline date | 12 October 2026 |
| Document status | Repository-derived draft; pending business-owner validation and approval |
| System status | Pre-production; staging implementation exists, production readiness is not established |
| System | Supplier Management System (`ms-form-analytics-dashboard`) |

## 1. Purpose

This document describes the business capabilities and rules currently represented in the Supplier Management System codebase. It is an as-is business requirements baseline, not a proposal for new scope and not proof that a hosted environment is configured or operating correctly.

Implementation statements were checked against application code and versioned migrations where practical. Product and operational documents were used for context. Where implementation and documentation conflict, this document identifies the gap and follows the implementation evidence. Environment-specific claims, especially about staging and production, remain subject to an authorized environment check.

## 2. Business context

Microgenesis uses the system to evaluate external Suppliers, Couriers, and Subcontractors; review evaluation results; manage partner registry and compliance-document information; and prepare internal reports. The application brings survey configuration, employee submissions, scoring, analytics, imports, reporting, partner records, and access administration into one internal web application.

The repository defines these operating objectives, but does not define target KPI values or formally approved benefit measures:

- Maintain consistent evaluation workflows and scoring across the three partner types.
- Make evaluation results and trends available to authorized internal users.
- Maintain partner, branch, and compliance-document records used by internal teams.
- Control access to modules and response data according to employee role and organizational profile.
- Support controlled import, review, archiving, and export of business records.

## 3. Stakeholders and user groups

Named business owners, approvers, and data stewards are not identified in the repository. The user groups below are derived from implemented roles and workflows.

| User group | Current system responsibility |
|---|---|
| System Administrator | Manages accounts and permissions, surveys, partner records, document information, imports, categories, archives, settings, and administrative history, subject to backend authorization. |
| Employee / evaluator | Signs in with a company account, completes forms available to their profile, and uses permitted internal modules. |
| Supervisory, Managerial, Director, and Executive users | Use modules and response views permitted by their designation, department, survey-type access, and any approved account or department overrides. |
| External partner company | Is represented as a Supplier, Courier, or Subcontractor record and may be the subject of an evaluation. The current application does not provide a partner self-service login or portal. |
| System and data owners | Must approve production identity, access policy, retention, compliance rules, operational service targets, and outstanding business decisions. Owner identities are to be assigned. |

Employee designations in the current profile model are Rank & File, Supervisory, Managerial, Director, and Executive. Departments include Accounts Payable – Trade, Business Solutions Manager, Executive Office, Logistics, Procurement Group, and TASS.

## 4. Scope

### 4.1 Included in the current system

- Internal account sign-in, profile access, role-based navigation, and permission administration.
- Survey form creation, configuration, availability, completion, review, and archival.
- Supplier, Courier, and Subcontractor partner records, including branch and accreditation details.
- Compliance document status and expiry tracking, with notifications and authorized updates.
- Evaluation imports from CSV and Excel files, including isolated test imports and stored source files.
- Score calculation, dashboards, analytics, report builders, presentation exports, and data exports.
- Feedback Hub report preparation and email-delivery workflows in the application.
- Activity, export, notification, and modification history represented by the current modules.

### 4.2 Not available or not established as current production scope

- A public or partner-facing portal, partner account management, purchase ordering, procurement transactions, or payments.
- Microsoft Entra sign-in and Microsoft Graph email delivery in the current configured environment; the codebase contains integration code, but repository documentation says Azure access/configuration is unavailable.
- A verified production deployment, production database state, production operating procedures, or production service-level commitment.
- Approved KPI targets, formal retention periods, business-continuity targets, and named product/data owners.

## 5. Current business processes

### 5.1 Account and access lifecycle

An authorized administrator creates or manages an employee account and assigns role, designation, department, survey types, and permitted modules. Defaults are derived from profile attributes; department ceilings and per-account overrides can further restrict access. In the repository implementation, sign-in uses Supabase email/password and accepts `@mgenesis.com` addresses. Account provisioning requires the Express server and a server-only Supabase credential. The repository does not establish successful live provisioning or production authentication.

### 5.2 Evaluation lifecycle

An administrator configures a form for one of the three partner types and defines its questions, access rules, and applicable dates. An eligible employee selects an available partner and submits answers. Responses retain submission and respondent context and are used by review and reporting features. Form completion and whether a submission is counted follow the current response-validation rules; blank or N/A-only forms do not count as completed evaluations.

### 5.3 Partner and compliance lifecycle

Internal users maintain partner and branch records. Authorized users review document status and expiry dates, update permitted document information, and use the notification and modification-history features. Document status is derived from the stored document details and current date; it is not treated as an independently authoritative status field.

### 5.4 Import and archive lifecycle

Administrators select one or more evaluation export files. The application detects supported forms, checks duplicates, matches company names against the Partner Registry, previews records, and imports the selected batch. Test imports are isolated and identified separately from official analytics data. Stored source files can be moved between active imports and history; permanent removal has distinct behavior for ordinary and test imports. Evaluation archive workflows also support restoring eligible archived records.

### 5.5 Analysis and reporting lifecycle

Authorized users select available analytics scopes, review metrics and rankings, prepare reports, and export supported outputs. The application also provides presentation mode and a Feedback Hub workflow for preparing report cards. Email delivery depends on Microsoft Graph configuration, which is not available in the documented current environment.

## 6. Current-state business requirements

“Implemented in source” means the capability is represented in the checked repository. It does not certify deployment, hosted configuration, or end-to-end acceptance in staging or production.

| ID | Current-state requirement | Current implementation status |
|---|---|---|
| BR-01 | The system shall authenticate internal users and restrict application accounts to the company email domain. | Supabase email/password and `@mgenesis.com` validation are implemented. Hosted settings and production use are not verified. |
| BR-02 | The system shall derive module and survey-type access from role, designation, department, and administrator-managed overrides. | Implemented in application access logic and profile contracts; database authorization remains authoritative. |
| BR-03 | The system shall support the Courier, Supplier, and Subcontractor evaluation categories. | Implemented as the three canonical survey types. |
| BR-04 | The system shall allow authorized users to create and manage evaluation forms, questions, access rules, and deadlines. | Form creation, editing, distribution, and access configuration are represented in the application. Actual email distribution is environment-dependent. |
| BR-05 | The system shall allow eligible employees to submit evaluation answers for partner companies. | Implemented. Persisted response access and writes are subject to Supabase policies and the signed-in profile. |
| BR-06 | The system shall calculate partner evaluation scores using the configured question weights and display score bands. | Weighted scoring and score-band logic are implemented in source. |
| BR-07 | The system shall provide analytics and rankings with current, all-time, and custom-date scopes where available. | UI and filtering logic are implemented. Company-wide Analytics for lower-rank users is not guaranteed: raw response access is restricted by RLS and the required protected aggregate service is not present in the repository. |
| BR-08 | The system shall maintain partner company and branch information for the three partner categories. | Partner registry, branches, classifications, and related workflows are implemented. |
| BR-09 | The system shall track partner compliance documents and calculate status from document details and expiry dates. | Implemented in the document-tracking logic and UI. Required document inventory and business-specific expiry thresholds require owner confirmation. |
| BR-10 | The system shall notify authorized users about relevant submissions and document-expiry events. | Notification and per-user read-state features are implemented. Delivery channels and notification service targets are not defined here. |
| BR-11 | The system shall import evaluation data from supported CSV and Excel exports, validate files, detect duplicates, and allow company matching review. | Implemented in the import workflow. Supported files and mappings depend on recognized export formats. |
| BR-12 | The system shall distinguish test submissions from official analytics submissions. | Provenance is implemented. Staging submissions are classified as test data; client CSV and explicitly production-sourced submissions are eligible for official Analytics. |
| BR-13 | The system shall retain uploaded import source files in a controlled archive and support active/history management. | Implemented in the source service and migration set. Hosted bucket policies and migration state must be verified for each target environment. |
| BR-14 | The system shall support review, export, archive, and restoration of evaluation records subject to authorization. | Implemented in application workflows. Archive Center is Admin-only in route logic; staging authorization and failure scenarios still require verification. |
| BR-15 | The system shall provide report builders and export functionality for internal use. | Summary, company, question, executive summary, raw-data, and presentation flows are represented. Actual output formats vary by module. |
| BR-16 | The system shall support preparation of partner feedback report cards and delivery workflows. | Feedback Hub/report generation is implemented. Microsoft Graph email delivery is not available until the required Azure configuration is supplied and approved. |
| BR-17 | The system shall support administrator management of employee accounts, roles, departments, and permissions. | Implemented in source. Account provisioning requires the Express API and server-only Supabase configuration; live provisioning is not verified. |
| BR-18 | The system shall maintain operational history such as administrative activity, exports, document modifications, and notification read state where supported. | Corresponding application record types and UI workflows are implemented. Retention and audit completeness targets are not specified. |
| BR-19 | The system shall preserve shared business data across authenticated devices while retaining device-specific drafts and preferences locally. | Supabase application records are the intended shared editable store; local storage is used as an authenticated cache and for device-specific state. Hosted synchronization must be checked in the target environment. |

## 7. Business rules represented in the implementation

1. **Partner types:** Courier, Supplier, and Subcontractor are the canonical evaluation categories. Uncategorized partner records are not eligible for evaluation until classified.
2. **Scoring:** Question weights and category rules produce a normalized composite score. The “Overall” feedback category is not scored. A response without scoreable answers can have no score.
3. **Counted evaluations:** A submission is counted when it contains a meaningful evaluation rating or designated remark. Numeric zero is meaningful; blank, N/A-only, and configured empty-value markers do not count as a completed evaluation.
4. **Access:** Page visibility is a user-interface feature; database row-level security is the enforcement boundary for protected shared data and mutations. A survey’s access settings may narrow account access but must not grant a survey type removed from the user’s account permissions.
5. **Response scope:** General response views are filtered by role/designation and survey-type permissions in the application and by RLS in the backend. Analytics currently bypasses some client-side filtering, but lower-rank raw-response RLS still limits available records; company-wide lower-rank analytics is an unresolved requirement gap.
6. **Data provenance:** `client_csv` and `production_submission` are eligible for official Analytics. `test_submission` is excluded. Staging is the default deployment classification unless explicitly configured otherwise.
7. **Import duplicates:** Duplicate source response IDs in a batch are rejected to avoid silent replacement. Test-import data is tagged so its related responses and temporary partners can be removed under the test-import rules.
8. **Import history:** Moving an import to history preserves its source file and evaluation responses. Removing an ordinary archived source-file record preserves responses; removing a test import can remove its tagged responses and temporary partner records, subject to dependency checks.
9. **Archive access:** Archive Center mutation access is restricted to administrators in current application access logic. Do not infer that historical non-Admin access defaults from older documents are still valid.
10. **Document status:** Current, expiring, expired, missing, and special document statuses are derived from document details and applicable rules; the document type may affect the calculation.

## 8. Information and system boundaries

### 8.1 Information handled

- Employee account identity, department, designation, and permission data.
- Partner company and branch identity, classification, contact, accreditation, and business reference information.
- Compliance-document details and expiry dates.
- Survey definitions, access configuration, evaluation answers, comments, respondent identity, and submission dates.
- Import source files, import metadata, analytics provenance, archives, administrative activity, and export history.

This is confidential internal business information. The BRD does not define retention duration, classification labels beyond confidentiality, or an approved deletion schedule.

### 8.2 Persistence and integrations

| Boundary | Current role |
|---|---|
| Supabase Auth | Password identity and session management in the documented staging configuration. |
| Supabase Postgres and `application_records` | Authenticated shared application data, guarded by row-level security. |
| Normalized import tables | Imported reference/audit layer; separate from editable application records. |
| Supabase Storage | Private evaluation-import source-file storage, subject to installed storage policies. |
| Supabase Realtime | Signals changes so the client can re-read data through the normal RLS-protected query path. |
| Express account endpoint | Server-side employee account provisioning; requires server-only Supabase credentials. |
| Microsoft Entra / Microsoft Graph | Integration code exists, but sign-in and Graph mail are not available in the documented environment. |
| CSV/XLSX and generated reports | File import/export boundary for operational data and reporting outputs. |

The legacy `supabase/schema.sql` is a draft and must not be treated as the deployed schema. Versioned migrations are the database change source of truth. Staging and production must be verified independently.

## 9. Non-functional requirements and constraints

| Area | Current requirement or constraint |
|---|---|
| Security | Enforce protected data access at Supabase RLS/server boundaries; validate external and persisted data; keep server-only keys out of browser configuration. |
| Identity | Current documented staging sign-in accepts confirmed `@mgenesis.com` email/password accounts. Production identity-provider approval is open. |
| Session handling | The application warns after 25 minutes of inactivity and signs out at the 30-minute boundary, according to the current session-timeout implementation and project documentation. |
| Shared-state behavior | Authenticated users use Supabase for shared records, with local storage serving as cache and device-specific state. Realtime event payloads are not treated as trusted application data. |
| Browser support | README identifies Safari 16.4+, Chrome 111+, and Firefox 128+ as the supported baseline. |
| Availability/performance | No approved uptime, response-time, capacity, recovery-time, or recovery-point targets are specified in the repository. |
| Audit/retention | Several operational history records are maintained, but retention periods and formal audit completeness requirements are unspecified. |
| Environment | The repository describes the application as pre-production. No production sign-off or production-state verification is included in this baseline. |

## 10. Known gaps and risks

- **Lower-rank Analytics:** Application intent is company-wide aggregate Analytics, but no protected aggregate RPC/view is present in the repository. Raw response RLS may limit the data available to Supervisory and Rank & File users. Resolve and verify this without widening raw-response access.
- **Production readiness:** Production migrations, identity-provider configuration, RLS, storage policies, recovery settings, and deployment controls require independent verification. Staging evidence is not production evidence.
- **Account provisioning:** The admin account endpoint depends on the Express host and a server-only secret. Live provisioning and recovery have not been verified in the target environment.
- **Microsoft integrations:** Microsoft sign-in and Graph email delivery remain unavailable until Azure configuration and approval exist.
- **Password policy:** Repository documentation reports that leaked-password protection is disabled in staging. Confirm target hosting plan and enable the control or approve a documented alternative before production.
- **Operational requirements:** Business owner, support owner, approved partner-document matrix, KPI targets, retention schedule, service levels, backup/recovery objectives, and formal sign-off criteria are not established in the repository.
- **Permission integration:** Delegated document renewal has a narrowly validated RPC in source, but its migration and permitted/denied cases must be verified in the target environment.

## 11. Assumptions and decisions requiring business validation

1. Confirm the accountable product owner, business approver, system administrator, and data steward.
2. Confirm whether company-wide aggregate Analytics is required for every employee designation and what aggregates are safe to expose.
3. Approve the production identity model: Supabase email/password, Microsoft Entra, or another controlled model.
4. Confirm partner categories, required documents by partner type/branch, expiry rules, notification recipients, and escalation timing.
5. Confirm evaluation form ownership, approval/publishing authority, evaluation periods, and handling of late or corrected submissions.
6. Confirm official-data definitions, test-data handling, archival duration, source-file retention, and deletion approvals.
7. Define business KPIs and target thresholds for evaluation completion, partner performance, compliance, and operational adoption.
8. Define uptime, support hours, response-time, backup, recovery, and incident-notification expectations.
9. Confirm whether Microsoft sign-in and partner feedback email are required launch capabilities or remain disabled.
10. Validate this as-is baseline with business users before treating it as an approved or future-state BRD.

## 12. Baseline validation checklist

Business and system owners should confirm that:

- The three partner categories and employee user groups are complete and correctly named.
- Survey access, scoring, meaningful-completion, and official-data rules match business policy.
- Each requirement in Section 6 is still present and behaves as stated in the approved target environment.
- The lower-rank Analytics gap and delegated-document-renewal boundary have an accepted resolution and verification plan.
- The data inventory, security classification, retention, and deletion rules are approved.
- Production integrations, support ownership, quality targets, and sign-off authority are documented.

## 13. Source references

Implementation and operational references used for this baseline:

- [Product overview and module documentation](../README.md)
- [System turnover and known issues](../SYSTEM_TURNOVER.md)
- [Authorization rules](../src/utils/rbac.ts) and [profile contract](../src/features/account-management/domain/accountProfile.ts)
- [Application route and response scoping](../src/App.tsx) and [route definitions](../src/utils/pageRouting.ts)
- [Survey, partner, and response contracts](../src/types/survey.ts)
- [Shared persistence repository](../src/services/applicationRepository.ts)
- [Supabase frontend/backend alignment and environment blockers](./engineering/SUPABASE_FRONTEND_ALIGNMENT.md)
- [Authentication and account operations](./engineering/AUTH_OPERATIONS.md)
- [Versioned database migrations](../supabase/migrations)
