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
| **Real-time analytics** | Every submission instantly refreshes company-wide charts, trends, and comparisons. |
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

- **Weighted rubric:** Each question carries a point value validated against the company's original paper evaluation forms (`src/data/questionWeights.ts`). Answers are scored, summed per category, and normalized so **every survey type shares one 0–100 composite axis** (`src/utils/scoring.ts`).
- **Score bands:** Composite scores map to labeled bands (e.g. Critical → Excellent). Companies with no scoreable answers yet get a distinct "No Score Yet" band instead of being mislabeled as failing.
- **Ranking:** The leaderboard uses a *volume-weighted* variant of the composite score, pulling companies with very few evaluations toward the peer mean so a single glowing review doesn't top the chart.
- **Renaming vs. rubric:** Admins can **rename** a category's display label from **Evaluations → Category Settings** without ever touching the underlying point values — display names are translated by slot position, keeping the validated rubric intact.

### 3.3 Roles, Designations & Departments (RBAC)

Access is **computed**, not hand-assigned per user. Every account has three attributes, and its default access falls out of their combination (`src/utils/rbac.ts`):

- **System Role:** `Admin` (unrestricted) or `Employee`.
- **Designation (rank):** Rank & File, Supervisory, Managerial, Director, or Executive.
- **Department:** Accounts Payable – Trade, Business Solutions Manager, Executive Office, Logistics, Procurement Group, or TASS.

**Default module access by designation:**

| Designation | Default modules granted |
|---|---|
| Rank & File | Dashboard, Analytics, Evaluations, Partners, Compliance Documents, Notifications |
| Supervisory | All Rank & File modules + Partner Feedback and Reports |
| Managerial | All Supervisory modules + Evaluation Responses, Presentations, and Archive |
| Director | Same default set as Managerial |
| Executive | Dashboard, Analytics, Reports, Presentations, Notifications (a reduced, summary-focused set) |
| **Admin (role)** | **Every module**, including Users & Access, Renew Compliance Documents, and Import Responses |

An Admin can **override** access per individual account ("Custom Overrides"), or set a bulk access **ceiling** for an entire department ("Department Access"), from Users & Access.

### 3.4 Data Scoping & Isolation

Beyond *which modules* a user sees, the system controls *which response data* they see (`applyAccessFilter` in `src/App.tsx`):

| Who | Sees which survey responses |
|---|---|
| Admin / Executive / Director | Every response (within their permitted survey types) |
| Supervisory | Only their own department's responses |
| Rank & File | Only their own submissions |
| **Analytics (everyone)** | **Always company-wide and aggregate-only**, regardless of rank |

A **Data Scope** toggle (shared across Dashboard and Analytics) further switches between *Current* (active period), *All-Time* (active + all archived periods), and *Custom* (specific archived series).

---

## 4. Modules

| Module | What it does |
|---|---|
| **Dashboard** | Personalized performance indicators and KPIs. |
| **Evaluations → Forms** | View, fill, and publish evaluation forms. |
| **Evaluations → Responses** | Review each evaluation submission, filter by respondent email, inspect answers, and export all or filtered responses to Excel. |
| **Analytics** | Company statistical charts, trends, rankings, and company comparisons over the response data authorized for the current session. |
| **Reports** | Summary / Company / Question / Executive-Summary builders + raw exports (PDF, Excel, CSV). |
| **Reports → Presentations** | Staggered slide-deck presentation builder (PDF/PPTX export). |
| **Partners → Directory** | Manage external courier, supplier, and subcontractor rosters, branches, documents, and the Admin-only dated Active Companies upload history. |
| **Partners → Compliance Documents** | Categorized compliance-document register across all partner companies. |
| **Renew Compliance Documents** | Action permission: update document expiry/status without full Users & Access permissions. |
| **Partners → Supplier Ranking** | Curate and reorder the Top 20 suppliers evaluable by default in Supplier surveys. |
| **Partners → Partner Feedback** | Send report cards to partner companies (single or bulk email via Microsoft Graph). |
| **Users & Access** | Configure roles, ranks, departments, and per-user/per-department permissions. |
| **Notifications** | Audit trail of incoming survey responses and document-expiry alerts, opened as a modal from the header bell rather than a separate sidebar destination. |
| **Archive** | Browse and restore archived feedback submissions and series. |
| **Evaluations → Import Responses** | Admins upload one Excel workbook containing Supplier, Subcontractor, and Courier evaluation worksheets. The system detects each form, matches companies against the full Partner Registry, and imports the categories together. The original workbook is stored once in a private Supabase Storage archive with Admin-only download access. |
| **Evaluations → Category Settings** | Rename the display labels of scoring categories per survey type. |
| **Settings / Profile** | A large modal opened from the account-session dropdown. Employees retain their full profile, impact, recent-submission, preference, and session view; Admins retain the complete Settings view with activity, import, and cache-management tools. |

