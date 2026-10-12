export type PageKey =
  | 'login'
  | 'dashboard'
  | 'partner-companies'
  | 'document-register'
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

export type PageNavigationMode = 'push' | 'replace';

export function getPageNavigationMode(currentPage: PageKey, targetPage: PageKey): PageNavigationMode {
  return currentPage === targetPage ? 'replace' : 'push';
}

export function shouldConfirmSurveySwitch(
  currentPage: PageKey,
  targetPage: PageKey,
  currentSurveyId: string | null,
  nextSurveyId: string | null,
): boolean {
  return currentPage === 'fill-form' && targetPage === 'fill-form' && currentSurveyId !== nextSurveyId;
}

const PAGE_KEYS = new Set<PageKey>([
  'login',
  'dashboard',
  'partner-companies',
  'document-register',
  'partners-feedback-hub',
  'account-management',
  'survey-forms',
  'analytics',
  'present',
  'explorer',
  'reports',
  'notifications',
  'create-form',
  'view-form',
  'fill-form',
  'archive',
  'import-evaluations',
  'my-submissions',
  'profile-settings',
  'pending-review',
  'export-history',
  'settings',
  'categories-manager',
]);

const PAGE_PATH_SEGMENTS: Record<PageKey, string> = {
  login: 'login',
  dashboard: 'dashboard',
  'partner-companies': 'partners',
  'document-register': 'document-tracker',
  'partners-feedback-hub': 'feedback-hub',
  'account-management': 'employees-users',
  'survey-forms': 'evaluation-workspace',
  archive: 'archive-center',
  'import-evaluations': 'import-evaluation-responses',
  'categories-manager': 'evaluation-settings',
  analytics: 'analytics',
  present: 'present-mode',
  explorer: 'explorer',
  reports: 'generate-report',
  notifications: 'notifications',
  'create-form': 'create-form',
  'view-form': 'view-form',
  'fill-form': 'fill-form',
  'my-submissions': 'my-submissions',
  'profile-settings': 'profile-settings',
  'pending-review': 'pending-review',
  'export-history': 'export-history',
  settings: 'settings',
};

const PAGE_KEYS_BY_PATH_SEGMENT = new Map(
  Object.entries(PAGE_PATH_SEGMENTS).map(([page, segment]) => [segment, page as PageKey]),
);

function normalizeBasePath(basePath: string): string {
  const segments = basePath.split('/').filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '';
}

export function getPagePathname(page: PageKey, basePath = ''): string {
  return `${normalizeBasePath(basePath)}/${PAGE_PATH_SEGMENTS[page]}`;
}

export function getPageKeyFromPathname(pathname: string, basePath = ''): PageKey {
  const normalizedBasePath = normalizeBasePath(basePath);
  let routePathname = pathname;

  if (normalizedBasePath) {
    if (pathname === normalizedBasePath || pathname === `${normalizedBasePath}/`) return 'dashboard';
    if (!pathname.startsWith(`${normalizedBasePath}/`)) return 'dashboard';
    routePathname = pathname.slice(normalizedBasePath.length);
  }

  const segments = routePathname.split('/').filter(Boolean);
  if (segments.length !== 1) return 'dashboard';

  const segment = segments[0];
  const canonicalPage = PAGE_KEYS_BY_PATH_SEGMENT.get(segment);
  if (canonicalPage) return canonicalPage;
  return PAGE_KEYS.has(segment as PageKey) ? segment as PageKey : 'dashboard';
}
