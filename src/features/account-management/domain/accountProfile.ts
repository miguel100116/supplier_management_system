import type { PageModuleKey } from '../../../utils/rbac';
import type { SurveyAccessRole, SurveyType } from '../../../types/survey';

export interface PersistedProfile {
  email: string;
  role: 'Admin' | 'Employee';
  designation: SurveyAccessRole;
  department: typeof PROFILE_DEPARTMENTS[number];
  permissions?: {
    pages: PageModuleKey[];
    surveyTypes: SurveyType[];
  };
}
const PROFILE_ROLES = ['Admin', 'Employee'] as const;
const PROFILE_DESIGNATIONS = ['Rank & File', 'Supervisory', 'Managerial', 'Director', 'Executive'] as const;
const PROFILE_DEPARTMENTS = [
  'Accounts Payable - Trade',
  'Business Solutions Manager',
  'Executive Office',
  'Logistics',
  'Procurement Group',
  'TASS',
] as const;
const PROFILE_PAGE_MODULES = [
  'dashboard',
  'survey-forms',
  'explorer',
  'analytics',
  'reports',
  'present',
  'partner-companies',
  'partners-feedback-hub',
  'account-management',
  'notifications',
  'archive',
  'import-evaluations',
  'document-register',
  'renew-documents',
] as const satisfies readonly PageModuleKey[];
const LEGACY_PROFILE_PAGE_MODULES = ['supplier-ranking'] as const;
const PROFILE_SURVEY_TYPES = ['Courier', 'Supplier', 'Subcontractor'] as const satisfies readonly SurveyType[];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function parseOptionalEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => !isOneOf(item, allowed))) {
    throw new Error(`${label} contains an unsupported value.`);
  }
  return [...new Set(value as T[])];
}

export function parsePersistedProfile(value: unknown, label = 'profile'): PersistedProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  if (!email.endsWith('@mgenesis.com')) throw new Error(`${label}.email must be an @mgenesis.com address.`);
  if (!isOneOf(record.role, PROFILE_ROLES)) throw new Error(`${label}.role is invalid.`);
  if (!isOneOf(record.designation, PROFILE_DESIGNATIONS)) throw new Error(`${label}.designation is invalid.`);
  if (!isOneOf(record.department, PROFILE_DEPARTMENTS)) throw new Error(`${label}.department is invalid.`);

  const storedPages = parseOptionalEnumArray(
    record.permission_pages,
    [...PROFILE_PAGE_MODULES, ...LEGACY_PROFILE_PAGE_MODULES],
    `${label}.permission_pages`,
  );
  // Older persisted profiles may still contain the removed module key. Accept
  // it at the storage boundary but never expose it as an active permission.
  const pages = storedPages?.filter((page): page is PageModuleKey => page !== 'supplier-ranking');
  const surveyTypes = parseOptionalEnumArray(
    record.permission_survey_types,
    PROFILE_SURVEY_TYPES,
    `${label}.permission_survey_types`,
  );

  return {
    email,
    role: record.role,
    designation: record.designation,
    department: record.department,
    ...(pages || surveyTypes
      ? { permissions: { pages: pages ?? [], surveyTypes: surveyTypes ?? [] } }
      : {}),
  };
}
