export type PageKey =
  | 'dashboard'
  | 'partner-companies'
  | 'document-register'
  | 'supplier-ranking'
  | 'partners-feedback-hub'
  | 'account-management'
  | 'survey-forms'
  | 'analytics'
  | 'present'
  | 'explorer'
  | 'reports'
  | 'notifications'
  | 'create-form'
  | 'view-form'
  | 'fill-form'
  | 'archive'
  | 'import-evaluations'
  | 'my-submissions'
  | 'profile-settings'
  | 'pending-review'
  | 'export-history'
  | 'settings'
  | 'categories-manager';

export const ADMIN_PRIMARY_NAVIGATION = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'partner-companies', label: 'Partners' },
  { key: 'survey-forms', label: 'Evaluations' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'reports', label: 'Reports' },
  { key: 'account-management', label: 'Users & Access' },
  { key: 'archive', label: 'Archive' },
] as const;

export const EMPLOYEE_PRIMARY_NAVIGATION = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'fill-form', label: 'New Evaluation' },
  { key: 'my-submissions', label: 'My Submissions' },
] as const;

export const PARTNER_WORKSPACE_VIEWS = [
  { key: 'partner-companies', label: 'Directory' },
  { key: 'document-register', label: 'Compliance Documents' },
  { key: 'supplier-ranking', label: 'Supplier Ranking' },
  { key: 'partners-feedback-hub', label: 'Partner Feedback' },
] as const;

export const EVALUATION_WORKSPACE_VIEWS = [
  { key: 'survey-forms', label: 'Forms' },
  { key: 'explorer', label: 'Responses' },
  { key: 'pending-review', label: 'Coverage' },
  { key: 'categories-manager', label: 'Category Labels' },
] as const;

export const REPORT_WORKSPACE_VIEWS = [
  { key: 'reports', label: 'Create Report' },
  { key: 'present', label: 'Presentations' },
  { key: 'export-history', label: 'Export History' },
] as const;

export const isPartnerWorkspacePage = (page: PageKey): page is typeof PARTNER_WORKSPACE_VIEWS[number]['key'] =>
  PARTNER_WORKSPACE_VIEWS.some((view) => view.key === page);

export const isEvaluationWorkspacePage = (page: string): page is typeof EVALUATION_WORKSPACE_VIEWS[number]['key'] =>
  EVALUATION_WORKSPACE_VIEWS.some((view) => view.key === page);

export const isReportWorkspacePage = (page: PageKey): page is typeof REPORT_WORKSPACE_VIEWS[number]['key'] =>
  REPORT_WORKSPACE_VIEWS.some((view) => view.key === page);

export interface NavigationBreadcrumb {
  label: string;
  page?: PageKey;
}

export interface PagePresentation {
  title: string;
  sidebarKey: PageKey;
  breadcrumbs: NavigationBreadcrumb[];
  description?: string;
}

interface PagePresentationOptions {
  isAdmin: boolean;
  editingSurveyId?: string | null;
  selectedSurveyTitle?: string;
  userDisplayName?: string;
}

const workspacePresentation = (
  moduleLabel: string,
  modulePage: PageKey,
  view: { key: PageKey; label: string },
): PagePresentation => ({
  title: view.label,
  sidebarKey: modulePage,
  breadcrumbs: [
    { label: moduleLabel, page: modulePage },
    { label: view.label },
  ],
});

export function getPagePresentation(
  page: PageKey,
  {
    isAdmin,
    editingSurveyId,
    selectedSurveyTitle,
    userDisplayName = 'User',
  }: PagePresentationOptions,
): PagePresentation {
  const partnerView = PARTNER_WORKSPACE_VIEWS.find((view) => view.key === page);
  if (isAdmin && partnerView) {
    return workspacePresentation('Partners', 'partner-companies', partnerView);
  }

  const evaluationView = EVALUATION_WORKSPACE_VIEWS.find((view) => view.key === page);
  if (isAdmin && evaluationView) {
    return workspacePresentation('Evaluations', 'survey-forms', evaluationView);
  }

  const reportView = REPORT_WORKSPACE_VIEWS.find((view) => view.key === page);
  if (isAdmin && reportView) {
    return workspacePresentation('Reports', 'reports', reportView);
  }

  if (page === 'dashboard') {
    return {
      title: 'Dashboard',
      sidebarKey: 'dashboard',
      breadcrumbs: [],
      description: `Welcome back, ${userDisplayName}.`,
    };
  }

  if (page === 'create-form') {
    const title = editingSurveyId ? 'Edit Evaluation Form' : 'Create Evaluation Form';
    return {
      title,
      sidebarKey: 'survey-forms',
      breadcrumbs: [
        { label: 'Evaluations', page: 'survey-forms' },
        { label: 'Forms', page: 'survey-forms' },
        { label: title },
      ],
    };
  }

  if (page === 'view-form') {
    const title = selectedSurveyTitle || 'Evaluation Details';
    return {
      title,
      sidebarKey: 'survey-forms',
      breadcrumbs: [
        { label: 'Evaluations', page: 'survey-forms' },
        { label: 'Forms', page: 'survey-forms' },
        { label: title },
      ],
    };
  }

  if (page === 'fill-form') {
    if (!isAdmin) {
      return { title: 'New Evaluation', sidebarKey: 'fill-form', breadcrumbs: [] };
    }
    return {
      title: 'New Evaluation',
      sidebarKey: 'survey-forms',
      breadcrumbs: [
        { label: 'Evaluations', page: 'survey-forms' },
        { label: 'New Evaluation' },
      ],
    };
  }

  const primaryTitle: Partial<Record<PageKey, string>> = {
    analytics: 'Analytics',
    'account-management': 'Users & Access',
    archive: 'Archive',
    'my-submissions': 'My Submissions',
    notifications: 'Notifications',
    'profile-settings': 'Profile',
    settings: 'Settings',
  };
  const title = primaryTitle[page] ?? 'Dashboard';
  return { title, sidebarKey: page, breadcrumbs: [] };
}
