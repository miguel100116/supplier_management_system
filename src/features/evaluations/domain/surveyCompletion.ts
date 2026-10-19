import { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { SurveyAccount } from '../../../hooks/useSurveyData';
import { getSurveyEvaluationCompanies, hasAnsweredItem } from '../../analytics/domain/analytics';
import { parseDDMMYYYY } from '../../../utils/time';
import { getSurveyStatus } from './surveyStatus';

export interface EmployeeSurveyProgress {
  email: string;
  department: string;
  designation: string;
  completed: number;
  total: number;
  pct: number;
}

export type SurveyCompletionReason = 'manual' | 'deadline' | 'all-employees' | null;

export interface SurveyCompletionSummary {
  /** Every non-admin account whose department + role can access this survey. */
  eligibleEmployees: EmployeeSurveyProgress[];
  /** The live "Modify Companies to Evaluate" pool this survey is scored against. */
  companiesTotal: number;
  deadlinePassed: boolean;
  /** True only when there's at least one eligible employee and every one of them has evaluated every company in scope. */
  allEmployeesAt100: boolean;
  /** Admin used the manual "Mark Survey as Complete" override. */
  manuallyCompleted: boolean;
  isComplete: boolean;
  completionReason: SurveyCompletionReason;
}

/** Non-admin accounts whose department and role fall within this survey's access limits. */
export function getSurveyEligibleEmployees<T extends SurveyAccount>(
  survey: Pick<CustomForm, 'accessDepartments' | 'accessRoles'>,
  accounts: T[]
): T[] {
  return accounts.filter((acct) => {
    if (acct.role === 'Admin') return false;
    const allowsDepartment = !survey.accessDepartments?.length || survey.accessDepartments.includes(acct.department);
    const allowsRole = !survey.accessRoles?.length || survey.accessRoles.includes(acct.designation as any);
    return allowsDepartment && allowsRole;
  });
}

/**
 * A survey is "Completed" only when:
 * - an admin manually marked it complete, OR
 * - its deadline (dd/mm/yyyy) has passed, OR
 * - every eligible employee has evaluated 100% of the companies this survey
 *   is currently scoped to evaluate (its "Modify Companies to Evaluate"
 *   selection, or every registered company of that type by default).
 *
 * Everything here is derived live from partnerCompanies/accounts/responses,
 * so it automatically stays correct as the admin edits the company
 * selection, adds/removes employees, or new responses come in.
 */
export function getSurveyCompletionSummary(
  survey: CustomForm,
  accounts: SurveyAccount[],
  partnerCompanies: PartnerCompany[],
  responses: SurveyResponse[]
): SurveyCompletionSummary {
  const currentDateStr = new Date().toISOString().slice(0, 10);
  const evaluationCompanies = getSurveyEvaluationCompanies(survey, partnerCompanies, currentDateStr);
  const companiesTotal = evaluationCompanies.length;
  const companyNameSet = new Set(evaluationCompanies.map((c) => c.name.trim().toLowerCase()));

  const eligibleAccounts = getSurveyEligibleEmployees(survey, accounts);

  const eligibleEmployees: EmployeeSurveyProgress[] = eligibleAccounts.map((acct) => {
    const evaluatedNames = new Set(
      responses
        .filter(
          (r) =>
            !r.archived &&
            hasAnsweredItem(r) &&
            r.surveyType === survey.surveyType &&
            r.respondentEmail &&
            r.respondentEmail.trim().toLowerCase() === acct.email.trim().toLowerCase() &&
            companyNameSet.has(r.company.trim().toLowerCase())
        )
        .map((r) => r.company.trim().toLowerCase())
    );
    const completed = evaluatedNames.size;
    return {
      email: acct.email,
      department: acct.department,
      designation: acct.designation,
      completed,
      total: companiesTotal,
      pct: companiesTotal > 0 ? Math.round((completed / companiesTotal) * 100) : 0,
    };
  });

  const deadline = parseDDMMYYYY(survey.deadlineDate);
  // Deadline day counts as still open until it fully elapses (end of day),
  // not at its first midnight.
  const deadlineEndOfDay = deadline ? new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate(), 23, 59, 59, 999) : null;
  const deadlinePassed = !!deadlineEndOfDay && deadlineEndOfDay.getTime() < Date.now();

  const allEmployeesAt100 =
    companiesTotal > 0 &&
    eligibleEmployees.length > 0 &&
    eligibleEmployees.every((e) => e.completed >= e.total);

  const manuallyCompleted = survey.status === 'Completed' && getSurveyStatus(survey) === 'Completed';

  let completionReason: SurveyCompletionReason = null;
  if (manuallyCompleted) completionReason = 'manual';
  else if (allEmployeesAt100) completionReason = 'all-employees';
  else if (deadlinePassed) completionReason = 'deadline';

  return {
    eligibleEmployees,
    companiesTotal,
    deadlinePassed,
    allEmployeesAt100,
    manuallyCompleted,
    isComplete: manuallyCompleted || deadlinePassed || allEmployeesAt100,
    completionReason,
  };
}
