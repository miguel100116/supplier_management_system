import type { PageKey } from '../navigation/navigationConfig';
import { PATHS } from '../routes/paths';

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  page: PageKey;
  children?: readonly NavigationItem[];
  end?: boolean;
  pinnedBottom?: boolean;
}

export const adminNav = [
  { id: 'dashboard', label: 'Dashboard', path: PATHS.admin.dashboard, page: 'dashboard' },
  {
    id: 'partners', label: 'Partners', path: PATHS.admin.partners.root, page: 'partner-companies',
    children: [
      { id: 'partner-directory', label: 'Directory', path: PATHS.admin.partners.root, page: 'partner-companies', end: true },
      { id: 'partner-documents', label: 'Documents', path: PATHS.admin.partners.documents, page: 'document-register' },
      { id: 'partner-feedback', label: 'Feedback', path: PATHS.admin.partners.feedback, page: 'partners-feedback-hub' },
    ],
  },
  {
    id: 'evaluations', label: 'Evaluations', path: PATHS.admin.evaluations.root, page: 'survey-forms',
    children: [
      { id: 'evaluation-workspace', label: 'Workspace', path: PATHS.admin.evaluations.workspace.root, page: 'survey-forms' },
      { id: 'evaluation-archive', label: 'Archive', path: PATHS.admin.evaluations.archive, page: 'archive' },
      { id: 'evaluation-import', label: 'Import Responses', path: PATHS.admin.evaluations.importResponses, page: 'import-evaluations' },
    ],
  },
  { id: 'analytics', label: 'Analytics', path: PATHS.admin.analytics, page: 'analytics' },
  {
    id: 'reports', label: 'Reports', path: PATHS.admin.reports.root, page: 'reports',
    children: [
      { id: 'report-generate', label: 'Generate', path: PATHS.admin.reports.generate, page: 'reports' },
      { id: 'report-present', label: 'Present', path: PATHS.admin.reports.present, page: 'present' },
      { id: 'report-history', label: 'Export History', path: PATHS.admin.reports.history, page: 'export-history' },
    ],
  },
  { id: 'users', label: 'Users', path: PATHS.admin.users.root, page: 'account-management' },
] as const satisfies readonly NavigationItem[];

export const employeeNav = [
  { id: 'employee-home', label: 'Home', path: PATHS.employee.home, page: 'dashboard' },
  { id: 'employee-evaluations', label: 'Assigned Evaluations', path: PATHS.employee.evaluations, page: 'fill-form' },
  { id: 'employee-submissions', label: 'My Submissions', path: PATHS.employee.submissions, page: 'my-submissions' },
  { id: 'employee-profile', label: 'Profile', path: PATHS.employee.profile, page: 'profile-settings' },
] as const satisfies readonly NavigationItem[];
