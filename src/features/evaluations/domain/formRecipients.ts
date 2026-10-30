import type { PersistedProfile } from '../../account-management/domain/accountProfile';
import type { CustomForm, SurveyType } from '../../../types/survey';
import { getDepartmentDefaultPermissions, getProfilePermissions, hasPageAccess, type PageModuleKey } from '../../../utils/rbac';
import { getVisibleSurveyForms } from './surveySelection';

export type DepartmentSurveyPermissions = Record<string, { surveyTypes: SurveyType[]; pages?: PageModuleKey[] }>;

export function getEligibleFormRecipients(
  survey: CustomForm,
  profiles: PersistedProfile[],
  departmentPermissions: DepartmentSurveyPermissions,
): PersistedProfile[] {
  if (!getVisibleSurveyForms([survey], false).length) return [];
  const departments = Object.fromEntries(Object.entries(departmentPermissions).map(([department, permissions]) => [department, {
    ...permissions, pages: permissions.pages ?? getDepartmentDefaultPermissions(department).pages,
  }]));
  return profiles.filter((profile) => {
    if (profile.role !== 'Employee') return false;
    const permissions = getProfilePermissions(profile, departments);
    return hasPageAccess(permissions.pages, 'fill-form', false)
      && permissions.surveyTypes.includes(survey.surveyType)
      && (!survey.accessDepartments?.length || survey.accessDepartments.includes(profile.department))
      && (!survey.accessRoles?.length || survey.accessRoles.includes(profile.designation));
  });
}
