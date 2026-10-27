# Supplier Management System — Presentation Guide

**Audience:** administrators, evaluators, and business stakeholders

**Suggested length:** 12–15 minutes
**Checked against the current source:** October 23, 2026

Use one section per slide or live-demo stop. Show one representative record per module; focus on its purpose and main action rather than every control. Use sample records for demonstrations that create, send, import, or archive data.

## Opening: what the system does

“The Supplier Management System brings partner records, compliance documents, employee evaluations, performance analysis, and reporting into one workflow. It supports Couriers, Suppliers, and Subcontractors.”

**Walkthrough:** Sign in → Dashboard → Directory → Documents → Evaluation Workspace → Employee evaluation → Analytics → Feedback → Reports → Present → Archive → Import Responses → Users → Notifications and settings.

## 1. Sign-in and access

**Purpose:** Give administrators and employees access to the functions and records available to their accounts.

**Show:** Select **Admin Account** or **Employee Account**, then sign in with the corresponding company account. Explain that role, designation, department, and assigned permissions control access. Microsoft sign-in depends on configuration.

## 2. Dashboard

**Purpose:** Give administrators a quick view of work requiring attention and current evaluation activity.

**Show:** Point out document follow-up, forms in progress, evaluation results, and recent submissions. Open one follow-up item to demonstrate how the Dashboard leads into the relevant workflow.

## 3. Partners → Directory

**Purpose:** Maintain the central partner-company and branch records used throughout the system.

**Show:** Search for one partner and open its record. Highlight company details, BP Codes and branches, document information, and performance. Point out **Register New Partner** and **Active Companies by Type** for registration and dated active-company lists.

**Key point:** A company can have multiple branches; each branch can have its own compliance-document record.

## 4. Partners → Documents

**Purpose:** Monitor compliance and maintain each branch’s required document statuses and expiry dates.

**Show:** Start with **All Categories** in Compliance Overview, then select a category to open its detailed matrix. Search by company or BP Code, filter by document/status, and inspect one document. Demonstrate a renewal or checklist-status update with a sample record, then locate **Modification History**.

Point out **Customize** for overview widgets and **Add Notification** for optional early reminders. Standard expiry alerts remain active; AFS follows fiscal-year rules.

**Key point:** Partner totals count companies, the compliance rate uses branch statuses, and expiry totals count documents. These measure different things.

## 5. Evaluations → Workspace

**Purpose:** Manage the evaluation process from form setup through response review and completion tracking.

| View | Essential function | What to demonstrate |
|---|---|---|
| **Forms** | Create forms and manage availability, deadlines, access, and assigned partners. | Open **Create Form**, show category/questions, then use **Manage Access** and preview the **Send** confirmation. |
| **Responses** | Inspect submitted evaluations and export response data. | Select a form, review one submission, and point out the spreadsheet export. |
| **Coverage** | Identify assigned companies with evaluations on record and those still outstanding. | Show one completed and one outstanding assignment when available. |
| **Category Labels** | Rename displayed scoring-category labels. | Show where a label is edited; explain that renaming does not change scoring weights. |

Explain the form statuses **Active**, **Paused**, **Ended**, and **Archived**. Ending a category’s evaluation period archives its current results; demonstrate this only with a prepared sample period.

## 6. Employee experience

**Purpose:** Let employees complete available evaluations and review their own submission history.

| Module | Essential function | What to demonstrate |
|---|---|---|
| **Home** | Summarizes available evaluation work and recent submissions. | Identify a pending evaluation and its deadline. |
| **Evaluations** | Lists accessible partner evaluations and opens the response workflow. | Select a partner, complete respondent information and questions, review, and submit a sample evaluation. Point out draft saving. |
| **My submissions** | Shows the employee’s submitted evaluations. | Find the submitted sample and open its details. |

**Key point:** Seeing or reading a reminder does not complete an evaluation. Completion requires the relevant submission.

## 7. Analytics

**Purpose:** Turn authorized evaluation responses into performance measures and comparisons.

**Show:** Select a partner category and data scope (**Current**, **All time**, or **Custom**). Review the Company Leaderboard, open one company’s analysis, and show trends and question performance. Point out archived rankings where available.

**Key point:** Results depend on the selected filters, period, and records the account may access. Use matching scopes when comparing Analytics with reports.

## 8. Partners → Feedback

**Purpose:** Review evaluation progress and prepare performance feedback for partner companies.

**Show:** Walk through **Current Forms**, **Past Results**, and **Sent Reports Log**. Open a form’s progress/results, preview a partner report, and show the individual or bulk reporting workflow. Explain that queued reports can be reviewed and revised or returned before dispatch.

**Key point:** Queuing or previewing a report is not proof of delivery. Actual email sending requires configured Microsoft Graph access.

## 9. Reports → Reports

**Purpose:** Produce shareable evaluation summaries and retain export history.

**Show:** In **Generate**, choose **Summary Report**, **Companies Report**, **Question Report**, or the Executive Summary builder. Set the available options, review the output, and export in a format offered by that report. Point out **Raw Data Export** for selecting individual evaluation records and fields. In **History**, locate an export and demonstrate **Download again** or **Regenerate** when available.

**Key point:** Download again returns the retained file; Regenerate uses the saved options with current authorized data. Older history entries may not support both actions.

## 10. Reports → Present

**Purpose:** Convert selected evaluation results into a presentation deck.

**Show:** Choose topics/categories and a reporting window, generate the presentation, and navigate a few slides. Point out **PDF** and **PowerPoint (PPTX)** export.

## 11. Evaluations → Archive

**Purpose:** Preserve past evaluation periods and archived partner records for later review.

**Show:** Open an archived period or partner, inspect its retained information, and point out the restore action. Explain that archiving separates historical records from current work.

## 12. Evaluations → Import Responses

**Purpose:** Bring existing Courier, Supplier, and Subcontractor evaluation data into the system.

**Show:** Select sample CSV or Excel files, review detected forms and partner matches, then explain the import confirmation. Show **Stored Source Files** and the active/history organization for retained uploads.

**Key point:** Importing evaluation responses is separate from registering partners or importing the partner master list in Directory.

## 13. Users

**Purpose:** Manage employee accounts and access to system functions and survey categories.

**Show:** Open **Add Account** and identify the company email, initial password, role, designation, and department fields. Open an existing account’s permissions and point out **Department Access** for department-level settings.

**Key point:** Document renewal can be granted separately from full account-management access.

## 14. Notifications, settings, and help

**Purpose:** Keep users informed and provide account, appearance, and session controls.

**Show:** Open the header bell. Administrators see evaluation activity and document alerts; employees see reminders for unfinished available evaluations. Open the account menu for settings/profile, show dark mode and sign-out, and open the question-mark quick guide.

**Key point:** In-app reminders are available; saved reminder-frequency settings do not establish scheduled background email or push delivery.

## Closing

“The workflow connects partner records and compliance tracking with employee evaluations, then turns the results into analysis, feedback, reports, and presentations. Administrators manage the process; employees contribute evaluations; historical records remain available for review.”

## Presenter preparation

- Prepare one sample partner with branches/documents, one available evaluation form, and one completed evaluation with reportable results.
- Have separate Admin and Employee sessions ready. Keep the same category and reporting period when comparing results.
- Confirm email integration before demonstrating delivery. Otherwise, demonstrate report preview and export and state that email requires configuration.

Navigation and behavior were checked against [application navigation](../src/App.tsx), [module documentation](../README.md#4-modules), and the current page/feature implementations. This is a presentation guide, not a claim that live hosting or external integrations were tested.
