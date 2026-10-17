import { lazy, Suspense, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, FileText, LayoutDashboard, Moon, Sun, FilePlus, ClipboardCheck, ArrowLeft, Clock3, LogOut, ShieldAlert, Users, UserCog, ClipboardList, X } from 'lucide-react';
import { EvaluationWorkspace, isEvaluationWorkspacePage } from './features/evaluations/components/EvaluationWorkspace';
import { AccountMenu } from './components/AccountMenu';
import { NotificationBell } from './components/NotificationBell';
import { EmployeeNotificationBell } from './components/EmployeeNotificationBell';
import { Shell, NavItem } from './layouts/Shell';
import { LoginPage, MicrosoftAuth } from './pages/LoginPage';
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage';
import { restoreMicrosoftAccount, logoutMicrosoft, isMsalConfigured } from './services/msalAuth';
import { signIntoSupabaseWithMicrosoft, signOutSupabase } from './services/authBridge';
import { isSupabaseConfigured, supabase } from './services/supabaseClient';
import { getSupabaseSessionEmail } from './services/supabasePasswordAuth';
import {
  APPLICATION_PROFILES_CHANGED_EVENT,
  APPLICATION_RECORD_CHANGED_EVENT,
  type ApplicationRecordType,
  loadApplicationRecords,
  loadProfiles,
  replaceApplicationRecords,
  replaceProfiles,
  subscribeToApplicationChanges,
  type PersistedProfile,
} from './services/applicationRepository';
import { hydrateChangedSharedStore, hydrateSharedClientStores } from './services/sharedStoreHydration';
import { isOfficialAnalyticsResponse } from './features/analytics/domain/responseProvenance';
import type { SurveyFillerHandle } from './pages/SurveyFillerPage';
import { logAdminActivity } from './utils/adminActivityLog';
import { useSurveyData } from './hooks/useSurveyData';
import { applyFilters, initialFilters } from './utils/analytics';
import { FilterState, SurveyType, CustomForm, SurveyResponse } from './types/survey';
import { PageModuleKey, getDefaultPermissions, getEffectiveSurveyTypes, hasPageAccess, getDepartmentDefaultPermissions } from './utils/rbac';
import { clearSessionActivity, recordSessionActivity, useIdleSessionTimeout } from './hooks/useIdleSessionTimeout';
import { formatSessionTimeRemaining } from './utils/sessionTimeout';
import { useModalEscape } from './hooks/useModalEscape';
import { adminNav, employeeNav, type NavigationItem } from './config/navigation';
import {
  getPagePresentation,
  type PageKey,
} from './navigation/navigationConfig';
import { getIndexRedirect, getPagePath, getRoleGuardRedirect, resolveAppRoute } from './routes/appRouter';
import { PATHS } from './routes/paths';

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(({ AnalyticsPage }) => ({ default: AnalyticsPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })));
const NotificationLogsPage = lazy(() => import('./pages/NotificationLogsPage').then(({ NotificationLogsPage }) => ({ default: NotificationLogsPage })));
const EmployeeNotificationLogsPage = lazy(() => import('./pages/EmployeeNotificationLogsPage').then(({ EmployeeNotificationLogsPage }) => ({ default: EmployeeNotificationLogsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(({ ReportsPage }) => ({ default: ReportsPage })));
const SurveyExplorerPage = lazy(() => import('./pages/SurveyExplorerPage').then(({ SurveyExplorerPage }) => ({ default: SurveyExplorerPage })));
const CreateSurveyPage = lazy(() => import('./pages/CreateSurveyPage').then(({ CreateSurveyPage }) => ({ default: CreateSurveyPage })));
const SurveyDetailsPage = lazy(() => import('./pages/SurveyDetailsPage').then(({ SurveyDetailsPage }) => ({ default: SurveyDetailsPage })));
const SurveyFillerPage = lazy(() => import('./pages/SurveyFillerPage').then(({ SurveyFillerPage }) => ({ default: SurveyFillerPage })));
const PartnerCompaniesPage = lazy(() => import('./pages/PartnerCompaniesPage').then(({ PartnerCompaniesPage }) => ({ default: PartnerCompaniesPage })));
const DocumentRegisterPage = lazy(() => import('./pages/DocumentRegisterPage').then(({ DocumentRegisterPage }) => ({ default: DocumentRegisterPage })));
const SupplierRankingPage = lazy(() => import('./pages/SupplierRankingPage').then(({ SupplierRankingPage }) => ({ default: SupplierRankingPage })));
const SurveyFormsPage = lazy(() => import('./pages/SurveyFormsPage').then(({ SurveyFormsPage }) => ({ default: SurveyFormsPage })));
const PresentPage = lazy(() => import('./pages/PresentPage').then(({ PresentPage }) => ({ default: PresentPage })));
const ArchivePage = lazy(() => import('./pages/ArchivePage').then(({ ArchivePage }) => ({ default: ArchivePage })));
const ImportEvaluationsPage = lazy(() => import('./pages/ImportEvaluationsPage').then(({ ImportEvaluationsPage }) => ({ default: ImportEvaluationsPage })));
const AccountManagementPage = lazy(() => import('./pages/AccountManagementPage').then(({ AccountManagementPage }) => ({ default: AccountManagementPage })));
const PartnersFeedbackHubPage = lazy(() => import('./pages/PartnersFeedbackHubPage').then(({ PartnersFeedbackHubPage }) => ({ default: PartnersFeedbackHubPage })));
const MySubmissionsPage = lazy(() => import('./pages/MySubmissionsPage').then(({ MySubmissionsPage }) => ({ default: MySubmissionsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(({ ProfilePage }) => ({ default: ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage })));
const OutstandingEvaluationsPage = lazy(() => import('./pages/OutstandingEvaluationsPage').then(({ OutstandingEvaluationsPage }) => ({ default: OutstandingEvaluationsPage })));
const ExportHistoryPage = lazy(() => import('./pages/ExportHistoryPage').then(({ ExportHistoryPage }) => ({ default: ExportHistoryPage })));
const CategoriesManagerPage = lazy(() => import('./pages/CategoriesManagerPage').then(({ CategoriesManagerPage }) => ({ default: CategoriesManagerPage })));

// Shared by userAccessibleResponses/userAccessibleAllTimeResponses below - the
// same role/department/survey-type scoping rule applied to either the
// active-only response list or the active+archived merged list, so a user's
// visibility rules don't drift between "Current" and "All-Time" data scope.
function applyAccessFilter(
  list: SurveyResponse[],
  profile: { email: string; role: string; designation: string; department: string } | null,
  effectiveSurveyTypes: SurveyType[],
  activePage: string
): SurveyResponse[] {
  if (!profile) return [];
  if (activePage === 'analytics') {
    return list; // Analytics remains company-wide for all users
  }

  if (profile.role === 'Admin' || profile.designation === 'Executive' || profile.designation === 'Director') {
    return list.filter((r) => effectiveSurveyTypes.includes(r.surveyType));
  }

  if (profile.designation === 'Supervisory') {
    return list.filter((r) => r.department === profile.department && effectiveSurveyTypes.includes(r.surveyType));
  }

  if (profile.designation === 'Rank & File') {
    return list.filter((r) => r.respondentEmail === profile.email && effectiveSurveyTypes.includes(r.surveyType));
  }

  return list.filter((r) => effectiveSurveyTypes.includes(r.surveyType));
}

export type AccountProfile = PersistedProfile;

interface PersistedDepartmentPermission {
  department: string;
  pages: PageModuleKey[];
  surveyTypes: SurveyType[];
}

// Real system administrators. Any @mgenesis.com Microsoft account listed here
// is recognized as Admin the moment it signs in, even before an accounts row
// exists for it - so the first admins are never locked out on a fresh system.
// Keep this in sync with supabase/seed_admins.sql (the server-side source of
// truth once RLS enforcement is fully wired).
const BOOTSTRAP_ADMIN_EMAILS = [
  'sheanne.cahinhinan@mgenesis.com',
  'presshel.escleto@mgenesis.com',
];

const BOOTSTRAP_ADMIN_ACCOUNTS: AccountProfile[] = BOOTSTRAP_ADMIN_EMAILS.map((email) => ({
  email,
  role: 'Admin',
  designation: 'Executive',
  department: 'Business Solutions Manager',
}));

const DEFAULT_ACCOUNTS: AccountProfile[] = [...BOOTSTRAP_ADMIN_ACCOUNTS];

const navigationIcons = {
  dashboard: LayoutDashboard,
  partners: Users,
  evaluations: ClipboardCheck,
  analytics: BarChart3,
  reports: FileText,
  users: UserCog,
  notifications: Clock3,
  settings: UserCog,
  'employee-home': LayoutDashboard,
  'employee-evaluations': FilePlus,
  'employee-submissions': ClipboardList,
  'employee-notifications': Clock3,
  'employee-profile': UserCog,
} as const;

const buildNavItems = (items: readonly NavigationItem[]): NavItem<PageKey>[] => items.map((item) => {
  const icon = navigationIcons[item.id as keyof typeof navigationIcons] ?? LayoutDashboard;
  if (item.children) {
    return {
      type: 'group',
      id: item.id,
      label: item.label,
      path: item.path,
      icon,
      children: item.children.map((child) => ({
        key: child.page,
        label: child.label,
        path: child.path,
        end: child.end,
      })),
    };
  }
  return {
    key: item.page,
    label: item.label,
    path: item.path,
    end: item.end,
    pinnedBottom: item.pinnedBottom,
    icon,
  };
});

const adminNavItems = buildNavItems(adminNav);
const employeeNavItems = buildNavItems(employeeNav);

const allSurveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const getBrowserPath = () => `${window.location.pathname}${window.location.search}`;

export default function App() {
  const [accountPersistenceError, setAccountPersistenceError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => {
    if (typeof window === 'undefined') return false;
    const hashType = new URLSearchParams(window.location.hash.slice(1)).get('type');
    const queryType = new URLSearchParams(window.location.search).get('type');
    return window.location.pathname === PATHS.passwordRecovery || hashType === 'recovery' || queryType === 'recovery';
  });
  // Gates the first paint until we've asked MSAL whether a real signed-in
  // account exists, so we never flash the app before auth is verified.
  const [authChecked, setAuthChecked] = useState(() => !isSupabaseConfigured && !isMsalConfigured());

  const handleLogout = useCallback(() => {
    if (account) clearSessionActivity(account);
    setAccount(null);
    localStorage.removeItem('user_account');
    void signOutSupabase();
    void logoutMicrosoft();
  }, [account]);

  const {
    isWarningVisible: isSessionWarningVisible,
    remainingMs: sessionRemainingMs,
    staySignedIn,
    signOutNow,
  } = useIdleSessionTimeout({
    userEmail: account,
    enabled: authChecked && Boolean(account),
    onTimeout: handleLogout,
  });

  // 'current' = active period only (today's default, unchanged behavior).
  // 'all-time' = active + every archived period combined, so multi-year
  // company trends accumulate across resets instead of blanking out each time
  // a survey period is archived. 'custom' = only the archived series picked
  // in selectedSeriesIds. Shared across Dashboard/Analytics so switching in
  // one keeps the other consistent (Dashboard doesn't offer 'custom' itself
  // and falls back to 'current' if it's ever selected elsewhere).
  const [dataScope, setDataScope] = useState<'current' | 'all-time' | 'custom'>('current');
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>([]);

  // Accounts Management State
  const [accounts, setAccounts] = useState<AccountProfile[]>(() => {
    // One-time cleanup of stale browser-only data from older builds.
    if (localStorage.getItem('legacy_frontend_data_removed_v1') !== 'true') {
      localStorage.removeItem('survey_accounts_v1');
      localStorage.removeItem('survey_analytics_responses');
      localStorage.removeItem('survey_analytics_responses_v4');
      localStorage.removeItem('survey_analytics_responses_v5');
      localStorage.removeItem('survey_analytics_responses_v6');
      localStorage.removeItem('survey_analytics_full_dataset_active');
      localStorage.removeItem('survey_sim_clock_v1');
      localStorage.removeItem('partner_feedback_contacts_v2');
      localStorage.setItem('legacy_frontend_data_removed_v1', 'true');
    }
    // When Supabase is configured, profiles are the shared source of truth
    // loaded after sign-in via loadProfiles(). Never seed from localStorage
    // here - stale local accounts would show wrong roles/permissions until
    // the Supabase fetch completes, causing inconsistent access behaviour.
    if (isSupabaseConfigured) {
      localStorage.removeItem('survey_accounts_v1');
      return [];
    }
    const saved = localStorage.getItem('survey_accounts_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_ACCOUNTS;
      }
    }
    return DEFAULT_ACCOUNTS;
  });

  const saveAccounts = (newAccounts: AccountProfile[]) => {
    setAccounts(newAccounts);
    if (!isSupabaseConfigured) {
      localStorage.setItem('survey_accounts_v1', JSON.stringify(newAccounts));
    }
    if (isSupabaseConfigured) {
      setAccountPersistenceError(null);
      void replaceProfiles(newAccounts).catch((saveError) => {
        setAccountPersistenceError(saveError instanceof Error ? saveError.message : 'Unable to save accounts to Supabase.');
      });
    }
    logAdminActivity('Updated employee accounts', `${newAccounts.length} account${newAccounts.length === 1 ? '' : 's'} on file`);
  };

  const [departmentPermissions, setDepartmentPermissions] = useState<Record<string, { pages: PageModuleKey[]; surveyTypes: SurveyType[] }>>(() => {
    // When Supabase is configured, department permissions are loaded from
    // application_records after sign-in. Don't seed from localStorage to
    // avoid stale permissions showing before the remote fetch completes.
    if (isSupabaseConfigured) {
      localStorage.removeItem('survey_department_permissions_v1');
      return {};
    }
    const saved = localStorage.getItem('survey_department_permissions_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const saveDepartmentPermissions = (newPerms: Record<string, { pages: PageModuleKey[]; surveyTypes: SurveyType[] }>) => {
    setDepartmentPermissions(newPerms);
    if (!isSupabaseConfigured) {
      localStorage.setItem('survey_department_permissions_v1', JSON.stringify(newPerms));
    }
    if (isSupabaseConfigured) {
      const records = Object.entries(newPerms).map(([department, permissions]) => ({ department, ...permissions }));
      setAccountPersistenceError(null);
      void replaceApplicationRecords('department_permission', records, (record) => record.department).catch((saveError) => {
        setAccountPersistenceError(saveError instanceof Error ? saveError.message : 'Unable to save department permissions to Supabase.');
      });
    }
    logAdminActivity('Updated department permissions');
  };

  const getUserProfile = (email: string | null) => {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const matched = accounts.find((acc) => acc.email.trim().toLowerCase() === normalized);
    if (matched) return matched;
    // Bootstrap admins are always Admin, even if no accounts row exists yet.
    if (BOOTSTRAP_ADMIN_EMAILS.includes(normalized)) {
      return {
        email: normalized,
        role: 'Admin',
        designation: 'Executive',
        department: 'Business Solutions Manager',
      };
    }
    return {
      email: normalized,
      role: 'Employee',
      designation: 'Rank & File',
      department: 'Logistics'
    };
  };

  const profile = useMemo(() => getUserProfile(account), [account, accounts]);

  // centralize user permissions mapping based on active profile and overrides
  const userPermissions = useMemo(() => {
    if (!profile) return { pages: [] as PageModuleKey[], surveyTypes: [] as SurveyType[] };
    
    // The persisted Admin role always has full access. Ignore stale account
    // overrides so they cannot narrow an administrator's modules or data.
    if (profile.role === 'Admin') {
      return {
        pages: [
          'dashboard', 'survey-forms', 'explorer', 'analytics', 'reports', 'present',
          'partner-companies', 'document-register', 'renew-documents', 'supplier-ranking', 'partners-feedback-hub', 'account-management', 'notifications', 'archive', 'import-evaluations',
        ] as PageModuleKey[],
        surveyTypes: ['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]
      };
    }

    const defaults = getDefaultPermissions(profile.designation, profile.department);
    const userPages = (profile.permissions?.pages ?? defaults.pages) as PageModuleKey[];
    const userSurveyTypes = (profile.permissions?.surveyTypes ?? defaults.surveyTypes) as SurveyType[];

    const deptPerms = departmentPermissions[profile.department] || getDepartmentDefaultPermissions(profile.department);
    return {
      pages: userPages.filter(p => deptPerms.pages.includes(p)) as PageModuleKey[],
      surveyTypes: userSurveyTypes.filter(t => deptPerms.surveyTypes.includes(t)) as SurveyType[]
    };
  }, [profile, departmentPermissions]);

  // Only the persisted system role confers administrator privileges. Page
  // permissions may expose a destination, but must never elevate a user to
  // unrestricted navigation, data, or administrative actions.
  const isAdmin = profile?.role === 'Admin';
  // Assignable independently of full Admin - lets a role be granted document
  // renewal rights (Partner Companies + Document Register) without also
  // granting Account Management / full system access.
  const canRenewDocuments = isAdmin || userPermissions.pages.includes('renew-documents');

  const {
    responses,
    archivedResponses,
    archiveSeries,
    renameArchiveSeries,
    archiveResponsesForSurveys,
    restoreResponseGroup,
    restoreResponsesForSurvey,
    deleteArchivedResponseGroups,
    restoreArchivedResponseGroups,
    importArchivedResponses,
    previewRawEvaluations,
    commitRawEvaluationsBatch,
    surveys,
    questions,
    companies,
    partnerCompanies,
    addPartnerCompany,
    updatePartnerCompany,
    updatePartnerCompaniesBulk,
    updatePartnerDocument,
    removePartnerCompany,
    previewMasterListImport,
    commitMasterListImport,
    isLoading,
    isRefreshing,
    error,
    notifications,
    unreadCount,
    unreadNotificationIds,
    markNotificationsRead,
    markNotificationRead,
    markNotificationUnread,
    createSurvey,
    updateSurvey,
    updateSurveysBulk,
    deleteSurvey,
    submitResponse,
    categoryLabels,
    renameCategory,
    restoreDefaultCategories,
    resetAllData,
  } = useSurveyData(accounts, account, isAdmin);

  const [currentPath, setCurrentPath] = useState(getBrowserPath);
  const [activePage, setActivePage] = useState<PageKey>(() => resolveAppRoute(getBrowserPath())?.page ?? 'dashboard');
  const pageHistoryRef = useRef<Array<{ page: PageKey; path: string }>>([]);
  const [isSupabaseHydrating, setIsSupabaseHydrating] = useState(isSupabaseConfigured);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  useModalEscape(isNotificationModalOpen, () => setIsNotificationModalOpen(false), 9999);
  useModalEscape(isSettingsModalOpen, () => setIsSettingsModalOpen(false), 200);
  useModalEscape(isSessionWarningVisible, staySignedIn, 300);

  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const surveyFillerRef = useRef<SurveyFillerHandle>(null);

  // Any navigation away from the survey-filling page (sidebar Home logo, a
  // top-level nav item, or picking a different survey from the sidebar
  // dropdown) should go through this, so an in-progress evaluation can warn
  // the respondent and offer to save a draft instead of silently discarding
  // their answers.
  const navigateFrom = (targetPage: PageKey, run: () => void) => {
    if (activePage === 'fill-form' && targetPage !== 'fill-form' && surveyFillerRef.current) {
      surveyFillerRef.current.attemptExit(run);
    } else {
      run();
    }
  };

  const setBrowserPath = useCallback((path: string, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', path);
    setCurrentPath(path);
  }, []);

  const navigateTo = (targetPage: PageKey, explicitPath?: string) => {
    const targetPath = explicitPath ?? getPagePath(targetPage, Boolean(isAdmin), selectedSurveyId ?? editingSurveyId ?? undefined);
    if (targetPage === activePage && targetPath === currentPath) return;

    navigateFrom(targetPage, () => {
      pageHistoryRef.current.push({ page: activePage, path: currentPath });
      setActivePage(targetPage);
      setBrowserPath(targetPath);
    });
  };

  const navigatePath = (path: string) => {
    const match = resolveAppRoute(path);
    if (match?.page) navigateTo(match.page, path);
  };

  const resetNavigationTo = (targetPage: PageKey, explicitPath?: string) => {
    pageHistoryRef.current = [];
    setActivePage(targetPage);
    setBrowserPath(explicitPath ?? getPagePath(targetPage, Boolean(isAdmin)), true);
  };

  const goToPreviousPage = (fallbackPage?: PageKey) => {
    const previous = pageHistoryRef.current.at(-1)
      ?? (fallbackPage ? { page: fallbackPage, path: getPagePath(fallbackPage, Boolean(isAdmin)) } : null);
    if (!previous || (previous.page === activePage && previous.path === currentPath)) return;

    navigateFrom(previous.page, () => {
      if (pageHistoryRef.current.at(-1) === previous) {
        pageHistoryRef.current.pop();
      }
      setActivePage(previous.page);
      setBrowserPath(previous.path, true);
    });
  };
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);

  // Deep-link into Partner Companies' detail/edit panel for one specific
  // company (e.g. from a notification click-through).
  const [focusCompanyId, setFocusCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(getBrowserPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!authChecked || isPasswordRecovery || (isSupabaseConfigured && isSupabaseHydrating && account)) return;

    const guardedPath = getRoleGuardRedirect(currentPath, Boolean(account), Boolean(isAdmin));
    const redirectedPath = guardedPath ?? getIndexRedirect(currentPath);
    if (redirectedPath && redirectedPath !== currentPath) {
      setBrowserPath(redirectedPath, true);
      return;
    }
    if (!account) return;

    const match = resolveAppRoute(currentPath);
    if (!match?.page) return;
    setActivePage(match.page);
    if (match.params.partnerId) setFocusCompanyId(match.params.partnerId);
    if (match.params.formId) setSelectedSurveyId(match.params.formId);
    if (match.params.mode === 'edit') setEditingSurveyId(match.params.formId ?? null);
    if (match.page === 'create-form' && match.params.mode !== 'edit') setEditingSurveyId(null);
  }, [account, authChecked, currentPath, isAdmin, isPasswordRecovery, isSupabaseHydrating, setBrowserPath]);

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [darkMode, setDarkMode] = useState(false);

  const handleResetAllData = () => {
    logAdminActivity('Cleared local frontend cache');
    resetAllData();
  };

  // A survey's own "Department / Role Access" checkboxes (set via Survey Forms > Modify)
  // are the source of truth for who can see & answer that specific form. If a survey has
  // been explicitly shared with someone's department + rank, that alone should be enough
  // to unlock it for them - they shouldn't also need a separate category checkbox flipped
  // in Account Management. This computes which survey categories have been unlocked for
  // the current user purely through form-level access grants.
  const formGrantedSurveyTypes = useMemo(() => {
    const set = new Set<SurveyType>();
    if (!profile || profile.role === 'Admin') return set;
    surveys.forEach((survey) => {
      if (survey.status === 'Archived') return;
      const departmentAccess = survey.accessDepartments;
      const roleAccess = survey.accessRoles;
      const allowsDepartment = !departmentAccess?.length || departmentAccess.includes(profile.department);
      const allowsRole = !roleAccess?.length || roleAccess.includes(profile.designation as any);
      if (allowsDepartment && allowsRole) set.add(survey.surveyType);
    });
    return set;
  }, [surveys, profile]);

  // Effective survey type access = whatever Account Management grants, PLUS whatever
  // any individual survey's own access settings grant. This is a union (additive) so it
  // never revokes what Account Management already allows - it only extends access when
  // an admin explicitly shares a specific form with a department/role.
  const effectiveSurveyTypes = useMemo<SurveyType[]>(() => {
    return getEffectiveSurveyTypes(userPermissions.surveyTypes);
  }, [userPermissions.surveyTypes]);

  const canExport = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'Admin' || profile.designation !== 'Rank & File';
  }, [profile]);

  // Centralized Data Isolation & Filtering based on user department/rank/permitted types
  const userAccessibleResponses = useMemo(
    () => applyAccessFilter(responses, profile, effectiveSurveyTypes, activePage),
    [responses, profile, effectiveSurveyTypes, activePage]
  );

  // The same active responses merged with every archived period, still
  // scoped by the same role/department rules - this is the "All-Time" data
  // source. Archived responses never overlap with active ones (archiving
  // just flips a flag on the same row, see useSurveyData.ts), so this concat
  // is a safe, dedup-free union of the full history.
  const historyResponsesRaw = useMemo(() => [...responses, ...archivedResponses], [responses, archivedResponses]);
  const userAccessibleAllTimeResponses = useMemo(
    () => applyAccessFilter(historyResponsesRaw, profile, effectiveSurveyTypes, activePage),
    [historyResponsesRaw, profile, effectiveSurveyTypes, activePage]
  );
  // Archived responses belonging to the series picked in the Analytics
  // "Custom" scope. Series only exist on archived rows (stamped at archive
  // time), so this never includes anything from the current/active period.
  const customScopedResponsesRaw = useMemo(
    () => (selectedSeriesIds.length ? historyResponsesRaw.filter((r) => r.seriesId && selectedSeriesIds.includes(r.seriesId)) : []),
    [historyResponsesRaw, selectedSeriesIds]
  );
  const userAccessibleCustomResponses = useMemo(
    () => applyAccessFilter(customScopedResponsesRaw, profile, effectiveSurveyTypes, activePage),
    [customScopedResponsesRaw, profile, effectiveSurveyTypes, activePage]
  );
  // Whichever of the three the current toggle selects - this is what most
  // scope-aware pages (Dashboard/Reports/Present/Explorer) should consume.
  const scopedAccessibleResponses =
    dataScope === 'all-time' ? userAccessibleAllTimeResponses :
    dataScope === 'custom' ? userAccessibleCustomResponses :
    userAccessibleResponses;

  const userAccessibleAllResponses = useMemo(() => {
    if (!profile) return [];
    if (activePage === 'analytics') {
      return responses;
    }

    if (profile.role === 'Admin' || profile.designation === 'Executive' || profile.designation === 'Director') {
      return responses.filter(r => effectiveSurveyTypes.includes(r.surveyType));
    }

    if (profile.designation === 'Supervisory') {
      return responses.filter(r => 
        r.department === profile.department && 
        effectiveSurveyTypes.includes(r.surveyType)
      );
    }

    if (profile.designation === 'Rank & File') {
      return responses.filter(r => 
        r.respondentEmail === profile.email && 
        effectiveSurveyTypes.includes(r.surveyType)
      );
    }

    return responses.filter(r => effectiveSurveyTypes.includes(r.surveyType));
  }, [responses, profile, effectiveSurveyTypes, activePage]);

  const userAccessibleSurveys = useMemo(() => {
    return surveys.filter((survey) => {
      if (!profile || profile.role === 'Admin') return true;
      if (!effectiveSurveyTypes.includes(survey.surveyType)) return false;

      const departmentAccess = survey.accessDepartments;
      const roleAccess = survey.accessRoles;
      const allowsDepartment = !departmentAccess?.length || departmentAccess.includes(profile.department);
      const allowsRole = !roleAccess?.length || roleAccess.includes(profile.designation as any);
      return allowsDepartment && allowsRole;
    });
  }, [surveys, effectiveSurveyTypes, profile]);

  const userAccessiblePartnerCompanies = useMemo(() => {
    // Uncategorized companies (pending review, no assigned survey type) are
    // never accessible here — same behavior as before this type existed.
    // Archived companies are excluded too: every page fed by
    // this list (dashboard stats, reports, presentation, feedback hub) should
    // only ever see the live registry, matching the Partner Registry's own
    // Active tab.
    return partnerCompanies.filter(c => !c.isArchived && effectiveSurveyTypes.some(t => t === c.type));
  }, [partnerCompanies, effectiveSurveyTypes]);

  const filteredResponses = useMemo(() => applyFilters(scopedAccessibleResponses, filters), [scopedAccessibleResponses, filters]);
  const officialAnalyticsResponses = useMemo(
    () => scopedAccessibleResponses.filter(isOfficialAnalyticsResponse),
    [scopedAccessibleResponses],
  );
  const analyticsFilteredResponses = useMemo(
    () => applyFilters(officialAnalyticsResponses, filters),
    [officialAnalyticsResponses, filters],
  );
  
  const activeSurveyTypes = filters.surveyType.length ? filters.surveyType : effectiveSurveyTypes;


  const visiblePages = useMemo<NavItem<PageKey>[]>(() => {
    const items = isAdmin ? adminNavItems : employeeNavItems;
    return items.map((item) => item.type === 'group'
      ? {
          ...item,
          children: item.children.map((child) => ({
            ...child,
            disabled: !hasPageAccess(userPermissions.pages, child.key, isAdmin),
          })),
        }
      : {
          ...item,
          disabled: !hasPageAccess(userPermissions.pages, item.key, isAdmin),
        });
  }, [isAdmin, userPermissions.pages]);

  // Flattened lookup (groups expanded) used by the route-guard fallback.
  const flatNavLeaves = useMemo(
    () =>
      visiblePages.flatMap((item) =>
        item.type === 'group' ? item.children.map((child) => ({ key: child.key, label: child.label })) : [{ key: item.key, label: item.label }]
      ),
    [visiblePages]
  );

  const namePart = profile?.email ? profile.email.split('@')[0] : 'User';
  const userDisplayName = namePart
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'User';
  const selectedSurveyTitle = surveys.find((survey) => survey.id === selectedSurveyId)?.title;
  const pagePresentation = getPagePresentation(activePage, {
    isAdmin,
    editingSurveyId,
    selectedSurveyTitle,
    userDisplayName,
  });
  // Safe routing guard redirecting users to permitted views
  useEffect(() => {
    if (!account) return;
    const currentIsAllowed = hasPageAccess(userPermissions.pages, activePage, isAdmin);
    if (!currentIsAllowed) {
      const fallback = flatNavLeaves.find(page => hasPageAccess(userPermissions.pages, page.key, isAdmin))?.key || 'dashboard';
      resetNavigationTo(fallback as PageKey);
    }
  }, [activePage, userPermissions.pages, flatNavLeaves, account, isAdmin]);

  // Supabase Auth is the source of truth whenever the backend is configured.
  // This prevents a manually edited localStorage value from bypassing the
  // login gate. Microsoft restoration remains available for deployments that
  // have MSAL configured but do not yet use Supabase Auth directly.
  useEffect(() => {
    if (isSupabaseConfigured) {
      let cancelled = false;
      const applyEmail = (email: string | null) => {
        if (cancelled) return;
        setAccount(email);
        if (email) localStorage.setItem('user_account', email);
        else localStorage.removeItem('user_account');
      };

      getSupabaseSessionEmail()
        .then(applyEmail)
        .catch(() => applyEmail(null))
        .finally(() => {
          if (!cancelled) setAuthChecked(true);
        });

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
          applyEmail(null);
          return;
        }
        const email = session?.user.email?.trim().toLowerCase() ?? null;
        applyEmail(email?.endsWith('@mgenesis.com') ? email : null);
      });

      return () => {
        cancelled = true;
        data.subscription.unsubscribe();
      };
    }

    if (!isMsalConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const acct = await restoreMicrosoftAccount();
        if (cancelled) return;
        const email = acct?.username?.trim().toLowerCase();
        if (email && email.endsWith('@mgenesis.com')) {
          setAccount(email);
          localStorage.setItem('user_account', email);
        } else {
          setAccount(null);
          localStorage.removeItem('user_account');
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !account) return;
    let cancelled = false;
      setAccountPersistenceError(null);
      setIsSupabaseHydrating(true);
      Promise.all([
      loadProfiles(),
      loadApplicationRecords<PersistedDepartmentPermission>('department_permission'),
    ])
      .then(([remoteProfiles, remoteDepartmentPermissions]) => {
        if (cancelled) return;
        setAccounts(remoteProfiles);
        localStorage.setItem('survey_accounts_v1', JSON.stringify(remoteProfiles));
        const permissionMap = Object.fromEntries(
          remoteDepartmentPermissions.map((record) => [
            record.department,
            { pages: record.pages, surveyTypes: record.surveyTypes },
          ]),
        );
        setDepartmentPermissions(permissionMap);
        localStorage.setItem('survey_department_permissions_v1', JSON.stringify(permissionMap));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setAccountPersistenceError(loadError instanceof Error ? loadError.message : 'Unable to load access settings.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsSupabaseHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  useEffect(() => {
    if (!isSupabaseConfigured || !account) return;
    return subscribeToApplicationChanges();
  }, [account]);

  useEffect(() => {
    if (!isSupabaseConfigured || !account) return;
    const refreshAccessSettings = () => {
      void Promise.all([
        loadProfiles(),
        loadApplicationRecords<PersistedDepartmentPermission>('department_permission'),
      ]).then(([remoteProfiles, remoteDepartmentPermissions]) => {
        setAccounts(remoteProfiles);
        localStorage.setItem('survey_accounts_v1', JSON.stringify(remoteProfiles));
        const permissionMap = Object.fromEntries(
          remoteDepartmentPermissions.map((record) => [
            record.department,
            { pages: record.pages, surveyTypes: record.surveyTypes },
          ]),
        );
        setDepartmentPermissions(permissionMap);
        localStorage.setItem('survey_department_permissions_v1', JSON.stringify(permissionMap));
      }).catch((loadError) => {
        setAccountPersistenceError(loadError instanceof Error ? loadError.message : 'Unable to refresh access settings.');
      });
    };
    const refreshDepartmentPermissions = (event: Event) => {
      const recordType = (event as CustomEvent<{ recordType?: ApplicationRecordType }>).detail?.recordType;
      if (recordType === 'department_permission') refreshAccessSettings();
    };
    window.addEventListener(APPLICATION_PROFILES_CHANGED_EVENT, refreshAccessSettings);
    window.addEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshDepartmentPermissions);
    return () => {
      window.removeEventListener(APPLICATION_PROFILES_CHANGED_EVENT, refreshAccessSettings);
      window.removeEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshDepartmentPermissions);
    };
  }, [account]);

  useEffect(() => {
    const handlePersistenceError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setAccountPersistenceError(detail || 'Unable to save shared data to Supabase.');
    };
    window.addEventListener('supabase-persistence-error', handlePersistenceError);
    return () => window.removeEventListener('supabase-persistence-error', handlePersistenceError);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !account || !profile) return;
    const canUseFeedbackHub = profile.role === 'Admin' || profile.designation !== 'Rank & File';
    const access = { userEmail: account, isAdmin, canUseFeedbackHub };
    void hydrateSharedClientStores(access).catch((loadError) => {
      setAccountPersistenceError(loadError instanceof Error ? loadError.message : 'Unable to load shared Supabase data.');
    });

    const refreshSharedStore = (event: Event) => {
      const recordType = (event as CustomEvent<{ recordType?: ApplicationRecordType }>).detail?.recordType;
      if (!recordType) return;
      void hydrateChangedSharedStore(recordType, access).catch((loadError) => {
        setAccountPersistenceError(loadError instanceof Error ? loadError.message : 'Unable to refresh shared Supabase data.');
      });
    };
    window.addEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshSharedStore);
    return () => window.removeEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshSharedStore);
  }, [account, profile, isAdmin]);

  const handleLogin = async (email: string, auth?: MicrosoftAuth) => {
    if (auth) {
      const result = await signIntoSupabaseWithMicrosoft(auth.idToken, auth.nonce);
      if (!result.ok) {
        throw new Error(result.error || 'Unable to establish the required Supabase session.');
      }
    }
    recordSessionActivity(email);
    setAccount(email);
    localStorage.setItem('user_account', email);
  };

  const completePasswordRecovery = async () => {
    await signOutSupabase();
    setIsPasswordRecovery(false);
    setAccount(null);
    localStorage.removeItem('user_account');
    setBrowserPath(PATHS.login, true);
  };

  // Hold the first paint until MSAL has been consulted, so the app never
  // flashes before we know whether the user is really signed in.
  if (!authChecked) {
    return <div className="min-h-screen w-full bg-white" />;
  }

  if (isPasswordRecovery) {
    return <PasswordRecoveryPage onComplete={completePasswordRecovery} />;
  }

  // Auth Guard
  if (!account) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Handler for custom survey submission
  const handleSurveySubmit = (
    surveyId: string,
    company: string,
    department: string,
    respondentType: string,
    address: string | undefined,
    answers: any[],
    startTime?: string
  ) => {
    submitResponse(surveyId, company, department, respondentType, address, answers, account || undefined, startTime);
  };

  // ----------------------------------------------------
  // ADMIN EXPERIENCE (ALL ANALYTICS SECURED HERE)
  // ----------------------------------------------------
  const pageContent = {
    dashboard: (
      <DashboardPage
        responses={filteredResponses}
        allResponses={userAccessibleAllResponses}
        historyResponses={dataScope === 'all-time' ? userAccessibleAllTimeResponses : userAccessibleAllResponses}
        dataScope={dataScope === 'custom' ? 'current' : dataScope}
        onChangeDataScope={setDataScope}
        partnerCompanies={userAccessiblePartnerCompanies}
        isLoading={isLoading}
        error={error}
        surveyTypeFilter={filters.surveyType}
        surveys={userAccessibleSurveys}
        isAdmin={isAdmin}
        userEmail={account || ''}
      />
    ),
    'partner-companies': (
      <PartnerCompaniesPage
        // Unfiltered on purpose: this is the admin registry itself (Active/
        // Expired/Archived tabs), so Uncategorized companies pending review
        // must stay visible here even though they're excluded from every
        // survey-scoped view via userAccessiblePartnerCompanies.
        partnerCompanies={partnerCompanies}
        responses={userAccessibleResponses}
        onAddCompany={addPartnerCompany}
        onRemoveCompany={removePartnerCompany}
        onUpdateCompany={updatePartnerCompany}
        onRenewDocument={updatePartnerDocument}
        onPreviewMasterListImport={previewMasterListImport}
        onCommitMasterListImport={commitMasterListImport}
        isAdmin={isAdmin}
        canRenewDocuments={canRenewDocuments}
        initialFocusCompanyId={focusCompanyId}
        onFocusConsumed={() => setFocusCompanyId(null)}
        currentUserEmail={account || ''}
      />
    ),
    'document-register': (
      <DocumentRegisterPage
        partnerCompanies={partnerCompanies}
        canRenewDocuments={canRenewDocuments}
        onUpdateCompany={updatePartnerCompany}
        onRenewDocument={updatePartnerDocument}
        currentUserEmail={account || ''}
        isAdmin={isAdmin}
      />
    ),
    'supplier-ranking': (
      <SupplierRankingPage
        partnerCompanies={partnerCompanies}
        onUpdateCompaniesBulk={updatePartnerCompaniesBulk}
        surveys={surveys}
        responses={responses}
        currentUserEmail={account || ''}
      />
    ),
    'partners-feedback-hub': (
      <PartnersFeedbackHubPage
        surveys={userAccessibleSurveys}
        responses={userAccessibleResponses}
        partnerCompanies={userAccessiblePartnerCompanies}
        accounts={accounts}
        currentUser={profile}
        onNavigatePage={(p) => navigateTo(p as PageKey)}
        onMarkSurveyComplete={(id) => {
          const survey = surveys.find((candidate) => candidate.id === id);
          if (survey) updateSurvey({ ...survey, status: 'Completed' });
        }}
      />
    ),
    'account-management': (
      <AccountManagementPage 
        accounts={accounts}
        onUpdateAccounts={saveAccounts}
        isAdmin={isAdmin}
        currentUserEmail={account || ''}
        departmentPermissions={departmentPermissions}
        onUpdateDepartmentPermissions={saveDepartmentPermissions}
      />
    ),
    'survey-forms': (
      <SurveyFormsPage
        surveys={userAccessibleSurveys}
        responses={userAccessibleResponses}
        partnerCompanies={userAccessiblePartnerCompanies}
        userEmail={account || ''}
        onUpdateSurvey={updateSurvey}
        onUpdateSurveysBulk={updateSurveysBulk}
        onArchiveResponses={archiveResponsesForSurveys}
        onSelectSurvey={(id) => {
          setSelectedSurveyId(id);
          navigateTo('view-form', PATHS.admin.evaluations.workspace.form(id));
        }}
        onNavigateToCreate={() => navigateTo('create-form', PATHS.admin.evaluations.workspace.newForm)}
        onFillForm={(id) => {
          setSelectedSurveyId(id);
          navigateTo('fill-form', isAdmin
            ? PATHS.admin.evaluations.workspace.form(id)
            : PATHS.employee.fillEvaluation(id));
        }}
        isAdmin={isAdmin}
      />
    ),
    analytics: (
      <AnalyticsPage
        responses={analyticsFilteredResponses}
        activeSurveyTypes={activeSurveyTypes}
        filters={filters}
        setFilters={setFilters}
        dataScope={dataScope}
        onChangeDataScope={setDataScope}
        archiveSeries={archiveSeries}
        selectedSeriesIds={selectedSeriesIds}
        onChangeSelectedSeriesIds={setSelectedSeriesIds}
        partnerCompanies={userAccessiblePartnerCompanies}
      />
    ),
    present: <PresentPage responses={scopedAccessibleResponses} partnerCompanies={userAccessiblePartnerCompanies} />,
    explorer: <SurveyExplorerPage responses={userAccessibleResponses} surveys={userAccessibleSurveys} />,
    reports: (
      <ReportsPage
        responses={filteredResponses}
        partnerCompanies={userAccessiblePartnerCompanies}
        canExport={canExport}
      />
    ),
    'export-history': <ExportHistoryPage />,
    'pending-review': (
      <OutstandingEvaluationsPage
        surveys={surveys}
        partnerCompanies={partnerCompanies}
        responses={responses}
      />
    ),
    'my-submissions': (
      <MySubmissionsPage
        responses={userAccessibleAllTimeResponses}
        userEmail={account || ''}
        onFillForm={() => navigateTo('fill-form')}
      />
    ),
    'profile-settings': profile && (
      <ProfilePage
        email={account || ''}
        role={profile.role}
        designation={profile.designation}
        department={profile.department}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((value) => !value)}
        onLogout={handleLogout}
        responses={userAccessibleAllTimeResponses}
        onViewAllSubmissions={() => navigateTo('my-submissions')}
      />
    ),
    settings: profile && (
      <SettingsPage
        email={account || ''}
        role={profile.role}
        designation={profile.designation}
        department={profile.department}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((value) => !value)}
        onResetSystemData={handleResetAllData}
        onLogout={handleLogout}
        accountsCount={accounts.length}
        activePartnerCompaniesCount={partnerCompanies.filter((c) => !c.isArchived).length}
        totalResponsesCount={responses.length}
      />
    ),
    notifications: isAdmin ? (
      <NotificationLogsPage
        notifications={notifications}
        unreadCount={unreadCount}
        unreadNotificationIds={unreadNotificationIds}
        onMarkRead={markNotificationRead}
        onMarkUnread={markNotificationUnread}
        onMarkAllRead={markNotificationsRead}
      />
    ) : (
      profile && (
        <EmployeeNotificationLogsPage
          userEmail={account || ''}
          profile={profile}
          surveys={surveys}
          partnerCompanies={partnerCompanies}
          responses={responses}
          onFillForm={(id) => {
            setSelectedSurveyId(id);
            navigateTo('fill-form', PATHS.employee.fillEvaluation(id));
          }}
        />
      )
    ),
    'create-form': (
      <CreateSurveyPage
        onBack={() => {
          setEditingSurveyId(null);
          goToPreviousPage('survey-forms');
        }}
        surveyToEdit={editingSurveyId ? surveys.find(s => s.id === editingSurveyId) : undefined}
        categoryLabels={categoryLabels}
        onSave={(surveyData) => {
          if (editingSurveyId) {
            const currentSurvey = surveys.find(s => s.id === editingSurveyId);
            updateSurvey({
              ...surveyData,
              id: editingSurveyId,
              createdAt: currentSurvey?.createdAt || new Date().toISOString(),
            });
            setEditingSurveyId(null);
            navigateTo('view-form', PATHS.admin.evaluations.workspace.form(editingSurveyId));
          } else {
            const newSurvey = createSurvey(surveyData);
            if (newSurvey) {
              setSelectedSurveyId(newSurvey.id);
              navigateTo('view-form', PATHS.admin.evaluations.workspace.form(newSurvey.id));
            }
          }
        }}
      />
    ),
    'view-form': (() => {
      const targetSurvey = surveys.find((s) => s.id === selectedSurveyId);
      if (!targetSurvey) {
        return (
          <div className="panel p-8 text-center text-slate-500">
            <ShieldAlert size={36} className="mx-auto mb-2 text-rose-500" />
            <p className="font-semibold">Survey not found or was deleted.</p>
            <button onClick={() => goToPreviousPage('survey-forms')} className="primary-button mt-4">Return to Surveys</button>
          </div>
        );
      }
      return (
        <SurveyDetailsPage
          survey={targetSurvey}
          responses={userAccessibleResponses}
          partnerCompanies={userAccessiblePartnerCompanies}
          userEmail={account || ''}
          onBack={() => goToPreviousPage('survey-forms')}
          onDelete={(id) => {
            deleteSurvey(id);
            goToPreviousPage('survey-forms');
          }}
          onEdit={(id) => {
            setEditingSurveyId(id);
            navigateTo('create-form', PATHS.admin.evaluations.workspace.editForm(id));
          }}
          isAdmin={isAdmin}
        />
      );
    })(),
    'fill-form': (
      <SurveyFillerPage
        ref={surveyFillerRef}
        surveys={userAccessibleSurveys}
        partnerCompanies={userAccessiblePartnerCompanies}
        initialSurveyId={selectedSurveyId}
        userEmail={account || ''}
        defaultDepartment={profile?.department}
        defaultRespondentType={profile?.designation}
        responses={userAccessibleResponses}
        onSubmitted={handleSurveySubmit}
        onCancel={() => goToPreviousPage('survey-forms')}
      />
    ),
    archive: (
      <ArchivePage
        surveys={userAccessibleSurveys}
        partnerCompanies={partnerCompanies}
        archivedResponses={archivedResponses}
        archiveSeries={archiveSeries}
        onRenameArchiveSeries={renameArchiveSeries}
        onUpdateSurvey={updateSurvey}
        onUpdatePartnerCompany={updatePartnerCompany}
        onRestoreResponseGroup={restoreResponseGroup}
        onRestoreResponsesForSurvey={restoreResponsesForSurvey}
        onDeleteArchivedResponseGroups={deleteArchivedResponseGroups}
        onRestoreArchivedResponseGroups={restoreArchivedResponseGroups}
        onImportArchivedResponses={importArchivedResponses}
        isAdmin={isAdmin}
      />
    ),
    'import-evaluations': (
      <ImportEvaluationsPage
        currentUserEmail={account || ''}
        onPreview={previewRawEvaluations}
        onCommitBatch={commitRawEvaluationsBatch}
      />
    ),
    'categories-manager': (
      <CategoriesManagerPage
        categoryLabels={categoryLabels}
        onRenameCategory={renameCategory}
        onRestoreDefaults={restoreDefaultCategories}
      />
    ),
  }[activePage];

  
  if (isSupabaseConfigured && isSupabaseHydrating && account) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="flex flex-col items-center gap-4 text-slate-500 dark:text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-[#0866B1] dark:border-slate-700 dark:border-t-blue-500" />
            <p className="font-medium animate-pulse">Loading access settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <Shell
        pages={visiblePages}
        activePage={pagePresentation.sidebarKey}
        currentPath={currentPath}
        onPageChange={(page) => {
          const targetPage = page as PageKey;
          navigateTo(targetPage);
          if (targetPage === 'notifications') markNotificationsRead();
        }}
        title={pagePresentation.title}
        pageDescription={pagePresentation.description}
        breadcrumbs={pagePresentation.breadcrumbs}
        compactPageHeader={activePage === 'analytics'}
        action={
          <div className="flex min-w-0 items-center divide-x divide-blue-400/25">
            {isAdmin ? (
              <div className="pr-1 sm:pr-3">
                <NotificationBell
                  notifications={notifications}
                  unreadCount={unreadCount}
                  onOpen={() => undefined}
                  onViewAll={() => setIsNotificationModalOpen(true)}
                />
              </div>
            ) : (
              <div className="pr-1 sm:pr-3">
                <EmployeeNotificationBell
                  userEmail={account || ''}
                  surveys={surveys}
                  partnerCompanies={partnerCompanies}
                  responses={responses}
                  onFillForm={(id) => {
                    setSelectedSurveyId(id);
                    navigateTo('fill-form', PATHS.employee.fillEvaluation(id));
                  }}
                  onViewAll={() => setIsNotificationModalOpen(true)}
                  variant="header"
                />
              </div>
            )}
            <div className="px-1 sm:px-3">
              <button
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition cursor-pointer ${
                  darkMode ? 'bg-white/10 text-white' : 'text-blue-100 hover:text-white'
                }`}
                type="button"
                onClick={() => setDarkMode((value) => !value)}
                title="Toggle dark mode"
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
            <div className="pl-1 sm:pl-3">
              <AccountMenu
                email={account}
                designation={profile?.designation}
                department={profile?.department}
                role={profile?.role}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onLogout={handleLogout}
              />
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {accountPersistenceError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {accountPersistenceError.includes('quarantined during refresh')
                ? 'Supabase data validation warning: '
                : 'Supabase operation failed: '}
              {accountPersistenceError}
            </div>
          )}
          {error && activePage !== 'dashboard' && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Supabase operation failed: {error}
            </div>
          )}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <div className="relative min-w-0 flex-1">
              {isSupabaseConfigured && isLoading ? (
                <div
                  className="flex min-h-64 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
                    <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-300 border-t-[#0866B1] dark:border-slate-700 dark:border-t-blue-500" />
                    <p className="text-sm font-medium">Refreshing shared data...</p>
                  </div>
                </div>
              ) : (
                <>
                  <Suspense
                    fallback={(
                      <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" role="status" aria-live="polite">
                        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
                          <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-300 border-t-[#0866B1] dark:border-slate-700 dark:border-t-blue-500" />
                          <p className="text-sm font-medium">Loading page...</p>
                        </div>
                      </div>
                    )}
                  >
                    {isAdmin && isEvaluationWorkspacePage(activePage) ? (
                      <EvaluationWorkspace currentPath={currentPath} onNavigate={navigatePath}>
                        {pageContent}
                      </EvaluationWorkspace>
                    ) : pageContent}
                  </Suspense>
                  {isSupabaseConfigured && isRefreshing && (
                    <div
                      className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-2 text-sm font-medium text-slate-600 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0866B1] dark:border-slate-600 dark:border-t-blue-400" />
                        <span>Refreshing shared data...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Shell>

      {isNotificationModalOpen && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 backdrop-blur-sm sm:p-6"
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2, 6, 23, 0.68)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-center-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsNotificationModalOpen(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" style={{ width: '100%', maxWidth: '80rem', maxHeight: '92vh', backgroundColor: darkMode ? '#020617' : '#f8fafc' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 id="notification-center-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  {isAdmin ? 'All Notifications' : 'All Reminders'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAdmin ? 'Survey submissions and document alerts.' : 'Your pending survey evaluation reminders.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNotificationModalOpen(false)}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Close notifications"
              >
                <X size={19} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <Suspense
                fallback={(
                  <div className="flex min-h-64 items-center justify-center" role="status" aria-live="polite">
                    <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
                      <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-300 border-t-[#0866B1] dark:border-slate-700 dark:border-t-blue-500" />
                      <p className="text-sm font-medium">Loading notifications...</p>
                    </div>
                  </div>
                )}
              >
                {isAdmin ? (
                  <NotificationLogsPage
                    notifications={notifications}
                    unreadCount={unreadCount}
                    unreadNotificationIds={unreadNotificationIds}
                    onMarkRead={markNotificationRead}
                    onMarkUnread={markNotificationUnread}
                    onMarkAllRead={markNotificationsRead}
                  />
                ) : (
                  profile && (
                    <EmployeeNotificationLogsPage
                      userEmail={account || ''}
                      profile={profile}
                      surveys={surveys}
                      partnerCompanies={partnerCompanies}
                      responses={responses}
                      onFillForm={(id) => {
                        setIsNotificationModalOpen(false);
                        setSelectedSurveyId(id);
                        navigateTo('fill-form', PATHS.employee.fillEvaluation(id));
                      }}
                    />
                  )
                )}
              </Suspense>
            </div>
          </div>
        </div>
      ), document.body)}

      {isSessionWarningVisible && account && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="session-timeout-title"
          aria-describedby="session-timeout-description"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl dark:border-amber-900/60 dark:bg-slate-950">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <Clock3 size={22} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="session-timeout-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Your session is about to end
                </h2>
                <p id="session-timeout-description" className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  You have been inactive. For security, you will be signed out in{' '}
                  <strong className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    {formatSessionTimeRemaining(sessionRemainingMs)}
                  </strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={signOutNow}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out now
              </button>
              <button
                type="button"
                onClick={staySignedIn}
                autoFocus
                className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#0866B1] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#07528E] focus:outline-none focus:ring-2 focus:ring-[#0866B1] focus:ring-offset-2 dark:focus:ring-offset-slate-950"
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsModalOpen && profile && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSettingsModalOpen(false);
          }}
        >
          <div className="flex max-h-[95vh] w-[96vw] max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 id="settings-modal-title" className="text-xl font-bold text-slate-900 dark:text-white">
                  {isAdmin ? 'Settings' : 'Profile & Settings'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAdmin
                    ? 'Manage your account, appearance, session, and available system tools.'
                    : 'View your profile, evaluation activity, preferences, and session.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Close settings"
              >
                <X size={20} />
              </button>
            </div>

            <Suspense
              fallback={(
                <div className="flex min-h-64 flex-1 items-center justify-center p-4 sm:p-6" role="status" aria-live="polite">
                  <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
                    <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-300 border-t-[#0866B1] dark:border-slate-700 dark:border-t-blue-500" />
                    <p className="text-sm font-medium">Loading settings...</p>
                  </div>
                </div>
              )}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
                {isAdmin ? (
                  <SettingsPage
                    email={account || ''}
                    role={profile.role}
                    designation={profile.designation}
                    department={profile.department}
                    darkMode={darkMode}
                    onToggleDarkMode={() => setDarkMode((value) => !value)}
                    onResetSystemData={handleResetAllData}
                    onLogout={handleLogout}
                    accountsCount={accounts.length}
                    activePartnerCompaniesCount={partnerCompanies.filter((company) => !company.isArchived).length}
                    totalResponsesCount={responses.length}
                  />
                ) : (
                  <ProfilePage
                    email={account || ''}
                    role={profile.role}
                    designation={profile.designation}
                    department={profile.department}
                    darkMode={darkMode}
                    onToggleDarkMode={() => setDarkMode((value) => !value)}
                    onLogout={handleLogout}
                    responses={userAccessibleAllTimeResponses}
                    onViewAllSubmissions={() => {
                      setIsSettingsModalOpen(false);
                      navigateTo('my-submissions');
                    }}
                  />
                )}
              </div>
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
