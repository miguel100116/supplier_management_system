// Content data for the Admin Manual. Kept separate from rendering/styling code.
module.exports = [
  // ===================================================================
  // CHAPTER 1
  // ===================================================================
  {
    title: 'Welcome to the Supplier Management System',
    intro: [
      'This manual is your complete guide to using the Supplier Management System (SMS) as an Administrator. It walks through every screen you will use day to day — from registering a new partner company, to building evaluation surveys, to sending performance reports back to your partners.',
      'You do not need any technical background to use this system or this manual. Every instruction below describes exactly what to click, in the order to click it, using the same words and buttons you will see on your screen.',
    ],
    sections: [
      {
        heading: 'What is the Supplier Management System?',
        blocks: [
          { type: 'p', text: 'The Supplier Management System is Microgenesis’s internal platform for keeping track of partner companies — Suppliers, Couriers, and Subcontractors — and for measuring how well they are performing. It brings together three things that used to live in separate spreadsheets and paper forms:' },
          { type: 'bullets', items: [
            'A single, always-up-to-date directory of every partner company, including their contact details and compliance documents (contracts, permits, certificates, and so on).',
            'Evaluation surveys that employees fill out to rate a partner company’s performance, and a way to build, publish, and manage those surveys.',
            'Reports, charts, and dashboards that turn all those survey answers into rankings, trends, and printable reports you can send to management or to the partner companies themselves.',
          ] },
        ],
      },
      {
        heading: 'Who uses this system?',
        blocks: [
          { type: 'p', text: 'There are two kinds of accounts in the system, and this manual is written for the first one:' },
          { type: 'bullets', items: [
            [{ text: 'Administrator (Admin)', bold: true }, ' — has full access to every module: managing companies, documents, surveys, reports, user accounts, and settings. This manual (the Admin Manual) is written for you.'],
            [{ text: 'Employee', bold: true }, ' — a regular staff member whose job is to fill out evaluation surveys about the partner companies they work with. Employees have a much smaller, simpler menu, and their own separate Employee Manual.'],
          ] },
          { type: 'note', text: 'If you ever need to see exactly what an Employee account experiences, ask IT to set up a test Employee account, or refer to the companion Employee Manual.' },
        ],
      },
      {
        heading: 'How this manual is organized',
        blocks: [
          { type: 'p', text: 'Each chapter after this one matches an item in the left-hand sidebar menu, in the same top-to-bottom order you see them in the app. Every chapter follows the same pattern:' },
          { type: 'bullets', items: [
            'An overview explaining what the page or module is for, in plain language.',
            'Step-by-step instructions for the most common tasks you will do on that page.',
            'Helpful "Tip", "Note", and "Important" boxes calling out anything easy to miss.',
          ] },
          { type: 'p', text: 'The very last chapter is a Frequently Asked Questions (FAQ) section that collects the most common "How do I…?" questions in one place, with a pointer back to the full instructions in the relevant chapter.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 2 — SIGNING IN
  // ===================================================================
  {
    title: 'Signing In',
    intro: [
      'You do not create a separate password for the Supplier Management System. Every account uses the same company email and password you already use for Microsoft 365 (Outlook, Teams, and the rest of your Microsoft work apps). If you can sign in to your work email, you already have everything you need to sign in here.',
    ],
    sections: [
      {
        heading: 'Signing in to your account',
        blocks: [
          { type: 'p', text: 'When you open the system, you will land on the Sign In screen, showing the Microgenesis logo and a short "Supplier Management System" title.' },
          { type: 'steps', items: [
            'Open the Supplier Management System in your web browser.',
            'In the "Email address" field, type your full company email address (it must end in @mgenesis.com — the same address you use for your company email).',
            'In the "Password" field, type your usual company account password. Click the small eye icon inside the field if you want to double-check what you typed.',
            'If you are on a device only you use, you can leave "Remember me" checked so you stay signed in next time. On a shared computer, uncheck it.',
            'Click "Sign in". If your organization has Microsoft sign-in enabled, you may instead see a "Sign in with Microsoft" button — clicking that lets you sign in with your Microsoft 365 account directly, without typing your password into this screen at all.',
            'Once your details are verified, you will be taken straight to your Dashboard.',
          ] },
          { type: 'screenshot', caption: 'The Sign In screen, showing the Microgenesis logo, the Email address and Password fields, and the Sign in button.' },
        ],
      },
      {
        heading: 'If you cannot sign in',
        blocks: [
          { type: 'p', text: 'A few messages may appear if something is not quite right:' },
          { type: 'bullets', items: [
            [{ text: '"Please enter both your email and password."', bold: true }, ' — one of the two fields was left empty. Fill in both and try again.'],
            [{ text: '"Access is restricted to verified @mgenesis.com email addresses."', bold: true }, ' — you typed an email address that is not a company address. Double-check you typed your full @mgenesis.com email correctly.'],
            [{ text: 'An incorrect-password message', bold: true }, ' — your password was not recognized. This is the same password as your company email, so if your Microsoft 365 password has recently changed, use the new one. If you are still stuck, this usually means your account’s password was reset company-wide and IT can confirm the current one.'],
          ] },
          { type: 'note', text: 'Because sign-in uses your existing Microsoft 365 company credentials, there is no separate "forgot my Supplier Management System password" process. If you cannot sign in to your company email/Microsoft 365 account, contact IT to resolve that first — the Supplier Management System will work again as soon as you can sign in to your normal work account.' },
          { type: 'warn', text: 'Never share your company email password with anyone, including other staff who ask you to "just check something" in the system for them. If a colleague needs access, an Admin should create them their own account instead (see Chapter 9, Employees / Users).' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 3 — GETTING AROUND
  // ===================================================================
  {
    title: 'Getting Around the Interface',
    intro: [
      'Every page in the system shares the same layout, so once you understand the basic pieces, you can find your way around anywhere.',
    ],
    sections: [
      {
        heading: 'The top header bar',
        blocks: [
          { type: 'p', text: 'Along the very top of the screen you will always see:' },
          { type: 'bullets', items: [
            'The Microgenesis logo on the far left — click it any time to jump back to your Dashboard.',
            'The current page name, shown next to "Supplier Management System".',
            'On the right, your account menu, the notification bell, and (if enabled) a light/dark mode switch.',
          ] },
        ],
      },
      {
        heading: 'The left-hand sidebar menu',
        blocks: [
          { type: 'p', text: 'This is your main way of moving between modules. As an Administrator, you will see these items, top to bottom:' },
          { type: 'bullets', items: [
            'Dashboard',
            'Partner Companies (a group that expands to: Partner Companies, Document Tracker, Feedback Hub)',
            'Evaluations (a group that expands to: All Submissions, Outstanding Evaluations, Raw Data Explorer, Archive Center, Categories Manager)',
            'Analytics',
            'Reports & Exports (a group that expands to: Generate Report, Present Mode, Export History)',
            'Employees / Users',
            'Notifications',
            'Settings',
          ] },
          { type: 'p', text: 'Items with a small arrow are groups — click the group name once to expand or collapse its sub-items; click a sub-item to open that page. You can also collapse the entire sidebar to a thin strip of icons using the small arrow button on its right edge, which is useful on smaller screens.' },
          { type: 'screenshot', caption: 'The left sidebar, expanded, showing the Dashboard item and the Partner Companies and Evaluations groups expanded.' },
        ],
      },
      {
        heading: 'The main content area',
        blocks: [
          { type: 'p', text: 'Whatever page you have selected fills the rest of the screen. Most pages follow a similar internal pattern: summary cards or tiles near the top, filters and a search box below that, and then a list, table, or grid of the actual records underneath. Clicking on a row or card almost always opens more detail or an edit screen for that item.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 4 — DASHBOARD
  // ===================================================================
  {
    title: 'Dashboard',
    intro: [
      'The Dashboard is your home screen and the first thing you see after signing in. It gives you a quick, at-a-glance summary of how the whole system is doing, without needing to visit every other page individually.',
    ],
    sections: [
      {
        heading: 'What you will see',
        blocks: [
          { type: 'p', text: 'The Dashboard is made up of individual "widgets" — small cards that each summarize one piece of information. Out of the box, you will typically see:' },
          { type: 'bullets', items: [
            [{ text: 'Top Performing Partner', bold: true }, ' — a gauge showing the name and score of the current best-rated active partner company.'],
            [{ text: 'Response Statistics Feed', bold: true }, ' — two simple counters: total feedback (survey responses) received, and total active partners on file.'],
            [{ text: 'Stakeholder Group Comparison', bold: true }, ' — three progress bars comparing average scores across Couriers, Suppliers, and Subcontractors.'],
            [{ text: 'Published Survey Forms', bold: true }, ' — a short list of currently live surveys, their due dates, and how many people have responded.'],
            [{ text: 'Recent Evaluations Log', bold: true }, ' — the five most recent survey submissions across the whole company.'],
            [{ text: 'Top & Bottom Question Ratings', bold: true }, ' — the single highest- and lowest-scoring survey questions company-wide.'],
          ] },
          { type: 'p', text: 'At the top of the page, a toggle lets you switch the whole Dashboard between "Current Period" (this evaluation cycle only) and "All-Time" (everything on record).' },
          { type: 'screenshot', caption: 'The Dashboard with its default widgets: Top Performing Partner, Response Statistics Feed, Stakeholder Group Comparison, Published Survey Forms, Recent Evaluations Log, and Top & Bottom Question Ratings.' },
        ],
      },
      {
        heading: 'Customizing your Dashboard layout',
        blocks: [
          { type: 'p', text: 'You can add, remove, resize, and rearrange widgets so the Dashboard shows exactly what matters most to you.' },
          { type: 'steps', items: [
            'Click "Customize Layout" near the top of the page.',
            'To reorder a widget, drag it to a new position, or use the small arrow buttons on its toolbar.',
            'To resize a widget, click the resize icon on its toolbar — it cycles between one-third width, two-thirds width, and full width.',
            'To remove a widget, click the trash icon on its toolbar.',
            'To add a new widget, click "Add" — this opens the "Workspace Catalog", where you can browse by category (All / Analytics / Surveys / Submissions) and click "Add Widget" on anything you want.',
            'When you are happy with the layout, click "Save Changes". If you change your mind partway through, click "Cancel" to discard your edits, or "Reset" to restore the original default layout.',
          ] },
          { type: 'tip', text: 'If you accidentally remove every widget, don’t worry — an empty Dashboard shows a friendly "Your Workspace is Empty" message with a button to start adding widgets again.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 5 — PARTNER COMPANIES GROUP
  // ===================================================================
  {
    title: 'Partner Companies',
    intro: [
      'This chapter covers the "Partner Companies" group in the sidebar, which contains three related pages: Partner Companies (the main company directory), Document Tracker, and Feedback Hub.',
    ],
    sections: [
      // ---- Partner Companies page ----
      {
        heading: 'Partner Companies — the company directory',
        blocks: [
          { type: 'p', text: 'This is the master list of every partner company Microgenesis works with — Couriers, Suppliers, and Subcontractors. From here you register new partners, edit their details, and keep track of who is active, archived, or missing paperwork.' },
          { type: 'h3', text: 'Understanding the summary tiles' },
          { type: 'p', text: 'Near the top of the page, four clickable tiles summarize the whole registry:' },
          { type: 'bullets', items: [
            '"Active Partners" — the total number of active companies.',
            '"Expired Documents" — companies that currently have at least one expired compliance document.',
            '"Incomplete Profiles" — companies missing some of their basic details (address, contact person, email, or mobile number).',
            '"Archived Partners" — companies that have been archived (removed from active use, but not deleted).',
          ] },
          { type: 'p', text: 'Clicking any tile filters the list below to just that group. Below the tiles, you can also filter by category — All categories, Couriers, Suppliers, Subcontractors, or Uncategorized — and, for Suppliers specifically, by Local or Foreign origin. A search box lets you search by company name or BP Code.' },
          { type: 'p', text: 'You can switch how the list displays using the "General" (card view) and "Simplified" (compact table view) buttons above the list.' },
          { type: 'screenshot', caption: 'The Partner Companies page, showing the Active Partners / Expired Documents / Incomplete Profiles / Archived Partners tiles, the category filter tabs, and the company list below.' },

          { type: 'h3', text: 'Adding a new company' },
          { type: 'p', text: 'Use this when a new courier, supplier, or subcontractor starts working with Microgenesis and needs to be added to the registry.' },
          { type: 'steps', items: [
            'From the Partner Companies page, click "Register New Partner" (top right, with a + icon).',
            'Make sure the "Manual Entry" tab is selected at the top of the window (the other tab, "Upload Master List", is for bulk-importing many companies at once from an Excel file — see the Tip below).',
            'Fill in "Company Name".',
            'Choose the "Affiliation Category": Courier, Supplier, or Subcontractor.',
            'If you chose Supplier, also choose "Supplier Origin": Local or Foreign.',
            'Optionally fill in "Specialization Scope" (a short description of what they do or supply) and "BP Code" (their business partner code, if known).',
            'If this company also needs a Non-Trade (NT) BP Code, tick "Also register a Non-Trade (NT) BP Code" and fill in that second code field.',
            'Set the "Registration Date" if it should be different from today.',
            'Click "Register Company" to save, or "Cancel" to back out.',
          ] },
          { type: 'note', text: 'When you register a company this way, its compliance documents are not uploaded at the same time — every document starts as "Missing" until you upload/renew it from the Document Tracker (Chapter 5) or through a Master List upload.' },
          { type: 'tip', text: 'If you need to add many companies at once, use "Upload Master List" instead of "Manual Entry" — you can upload an Excel (.xlsx/.xls) file with your full list. There is also an option to completely replace the existing registry with the uploaded file, which should be used with caution since it is a destructive action. After uploading, you will see a preview of exactly what will change before anything is applied.' },

          { type: 'h3', text: 'Editing a company’s details' },
          { type: 'steps', items: [
            'Click anywhere on a company’s card (or row, in Simplified view) to open its details.',
            'Under "Partner Classification", you can change the Partner Type and Supplier Origin.',
            'Under "Contact & Registration", you can update the company’s primary email address.',
            'Under "Branches & Compliance Documents", you can edit each branch’s Address, Contact Person, Mobile Phone, and Branch Email, and change its Status (for example Pending, Updated, Accredited, or Inactive).',
            'Click "Close Dialog" when you are done, or use the Archive/Delete options described below if needed.',
          ] },
          { type: 'p', text: 'From this same detail screen you can also click on any document "pill" to renew it or update its status — see "Renewing a document" under the Document Tracker section of this chapter, since it uses the exact same renewal steps.' },

          { type: 'h3', text: 'Archiving, restoring, or deleting a company' },
          { type: 'bullets', items: [
            [{ text: 'Archive: ', bold: true }, 'click the "Archive" button on the company’s card, or "Archive Partner Company" inside its detail screen. This immediately moves the company out of the active registry and into the Archived Partners tile — it is not deleted, and can be brought back at any time.'],
            [{ text: 'Restore: ', bold: true }, 'open an archived company and click "Restore to Active Registry" (or the "Restore" button on its card).'],
            [{ text: 'Delete (permanent): ', bold: true }, 'open the company’s detail screen and click "Delete Partner". You will be asked to enter an Administrative Passcode before the deletion is confirmed. This cannot be undone, so use it only when a company record was created by mistake or should never have existed — for everyday "we no longer work with them" situations, archiving is almost always the right choice instead.'],
          ] },
          { type: 'warn', text: 'Deleting a partner company permanently removes its record. If you simply want to stop actively evaluating a company but keep its history, use Archive instead of Delete.' },
        ],
      },

      // ---- Document Tracker ----
      {
        heading: 'Document Tracker — compliance document status',
        blocks: [
          { type: 'p', text: 'The Document Tracker is a grid (a bit like a spreadsheet) showing every partner company down one side and every required compliance document across the top — things like the Confidentiality and Non-Disclosure Agreement, Business Permit, Articles of Incorporation, and so on. Each cell tells you at a glance whether that document is current, expiring soon, expired, or missing for that company.' },
          { type: 'h3', text: 'Reading the color codes' },
          { type: 'bullets', items: [
            [{ text: 'Green — Current: ', bold: true }, 'the document is on file and not close to expiring.'],
            [{ text: 'Amber — Expiring within 30 days: ', bold: true }, 'shows how many days are left.'],
            [{ text: 'Red — Expired / For Update: ', bold: true }, 'the document’s expiry date has already passed.'],
            [{ text: 'Dashed / blank — Missing: ', bold: true }, 'no record of this document exists yet for that company.'],
          ] },
          { type: 'note', text: 'Not every document has an expiry date. Documents like the NDA or Letter of Accreditation are simple "provided / not provided" checklist items with no date attached, while documents like the Business Permit, AFS, and GIS do carry an expiry date and will move through the Current → Expiring → Expired stages automatically as time passes.' },
          { type: 'p', text: 'Use the category tabs (Supplier – Local, Supplier – Foreign, Courier, Subcontractor) to see the specific document set that applies to each type. Search by company name or BP Code above the document grid; results are shown 15 rows per page. Administrators can still use Customize Filters for more specific fields and conditions. The "Compliance Overview" panel above the grid also gives you KPIs like Total Partners, Compliance Rate, and charts showing which documents most need attention.' },
          { type: 'screenshot', caption: 'The Document Tracker grid, showing partner companies down the left and document types across the top, with green/amber/red/dashed color-coded cells.' },

          { type: 'h3', text: 'Uploading or renewing a document with an expiry date' },
          { type: 'p', text: 'Use this whenever a company sends you an updated Business Permit, AFS, GIS, Import Permit, or any other document that carries an expiry date.' },
          { type: 'steps', items: [
            'Go to Document Tracker, select the correct category tab for that company, and find their row.',
            'Click the cell for the document you want to update.',
            'In the status popup that appears, click "Renew Document".',
            'Choose the "New Expiry Date" for the renewed document.',
            'Click "Confirm Renewal" to save it, or "Cancel" to back out.',
          ] },
          { type: 'tip', text: 'You can also start a renewal from inside a company’s own detail screen on the Partner Companies page — click the document "pill" there and the same renewal steps apply.' },

          { type: 'h3', text: 'Updating a document that has no expiry date' },
          { type: 'steps', items: [
            'Click the cell for that document (for example, the NDA or Letter of Accreditation).',
            'In the "Set Document Status" window, choose either "Missing" or "Complete".',
            'Click "Confirm".',
            'A second confirmation window will summarize the change (Document / Company / New Status) — click "Confirm" again to apply it.',
          ] },

          { type: 'h3', text: 'Marking a document as missing' },
          { type: 'p', text: 'If a document needs to be removed from a company’s record (for example, it was uploaded in error), open its status popup and click "Mark as Missing", then confirm on the warning screen that appears.' },

          { type: 'h3', text: 'Setting document expiry alert timing' },
          { type: 'p', text: 'By default, the system automatically warns you 30 days before a document expires, and again once it has expired. If you would like additional early warnings (for example, a heads-up 60 or 90 days ahead), you can add your own custom alert milestones per document type.' },
          { type: 'steps', items: [
            'On the Document Tracker page, click "Add Notification" near the top of the page.',
            'In the "Document Expiry Notifications" window, find the document type you want to adjust and switch on "Early alert" for it.',
            'Add the extra number of days’ notice you want (you can add more than one milestone per document).',
            'Click "Done" to save your changes. If you want to undo your customizations later, use "Restore to Default".',
          ] },
          { type: 'note', text: 'These alerts appear in the Notifications activity log (Chapter 10) as they trigger — this is where you configure when they fire, not where you view them.' },

          { type: 'h3', text: 'Reviewing the modification history' },
          { type: 'p', text: 'At the bottom of the Document Tracker page, a "Modification History" panel keeps a running record of every renewal and status change made — showing the date and time, who made the change, and what changed. This same audit trail is also visible from the Partner Companies page.' },
        ],
      },

      // ---- Feedback Hub ----
      {
        heading: 'Feedback Hub — sending performance reports to partner companies',
        blocks: [
          { type: 'note', text: 'This is the page you use whenever you need to "send something to a company" — specifically, it sends the results of internal employee evaluations back out to the partner company as a performance report email. It is not an inbox for partners to submit feedback into the system.' },
          { type: 'p', text: 'The page has three tabs: "Current Forms" (surveys still being answered), "Past Results" (completed surveys), and "Sent Reports Log" (a queue and history of every report email sent or waiting to be sent).' },
          { type: 'h3', text: 'Sending a performance report to a partner company' },
          { type: 'steps', items: [
            'Go to Feedback Hub → "Past Results" tab (or open a completed survey card from "Current Forms").',
            'Find the survey/company you want to report on, and click "Send to Partner" on that row.',
            'This opens the full "Send to Partner" screen — fill in or confirm the recipient, subject, and message body for the report email.',
            'Submit it. The report is added to "Sent Reports Log" as "Queued", with a countdown timer before it actually goes out.',
            'While it is queued, you can click "Preview" to double-check exactly what will be sent, "Confirm Now" to send it immediately instead of waiting for the timer, or "Return" to pause it and send it back for revision (you will need to provide a reason).',
            'Once sent, the entry can be re-sent later using "Resend", and you can view its full history using "Log".',
          ] },
          { type: 'tip', text: 'To send reports for every fully completed survey at once instead of one at a time, use the "Bulk Sending" button at the top of the page. It only becomes available once every active survey for that batch has reached "Completed" status.' },
          { type: 'h3', text: 'Changing how long a report waits before auto-sending' },
          { type: 'steps', items: [
            'Go to Feedback Hub → "Sent Reports Log" tab.',
            'Click "Queue Config" near the top right.',
            'In "Default Queue Timer Duration Settings", choose a wait time (15, 30, 60, or 120 minutes).',
            'Click "Save & Close".',
          ] },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 6 — EVALUATIONS GROUP
  // ===================================================================
  {
    title: 'Evaluations',
    intro: [
      'This chapter covers the "Evaluations" group in the sidebar: All Submissions, Outstanding Evaluations, Raw Data Explorer, Archive Center, and Categories Manager. This is where you build and manage the actual evaluation survey forms, and review everything that has been submitted.',
    ],
    sections: [
      // ---- All Submissions / Survey Forms ----
      {
        heading: 'All Submissions — managing your survey forms',
        blocks: [
          { type: 'p', text: 'This is your home base for evaluation forms: creating new ones, changing their settings, and archiving old ones. Each row in the list is one survey form (for example, "Q3 Courier Satisfaction Survey"), showing its category, status, how far along employees are in completing it, and its deadline.' },
          { type: 'p', text: 'A form’s status is always one of: Active (open for responses), Paused (temporarily closed), or Ended.' },
          { type: 'screenshot', caption: 'The All Submissions page, with the survey list showing Survey Title, Category Type, Status, Completion, Deadline Date, and Actions columns.' },

          { type: 'h3', text: 'Creating a new evaluation survey' },
          { type: 'steps', items: [
            'From All Submissions, click "Create Form".',
            'Fill in "Survey Title" and, optionally, a "Description / Instructions" explaining the survey’s purpose to whoever fills it out.',
            'Choose "Survey Type (Audience)": Courier, Supplier, or Subcontractor. This decides which partner companies the survey applies to.',
            'Optionally set a "Deadline Date" (format dd/mm/yyyy).',
            'Adjust the "Rating Scale Max" slider — this sets the top end of the numeric scale respondents will rate against (for example, 0 to 5, or 0 to 10).',
            'For each question you want to include, click "Add Question" and fill in: the "Question Text", a "Category" (the scoring section it belongs to — see Categories Manager below), an optional "Section Header" to visually group related questions, and the "Input Type" — a numeric rating scale, a dropdown list of choices, a typed rating within a custom range, or a free-text answer.',
            'Repeat "Add Question" for every question the survey needs. Use the trash icon on a question card to remove it (you must always keep at least one question).',
            'When everything looks right, click "Create and Publish Form". The survey goes live immediately and appears in the All Submissions list.',
          ] },
          { type: 'note', text: 'There is no separate "save as draft" step for a new survey — clicking "Create and Publish Form" makes it live right away. If you are not ready for employees to see it yet, you can immediately set its status to "Paused" afterward (see "Changing a survey’s settings" below) so it exists but is not open for responses.' },
          { type: 'tip', text: 'The five scoring categories available in the Category dropdown come from Categories Manager (see later in this chapter) — renaming a category there will immediately update what appears in this dropdown for every survey of that type.' },

          { type: 'h3', text: 'Editing an existing survey’s questions' },
          { type: 'steps', items: [
            'From All Submissions, click "Manage" on the survey you want to change.',
            'On the survey’s detail page, click "Edit Survey Form".',
            'Make your changes to the title, description, type, deadline, rating scale, or questions, exactly as when creating a new survey.',
            'Click "Save Changes".',
          ] },

          { type: 'h3', text: 'Changing a survey’s settings (status, access, deadline, reminders)' },
          { type: 'p', text: 'Use this to pause/resume a survey, control who can answer it, change its deadline, or adjust how often reminder notifications go out to employees.' },
          { type: 'steps', items: [
            'From All Submissions, click "Modify" on the survey row (or turn on "Select Forms" mode to select several surveys at once and click "Modify Selected Survey").',
            'On Step 1, choose the survey’s status (Active, Paused, or Ended), and under "Survey Access", tick which Departments and Roles are allowed to answer this survey. Leave everything ticked if it should be open to everyone.',
            'Click "Next" to move to Step 2.',
            'Set the "Set Deadline" date if it needs to change.',
            'Under "Set Notification", choose how often employees with pending evaluations get reminded: Every 4 Hours (High Frequency), Every 8 Hours, Every 12 Hours, Every 24 Hours (Standard), or Every 48 Hours.',
            'If you need to change which partner companies this survey covers, click "Modify Companies to Evaluate". For any category, choose "Within the Top 20" to select up to 20 active companies in the current volume-weighted Analytics leaderboard order (unscored active companies fill remaining slots), choose "Active Companies" for the full active list, or tick companies individually.',
            'Click "Save Changes".',
          ] },
          { type: 'note', text: 'This "Set Notification" frequency is what controls how often employees are reminded (through their Notifications inbox and the bell icon) about evaluations they still need to complete. It does not send anything to the partner companies themselves — for that, see "Feedback Hub" in Chapter 5.' },

          { type: 'h3', text: 'Archiving a survey form' },
          { type: 'p', text: 'Archiving hides a form from both the admin list and employee dashboards, while safely keeping all of its past responses in the Archive Center.' },
          { type: 'steps', items: [
            'Turn on "Select Forms", tick the form(s) you want to archive, and click "Modify Selected Survey".',
            'Click "Archive Form/s".',
            'Enter the Administrator Passcode when prompted.',
            'Click "Proceed & Archive".',
          ] },

          { type: 'h3', text: 'Resetting a survey for a new evaluation period' },
          { type: 'p', text: 'Use this when you want to start a fresh evaluation cycle (for example, moving from "1st Half 2026" into "2nd Half 2026") without losing the previous period’s results — the old responses are automatically archived under a label you choose, and the form is cleared so employees answer it from scratch.' },
          { type: 'steps', items: [
            'Select the form(s) as above and click "Modify Selected Survey", then "Reset Form/s".',
            'Type a "Period / Series Label" to identify this batch of old responses later (for example, "1st Half 2026").',
            'Enter the Administrator Passcode.',
            'Click "Proceed & Reset".',
          ] },
          { type: 'warn', text: 'Both archiving and resetting a form require the Administrator Passcode as a safety check, since they affect what employees can currently see and answer. Make sure you mean to make the change before entering it.' },
        ],
      },

      // ---- Outstanding Evaluations ----
      {
        heading: 'Outstanding Evaluations — who still needs to be evaluated',
        blocks: [
          { type: 'p', text: 'This page is a simple, read-only coverage tracker. It shows you, for each category (Courier, Supplier, Subcontractor), exactly which registered partner companies have not received a single evaluation yet this period.' },
          { type: 'p', text: 'At the top, three summary cards show the percentage of companies covered per category, with a progress bar. Below that, each category has its own panel listing the specific companies still awaiting an evaluation — or a green "Fully covered" message if none are outstanding.' },
          { type: 'note', text: 'There are no buttons or actions on this page — it is purely for checking coverage at a glance. If you want to nudge employees to complete their evaluations sooner, adjust the reminder frequency from All Submissions → Modify → Set Notification (see above).' },
        ],
      },

      // ---- Raw Data Explorer ----
      {
        heading: 'Raw Data Explorer — inspecting individual responses',
        blocks: [
          { type: 'p', text: 'Use this page when you need to look closely at exactly what one specific person answered on one specific survey — for example, to double-check a submission or investigate an unusual score.' },
          { type: 'steps', items: [
            'Go to Raw Data Explorer.',
            'Click the survey you want to inspect from the grid of survey cards.',
            'Use "Select Respondent Email" to search for and choose the person whose answers you want to see.',
            'Every submission that person made for this survey appears as its own card, showing the submission date, company, department, and every question they answered along with their exact answer.',
            'Click "Back to Surveys" to return to the survey list, or choose a different respondent email to look at someone else.',
          ] },
        ],
      },

      // ---- Archive Center ----
      {
        heading: 'Archive Center — retired forms and past-period responses',
        blocks: [
          { type: 'p', text: 'This is where anything you archived from All Submissions ends up — either whole survey forms, or batches of responses from a "Reset". Two tabs organize it: "Archived Surveys" and "Archived Responses".' },
          { type: 'h3', text: 'Restoring an archived survey form' },
          { type: 'steps', items: [
            'Go to Archive Center → "Archived Surveys" tab.',
            'Find the form and click "Restore Form".',
            'Confirm by clicking "Confirm Restore" in the pop-up warning.',
          ] },
          { type: 'note', text: 'Restoring a survey immediately makes it visible to respondents again, exactly as it was before it was archived.' },
          { type: 'h3', text: 'Working with archived response periods' },
          { type: 'p', text: 'Under "Archived Responses", each row is a labeled batch of old submissions (for example, "1st Half 2026"). You can:' },
          { type: 'bullets', items: [
            'Expand a batch with "View Logs" to see every submission it contains.',
            'Rename the label with the pencil icon.',
            'Select one or more batches and use "Export Selected" to download them, "Restore Selected" to merge them back into the live/current dataset, or "Delete Selected" to permanently remove them (this cannot be undone — export first if you might need the data later).',
            'Use "Export All Archived" to download everything at once, or "Import" to bring in a previously exported archive file.',
          ] },
          { type: 'warn', text: 'Permanently deleting archived responses cannot be undone. Always export a copy first if there is any chance you will need that data again.' },
        ],
      },

      // ---- Categories Manager ----
      {
        heading: 'Categories Manager — naming the scoring categories',
        blocks: [
          { type: 'p', text: 'Every survey type (Courier, Supplier, Subcontractor) is scored across exactly five fixed categories, plus a shared "Overall" category used for whole-company feedback. Categories Manager lets you rename those five labels per type — for example, changing "Price" to "Cost Effectiveness" for Suppliers.' },
          { type: 'note', text: 'This page only renames the categories. It does not add, remove, or reorder them, and it does not change the underlying scoring/point values — those stay fixed to match Microgenesis’s official evaluation forms.' },
          { type: 'p', text: 'The default category names are:' },
          { type: 'bullets', items: [
            'Courier: Delivery, Commercial, Technology, Support, Security',
            'Supplier: Documentation, Delivery, Price, Quality, Communication',
            'Subcontractor: Delivery, Documentation, Cost, Quality, Communication',
          ] },
          { type: 'h3', text: 'Renaming a category' },
          { type: 'steps', items: [
            'Go to Categories Manager and click the card for the partner type you want to edit (Courier, Supplier, or Subcontractor).',
            'Edit any of the five "Category" text boxes.',
            'Click "Save Changes".',
            'Confirm by clicking "Yes, Apply Changes" in the warning dialog.',
          ] },
          { type: 'p', text: 'To undo your customizations and go back to the original five names for a type, open its editor and click "Restore to Default", then confirm the same way.' },
          { type: 'warn', text: 'Renaming a category changes its label everywhere at once — charts, reports, the analytics dashboard, and every existing survey question and submitted response already tagged with the old name. This cannot be automatically undone, so double-check the new name before saving.' },
          { type: 'tip', text: 'Whatever five names you set here immediately appear in the "Category" dropdown when creating or editing a survey question of that type (Chapter 6, All Submissions).' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 7 — ANALYTICS
  // ===================================================================
  {
    title: 'Analytics',
    intro: [
      'Analytics is your reporting and insights dashboard — a read-only page that turns every survey response on file into scores, rankings, and trends. There is nothing to create or edit here; it is entirely for viewing.',
    ],
    sections: [
      {
        heading: 'What you will find on this page',
        blocks: [
          { type: 'bullets', items: [
            [{ text: 'Top Performing Partner', bold: true }, ' — a large gauge highlighting the current leading company, with its score and standing.'],
            [{ text: 'Category Champion cards', bold: true }, ' — the top company in each of Courier, Supplier, and Subcontractor.'],
            [{ text: 'Company Leaderboard and Company Analysis panels', bold: true }, ' — a ranked list of every company with the ability to drill into any one of them.'],
            [{ text: 'Survey Comparison charts', bold: true }, ' — best and lowest performing companies, and total response volume.'],
            [{ text: 'N/A Frequency and Top/Bottom Questions charts', bold: true }, ' — which questions get skipped most, and which score highest and lowest overall.'],
            [{ text: 'Rating Trend chart', bold: true }, ' — how average scores are moving over time, viewable monthly, yearly, or by survey series.'],
            [{ text: 'Question Performance list', bold: true }, ' — every survey question ranked by its average rating.'],
          ] },
          { type: 'screenshot', caption: 'The Analytics page, showing the Top Performing Partner gauge, Category Champion cards, and the leaderboard/comparison charts below.' },
        ],
      },
      {
        heading: 'Filtering what you see',
        blocks: [
          { type: 'p', text: 'Use the "Filters" panel to narrow the data down:' },
          { type: 'bullets', items: [
            '"Survey Type" — tick which of Courier / Supplier / Subcontractor to include.',
            '"Company" — focus on one specific company, or leave it on "All companies".',
            '"Reset" — clears your filters back to showing everything.',
          ] },
          { type: 'p', text: 'Use the controls at the top of the page to choose the reporting scope: "Current Period", "All-Time", or a "Custom" selection of specific past periods. Company rankings use volume-weighted scores, which adjust company averages based on evaluation volume.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 8 — REPORTS & EXPORTS GROUP
  // ===================================================================
  {
    title: 'Reports & Exports',
    intro: [
      'This chapter covers the "Reports & Exports" group in the sidebar: Generate Report, Present Mode, and Export History. This is how you turn survey data into polished, downloadable reports and presentations.',
    ],
    sections: [
      {
        heading: 'Generate Report — the reports hub',
        blocks: [
          { type: 'p', text: 'This page is your starting point for every report type. It shows four cards — Summary Report, Companies Report, Question Report, and Raw Data Export — plus a larger featured panel for the Executive Summary Dossier. Clicking "Build report" on any card takes you into that report’s builder screen, where you choose what to include before exporting.' },
          { type: 'note', text: 'If your account is not allowed to export reports, you will see "⚠️ Export restricted" instead of the export options. Exporting is restricted to Supervisor level and above by default — contact an Admin if you believe you should have access.' },
        ],
      },
      {
        heading: 'Building and exporting a Summary Report',
        blocks: [
          { type: 'p', text: 'A system-wide performance summary with KPI cards, a chart, and rating tables.' },
          { type: 'steps', items: [
            'From Generate Report, click "Build report" on the Summary Report card.',
            'Under "1. Categories Included", tick which survey types to include.',
            'Under "2. Graph Metric", choose whether the chart shows "Submissions" or "Average Rating".',
            'Under "3. Show Sections", tick which parts of the report to include (KPI cards, chart, performance table, top/lowest performing companies, question highlights).',
            'Review the live preview on the right — it shows exactly what the exported file will look like.',
            'Click "Export Report" and choose PDF, CSV, or Excel.',
          ] },
        ],
      },
      {
        heading: 'Building and exporting an Executive Summary Dossier',
        blocks: [
          { type: 'p', text: 'A longer, more strategic briefing document combining KPIs, flagged low-scoring questions, top/bottom partner rankings, and space for written commentary — well suited for sharing with leadership.' },
          { type: 'steps', items: [
            'From Generate Report, click "Build Executive Report" in the Executive Summary Dossier panel.',
            'Tick which divisions (Courier, Supplier, Subcontractor) to include.',
            'Set the "Critical Threshold" slider — any question scoring below this benchmark gets flagged in the report.',
            'Optionally fill in "Prepared By" and edit the commentary text box with your own observations.',
            'Tick which sections of the dossier layout to include (cover page, KPI cards, chart, rankings, recommendations, commentary, detailed question reports).',
            'Click "Export Executive Dossier" and choose PDF, CSV, or Excel.',
          ] },
        ],
      },
      {
        heading: 'Building and exporting a Question Report',
        blocks: [
          { type: 'p', text: 'Compares every survey question’s performance, grouped by category, and shows each question’s highest- and lowest-scoring company.' },
          { type: 'steps', items: [
            'From Generate Report, click "Build report" on the Question Report card.',
            'Tick which survey categories to include.',
            'Tick which data columns to show: Average Rating, Total Responses, Highest Scoring Company, Lowest Scoring Company.',
            'Click "Export" and choose PDF, Excel, or CSV.',
          ] },
        ],
      },
      {
        heading: 'Building and exporting a Companies Report',
        blocks: [
          { type: 'p', text: 'A one-company "report card" with charts and a score trend for a single partner — this is also the only report type you can export as a Word document.' },
          { type: 'p', text: 'Stakeholder comments include overall feedback and free-text remarks left on survey sections. Each comment is labeled with its section, and repeated copies of the same remark from one respondent and section appear only once.' },
          { type: 'steps', items: [
            'From Generate Report, click "Build report" on the Companies Report card.',
            'Choose the "Category" (Courier, Supplier, or Subcontractor), then the specific "Company".',
            'Tick which graphs to include: bar graph, radar graph, score trend, and/or per-question average rating.',
            'If you want to include respondent comments, tick "Include stakeholder comments", then click "Review Stakeholder Remarks" to choose exactly which comments to include, and "Save Selection".',
            'Click "Export" and choose PDF or Word (.docx).',
          ] },
        ],
      },
      {
        heading: 'Exporting Raw Data',
        blocks: [
          { type: 'p', text: 'Exports the original, unprocessed survey answers — one row per submission — rather than a summarized report.' },
          { type: 'steps', items: [
            'From Generate Report, click "Build report" on the Raw Data Export card.',
            'Choose the category card (Courier, Supplier, or Subcontractor) for the data you want.',
            'Click "Export As" on that card and choose Excel, CSV, or PDF.',
          ] },
        ],
      },
      {
        heading: 'Present Mode — turning data into a slideshow',
        blocks: [
          { type: 'p', text: 'Present Mode builds a click-through slide deck from your survey data, ideal for presenting results in a meeting.' },
          { type: 'steps', items: [
            'Go to Present Mode.',
            'Under "1. What would you like to present?", select one or more topic cards (for example, Company Performance Rankings, Trends Over Time, Top & Bottom Questions).',
            'Under "2. What time window?", choose All Time, Last 6 Months, Last Month, Last Week, or a Custom date range.',
            'Under "3. Which stakeholder groups?", choose which of Courier / Supplier / Subcontractor to include.',
            'Under "4. Give it a title", type a name for the presentation.',
            'Click "Generate Presentation".',
            'Once generated, use the on-screen arrows (or your keyboard’s left/right arrow keys) to move between slides, click "Present fullscreen" to display it full-screen, and use "Export As" to save it as a PDF or a PowerPoint (PPTX) file.',
          ] },
        ],
      },
      {
        heading: 'Export History — your download log',
        blocks: [
          { type: 'p', text: 'A running list of every report you have exported from this browser, kept for your own reference. It shows the report title, filename, format, and when it was exported.' },
          { type: 'note', text: 'This page does not store the actual files — it is only a log of what you have exported. There is no re-download button, so keep your downloaded files organized on your own computer. Use the search box to find a past export by name, and "Clear log" if you want to wipe the whole list (this does not delete any files you already downloaded).' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 9 — EMPLOYEES / USERS
  // ===================================================================
  {
    title: 'Employees / Users',
    intro: [
      'This page is where you create and manage every account in the system, decide who is an Administrator versus a regular Employee, and control exactly which pages and survey categories each person can access.',
    ],
    sections: [
      {
        heading: 'Understanding the account list',
        blocks: [
          { type: 'p', text: 'The main table lists every account with its Email, Role (Employee or Administrator), Designation, Department, and a Permissions Status badge — "Role Defaults" (green) if the account is using the standard permission set for its designation and department, or "Custom Overrides" (amber) if someone has manually adjusted its access.' },
          { type: 'screenshot', caption: 'The Employees / Users page, showing the accounts table with Email, Role, Designation, Department, and Permissions Status columns, and the Add Account button.' },
        ],
      },
      {
        heading: 'Adding a new employee account',
        blocks: [
          { type: 'p', text: 'Because everyone signs in with their company Microsoft 365 email, there is no password to set here — you are simply telling the system that a particular company email address exists and what it is allowed to see.' },
          { type: 'steps', items: [
            'Go to Employees / Users and click "Add Account".',
            'Enter the person’s "Email Address" (their full @mgenesis.com company email).',
            'Choose their "System Role": Employee or Administrator.',
            'Choose their "Designation / Organizational Rank": Rank & File, Supervisory, Managerial, Director, or Executive.',
            'Choose their "Department": Accounts Payable - Trade, Business Solutions Manager, Executive Office, Logistics, Procurement Group, or TASS.',
            'Choosing a Designation and Department automatically fills in a sensible default set of permissions below — review the "Survey Data Access" and "Permitted Navigation Modules" sections and adjust anything that should be different for this specific person.',
            'Click "Add Account" to finish.',
          ] },
          { type: 'note', text: 'If you try to add an email address that already has an account, you will see a message that it already exists — search the list for it instead of creating a duplicate.' },
        ],
      },
      {
        heading: 'Assigning or changing an employee’s permissions',
        blocks: [
          { type: 'p', text: 'Two things control what a given account can see:' },
          { type: 'bullets', items: [
            [{ text: 'Survey Data Access', bold: true }, ' — broad visibility into Courier, Supplier, and/or Subcontractor survey data.'],
            [{ text: 'Permitted Navigation Modules', bold: true }, ' — exactly which sidebar pages this account is allowed to open (Dashboard, Survey Forms, Analytics, Reports, Account Management, and so on).'],
          ] },
          { type: 'steps', items: [
            'Click the edit (pencil) icon on the account’s row in Employees / Users.',
            'Adjust the "Survey Data Access" toggles for the categories they should see.',
            'Adjust the "Permitted Navigation Modules" toggles for the pages they should be able to open.',
            'Click "Save Permissions".',
          ] },
          { type: 'p', text: 'If you want to undo custom permissions and return an account to the standard defaults for its Designation and Department, click "Reset Access" on its row in the list (this button only appears once an account has custom overrides), or click "Load Role Defaults" while inside the edit screen before saving.' },
          { type: 'tip', text: 'To change permissions for an entire department at once instead of one person at a time, click "Department Access" at the top of the page, choose the department on the left, adjust its default Survey Data Access and Permitted Navigation Modules, and click "Save Department Access". Be aware this will affect everyone in that department immediately, even accounts that currently have individual custom overrides.' },
        ],
      },
      {
        heading: 'Editing or removing an account',
        blocks: [
          { type: 'steps', items: [
            'To edit someone’s Role, Designation, Department, or permissions, click the edit (pencil) icon on their row, make your changes, and click "Save Permissions".',
            'To remove an account, click the delete (trash) icon on their row and confirm.',
          ] },
          { type: 'warn', text: 'As a safety measure, an Administrator can never delete their own account, nor any other account that shares the same System Role as themselves — for example, one Admin cannot delete another Admin account. You will see a message explaining this if you try. This prevents anyone from accidentally locking every Administrator out of the system.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 10 — NOTIFICATIONS
  // ===================================================================
  {
    title: 'Notifications',
    intro: [
      'The Notifications page is an activity log — a record of things the system has already noticed and flagged automatically, such as new survey submissions and documents that are expiring or have expired. It is a good place to check for anything that needs your attention, but it is not where you compose or send a message yourself.',
    ],
    sections: [
      {
        heading: 'Reading the activity log',
        blocks: [
          { type: 'p', text: 'Three tiles summarize activity at a glance: "Total logged", "Unread", and "Today". Below that, a table lists every logged event with its date and time, category, company, respondent, department, and designation, sortable by clicking any column header. You can filter by category (All / Courier / Supplier / Subcontractor) and search by company, respondent, or department.' },
          { type: 'p', text: 'Two kinds of entries appear here:' },
          { type: 'bullets', items: [
            [{ text: 'New survey submissions', bold: true }, ' — logged automatically whenever an employee submits an evaluation.'],
            [{ text: 'Document expiry alerts', bold: true }, ' — shown with a "⚠️ SYSTEM ALERT" tag and a status badge of "Expired Document(s)" or "Expiring Soon", generated automatically by the Document Tracker’s expiry checks.'],
          ] },
          { type: 'screenshot', caption: 'The Notifications page, showing the Total logged / Unread / Today tiles and the activity log table below.' },
        ],
      },
      {
        heading: 'Where to configure alert timing and reminders',
        blocks: [
          { type: 'p', text: 'Since this page is a read-only log, the settings that control what appears here (and how often) live on the pages that generate those alerts:' },
          { type: 'bullets', items: [
            [{ text: 'How often employees are reminded about pending evaluations: ', bold: true }, 'Evaluations → All Submissions → "Modify" (or "Modify Selected Survey") → Step 2 → "Set Notification". See Chapter 6.'],
            [{ text: 'When document expiry warnings fire: ', bold: true }, 'Partner Companies → Document Tracker → "Add Notification". See Chapter 5.'],
            [{ text: 'Sending an actual message or report to a partner company: ', bold: true }, 'Partner Companies → Feedback Hub → "Send to Partner". See Chapter 5.'],
          ] },
          { type: 'note', text: 'There is currently no feature for typing a free-form message and sending it directly to a partner company from this Notifications page — every entry here is generated automatically by the system, not written by an Admin. If you need to communicate something directly to a partner, use Feedback Hub (for performance reports) or your normal company email.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 11 — SETTINGS
  // ===================================================================
  {
    title: 'Settings',
    intro: [
      'Settings brings together your own account information, display preferences, and a few system-wide maintenance tools in one place.',
    ],
    sections: [
      {
        heading: 'System Snapshot and Account',
        blocks: [
          { type: 'p', text: 'At the top, "System Snapshot" gives you quick read-only counts: total Accounts, Active Partners, Responses Logged, and when the system database was last reset. Below that, the "Account" section shows your own signed-in email, role, designation, and department — this information is read-only here and is managed through Employees / Users if it ever needs to change.' },
        ],
      },
      {
        heading: 'Appearance',
        blocks: [
          { type: 'p', text: 'Use the "Dark Mode" toggle to switch the whole interface between light and dark themes, based on your personal preference.' },
        ],
      },
      {
        heading: 'System Tools',
        blocks: [
          { type: 'p', text: 'A small set of administrative maintenance tools live here:' },
          { type: 'bullets', items: [
            [{ text: 'Import Evaluation Responses', bold: true }, ' — bulk-import evaluation results that were collected outside the system (for example, on paper or via a Microsoft Forms export) so they show up in your analytics and reports. See "Importing evaluation responses" below.'],
            [{ text: 'Reset System Database', bold: true }, ' — re-seeds the system’s standard reports and values. This is a significant, destructive action and should only be used when you specifically intend to reset the whole system, such as before a fresh rollout.'],
          ] },
          { type: 'warn', text: '"Reset System Database" is destructive and cannot be undone casually. Do not use it unless you are certain, and ideally after exporting anything you might need to keep.' },
          { type: 'h3', text: 'Importing evaluation responses' },
          { type: 'steps', items: [
            'Go to Settings → System Tools → "Import Evaluation Responses".',
            'For each applicable category card (Supplier, Subcontractor, Courier), drag and drop the matching export file onto the drop zone, or click it to browse for the file (.xlsx, .xls, or .csv only).',
            'Once you are happy with the files staged across the cards, click "Import" at the bottom of the page.',
            'If any company names in the file do not match an existing entry in the Partner Registry, a window will list them — choose "Add" to register them as new partner companies, or "Skip" to leave those rows out, then click "Continue Import".',
            'Review the import results shown for each category, including how many submissions were imported and any rows that were skipped.',
          ] },
          { type: 'tip', text: 'Re-uploading a refreshed export of the same period updates the matching existing rows instead of creating duplicates, so it is safe to re-import a corrected file.' },
        ],
      },
      {
        heading: 'Session and Recent Activity',
        blocks: [
          { type: 'p', text: 'Use the "Sign out" button to log out of the system on this device. The "Recent Activity" section below it shows the last several administrative actions performed on this device — database resets, account changes, and exports — as a quick personal audit trail.' },
        ],
      },
    ],
  },

  // ===================================================================
  // CHAPTER 12 — FAQ
  // ===================================================================
  {
    title: 'Frequently Asked Questions',
    isFaq: true,
    intro: [
      'Quick answers to the questions Admins ask most often, each pointing back to the full instructions earlier in this manual.',
    ],
    faqs: [
      { q: 'How do I log in?', a: 'Use your company Microsoft 365 email and password — the same ones you use for your work email — on the Sign In screen. There is no separate password to create. See Chapter 2, Signing In.' },
      { q: 'How do I add a new partner company?', a: 'Go to Partner Companies and click "Register New Partner", then fill in the Manual Entry form (Company Name, Affiliation Category, and so on) and click "Register Company". See Chapter 5, Partner Companies.' },
      { q: 'How do I add a lot of companies at once?', a: 'On the "Register New Partner" window, switch to the "Upload Master List" tab and upload an Excel file instead of entering companies one by one. See Chapter 5, Partner Companies.' },
      { q: 'How do I archive a company instead of deleting it?', a: 'Open the company’s card and click "Archive Partner Company" (or the "Archive" button on its card in the list). This hides it from the active registry without deleting anything, and it can be restored later. See Chapter 5, Partner Companies.' },
      { q: 'How do I renew a company’s expiring document?', a: 'Go to Document Tracker, click the document’s cell for that company, click "Renew Document", choose the new expiry date, and confirm. See Chapter 5, Document Tracker.' },
      { q: 'How do I control when document expiry warnings appear?', a: 'On the Document Tracker page, click "Add Notification" and switch on early alerts with your own day-counts per document type. See Chapter 5, Document Tracker.' },
      { q: 'How do I choose which partner companies can be evaluated?', a: 'In Evaluation Workspace, click "Modify" on the survey, open "Modify Companies to Evaluate", choose "Within the Top 20" or "Active Companies", or select companies individually, then save the survey changes. The saved company IDs determine which companies employees can rate. See Chapter 6, Evaluations.' },
      { q: 'How do I send a company its evaluation results?', a: 'Go to Feedback Hub → "Past Results", find the survey/company, and click "Send to Partner". See Chapter 5, Feedback Hub.' },
      { q: 'How do I create a new evaluation survey?', a: 'Go to All Submissions and click "Create Form". Fill in the survey title, type, and questions, then click "Create and Publish Form". See Chapter 6, Evaluations.' },
      { q: 'How do I edit an existing survey?', a: 'Go to All Submissions, click "Manage" on the survey, then "Edit Survey Form" to change its title, questions, or settings. See Chapter 6, Evaluations.' },
      { q: 'How do I set how often employees get reminded to finish their evaluations?', a: 'Go to All Submissions → "Modify" on the survey → Step 2 → "Set Notification", and choose a frequency such as Every 24 Hours. See Chapter 6, Evaluations.' },
      { q: 'Is there a way to send a custom notification message straight to a partner company?', a: 'Not directly as a free-form message — the closest equivalent is sending them their performance report through Feedback Hub → "Send to Partner". The Notifications page itself only displays automatically generated alerts. See Chapter 10, Notifications.' },
      { q: 'How do I rename a scoring category (like "Price")?', a: 'Go to Categories Manager, click the relevant company type’s card, edit the category name fields, and click "Save Changes". See Chapter 6, Categories Manager.' },
      { q: 'How do I see who still needs to be evaluated?', a: 'Go to Outstanding Evaluations to see, per category, which companies have not yet received any evaluation this period. See Chapter 6, Outstanding Evaluations.' },
      { q: 'How do I export a report?', a: 'Go to Generate Report, click "Build report" on the report type you need, choose your options, then click Export and pick a file format (PDF, Excel, CSV, or Word for Companies Reports). See Chapter 8, Reports & Exports.' },
      { q: 'How do I export the raw survey answers instead of a summary?', a: 'Go to Generate Report → Raw Data Export, choose a category card, click "Export As", and choose Excel, CSV, or PDF. See Chapter 8, Reports & Exports.' },
      { q: 'How do I build a presentation of the results?', a: 'Go to Present Mode, select what to present, your time window and stakeholder groups, give it a title, and click "Generate Presentation". See Chapter 8, Present Mode.' },
      { q: 'How do I add a new employee account?', a: 'Go to Employees / Users, click "Add Account", fill in their email, role, designation, and department, and click "Add Account". See Chapter 9, Employees / Users.' },
      { q: 'How do I control what an employee can see or access?', a: 'Edit their account under Employees / Users and adjust "Survey Data Access" and "Permitted Navigation Modules", or use "Department Access" to change an entire department at once. See Chapter 9, Employees / Users.' },
      { q: 'How do I remove an employee’s account?', a: 'Click the delete icon on their row in Employees / Users. Note that you cannot delete your own account or another account with the same System Role as yours. See Chapter 9, Employees / Users.' },
      { q: 'How do I import evaluations that were collected outside the system?', a: 'Go to Settings → System Tools → "Import Evaluation Responses" and upload the relevant Excel/CSV export files. See Chapter 11, Settings.' },
      { q: 'How do I switch between light and dark mode?', a: 'Go to Settings and use the "Dark Mode" toggle under Appearance. See Chapter 11, Settings.' },
    ],
  },
];
