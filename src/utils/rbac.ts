import { SurveyType } from '../types/survey';

export type PageModuleKey =
  | 'dashboard'
  | 'survey-forms'
  | 'explorer'
  | 'analytics'
  | 'reports'
  | 'present'
  | 'partner-companies'
  | 'partners-feedback-hub'
  | 'account-management'
  | 'notifications'
  | 'archive'
  | 'import-evaluations'
  | 'document-register'
  // Action permission (not a nav page): allowed to update compliance
  // document expiry/renewal in Partner Companies and the Document Register.
  | 'renew-documents';

export interface UserPermissions {
  pages: PageModuleKey[];
  surveyTypes: SurveyType[];
}

/**
 * Account-level survey access is the permission boundary. A survey's own
 * department/designation settings can further narrow which forms an employee
 * may open, but must never add a type the account administrator removed.
 */
export function getEffectiveSurveyTypes(grantedSurveyTypes: SurveyType[]): SurveyType[] {
  return [...new Set(grantedSurveyTypes)];
}

/**
 * Resolves the default permitted pages and survey types for a given designation (rank) and department.
 */
export function getDefaultPermissions(designation: string, department: string): UserPermissions {
  const rank = designation.trim();
  const dept = department.trim();

  // 1. Survey Types (Operational Data)
  // Default to all survey types for all departments as the standard
  const surveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

  // 2. Page Modules based on Rank/Designation
  let pages: PageModuleKey[] = [];

  if (rank === 'Rank & File') {
    pages = ['dashboard', 'analytics', 'survey-forms', 'partner-companies', 'document-register', 'notifications'];
  } else if (rank === 'Supervisory') {
    // Supervisor gets Dashboard, Analytics, Survey Forms, Partner Companies, Partners Feedback Hub, and optionally Reports for basic exports
    pages = ['dashboard', 'analytics', 'survey-forms', 'partner-companies', 'document-register', 'partners-feedback-hub', 'reports', 'notifications'];
  } else if (rank === 'Managerial') {
    pages = [
      'dashboard',
      'analytics',
      'survey-forms',
      'partner-companies',
      'document-register',
      'partners-feedback-hub',
      'explorer',
      'reports',
      'present',
      'notifications'
    ];
  } else if (rank === 'Director') {
    pages = [
      'dashboard',
      'analytics',
      'survey-forms',
      'partner-companies',
      'document-register',
      'partners-feedback-hub',
      'explorer',
      'reports',
      'present',
      'notifications'
    ];
  } else if (rank === 'Executive') {
    pages = ['dashboard', 'analytics', 'reports', 'present', 'notifications'];
  } else {
    // Default fallback or Admin
    pages = [
      'dashboard',
      'survey-forms',
      'explorer',
      'analytics',
      'reports',
      'present',
      'partner-companies',
      'partners-feedback-hub',
      'document-register',
      'renew-documents',
      'account-management',
      'notifications',
      'archive',
      'import-evaluations'
    ];
  }

  return { pages, surveyTypes };
}

/**
 * Resolves standard default department permissions.
 */
export function getDepartmentDefaultPermissions(department: string): UserPermissions {
  const dept = department.trim();
  const surveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

  let pages: PageModuleKey[] = [];
  if (dept === 'Executive Office') {
    pages = ['dashboard', 'analytics', 'reports', 'present', 'notifications'];
  } else if (dept === 'Business Solutions Manager') {
    pages = [
      'dashboard',
      'survey-forms',
      'explorer',
      'analytics',
      'reports',
      'present',
      'partner-companies',
      'document-register',
      'partners-feedback-hub',
      'notifications'
    ];
  } else {
    // AP - Trade, Logistics, Procurement Group, TASS
    pages = [
      'dashboard',
      'analytics',
      'survey-forms',
      'partner-companies',
      'document-register',
      'partners-feedback-hub',
      'explorer',
      'reports',
      'present',
      'notifications'
    ];
  }

  return { pages, surveyTypes };
}

/**
 * Validates whether a user has access to a specific page key.
 */
export function hasPageAccess(
  userPages: PageModuleKey[],
  pageKey: string,
  isAdmin: boolean
): boolean {
  // Archive mutations are Admin-only at the database boundary. Never expose
  // the route through a stale/custom employee page override.
  if (pageKey === 'archive') return isAdmin;

  if (isAdmin && pageKey !== 'fill-form' && pageKey !== 'view-form' && pageKey !== 'create-form') {
    return true; // Admin has full access by default
  }

  // Custom sub-views mapping
  if (pageKey === 'create-form') {
    return userPages.includes('survey-forms') && isAdmin; // Keep creation admin-restricted by default unless allowed
  }
  if (pageKey === 'view-form' || pageKey === 'fill-form') {
    return userPages.includes('survey-forms');
  }

  // Every authenticated user has their own submissions and profile,
  // regardless of rank/department page overrides.
  if (pageKey === 'my-submissions' || pageKey === 'profile-settings') {
    return true;
  }

  return userPages.includes(pageKey as PageModuleKey);
}
