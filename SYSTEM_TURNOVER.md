# Supplier Management System — Turnover Documentation

*Prepared: August 4, 2026*
*Internal project name: `ms-form-analytics-dashboard` (v0.1.0)*

## Read This First: System Status

This system is in active pre-production development, not a fully deployed production system.

- The project's first commit was on July 18, 2026 — roughly three weeks of history as of this document.
- The dedicated staging project uses Supabase email/password authentication and normalized company/form reference data.
- Authenticated `@mgenesis.com` users load and save shared business data, configuration, operational history, compliance/ranking snapshots, and per-user notification state through staging Supabase with RLS and Realtime invalidation.
- Device-specific drafts/preferences remain local. Microsoft login and Graph email remain unavailable without Azure access.

Every section below reflects the system's actual current state, verified directly against the source code as of this handoff — not aspirational or planned behavior. Where something is not yet in place, that is stated explicitly rather than assumed.

## Table of Contents

1. [Access & Administration](#1-access--administration)
   - [1.1 List of Assigned Roles & Departments](#11-list-of-assigned-roles--departments)
   - [1.2 Admin Account Details](#12-admin-account-details)
   - [1.3 Procedure for Requesting New User Access](#13-procedure-for-requesting-new-user-access)
   - [1.4 Password Reset Process](#14-password-reset-process)
2. [Documentation](#2-documentation)
   - [2.1 User Manual](#21-user-manual)
   - [2.2 Quick Reference Guide](#22-quick-reference-guide)
   - [2.3 Process Flow / Workflow Diagrams](#23-process-flow--workflow-diagrams)
   - [2.4 Known Issues & Workarounds](#24-known-issues--workarounds)
   - [2.5 Release Notes](#25-release-notes)

---

## 1. Access & Administration

### 1.1 List of Assigned Roles & Departments

The system recognizes two system roles:

- **Admin** – unrestricted access to every module.
- **Employee** – access is computed from two additional attributes on their account:
  - **Designation** (organizational rank): Rank & File, Supervisory, Managerial, Director, or Executive.
  - **Department**: Accounts Payable - Trade, Business Solutions Manager, Executive Office, Logistics, Procurement Group, or TASS.

Every account's default module access and visible survey data types are computed automatically from its Designation × Department combination (`src/utils/rbac.ts`). An Admin can override this per individual account, or set a bulk ceiling for an entire department, from Users & Access.

**Default module access by designation**

| Designation | Default modules granted |
|---|---|
| Rank & File | Dashboard, Analytics, Evaluations, Partners, Compliance Documents, Notification Logs |
| Supervisory | All Rank & File modules, plus Partner Feedback and Reports |
| Managerial | All Supervisory modules, plus Evaluation Responses, Presentations, and Archive |
| Director | Same default module set as Managerial |
| Executive | Dashboard, Analytics, Reports, Presentations, Notification Logs (a reduced, summary-focused set) |
| Admin (role) | Every module, regardless of designation, including Users & Access, Renew Compliance Documents, and Import Responses |

*Data-scoping for survey responses is enforced by the applied versioned RLS migrations: Admin, Executive, and Director see every response; Supervisory sees their own department's responses; Rank & File sees only their own submissions. The product intends Analytics to remain company-wide and aggregate-only for every rank, but lower-rank sessions currently hydrate from these already-scoped raw rows. A protected aggregate RPC/view is still required; see `docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md`.*

### 1.2 Admin Account Details

An Admin account has unrestricted access to every module in the system:

| Module | What it does |
|---|---|
| Dashboard | Personalized performance indicators and KPIs |
| Evaluations → Forms | View, fill, and publish evaluation forms |
| Evaluations → Responses | Analyze complete evaluation response records |
| Analytics | Company-wide statistical charts and trends |
| Reports | Generate custom report cards and raw exports |
| Reports → Presentations | Staggered slide-deck presentation builder |
| Partners → Directory | Manage external courier, supplier, and subcontractor rosters |
| Partners → Compliance Documents | Categorized compliance-document table across all partner companies |
| Renew Compliance Documents | Action permission: update document expiry/status in Partners and Compliance Documents without requiring full Users & Access permissions |
| Partners → Supplier Ranking | Curate and reorder the Top 20 suppliers evaluable by default in Supplier surveys |
| Users & Access | Configure system roles, ranks, departments, and user permissions |
| Notification Logs | Audit trail of incoming survey responses and document-expiry alerts |
| Archive | Browse and restore archived feedback submissions |
| Evaluations → Import Responses | Import Supplier, Subcontractor, and Courier evaluation worksheets together from one Excel workbook |

One built-in Admin identity, `admin@mgenesis.com`, ships as the seed account for a fresh deployment — it exists specifically so there is a way to sign in for the first time and start adding real employees through Users & Access. From there, Admin rights can be granted to any other real mgenesis.com employee the same way any account is granted access (Section 1.1), simply by setting their System Role to Admin.

| Email | Role | Designation | Department |
|---|---|---|---|
| admin@mgenesis.com | Admin | Executive | Business Solutions Manager |

An Admin account has no separate password to hand over: access is authenticated the same way as every other account, through the employee's own mgenesis.com Microsoft 365 / Entra ID sign-in (Section 1.4). Being an Admin is an authorization record in Users & Access, not a separate credential.

### 1.3 Procedure for Requesting New User Access

New access should be requested and granted end-to-end as follows:

| Step | Who | Action |
|---|---|---|
| 1 | Requester (manager/supervisor) | Submits a request for the new employee's system access to the System Administrator, stating the employee's name, department, and designation/rank. |
| 2 | mgenesis IT (Entra ID) | Confirms the employee has an active @mgenesis.com Microsoft 365 / Entra ID account (provisions one first if this is a new hire). |
| 3 | System Administrator | Opens Users & Access → Add Account, and enters the employee's @mgenesis.com email, System Role, Designation, and Department. |
| 4 | System | Automatically computes the employee's default module and survey-data access from their Designation and Department. |
| 5 | System Administrator | Optionally customizes individual module access ("Custom Overrides") if the employee needs something outside their role default, then saves. |
| 6 | Employee | Signs in at the system's login page with "Sign in with Microsoft," using their existing mgenesis.com credentials — no separate password is created. |

Once an account exists in Users & Access, an Admin can further customize its individual module or survey-type access ("Custom Overrides"), or reset it back to role/department defaults at any time. A department's overall access ceiling can also be set in bulk via "Department Access," which then applies to every member of that department.

Built-in safeguards: an Admin cannot delete their own account, or delete another account that shares their same role.

### 1.4 Password Reset Process

Every mgenesis.com user — including Admins — signs in with "Sign in with Microsoft," authenticating against the organization's own Microsoft Entra ID (Microsoft 365) directory. Because of this, password reset and account recovery is handled entirely by Entra ID, exactly as it is for the employee's email or any other Microsoft 365 app — not by this system.

- **To reset a forgotten password**: the employee uses mgenesis' standard Microsoft 365 self-service password reset (SSPR), or contacts the mgenesis IT helpdesk, the same as for any other Microsoft 365 sign-in issue.
- **No action is required in this system**: resetting a Microsoft 365 password automatically restores the employee's system access, since the system holds no separate password of its own.

> **Implementation note:** this requires the Azure AD app registration for this system to be completed so "Sign in with Microsoft" is the active, sole login path — see [Known Issues #1, #2, and #9](#24-known-issues--workarounds) for the current gap and its risks.

---

## 2. Documentation

### 2.1 User Manual

The system is organized into modules, each shown or hidden in the navigation according to the permission model in Section 1.1. Survey data itself is further divided into three types:

| Type | Label | Covers |
|---|---|---|
| Courier | Courier Satisfaction | Courier and logistics satisfaction reporting |
| Supplier | Supplier Quality | Inventory supplier assessment and commercials |
| Subcontractor | Subcontractor Performance | On-site subcontractor compliance and execution |

**Modules**

| Module | What it does |
|---|---|
| Dashboard | Personalized performance indicators and KPIs |
| Evaluations → Forms | View, fill, and publish evaluation forms |
| Evaluations → Responses | Analyze complete evaluation response records |
| Analytics | Company-wide statistical charts and trends |
| Reports | Generate custom report cards and raw exports |
| Reports → Presentations | Staggered slide-deck presentation builder |
| Partners → Directory | Manage external courier, supplier, and subcontractor rosters |
| Partners → Compliance Documents | Categorized compliance-document table across all partner companies |
| Renew Compliance Documents | Action permission: update document expiry/status in Partners and Compliance Documents without requiring full Users & Access permissions |
| Partners → Supplier Ranking | Curate and reorder the Top 20 suppliers evaluable by default in Supplier surveys |
| Users & Access | Configure system roles, ranks, departments, and user permissions |
| Notification Logs | Audit trail of incoming survey responses and document-expiry alerts |
| Archive | Browse and restore archived feedback submissions |
| Evaluations → Import Responses | Import Supplier, Subcontractor, and Courier evaluation worksheets together from one Excel workbook |

**Settings**

Every signed-in user has a Settings page for light/dark mode and signing out; Admins additionally see the admin activity log, export history, and Evaluations → Import Responses.

**Frequently Asked Questions**

**How do I generate a report?**
Go to Reports and choose a builder — Summary, Company, Question, or Executive Summary — then export it as PDF, Excel, or CSV.

**How do I send a report to a partner company?**
Open Partners → Partner Feedback, select a completed survey, and use "Send Report to Partner" for one company, or "Bulk Sending" to queue reports for every completed company at once. The email (with a PDF report attached) is sent through Microsoft Graph as the signed-in Admin's own Microsoft account, so "Sign in with Microsoft" is required to use it.

**How do I create and publish a new survey?**
Go to Evaluations → Forms → Create Evaluation Form, fill in the type, questions, deadline, and which departments/ranks/companies should see it, then Publish.

**How do I check which compliance documents are expiring soon?**
Open Partners → Compliance Documents for the full list, or check the Notification Bell / Notification Logs for active expiring/expired alerts.

**How do I request access for a new employee?**
Follow the procedure in [Section 1.3](#13-procedure-for-requesting-new-user-access) of this document — it starts with your mgenesis IT/Entra ID request, then an Admin adds the account in Users & Access.

**How do I reset my password?**
Password reset is handled by mgenesis' Microsoft Entra ID / Microsoft 365, the same as for email — see [Section 1.4](#14-password-reset-process). This system does not manage passwords itself.

**How do I give someone extra access beyond their role's default?**
In Users & Access, edit their account and toggle the specific modules or survey types they need; saving marks their account "Custom Overrides." Use "Reset Access" to remove the override and return to role defaults.

**How do I recover an archived survey response?**
Go to Archive to browse and restore previously archived submissions.

**How do I present results to leadership?**
Use Reports → Presentations to build a staggered slide-deck from the current analytics/report data.

**Why can't I see a module I need?**
It is not part of your role/department's default access. Ask an Admin to grant it to your account individually, or check whether your department's overall access ceiling (Department Access) allows it.

### 2.2 Quick Reference Guide

A condensed cheat-sheet of who gets what, by default:

| Designation | Default modules granted |
|---|---|
| Rank & File | Dashboard, Analytics, Evaluations, Partners, Compliance Documents, Notification Logs |
| Supervisory | All Rank & File modules, plus Partner Feedback and Reports |
| Managerial | All Supervisory modules, plus Evaluation Responses, Presentations, and Archive |
| Director | Same default module set as Managerial |
| Executive | Dashboard, Analytics, Reports, Presentations, Notification Logs (a reduced, summary-focused set) |
| Admin (role) | Every module, regardless of designation, including Users & Access, Renew Compliance Documents, and Import Responses |

- To add a user: Users & Access → Add Account (Admin only).
- To change what a whole department can see: Users & Access → Department Access.
- To create an evaluation form: Evaluations → Forms → Create Evaluation Form (Admin only by default).
- To check compliance-document expiries: Partners → Compliance Documents, or the Notification Bell for active alerts.
- To recover archived responses: Archive.
- To send a report to a partner company: Partners → Partner Feedback → Send Report to Partner, or Bulk Sending for multiple companies at once.

### 2.3 Process Flow / Workflow Diagrams

**A. Sign-in & access resolution**

| Step | Actor | Action |
|---|---|---|
| 1 | User | Opens the login page and either enters an @mgenesis.com email + password, or clicks "Sign in with Microsoft" (if configured). |
| 2 | System | Rejects any email that does not end in @mgenesis.com. |
| 3 | System | Checks the entered password against the local fallback values, or — for Microsoft sign-in — authenticates the identity with Microsoft Entra ID. |
| 4 | System | Looks up the signed-in email in the Accounts list to resolve Role, Designation, and Department. |
| 5 | System | Computes the account's permitted pages and survey types (role/designation/department defaults, or a saved per-account override). |
| 6 | User | Lands on the Dashboard with only the permitted modules visible in the navigation. |

**B. Survey lifecycle**

| Step | Actor | Action |
|---|---|---|
| 1 | Admin | Creates a Survey Form: title, type (Courier / Supplier / Subcontractor), questions, deadline, and which departments/ranks/companies can see it. |
| 2 | Admin | Publishes the form (status: Running). |
| 3 | Employee / Partner | Fills out the form if their department/rank/company is in scope. |
| 4 | System | Records one response row per answered question and updates the Notification Bell and Notification Logs. |
| 5 | All eligible users | See the new data reflected in Dashboard, Analytics (company-wide for everyone), and — for their own scope — Evaluations → Responses and Reports. |
| 6 | Admin | Archives a completed survey's responses into an Archive Series once it is no longer active. |
| 7 | Authorized users | Browse or restore archived submissions from Archive. |

**C. Partner company & compliance-document tracking**

| Step | Actor | Action |
|---|---|---|
| 1 | Admin | Adds or edits a Partner Company (Courier, Supplier, or Subcontractor), including branches and compliance documents. |
| 2 | System | Aggregates compliance documents across all partner companies into Partners → Compliance Documents, applying each document type's configured expiry milestones. |
| 3 | System | Raises "expiring soon" / "expired" alerts based on Document Notification Settings, surfaced via the Notification Bell and Notification Logs. |
| 4 | User with Renew Compliance Documents permission | Updates the document's expiry date/status in Partners → Directory or Partners → Compliance Documents. |

### 2.4 Known Issues & Workarounds

Every item below was verified directly against the current source code, not inferred.

| # | Issue | Impact | Workaround / Recommendation |
|---|---|---|---|
| 1 | Supabase email/password is the staging login because Azure access is unavailable. | Microsoft login and Graph email cannot be used. | Keep Azure features disabled unless an approved Entra registration becomes available. |
| 2 | Password-reset UI is not implemented. | A staging user cannot self-recover from the application. | Use Supabase Dashboard authentication tools until a reset flow is added. |
| 3 | Supabase leaked-password protection is disabled in staging and requires the Pro plan or above. | Known leaked passwords are not rejected by the hosted Auth service. | Enable leaked-password protection in Supabase Auth settings before production if the target plan supports it. |
| 4 | New confirmed users default to Employee; Admin edits require an approved `app_profiles` promotion. | A first-time user can submit evaluations but cannot edit shared registry/configuration data. | Promote an approved user in the Supabase dashboard after account confirmation. |
| 5 | The old `supabase/schema.sql` draft contains anonymous test policies and is not applied. | Applying it as-is would weaken access controls. | Use only reviewed versioned migrations. |
| 6 | A live-chat feature (Admin Chat Widget, Live Chat page, Employee Notifications Hub, chat service) was built across several commits and is now deleted in the working tree, but the deletion is not yet committed. | Whoever continues this project should confirm the removal is intentional before it is committed, since it removes real functionality. | Confirm with the project owner, then commit the removal explicitly (or restore the feature) rather than leaving it as an uncommitted change. |
| 7 | `EFAS_Project_Charter.docx` (in the project root, tracked since the initial commit) is a corrupted Word file — its ZIP central directory offset is invalid. | It cannot be opened by Word, pandoc, or standard ZIP tooling; whatever project-charter content it held is currently inaccessible. | Locate a valid backup copy if one exists, or treat the content as lost and re-document the project charter separately. |
| 8 | No User Manual, Quick Reference Guide, Known Issues log, or Release Notes existed in the repository before this handoff. | New team members previously had no onboarding documentation. | This document is the first pass at all four — keep it updated as the system changes. |
| 9 | Lower-rank Analytics is intended to be company-wide, but its input is the raw `survey_response` projection restricted by RLS. | Supervisory users see only their department and Rank & File users see only their own records, so their charts cannot be company-wide. | Add a protected aggregate RPC/view; do not widen access to raw responses. See `docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md`. |
| 10 | The UI can grant `renew-documents` to a non-Admin, while `partner_company` updates are Admin-only in RLS. | A delegated document renewal can appear optimistically in the browser and then fail to persist. | Add a narrowly validated renewal RPC or a server-side effective-permission rule before relying on delegated renewal. |
| 11 | Managerial and Director defaults expose Archive, while existing response UPDATE/DELETE operations are Admin-only in RLS. | Archive, restore, and permanent-delete mutations fail remotely for those non-Admin roles. | Decide whether Archive is Admin-only or implement an authorized server-side archive operation. |

### 2.5 Release Notes

Summarized from the project's git commit history (first commit July 18, 2026 through the present).

| Date | Milestone | Summary |
|---|---|---|
| 2026-07-18 | Initial commit | First working version of the system committed; initial pass and same-day fixes to Notification Logs for Employees. |
| 2026-07-20 | Settings & evaluation picker | Reworked the Modify Settings modal and added a company evaluation picker. |
| 2026-07-21 | Notification Logs fixes | Additional fixes to Notification Logs behavior for Employee accounts. |
| 2026-07-22 | Bulk sending | "Send To Companies" and Bulk Sending features introduced and iterated on. |
| 2026-07-23 | Masterlist & stability | Partner company masterlist incorporated; simulated system clock added for testing time-dependent features; general bug fixes, a scaling fix, and Excel export formatting. |
| 2026-07-24 | Deployment fix | Fix for the Vercel deployment. |
| 2026-07-26 – 27 | Rating system & imports | Improved rating system; CSV file import acceptance added; several masterlist updates. |
| 2026-07-27 – 29 | Document tracking | Multiple Document Masterlist updates refining compliance-document tracking. |
| 2026-07-30 | Analytics & UI cleanup | Analytics updated for the revised rating system; decimal rating logic revised; general UI decluttering. |
| 2026-07-31 | Dashboards | Documents Tracker Dashboard update; Employee Evaluation Tracker Dashboard update. |
| 2026-08-03 | Latest updates | Final committed round of updates ("Last few updates") ahead of this handoff. |
| 2026-08-04 (uncommitted) | Pre-handoff cleanup | Live-chat feature removed from the working tree; Supabase backend groundwork added (draft schema plus partial client wiring); environment-flag and `.env.example` setup notes added ahead of go-live. See Known Issues #3–6. |

### Admin evaluation navigation

Admins use grouped, URL-backed navigation: Partners (Directory, Documents, Feedback), Evaluations (Workspace, Archive, Import Responses), and Reports (Generate, Present, Export History), plus Dashboard, Analytics, and Users. Notifications and Settings are pinned at the bottom of the sidebar. Employees use Home, Assigned Evaluations, My Submissions, Notifications, and Profile. Existing permission and persistence keys remain unchanged.
