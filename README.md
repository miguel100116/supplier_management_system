# Supplier Management System

> Internal project name: `ms-form-analytics-dashboard` (v0.1.0)
> A survey-driven evaluation, analytics, and compliance-tracking platform for managing external **Couriers, Suppliers, and Subcontractors**.

---

## Table of Contents

1. [Overview](#1-overview)
2. [What the System Does](#2-what-the-system-does)
3. [Core Concepts & Organization Technique](#3-core-concepts--organization-technique)
   - [3.1 Survey Data Types](#31-survey-data-types)
   - [3.2 Categories, Weights & Scoring](#32-categories-weights--scoring)
   - [3.3 Roles, Designations & Departments (RBAC)](#33-roles-designations--departments-rbac)
   - [3.4 Data Scoping & Isolation](#34-data-scoping--isolation)
4. [Modules](#4-modules)
5. [Architecture & Tech Stack](#5-architecture--tech-stack)
6. [Project Structure](#6-project-structure)
7. [Data Storage & Persistence](#7-data-storage--persistence)
8. [Authentication](#8-authentication)
9. [Getting Started](#9-getting-started)
10. [Environment Configuration](#10-environment-configuration)
11. [Available Scripts](#11-available-scripts)
12. [Deployment](#12-deployment)
13. [The Creation Process (Development History)](#13-the-creation-process-development-history)
14. [User Manuals](#14-user-manuals)
15. [Current Status & Known Issues](#15-current-status--known-issues)
16. [Glossary](#16-glossary)

---

## 1. Overview

The **Supplier Management System** is an internal web application built for **Microgenesis** to evaluate, rank, and monitor the company's external business partners — its couriers, inventory suppliers, and on-site subcontractors.

At its heart, the system replaces scattered paper evaluation forms and standalone Microsoft Forms surveys with a single, unified platform where employees can:

- **Fill out structured evaluation surveys** for partner companies,
- **See those results turned into live analytics, rankings, and report cards** the moment they are submitted, and
- **Track each partner's compliance documents** (permits, certifications, insurance, etc.) and their expiry dates.

It is a role-aware platform: what each employee sees — which modules, which data — is computed automatically from their organizational rank and department, and can be fine-tuned by an administrator.

> **Status note:** This system is in **active pre-production development**. Staging uses Supabase email/password authentication and Supabase as the durable source for shared business records, configuration, operational history, and per-user notification state. Device-specific drafts and display preferences remain local. Microsoft login and Graph email remain unavailable without Azure access.

---

## 2. What the System Does

| Capability | Description |
|---|---|
| **Partner evaluation surveys** | Create, publish, and fill structured feedback forms scoped to specific departments, ranks, and companies. |
| **Real-time analytics** | Loaded submissions refresh charts, trends, and comparisons within the signed-in user's authorized response scope. |
| **Scoring & ranking** | Weighted, rubric-based scoring converts raw answers into a normalized 0–100 composite score and a ranked leaderboard per partner type. |
| **Compliance document tracking** | A categorized register of every partner's compliance documents, with configurable expiry milestones and "expiring soon / expired" alerts. |
| **Report generation** | Summary, per-company, per-question, and executive-summary report builders, exportable to PDF, Excel, and CSV. |
| **Partner feedback delivery** | Send finished report cards to partner companies by email (individually or in bulk) via Microsoft Graph. |
| **Presentation mode** | Build a staggered slide deck from the current analytics for leadership presentations (exportable to PDF/PPTX). |
| **Archiving** | Archive completed survey periods into named series so multi-year trends accumulate without cluttering the active view. |
| **Account & access management** | Admins manage employee accounts, per-department access ceilings, and per-account permission overrides. |
| **Bulk imports** | Import a partner-company master list, or import Supplier, Subcontractor, and Courier evaluation worksheets together from one Excel workbook. |

---

## 3. Core Concepts & Organization Technique

The system's data model is organized along a few consistent axes. Understanding these four is enough to understand the whole application.

### 3.1 Survey Data Types

All survey data is divided into **three partner types**. Every survey, response, partner company, score, and report belongs to exactly one of these:

| Type | Label | Covers |
|---|---|---|
| **Courier** | Courier Satisfaction | Courier and logistics satisfaction reporting |
| **Supplier** | Supplier Quality | Inventory supplier assessment and commercials |
| **Subcontractor** | Subcontractor Performance | On-site subcontractor compliance and execution |

### 3.2 Categories, Weights & Scoring

Each survey type's questions are grouped into **5 scored categories** plus a fixed 6th "Overall" bucket for free-form/period feedback that isn't scored.

| Survey Type | The 5 scoring categories |
|---|---|
| **Courier** | Delivery, Commercial, Technology, Support, Security |
| **Supplier** | Documentation, Delivery, Price, Quality, Communication |
| **Subcontractor** | Delivery, Documentation, Cost, Quality, Communication |

- **Weighted rubric:** Each question carries a point value validated against the company's original paper evaluation forms (`src/data/questionWeights.ts`). Answers are scored, summed per category, and normalized so **every survey type shares one 0–100 composite axis** (`src/features/evaluations/domain/scoring.ts`).
- **Score bands:** Composite scores map to labeled bands (e.g. Critical → Excellent). Companies with no scoreable answers yet get a distinct "No Score Yet" band instead of being mislabeled as failing.
- **Ranking:** Analytics and generated company-ranking reports use the normalized rubric composite, with matching score formatting and rating bands. Scores display exactly two decimal places without rounding up (89.999 becomes 89.99); calculations retain full precision and ratings use the unrounded value. Subcontractor displays on the 0–2 scale with Top/Good/Marginal/Poor Performer bands; Courier/Supplier retain their 0–100 bands. Other consumers of `getLeaderboard` still have the separate Bayesian confidence-weighted rank score available. Reports and Analytics must use the same filters and authorized data scope for direct comparison.
- **CSV re-uploads:** Analytics recognizes original UUID submissions and their matching standard `IMPORT-*` re-upload identities once when company, timestamp, respondent, form, and archive period agree. Stored source records and additional client evaluations are preserved; CSV reference totals are not limits on new data.
- **Generated report content:** Summaries, question tables, and company rankings use the same authorized official response cohort. Company preview/export follows stable company IDs and the selected archive scope. Evaluated-company lists require actual answered evaluations. Executive findings require scored data; custom notes start blank and saved notes remain user-provided.
- **Renaming vs. rubric:** Admins can **rename** a category's display label via the **Categories Manager** without ever touching the underlying point values — display names are translated by slot position, keeping the validated rubric intact.

- **Counted forms:** A unique submission counts when at least one evaluation rating or designated remark has a real answer. Numeric zero counts; blank, N/A, none, dash, and nil markers do not. Metadata such as Period Covered never counts. Blank/N/A-only forms are excluded from totals and completion counts; score averages still use numeric ratings.

### 3.3 Roles, Designations & Departments (RBAC)

Access is **computed**, not hand-assigned per user. Every account has three attributes, and its default access falls out of their combination (`src/utils/rbac.ts`):

- **System Role:** `Admin` (unrestricted) or `Employee`.
- **Designation (rank):** Rank & File, Supervisory, Managerial, Director, or Executive.
- **Department:** Accounts Payable – Trade, Business Solutions Manager, Executive Office, Logistics, Procurement Group, or TASS.

**Default module access by designation:**

| Designation | Default modules granted |
|---|---|
| Rank & File | Dashboard, Analytics, Survey Forms, Partner Companies, Document Tracker, Notifications |
| Supervisory | All Rank & File modules + Feedback Hub and Reports |
| Managerial | All Supervisory modules + Survey Explorer, Present, and Archive Center |
| Director | Same default set as Managerial |
| Executive | Dashboard, Analytics, Reports, Present, Notifications (a reduced, summary-focused set) |
| **Admin (role)** | **Every module**, including Account Management, Renew Compliance Documents, and Import Evaluation Responses |

An Admin can **override** access per individual account ("Custom Overrides"), or set a bulk access **ceiling** for an entire department ("Department Access"), from the Account Management page.

### 3.4 Data Scoping & Isolation

Beyond *which modules* a user sees, the system controls *which response data* they see (`applyAccessFilter` in `src/App.tsx`, including Analytics):

| Who | Sees which survey responses |
|---|---|
| Admin / Executive / Director | Every response (within their permitted survey types) |
| Supervisory | Only their own department's responses |
| Rank & File | Only their own submissions |
| **Analytics** | Uses the same authorized response scope above, within permitted survey categories |

A **Data Scope** toggle further switches between *Current* (active period), *All-Time* (active + all archived periods), and *Custom* (Analytics submission-date calendars across active and archived history, optionally narrowed to selected archived series). Custom ranges include both selected dates in the user's local time zone; either boundary can be left blank. The calendar controls remain available when no responses match.

---

## 4. Modules

The Admin sidebar groups **Directory**, **Documents**, and **Feedback** under **Partners**; **Workspace**, **Archive**, and **Import Responses** under **Evaluations**; and **Reports** and **Present** under the Reports group. Reports contains **Generate** and **History** tabs. Account management is labeled **Users**. Module headings and browser tab titles use these same navigation names; descriptive subtitles remain below the headings. These display labels do not change existing URLs or access permissions.

Form headings use **Create Evaluation Form**, **Edit Evaluation Form**, **Evaluation Details**, and **Fill Out Evaluation Survey**. The company report screen is labeled **Partners Report Builder**; the evaluation company-picker preset is labeled **Active Partners**.

Admin module headers follow the compact Partner directory format: matching title typography, a subtitle directly below when present, and header actions alongside the text on desktop or below it on narrow screens. The Dashboard retains its greeting and welcome banner.

| Module | What it does |
|---|---|
| **Dashboard** | Personalized performance indicators and KPIs. Evaluation results use the same authorized official responses, Current/All-Time/Custom scope, filters, counting rules, and two-decimal score formatting as Analytics and generated report summaries. Operational form/completion tracking remains current-round data; custom dates are selected in Analytics. |
| **Survey Forms** | View, fill, and publish feedback forms. Manage Access and the Forms table use the same deadline-aware status, including explicit manual endings. Marking a form **Ended** archives the active results for its partner category; the category ranking remains available in Company Leaderboard → Archives and the archived responses remain in Archive Center. Legacy forms named with a leading Test/Tests label are hidden from employee evaluation choices and remain available to Admins. Respondent Info starts directly with the progress steps and has only “Proceed to Form Questions” in its footer; sidebar navigation and the later Questions Form Return actions remain available. Date-range questions support calendar pickers with month/year selection or typed `dd/mm/yyyy` dates; both dates are required and the end must be on or after the start. |
| **Survey Explorer** | Review each survey submission, filter by respondent email, inspect answers, and export all or filtered responses to Excel. |
| **Analytics** | Charts, trends, rankings, and company comparisons calculated locally from authorized loaded responses within permitted survey categories. Company Leaderboard has Current rankings and Archives views; choosing an archived category-period opens its company ranking list. |
| **Reports** | Generate and History tabs for Summary / Company / Question / Executive-Summary builders and raw exports (PDF, Excel, CSV, Word where supported). Saved copies can be downloaded again; Regenerate opens saved builder options with current authorized data and filters. |
| **Present** | Staggered slide-deck presentation builder (PDF/PPTX export). |
| **Partner Companies** | Manage external courier, supplier, and subcontractor rosters, branches, documents, and the Admin-only dated Active Companies upload history. |
| **Document Tracker** | Opens on All Categories with combined compliance figures. The category filter stays below the navigation bar while scrolling, with the floating document-table header below it. Category tabs filter the register; a valid `?category=supplier-local`, `supplier-foreign`, `courier`, or `subcontractor` link opens that category. Returning through normal navigation resets to All Categories. |
| **Renew Compliance Documents** | Action permission: update document expiry/status without full Account Management access. |
| **Partners Feedback Hub** | Send report cards to partner companies (single or bulk email via Microsoft Graph). |
| **Account Management** | Create company-domain logins with a generated or customized initial password, and configure roles, ranks, departments, and per-user/per-department permissions. |
| **Notifications** | Admin header bell and logs show response activity and document-specific expiry alerts, including branch, due date, early milestones, and AFS status. Employees see in-app reminders for unfinished work on accessible forms. Explicit successful sends/resends renew unread reminders for pending work; reading a reminder does not complete an evaluation. |
| **Archive Center** | Browse and restore archived feedback submissions and series. |
| **Import Evaluation Responses** | Admins select multiple CSV or Excel exports across Supplier, Subcontractor, and Courier, including multiple files for one category. The system detects each form, matches companies against the full Partner Registry, and imports the selected files together. Each original file is stored in a private Supabase Storage archive with Admin-only download access. |
| **Categories Manager** | Rename the display labels of scoring categories per survey type. |
| **Settings / Profile** | A large modal opened from the account-session dropdown. Employees retain their full profile, impact, recent-submission, preference, and session view; Admins retain the complete Settings view with activity, import, and cache-management tools. |

Reminder completion is per form and company ID. Legacy responses without IDs count only when the available form/question and company-name mappings are unambiguous; ambiguous records remain stored and do not complete new work. Forms without distribution metadata retain their existing read-state IDs. Reminder frequency remains a saved preference: scheduled email, push, and background dispatch are not implemented. Shared Supabase invalidation refreshes forms while connected and after reconnect; live delivery timing requires environment-specific verification.

Reports uses `/reports`; `/generate-report` remains an alias, and `/export-history` redirects to `/reports?tab=history`. Export history is saved per authenticated user in Supabase. New Reports downloads retain their original file (up to 15 MB) and builder options; filenames use `sms_<report>_<UTC timestamp>_<unique suffix>.<extension>`. If history saving fails or the file exceeds the limit, the download still completes and an error is shown. Legacy entries without a saved file or options remain visible with unavailable actions disabled. Clear log requires confirmation and removes retained copies with their entries; it does not remove files already downloaded. Unattributed legacy browser caches are retained on the device and are not automatically assigned to a user.

Form details show **Recent Form Submissions** in pages of 10, with the visible range and Previous/Next controls when needed.

Unsaved form and category edits use an in-system warning with **Continue Editing**, **Discard Changes**, and **Save Changes** where available. Escape and backdrop dismissal continue editing. Form saves must pass validation and finish successfully before leaving; category saves retain their existing impact confirmation. Evaluation answers can be saved as a draft through the same action labels.

Select or drop one or more `.csv`, `.xlsx`, or `.xls` response exports on the Import Evaluation Responses page. Each file may contain one or more recognized forms; the normal **Import selected files** action accepts any category mix. Choose non-overlapping exports: duplicate source response IDs in one batch are rejected to prevent silent replacement. To check a batch without replacing existing evaluations, use **Test import**. Its responses appear in Analytics under the files' submission dates. In **Stored Source Files**, **Active** requires current imported responses in that file's batch linked to an existing Active form in **Workspace > Manage Access**, including its deadline. An explicit response form ID is authoritative; older imports without one belong to their standard Workspace form. For legacy batches without response links, the newest standard Microgenesis CSV for an active default form also qualifies; explicitly archived/replaced files, test imports, and older copies do not. Files linked to deleted forms or archived responses remain in History even when another form of the same category is Active. Combined files qualify when their own batch links to any Active form; explicitly archived or replaced files remain in History until restored. Imports can be moved to **Import History** with the archive action; this keeps the source file and all evaluation responses. Permanently remove is available only in Import History. Removing an ordinary archived file deletes that stored copy and its archive record while preserving evaluation responses and any other copies. Permanently removing a test import also deletes its tagged responses and temporary partner records. The selection X is shown only before importing. Ordinary imports may have replaced earlier responses; those earlier values cannot be restored by removing an archived source file, and ordinary partner records remain in the registry. If a temporary partner has since been referenced by another evaluation, test removal stops before deleting data.

---

## 5. Architecture & Tech Stack

The application is a **single-page React app** with an Express server for development, production static hosting, and protected account provisioning.

| Layer | Technology |
|---|---|
| **UI framework** | React 18 + TypeScript |
| **Build tool** | Vite 6 |
| **Styling** | Tailwind CSS 4 with the PostCSS integration |
| **Charts** | Recharts |
| **Icons / animation** | lucide-react, motion |
| **Server** | Express (dev middleware via Vite; static host in production) |
| **Auth** | Supabase email/password in staging; optional Microsoft Entra ID code remains unavailable without Azure configuration |
| **Backend** | Supabase normalized import/audit tables plus an RLS-protected editable application store in staging |
| **Email** | Microsoft Graph (`Mail.Send`, delegated) |
| **Exports** | jsPDF + jspdf-autotable (PDF), xlsx (Excel), papaparse (CSV), pptxgenjs (PPTX), docx |

The Tailwind 4 security upgrade retains the existing color/effect scales in `tailwind.config.js` and sibling spacing, divider, and outline behavior through `scripts/tailwindCompatibility.mjs`. Its stylesheet regression test runs with `npm test`. Supported browsers are Safari 16.4+, Chrome 111+, and Firefox 128+; see the [official browser requirements](https://tailwindcss.com/docs/upgrade-guide#browser-requirements).

**Key design decision — the data source seam:** Authenticated staging sessions load shared business records, configuration, operational history, and per-user state through the Supabase application repository. The normalized CSV tables remain the immutable import/audit layer, while `application_records` is the editable UI-facing store. Realtime table changes trigger an RLS-protected refetch. Local storage is limited to authenticated startup caching and device-specific state; the frontend no longer generates or bundles mock business records.

**Official Analytics provenance:** Client CSV evaluations and verified production submissions feed Analytics and Company Leaderboards. Submissions created while `VITE_DEPLOYMENT_ENV=staging` are retained as test records but excluded from official analytics. The setting defaults safely to staging and must be explicitly set to `production` in the approved live deployment.

---

## 6. Project Structure

```
Supplier_Management_System/
├── src/
│   ├── App.tsx                 # Root: routing, RBAC resolution, data-scope wiring
│   ├── main.tsx                # React entry point
│   ├── layouts/Shell.tsx       # App shell (sidebar nav, header)
│   ├── pages/                  # Route composition, page layouts, workflow orchestration
│   ├── components/             # Shared UI controls, charts, filters, and state messages
│   ├── features/               # Feature-owned components, domain rules, services, and tests
│   ├── services/               # Shared persistence, authentication, Graph, and Supabase access
│   ├── utils/                  # Shared routing, permission, session, date, and table helpers
│   ├── hooks/                  # useSurveyData (central data store), session and viewport hooks
│   ├── data/                   # Survey questions, weights, and category definitions
│   └── types/                  # Shared survey, partner, and application contracts
├── reference-materials/         # Historical utilities, extracted form material, reviewed CSVs
│   ├── scripts/                # Extraction, generation, and patch utilities
│   ├── extracted/              # Existing extracted text, metadata, and question JSON
│   └── source-data/            # Reviewed CSVs, original screenshots, and project charter
├── docs/
│   ├── Admin_Manual.docx       # Full administrator manual
│   ├── Employee_Manual.docx    # Full employee manual
│   └── _build/                 # Scripts that generate the two .docx manuals
├── supabase/schema.sql         # DRAFT PostgreSQL schema (not yet applied)
├── server.ts                   # Express dev/production server
├── .env.example                # Environment variable template
├── SYSTEM_TURNOVER.md          # Detailed handoff / turnover documentation
└── README.md                   # This file
```

See [the feature directory map](docs/engineering/PROJECT_STRUCTURE.md) for ownership, moved modules, and shared boundaries. Tests remain beside the code they cover; `npm test` includes their current paths.

See [reference materials](reference-materials/README.md) for the relocated utilities and CSV sources. Run legacy utilities from the repository root using their new paths. Normal application and build configuration remains at the root.

---

## 7. Data Storage & Persistence

**Current state:** Authenticated staging users load and save profiles, department permissions, surveys, Partner Companies/documents, evaluation responses, archives, category labels, Feedback Hub data, notification/reminder settings, compliance snapshots, activity/modification logs, export history, and employee notification state through Supabase. Legacy Supplier Ranking history rows remain stored in Supabase but are no longer loaded or updated by the application. Existing eligible browser records are migrated once, after which the remote record set is authoritative. `localStorage` is retained as an authenticated startup cache and for intentionally device-specific state such as in-progress survey drafts and layout preferences.

> **Implication:** Authenticated shared business data is available across devices through staging Supabase. Clearing browser storage removes only the local cache and device-specific drafts/preferences; it does not delete the shared backend records.

**Staging backend:** The normalized migrations under [`supabase/migrations`](supabase/migrations) are applied to the dedicated staging project. Imported normalized tables remain the immutable source/audit layer. `app_profiles` and per-entity `application_records` are the editable frontend store and are published to Supabase Realtime. RLS scopes evaluation rows by profile, permits employees to insert only their own submissions and operational entries, and restricts shared configuration/registry writes by role. Authorization helpers live in an unexposed `private` schema. The older [`supabase/schema.sql`](supabase/schema.sql) remains an unapplied draft.

The verified frontend/backend contract, record-type matrix, Realtime routing, and known authorization gaps are documented in [`docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md`](docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md). Analytics calculates locally from the existing authorized response store. Current, All-Time, and Custom scopes retain official provenance, CSV identity reconciliation, inclusive local-day filtering, and optional archive-period selection. Category selection recalculates from the filtered loaded responses. Analytics does not request `/api/analytics` or require a server-only key; existing Supabase hydration, RLS, and Realtime refresh remain authoritative. Lower-rank users see their authorized response scope, not company-wide aggregates. No database migration is needed.

Company Leaderboards use the existing shared Postgres Changes channel on `application_records` (`survey_response` INSERT/UPDATE/DELETE), with no polling. Events are batched for 500 ms (at most 1.5 seconds during a continuous stream), then complete affected submissions are fetched through RLS. Reconnection reconciles missed responses. Saved submissions and evaluation imports become visible after persistence succeeds; response batches use one atomic PostgREST upsert. Large imports must fit the deployed API request/transaction limits; a rejected batch reports failure instead of publishing partial evaluation scores. Company leaderboard rows reuse unchanged calculations and references while rank changes update in place. Existing score/count rules, official provenance, scope filters, and legacy import completion-date fallbacks remain unchanged. Live timing and Realtime publication/RLS must be verified separately in each environment.

---

## 8. Authentication

Staging signs users in with **Supabase email and password** because the team does not have access to the Microsoft Entra tenant. Only `@mgenesis.com` addresses are accepted, and email confirmation is enabled in the staging Supabase project.

- **Email domain is enforced:** only `@mgenesis.com` addresses are accepted.
- **Account type must match:** select Admin Account or Employee Account before signing in. The selected type must match the confirmed Supabase user's persisted account profile. A linked profile must match the Auth user ID; legacy Employee profiles with an explicitly null `user_id` are accepted only when their email exactly matches the verified Auth email. Admin profiles still require the matching user ID. A mismatch clears the new session; missing, malformed, or conflicting profiles remain blocked.
- **Password management:** passwords belong to Supabase Auth. Use **Forgot password** on the login page for recovery; configure the hosted recovery redirect allowlist.
- **Add Account:** a signed-in Admin enters a verified employee's company email and access profile. The form generates a fresh 20-character password; the Admin can reveal, copy, regenerate, or replace it with a custom password of at least 16 characters (up to 72 UTF-8 bytes). Copy it before saving and share it through the approved private channel. The login becomes confirmed after its profile is saved, so the employee can sign in immediately. Passwords are not saved in application profiles, browser storage, or activity logs.
- **Account creation server:** `POST /api/admin/accounts` requires the Express host (`npm run dev` or built `npm start`) and server environment variables `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SECRET_KEY`, all for the same Supabase project. Use a secret key or legacy service-role key only in the server environment. Static hosting and `npm run preview` do not provide this API. Missing configuration produces an error rather than a profile-only success. See [account operations](docs/engineering/AUTH_OPERATIONS.md).
- **Session safety:** users can sign out manually; after 25 minutes without activity the app shows a five-minute warning, then signs out at 30 minutes. Activity in another open tab refreshes the same account-specific deadline.
- **Microsoft features:** Microsoft login and Graph report-email delivery remain unavailable until Azure access is provided.

> **Security boundary:** browser access uses the publishable key plus authenticated RLS. Secret/service-role keys must never be placed in `VITE_*` variables.

**Bootstrap admins:** Approved administrators need a persisted Admin row in `app_profiles`, linked to their confirmed Supabase user through `user_id`. The frontend fallback identities in `src/App.tsx` do not satisfy explicit login validation. The legacy `supabase/seed_admins.sql` targets `accounts` and does not provision this current profile contract. Admin rights are authorization records; set an approved employee's System Role to `Admin` to grant them.

---

## 9. Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- A modern browser

### Install & run

```bash
npm install
npm run dev
```

The app starts on **http://localhost:3000**. With Supabase variables configured, the login page uses email/password authentication and loads the staging Partner Companies registry after sign-in.

Create a staging account with an `@mgenesis.com` email, confirm it from the received email, then sign in. There is no quick-login or frontend-only authentication path.

---

## 10. Environment Configuration

Copy `.env.example` to `.env` and configure at least one real authentication provider:

Express loads Vite's `.env`, `.env.local`, and mode-specific files before configuring its APIs. For Admin account creation, put the matching project's `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) in ignored `.env.local`, then restart `npm run dev`. Hosted environment variables take precedence. Do not use a `VITE_` prefix for server credentials.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase project connection. The Express host also exposes these public values through `/api/config`, so they may be supplied at runtime rather than baked into the client bundle. |
| `VITE_AZURE_CLIENT_ID` / `VITE_AZURE_TENANT_ID` | Microsoft Entra ID app registration — required for Microsoft sign-in and Graph email. |
| `VITE_AZURE_REDIRECT_URI` | Optional; defaults to `window.location.origin`. |

Full step-by-step Azure app-registration instructions are documented inline in [`.env.example`](.env.example).

---

## 11. Available Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the app in development on http://localhost:3000 (Vite middleware via Express). |
| `npm run build` | Type-check-free production build: Vite bundles the client, esbuild bundles the server to `dist/server.cjs`. |
| `npm run start` | Run the built production server (`node dist/server.cjs`). |
| `npm run preview` | Preview the built client with Vite. |
| `npm run lint` | Type-check the frontend, Vite configuration, scripts, and Express server with their explicit TypeScript projects. ESLint is not configured. |
| `npm test` | Discover and run all colocated Node tests, including domain, service, HTTP, component, import, and stylesheet checks. |
| `npm run test:unit` | Run pure domain and utility tests. |
| `npm run test:integration` | Run the remaining service, HTTP, component-presentation, import, and tooling tests. |
| `npm run test:e2e` | Run Chromium browser journeys against the built Express application at desktop and mobile sizes. Build first. |
| `npm run verify` | Run TypeScript checks, all Node tests, production build, browser tests, and the high/critical dependency audit. |
| `npm run hooks:install` | Enable this checkout's pre-push verification hook. Each developer must run this once. |
| `npm audit --audit-level=high` | Check dependency advisories; high and critical findings fail the verification workflow. |
| `npm run db:cleanup:tests:preview --silent` | Print SQL that previews test evaluation rows, provides full rows for a private backup export, and rolls back. No database connection is made. |
| `npm run db:cleanup:tests:sql --silent` | Print deletion SQL for reviewed test evaluation rows. Paste into the intended project's Supabase SQL Editor to execute; generating it does not delete data. |

The [Verify workflow](.github/workflows/verify.yml) runs on pushes and pull requests with Node 22, a clean `npm ci`, TypeScript checks, discovered tests, a production build, desktop/mobile browser tests, dependency auditing, and a separate secret scan. The existing application check name is preserved for required-check compatibility. Browser diagnostics are uploaded on failure; they contain synthetic test data.

### Before pushing

Use Node 22 (`.nvmrc`), run `npm ci`, then `npx playwright install chromium` and `npm run hooks:install` once per checkout. Commit your changes before pushing; the hook rejects uncommitted files or outgoing commits different from the checked-out HEAD and runs `npm run verify`. Switch to each branch before pushing it. Run `npm run verify` manually before a commit when iterating. CI remains the required shared check because local hooks are opt-in and can be bypassed. Repository administrators should require the Verify application and Secret scan checks on pull requests; this change does not alter GitHub branch protection.

Tests are discovered under `src/`, `server/`, and `scripts/` by the `.test.ts`, `.test.tsx`, or `.test.mjs` suffix. New files do not need a package-script entry. `test:unit` selects `domain/` and `utils/`; `test:integration` includes the remaining tests, including component rendering and source-contract checks. This partition does not claim every existing test exercises a full integration.

Browser tests in `tests/e2e/` use the built application and actual Express host with synthetic Supabase responses. They cover signed-out deep links, rejected credentials, role mismatch, Admin Directory search, archive dismissal, and persisted archive state; employee read-reminder persistence and saved-resend renewal; and explicit Admin send/resend with rejected-write recovery and notification read-state persistence. External requests are blocked; the test host overrides Supabase/Microsoft settings and clears server credentials. No live identity, business data, Supabase RLS, Microsoft, email, or deployment behavior is verified. Add critical journeys incrementally; passing this suite is not full-system coverage. Do not run two E2E instances concurrently on port 4173.

A red commit status can come from hosting independently of Verify. On 2026-10-23, `regoris` at `bec4e6a` had successful Verify and Cloudflare checks but a Vercel **Deployment was blocked** status. Check the named failing status before changing code. Vercel project access, linked Git identities, and plan restrictions must be resolved in the hosting configuration; tests do not grant deployment access. See [Vercel collaboration troubleshooting](https://vercel.com/docs/deployments/troubleshoot-project-collaboration). Do not disable checks or rewrite commit authors to conceal a blocked deployment.

### Cleaning test evaluations

Run the preview command, copy only its SQL into Supabase SQL Editor, and verify the selected project. Review every listed company/evaluation and export the full candidate rows privately before deleting. `test_submission` reflects staging provenance, so real evaluations entered in staging may carry that label. Do not proceed if the results include real work.

After reviewing the preview, generate the deletion SQL with the second command and run it in the same project's SQL Editor. It commits the deletion in one transaction; after commit, recovery requires restoring the exported full rows to `application_records` or using an existing database backup. Coordinate cleanup with other users so clients do not resubmit test evaluations during the operation, then refresh the app.

Cleanup targets only whole `survey_response` groups marked `test_submission`, or unmarked groups for the exact company name `TEST` outside default imported forms. Mixed/uncertain groups and missing response IDs are retained. CSV/production provenance, `IMPORT-*` IDs, `client-csv:*` batch IDs, and normalized imported submission identities are protected. Both active and archived test evaluations are eligible. Companies, forms, accounts, documents, normalized import tables, project files, and CSV files are preserved. These commands do not use credentials, write files, apply migrations, or repair Realtime synchronization.

---

## 12. Deployment

The production build produces a static client plus a small Express server that serves it and provides `/api/health`, public runtime configuration, and protected account provisioning. Configure the server-only Supabase key for account provisioning. Analytics runs in the client using its authenticated Supabase response store and needs no separate Analytics API.

For Vercel SPA deployments, the root `vercel.json` rewrites frontend paths to `index.html` so direct links and browser refreshes reach the client router. `/api/*` is excluded from that rewrite and must be served by the configured API host when needed for account provisioning. There is no Vercel Analytics Function or separate Analytics server bundle.

```bash
npm run build
NODE_ENV=production npm run start
```

The app has previously been deployed to **Vercel**. Before deploying to the real company environment:

1. Configure the approved Supabase URL and publishable key; never put a secret/service-role key in a `VITE_*` variable.
2. Apply the reviewed versioned migrations, verify RLS/Realtime publication, and configure the same public Supabase values in the deployment environment.
3. Configure Azure only if Microsoft login or Graph email is restored as a requirement.

---

## 13. The Creation Process (Development History)

The system was built iteratively over roughly three weeks, starting **July 18, 2026**. It began as a Microsoft Forms analytics dashboard prototype and grew into a full partner-management platform. Milestones, summarized from git history:

| Date | Milestone | Summary |
|---|---|---|
| 2026-07-18 | Initial commit | First working version; Notification Logs for employees. |
| 2026-07-20 | Settings & evaluation picker | Reworked settings modal; company evaluation picker. |
| 2026-07-21 | Notification fixes | Employee notification-log behavior fixes. |
| 2026-07-22 | Bulk sending | "Send To Companies" and Bulk Sending introduced. |
| 2026-07-23 | Masterlist & stability | Partner master list; simulated system clock; scaling & Excel-export fixes. |
| 2026-07-24 | Deployment fix | Vercel deployment fix. |
| 2026-07-26 – 27 | Rating & imports | Improved rating system; CSV import; masterlist updates. |
| 2026-07-27 – 29 | Document tracking | Document master-list refinements for compliance tracking. |
| 2026-07-30 | Analytics cleanup | Analytics reworked for the revised rating system; UI decluttering. |
| 2026-07-31 | Dashboards | Documents Tracker + Employee Evaluation Tracker dashboards. |
| 2026-08-03 | Updates | Final committed round before handoff. |
| 2026-08-04 | Backend groundwork | Supabase draft schema + partial wiring; `.env` / demo-mode flags added. |
| 2026-08-05 | Categories & docs | Categories Manager wired up; system turnover + Admin/Employee manuals added. |

The system now uses explicit Supabase repository and adapter boundaries for shared business data, keeping normalized import/audit tables separate from the editable frontend projection.

---

## 14. User Manuals

Plain-language guides for the current interface are available in the [`docs/`](docs) folder. Each guide includes a screenshot for every module it covers:

- [Administrator User Guide](docs/ADMIN_USER_GUIDE.md) — partner records, evaluations, archives, imports, reports, and employee access.
- [Employee User Guide](docs/EMPLOYEE_USER_GUIDE.md) — assigned evaluations, submissions, reminders, and profile settings.

Screenshots are stored in [`docs/screenshots/`](docs/screenshots). The older Word manuals remain available, though some menu names may differ from the current interface.

For a condensed reference (roles matrix, workflow diagrams, FAQ), see [`SYSTEM_TURNOVER.md`](SYSTEM_TURNOVER.md).

---

## 15. Current Status & Known Issues

This system is **pre-production**. The most important open items (verified against source; see [`SYSTEM_TURNOVER.md`](SYSTEM_TURNOVER.md) §2.4 for the full list and workarounds):

| # | Issue | Recommendation |
|---|---|---|
| 1 | Admin account creation requires the Express host and a server-only Supabase secret; live provisioning has not been verified. | Configure the server environment and verify creation, sign-in, and recovery in the authorized target environment. |
| 2 | Supabase's leaked-password protection remains disabled in staging and is available only on the Pro plan and above. | Enable it in Auth settings before production if the target project plan supports it. |
| 3 | The first confirmed account defaults to Employee unless it uses the bootstrap `admin@mgenesis.com` identity. | Promote an approved user in `app_profiles` from the Supabase dashboard before testing Admin edits. |
| 4 | The old draft `supabase/schema.sql` contains temporary anonymous policies and is not the applied staging schema. | Use versioned migrations only; never apply the draft file as-is. |
| 5 | Microsoft login and Graph email are unavailable without Azure access. | Keep them disabled or obtain an approved Entra app registration later. |
| 6 | `reference-materials/source-data/EFAS_Project_Charter.docx` is a corrupted Word file. | Restore from backup or re-document the charter separately. |

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Survey type** | One of Courier, Supplier, or Subcontractor — the top-level partition of all data. |
| **Designation** | An employee's organizational rank (Rank & File → Executive), one input to their default access. |
| **Composite score** | A partner's weighted, normalized 0–100 rating across its 5 scoring categories. |
| **Score band** | A labeled tier (e.g. Critical → Excellent) a composite score maps to. |
| **Rank score** | A volume-adjusted composite used for leaderboard ordering and report fields labeled Volume-Weighted Score. |
| **Data scope** | The Current / All-Time / Custom toggle selecting which time periods feed a view. |
| **Archive series** | A named snapshot of a completed survey period, preserved for long-term trends. |
| **Custom overrides** | Per-account permissions set by an Admin that replace the computed role defaults. |
| **Department access** | A per-department access ceiling that caps what any member of that department can see. |

---

*For a detailed, verified handoff of the system's exact current state — access administration, workflows, known issues, and release notes — see [`SYSTEM_TURNOVER.md`](SYSTEM_TURNOVER.md).*

### Admin evaluation navigation

Admins open Evaluations > Workspace and switch between Forms (form management), Responses (submission list, answer inspection, and Excel export), Coverage (company evaluation coverage), and Category Labels (display names for scoring categories). All four views share the same grouped tab layout and active-tab highlight; tabs wrap on narrow screens. Archive and Import Responses remain separate destinations. Existing route permissions and persistence contracts are unchanged.

For Courier and Supplier forms, open **Send Form** and check the specific companies to evaluate from that category's Top 20 list. **Select top 20 couriers/suppliers** checks the full list; uncheck any companies you do not want to include. At least one company must be checked before **Confirm & Save Selection**. This uses the existing Manage Access Top 20 preset and saves only the checked company IDs, including for already-active forms. The final in-app popup shows the form, company count and eligible employee count; only **Yes, proceed** saves the distribution. **Go back**, Escape or backdrop dismissal returns to review without sending. Cancelling a company draft uses an in-app discard prompt. Opening or cancelling does not change existing assignments. Existing recipient permissions and deadline checks still apply.
