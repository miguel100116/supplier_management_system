import type { PageKey } from '../navigation/navigationConfig';
import { PATHS } from './paths';

export type RouteRole = 'public' | 'admin' | 'employee';

export interface AppRouteMatch {
  page: PageKey | null;
  role: RouteRole;
  params: {
    partnerId?: string;
    formId?: string;
    mode?: 'view' | 'edit' | 'fill';
  };
}

const route = (page: PageKey | null, role: RouteRole, params: AppRouteMatch['params'] = {}): AppRouteMatch => ({ page, role, params });
const pathnameOf = (value: string) => (value.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/');
const decodeSegment = (value: string) => {
  try { return decodeURIComponent(value); } catch { return value; }
};

const exactRoutes = new Map<string, AppRouteMatch>([
  [PATHS.login, route(null, 'public')],
  [PATHS.passwordRecovery, route(null, 'public')],
  [PATHS.admin.dashboard, route('dashboard', 'admin')],
  [PATHS.admin.partners.root, route('partner-companies', 'admin')],
  [PATHS.admin.partners.documents, route('document-register', 'admin')],
  [PATHS.admin.partners.documentExpiry, route('document-register', 'admin')],
  [PATHS.admin.partners.feedback, route('partners-feedback-hub', 'admin')],
  [PATHS.admin.evaluations.workspace.forms, route('survey-forms', 'admin')],
  [PATHS.admin.evaluations.workspace.newForm, route('create-form', 'admin')],
  [PATHS.admin.evaluations.workspace.responses, route('explorer', 'admin')],
  [PATHS.admin.evaluations.workspace.coverage, route('pending-review', 'admin')],
  [PATHS.admin.evaluations.workspace.categoryLabels, route('categories-manager', 'admin')],
  [PATHS.admin.evaluations.archive, route('archive', 'admin')],
  [PATHS.admin.evaluations.importResponses, route('import-evaluations', 'admin')],
  [PATHS.admin.analytics, route('analytics', 'admin')],
  [PATHS.admin.reports.generate, route('reports', 'admin')],
  [PATHS.admin.reports.present, route('present', 'admin')],
  [PATHS.admin.reports.history, route('export-history', 'admin')],
  [PATHS.admin.reports.builders.summary, route('reports', 'admin')],
  [PATHS.admin.reports.builders.partners, route('reports', 'admin')],
  [PATHS.admin.reports.builders.questions, route('reports', 'admin')],
  [PATHS.admin.reports.builders.executiveSummary, route('reports', 'admin')],
  [PATHS.admin.reports.export.rawData, route('reports', 'admin')],
  [PATHS.admin.users.root, route('account-management', 'admin')],
  [PATHS.admin.users.departmentAccess, route('account-management', 'admin')],
  [PATHS.admin.notifications, route('notifications', 'admin')],
  [PATHS.admin.settings, route('settings', 'admin')],
  [PATHS.employee.home, route('dashboard', 'employee')],
  [PATHS.employee.evaluations, route('fill-form', 'employee')],
  [PATHS.employee.submissions, route('my-submissions', 'employee')],
  [PATHS.employee.notifications, route('notifications', 'employee')],
  [PATHS.employee.profile, route('profile-settings', 'employee')],
]);

export const INDEX_REDIRECTS = new Map<string, string>([
  [PATHS.admin.root, PATHS.admin.dashboard],
  [PATHS.admin.evaluations.root, PATHS.admin.evaluations.workspace.root],
  [PATHS.admin.evaluations.workspace.root, PATHS.admin.evaluations.workspace.forms],
  [PATHS.admin.reports.root, PATHS.admin.reports.generate],
]);

interface LegacyRedirectTarget {
  admin: string;
  employee: string;
}

const forBoth = (path: string): LegacyRedirectTarget => ({ admin: path, employee: path });

// Legacy PageKey aliases. The former application did not expose URL routes;
// these aliases preserve bookmarks created from its state-navigation names.
// Keep this block self-contained so it can be removed after the transition.
export const LEGACY_REDIRECTS = new Map<string, LegacyRedirectTarget>([
  ['/dashboard', { admin: PATHS.admin.dashboard, employee: PATHS.employee.home }],
  ['/partner-companies', forBoth(PATHS.admin.partners.root)],
  ['/document-register', forBoth(PATHS.admin.partners.documents)],
  ['/supplier-ranking', forBoth(PATHS.admin.partners.root)],
  ['/partners-feedback-hub', forBoth(PATHS.admin.partners.feedback)],
  ['/survey-forms', { admin: PATHS.admin.evaluations.workspace.forms, employee: PATHS.employee.evaluations }],
  ['/explorer', forBoth(PATHS.admin.evaluations.workspace.responses)],
  ['/pending-review', forBoth(PATHS.admin.evaluations.workspace.coverage)],
  ['/categories-manager', forBoth(PATHS.admin.evaluations.workspace.categoryLabels)],
  ['/archive', forBoth(PATHS.admin.evaluations.archive)],
  ['/import-evaluations', forBoth(PATHS.admin.evaluations.importResponses)],
  ['/analytics', forBoth(PATHS.admin.analytics)],
  ['/reports', forBoth(PATHS.admin.reports.generate)],
  ['/present', forBoth(PATHS.admin.reports.present)],
  ['/export-history', forBoth(PATHS.admin.reports.history)],
  ['/account-management', forBoth(PATHS.admin.users.root)],
  ['/notifications', { admin: PATHS.admin.notifications, employee: PATHS.employee.notifications }],
  ['/settings', { admin: PATHS.admin.settings, employee: PATHS.employee.profile }],
  ['/create-form', forBoth(PATHS.admin.evaluations.workspace.newForm)],
  ['/view-form', forBoth(PATHS.admin.evaluations.workspace.forms)],
  ['/fill-form', { admin: PATHS.admin.evaluations.workspace.forms, employee: PATHS.employee.evaluations }],
  ['/my-submissions', { admin: PATHS.admin.dashboard, employee: PATHS.employee.submissions }],
  ['/profile-settings', { admin: PATHS.admin.settings, employee: PATHS.employee.profile }],
  ['/admin/partner-companies', forBoth(PATHS.admin.partners.root)],
  ['/admin/document-register', forBoth(PATHS.admin.partners.documents)],
  ['/admin/supplier-ranking', forBoth(PATHS.admin.partners.root)],
  ['/admin/partners-feedback-hub', forBoth(PATHS.admin.partners.feedback)],
  ['/admin/survey-forms', forBoth(PATHS.admin.evaluations.workspace.forms)],
  ['/admin/explorer', forBoth(PATHS.admin.evaluations.workspace.responses)],
  ['/admin/pending-review', forBoth(PATHS.admin.evaluations.workspace.coverage)],
  ['/admin/categories-manager', forBoth(PATHS.admin.evaluations.workspace.categoryLabels)],
  ['/admin/archive', forBoth(PATHS.admin.evaluations.archive)],
  ['/admin/import-evaluations', forBoth(PATHS.admin.evaluations.importResponses)],
  ['/admin/present', forBoth(PATHS.admin.reports.present)],
  ['/admin/export-history', forBoth(PATHS.admin.reports.history)],
  ['/admin/account-management', forBoth(PATHS.admin.users.root)],
  ['/employee/dashboard', { admin: PATHS.admin.dashboard, employee: PATHS.employee.home }],
  ['/employee/fill-form', { admin: PATHS.admin.dashboard, employee: PATHS.employee.evaluations }],
  ['/employee/my-submissions', { admin: PATHS.admin.dashboard, employee: PATHS.employee.submissions }],
  ['/employee/profile-settings', { admin: PATHS.admin.dashboard, employee: PATHS.employee.profile }],
]);

export function resolveAppRoute(value: string): AppRouteMatch | null {
  const pathname = pathnameOf(value);
  const exact = exactRoutes.get(pathname);
  if (exact) return exact;

  let match = pathname.match(/^\/admin\/partners\/([^/]+)$/);
  if (match) return route('partner-companies', 'admin', { partnerId: decodeSegment(match[1]) });

  match = pathname.match(/^\/admin\/evaluations\/workspace\/forms\/([^/]+)\/edit$/);
  if (match) return route('create-form', 'admin', { formId: decodeSegment(match[1]), mode: 'edit' });

  match = pathname.match(/^\/admin\/evaluations\/workspace\/forms\/([^/]+)$/);
  if (match) return route('view-form', 'admin', { formId: decodeSegment(match[1]), mode: 'view' });

  match = pathname.match(/^\/employee\/evaluations\/([^/]+)\/fill$/);
  if (match) return route('fill-form', 'employee', { formId: decodeSegment(match[1]), mode: 'fill' });

  return null;
}

export function getIndexRedirect(value: string) {
  return INDEX_REDIRECTS.get(pathnameOf(value)) ?? null;
}

export function getLegacyRedirect(value: string, isAdmin: boolean) {
  const target = LEGACY_REDIRECTS.get(pathnameOf(value));
  return target ? (isAdmin ? target.admin : target.employee) : null;
}

export function getRoleGuardRedirect(value: string, isAuthenticated: boolean, isAdmin: boolean) {
  const pathname = pathnameOf(value);
  if (!isAuthenticated) return pathname === PATHS.login || pathname === PATHS.passwordRecovery ? null : PATHS.login;
  if (pathname === PATHS.login || pathname === PATHS.passwordRecovery) return isAdmin ? PATHS.admin.dashboard : PATHS.employee.home;
  if (pathname.startsWith('/admin/') || pathname === PATHS.admin.root) return isAdmin ? null : PATHS.employee.home;
  if (pathname.startsWith('/employee/')) return isAdmin ? PATHS.admin.dashboard : null;
  return isAdmin ? PATHS.admin.dashboard : PATHS.employee.home;
}

export function getPagePath(page: PageKey, isAdmin: boolean, formId?: string) {
  if (!isAdmin) {
    const employeePaths: Partial<Record<PageKey, string>> = {
      dashboard: PATHS.employee.home,
      'fill-form': formId ? PATHS.employee.fillEvaluation(formId) : PATHS.employee.evaluations,
      'my-submissions': PATHS.employee.submissions,
      notifications: PATHS.employee.notifications,
      'profile-settings': PATHS.employee.profile,
    };
    return employeePaths[page] ?? PATHS.employee.home;
  }

  const adminPaths: Partial<Record<PageKey, string>> = {
    dashboard: PATHS.admin.dashboard,
    'partner-companies': PATHS.admin.partners.root,
    'document-register': PATHS.admin.partners.documents,
    'partners-feedback-hub': PATHS.admin.partners.feedback,
    'survey-forms': PATHS.admin.evaluations.workspace.forms,
    explorer: PATHS.admin.evaluations.workspace.responses,
    'pending-review': PATHS.admin.evaluations.workspace.coverage,
    'categories-manager': PATHS.admin.evaluations.workspace.categoryLabels,
    archive: PATHS.admin.evaluations.archive,
    'import-evaluations': PATHS.admin.evaluations.importResponses,
    analytics: PATHS.admin.analytics,
    reports: PATHS.admin.reports.generate,
    present: PATHS.admin.reports.present,
    'export-history': PATHS.admin.reports.history,
    'account-management': PATHS.admin.users.root,
    notifications: PATHS.admin.notifications,
    settings: PATHS.admin.settings,
    'create-form': formId ? PATHS.admin.evaluations.workspace.editForm(formId) : PATHS.admin.evaluations.workspace.newForm,
    'view-form': formId ? PATHS.admin.evaluations.workspace.form(formId) : PATHS.admin.evaluations.workspace.forms,
    'fill-form': formId ? PATHS.admin.evaluations.workspace.form(formId) : PATHS.admin.evaluations.workspace.forms,
  };
  return adminPaths[page] ?? PATHS.admin.dashboard;
}
