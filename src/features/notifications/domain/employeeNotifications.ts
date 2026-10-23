import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { getPendingEvaluationCompanies } from '../../evaluations/domain/evaluationProgress';
import { getSurveyStatus } from '../../evaluations/domain/surveyStatus';
import { getDefaultPermissions } from '../../../utils/rbac';

export interface EmployeeNotification {
  id: string;
  surveyId: string;
  surveyTitle: string;
  surveyType: SurveyType;
  sender: string;
  subject: string;
  deadlineDate: string;
  pendingCompanies: PartnerCompany[];
  createdAt: string;
}

export function getEmployeePendingSurveys(
  userEmail: string | null,
  profile: { department: string; designation: string; role: string; permissions?: { surveyTypes: SurveyType[] } } | null,
  surveys: CustomForm[],
  partnerCompanies: PartnerCompany[],
  responses: SurveyResponse[],
  knownSurveys: CustomForm[] = surveys,
): EmployeeNotification[] {
  if (!userEmail || !profile || profile.role === 'Admin') {
    return [];
  }

  // Filter for active (running or un-set status) surveys
  const activeSurveys = surveys.filter(
    (s) => getSurveyStatus(s) === 'Running'
  );

  const pendingReminders: EmployeeNotification[] = [];

  activeSurveys.forEach((survey) => {
    const allowedTypes = profile.permissions?.surveyTypes ?? getDefaultPermissions(profile.designation, profile.department).surveyTypes;
    if (!allowedTypes.includes(survey.surveyType)) return;
    // Check Department & Role Access limits for this specific survey form
    const allowsDepartment = !survey.accessDepartments?.length || survey.accessDepartments.includes(profile.department);
    const allowsRole = !survey.accessRoles?.length || survey.accessRoles.includes(profile.designation as any);

    if (!allowsDepartment || !allowsRole) {
      return; // No access to this survey
    }

    const pendingCompanies = getPendingEvaluationCompanies(survey, knownSurveys, partnerCompanies, responses, userEmail);

    // If there is at least one partner company remaining to be evaluated, trigger a notification!
    if (pendingCompanies.length > 0) {
      // Format deadline or use fallback
      const deadline = survey.deadlineDate || 'the end of the current evaluation cycle';

      // We use the survey's creation date or fallback to a standard relative date for the reminder
      const createdAt = survey.lastDistributedAt || survey.createdAt;

      pendingReminders.push({
        id: survey.distributionId ? `reminder-${survey.id}:${survey.distributionId}` : `reminder-${survey.id}`,
        surveyId: survey.id,
        surveyTitle: survey.title,
        surveyType: survey.surveyType,
        sender: 'System reminder',
        subject: 'REMINDER - Survey Accomplishment',
        deadlineDate: deadline,
        pendingCompanies,
        createdAt,
      });
    }
  });

  return pendingReminders;
}