---

## 5. Architecture & Tech Stack

The application is a **single-page React app** with a thin Express server used only for local dev/preview and production static hosting.

| Layer | Technology |
|---|---|
| **UI framework** | React 18 + TypeScript |
| **Build tool** | Vite 6 |
| **Styling** | Tailwind CSS 3 |
| **Charts** | Recharts |
| **Icons / animation** | lucide-react, motion |
| **Server** | Express (dev middleware via Vite; static host in production) |
| **Auth** | Supabase email/password in staging; optional Microsoft Entra ID code remains unavailable without Azure configuration |
| **Backend** | Supabase normalized import/audit tables plus an RLS-protected editable application store in staging |
| **Email** | Microsoft Graph (`Mail.Send`, delegated) |
| **Exports** | jsPDF + jspdf-autotable (PDF), xlsx (Excel), papaparse (CSV), pptxgenjs (PPTX), docx |

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
│   ├── pages/                  # 31 page components (one per module/view)
│   ├── components/             # 15 shared UI components (charts, bells, panels…)
│   ├── services/               # Data source, MSAL auth, Graph mail, Supabase client
│   ├── utils/                  # 29 domain utilities (rbac, scoring, exporters, compliance…)
│   ├── hooks/                  # useSurveyData (central data store), session and viewport hooks
│   ├── data/                   # Survey questions, weights, and category definitions
│   └── types/                  # TypeScript domain types (survey, feedbackHub)
├── docs/
│   ├── Admin_Manual.docx       # Full administrator manual
│   ├── Employee_Manual.docx    # Full employee manual
│   └── _build/                 # Scripts that generate the two .docx manuals
├── supabase/schema.sql         # DRAFT PostgreSQL schema (not yet applied)
├── server.ts                   # Express dev/production server
├── screenshots/                # Reference screenshots (courier/supplier/subcontractor)
├── .env.example                # Environment variable template
├── SYSTEM_TURNOVER.md          # Detailed handoff / turnover documentation
└── README.md                   # This file
```

---

## 7. Data Storage & Persistence

**Current state:** Authenticated staging users load and save profiles, department permissions, surveys, Partner Companies/documents, evaluation responses, archives, category labels, Feedback Hub data, notification/reminder settings, compliance snapshots, ranking history, activity/modification logs, export history, and employee notification state through Supabase. Existing eligible browser records are migrated once, after which the remote record set is authoritative. `localStorage` is retained as an authenticated startup cache and for intentionally device-specific state such as in-progress survey drafts and layout preferences.

> **Implication:** Authenticated shared business data is available across devices through staging Supabase. Clearing browser storage removes only the local cache and device-specific drafts/preferences; it does not delete the shared backend records.

**Staging backend:** The normalized migrations under [`supabase/migrations`](supabase/migrations) are applied to the dedicated staging project. Imported normalized tables remain the immutable source/audit layer. `app_profiles` and per-entity `application_records` are the editable frontend store and are published to Supabase Realtime. RLS scopes evaluation rows by profile, permits employees to insert only their own submissions and operational entries, and restricts shared configuration/registry writes by role. Authorization helpers live in an unexposed `private` schema. The older [`supabase/schema.sql`](supabase/schema.sql) remains an unapplied draft.

The verified frontend/backend contract, record-type matrix, Realtime routing, and known authorization gaps are documented in [`docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md`](docs/engineering/SUPABASE_FRONTEND_ALIGNMENT.md). In particular, lower-rank company-wide aggregate Analytics, delegated document renewal, and non-Admin archive mutations require dedicated server-side authorization work before production; the client must not bypass those boundaries.

---

## 8. Authentication

Staging signs users in with **Supabase email and password** because the team does not have access to the Microsoft Entra tenant. Only `@mgenesis.com` addresses are accepted, and email confirmation is enabled in the staging Supabase project.

- **Email domain is enforced:** only `@mgenesis.com` addresses are accepted.
- **Password management:** staging passwords belong to Supabase Auth. A reset UI is still pending.
- **Session safety:** users can sign out manually; after 25 minutes without activity the app shows a five-minute warning, then signs out at 30 minutes. Activity in another open tab refreshes the same account-specific deadline.
- **Microsoft features:** Microsoft login and Graph report-email delivery remain unavailable until Azure access is provided.

> **Security boundary:** browser access uses the publishable key plus authenticated RLS. Secret/service-role keys must never be placed in `VITE_*` variables.

**Bootstrap admins:** The approved bootstrap identities are maintained in `src/App.tsx` and `supabase/seed_admins.sql` so a fresh deployment can authorize the initial administrators. Admin rights are authorization records; set an approved employee's System Role to `Admin` to grant them.

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
| `npm run lint` | Type-check the project (`tsc --noEmit`). |

---

## 12. Deployment

The production build produces a static client plus a small Express server that serves it and provides an `/api/health` health check.

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
| 2026-08-05 | Categories & docs | Category Settings wired up; system turnover + Admin/Employee manuals added. |

The system now uses explicit Supabase repository and adapter boundaries for shared business data, keeping normalized import/audit tables separate from the editable frontend projection.

---

## 14. User Manuals

Full, standalone user documentation lives in the [`docs/`](docs) folder as Word documents:

- **[`docs/Admin_Manual.docx`](docs/Admin_Manual.docx)** — the complete administrator guide (account management, surveys, reports, compliance, imports, settings).
- **[`docs/Employee_Manual.docx`](docs/Employee_Manual.docx)** — the complete employee guide (filling evaluations, submissions, notifications, profile).

Both manuals are generated from source via the scripts in [`docs/_build/`](docs/_build) (`build-admin.cjs` / `build-employee.cjs`), so they can be regenerated if content changes.

For a condensed reference (roles matrix, workflow diagrams, FAQ), see [`SYSTEM_TURNOVER.md`](SYSTEM_TURNOVER.md).

---

## 15. Current Status & Known Issues

This system is **pre-production**. The most important open items (verified against source; see [`SYSTEM_TURNOVER.md`](SYSTEM_TURNOVER.md) §2.4 for the full list and workarounds):

| # | Issue | Recommendation |
|---|---|---|
| 1 | Supabase email/password is active in staging, but password-reset UI is not implemented. | Use the Supabase dashboard for staging recovery until a reset flow is added. |
| 2 | Supabase's leaked-password protection remains disabled in staging and is available only on the Pro plan and above. | Enable it in Auth settings before production if the target project plan supports it. |
| 3 | The first confirmed account defaults to Employee unless it uses the bootstrap `admin@mgenesis.com` identity. | Promote an approved user in `app_profiles` from the Supabase dashboard before testing Admin edits. |
| 4 | The old draft `supabase/schema.sql` contains temporary anonymous policies and is not the applied staging schema. | Use versioned migrations only; never apply the draft file as-is. |
| 5 | Microsoft login and Graph email are unavailable without Azure access. | Keep them disabled or obtain an approved Entra app registration later. |
| 6 | `EFAS_Project_Charter.docx` in the project root is a corrupted Word file. | Restore from backup or re-document the charter separately. |

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Survey type** | One of Courier, Supplier, or Subcontractor — the top-level partition of all data. |
| **Designation** | An employee's organizational rank (Rank & File → Executive), one input to their default access. |
| **Composite score** | A partner's weighted, normalized 0–100 rating across its 5 scoring categories. |
| **Score band** | A labeled tier (e.g. Critical → Excellent) a composite score maps to. |
| **Rank score** | A volume-adjusted composite used only for leaderboard ordering. |
| **Data scope** | The Current / All-Time / Custom toggle selecting which time periods feed a view. |
| **Archive series** | A named snapshot of a completed survey period, preserved for long-term trends. |
| **Custom overrides** | Per-account permissions set by an Admin that replace the computed role defaults. |
| **Department access** | A per-department access ceiling that caps what any member of that department can see. |

---

*For a detailed, verified handoff of the system's exact current state — access administration, workflows, known issues, and release notes — see [`SYSTEM_TURNOVER.md`](SYSTEM_TURNOVER.md).*

### Admin evaluation navigation

Admins use grouped, URL-backed navigation: Partners (Directory, Documents, Feedback), Evaluations (Workspace, Archive, Import Responses), and Reports (Generate, Present, Export History), plus Dashboard, Analytics, and Users. Notifications and Settings are pinned at the bottom of the sidebar. Employees use Home, Assigned Evaluations, My Submissions, Notifications, and Profile. Existing permission and persistence keys remain unchanged.
