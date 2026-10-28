import type { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import type { PersistedProfile } from '../../account-management/domain/accountProfile';
import { averageRating, getSurveyEvaluationCompanies, hasAnsweredItem, submissionCount, submissionScores } from '../../analytics/domain/analytics';
import { isOfficialAnalyticsResponse } from '../../analytics/domain/responseProvenance';
import { getEligibleFormRecipients, type DepartmentSurveyPermissions } from '../../evaluations/domain/formRecipients';
import { getSurveyCompletionSummary } from '../../evaluations/domain/surveyCompletion';
import { groupSurveySubmissions, selectSurveyResponses } from '../../evaluations/domain/surveyResponses';
import { getSurveyStatus } from '../../evaluations/domain/surveyStatus';
import { parseSubmissionTimestamp } from './submissionTimestamp';
import { getPendingEvaluationCompanies } from '../../evaluations/domain/evaluationProgress';

export interface AssignmentProgress {
  completed: number;
  required: number;
  percentage: number | null;
}

export interface EmployeeAssignmentDetail {
  email: string;
  department: string;
  designation: string;
  completed: number;
  total: number;
  companies: { id: string; name: string; completed: boolean }[];
}

function sumProgress(items: AssignmentProgress[]): AssignmentProgress {
  const completed = items.reduce((sum, item) => sum + item.completed, 0);
  const required = items.reduce((sum, item) => sum + item.required, 0);
  return { completed, required, percentage: required ? Math.floor(completed / required * 100) : null };
}

/** All response inputs must already be authorized by the caller. This selector
 * adds official-data filtering, never grants access or fetches additional data.
 * Current assignments and scoped reporting deliberately have separate inputs.
 */
export function buildDashboardSnapshot({
  reportingResponses, currentResponses, surveys, companies, accounts, departmentPermissions = {}, surveyTypes = [], uncategorizedCompanyIds = [],
}: {
  reportingResponses: SurveyResponse[];
  currentResponses: SurveyResponse[];
  surveys: CustomForm[];
  companies: PartnerCompany[];
  accounts?: PersistedProfile[];
  departmentPermissions?: DepartmentSurveyPermissions;
  surveyTypes?: SurveyType[];
  scope?: 'current' | 'all-time' | 'custom';
  uncategorizedCompanyIds?: string[];
}) {
  const allowedType = (type: SurveyType) => !surveyTypes.length || surveyTypes.includes(type);
  const official = (row: SurveyResponse) => allowedType(row.surveyType) && isOfficialAnalyticsResponse(row);
  const reporting = reportingResponses.filter(official);
  const current = currentResponses.filter(row => !row.archived && official(row));
  const uncategorized = new Set(uncategorizedCompanyIds);
  const forms = surveys.filter(survey => survey.status !== 'Archived' && allowedType(survey.surveyType)).map(survey => {
    let progress: AssignmentProgress | null = null;
    let employees: EmployeeAssignmentDetail[] | null = null;
    if (accounts !== undefined) {
      const recipients = getEligibleFormRecipients(survey, accounts, departmentPermissions);
      const summary = getSurveyCompletionSummary(survey, recipients, companies, current, surveys);
      progress = sumProgress(summary.eligibleEmployees.map(employee => ({
        completed: employee.completed, required: employee.total, percentage: null,
      })));
      const assigned = getSurveyEvaluationCompanies(survey, companies);
      employees = summary.eligibleEmployees.map(employee => {
        const pending = new Set(getPendingEvaluationCompanies(survey, surveys, companies, current, employee.email).map(company => company.id));
        return { ...employee, companies: assigned.map(company => ({ id: company.id, name: company.name, completed: !pending.has(company.id) })) };
      });
    }
    return { survey, status: getSurveyStatus(survey), progress, employees,
      submissions: submissionCount(selectSurveyResponses(survey, surveys, current)) };
  });
  const results = (['Courier', 'Supplier', 'Subcontractor'] as const).filter(allowedType).map(type => {
    const rows = reporting.filter(row => row.surveyType === type);
    const scored = submissionScores(rows);
    return { type, submissions: submissionCount(rows), scoredSubmissions: scored.length,
      unclassifiedSubmissions: submissionCount(rows.filter(row => row.companyId && uncategorized.has(row.companyId))),
      average: scored.length ? averageRating(rows) : null,
      progress: accounts !== undefined
        ? sumProgress(forms.filter(form => form.survey.surveyType === type).flatMap(form => form.progress ? [form.progress] : []))
        : null };
  });
  const scores = new Map(submissionScores(reporting).map(item => [item.responseId, item.score]));
  const formTitles = new Map(surveys.map(survey => [survey.id, survey.title]));
  const legacyFormOwners = new Map<string, Set<string>>();
  for (const survey of surveys) {
    for (const row of selectSurveyResponses(survey, surveys, reporting)) {
      if (row.surveyId) continue;
      const owners = legacyFormOwners.get(row.responseId) ?? new Set<string>();
      owners.add(survey.id);
      legacyFormOwners.set(row.responseId, owners);
    }
  }
  const recent = groupSurveySubmissions(reporting)
    .filter(submission => submission.answers.some(hasAnsweredItem))
    .map(({ first, id }) => {
      const owners = legacyFormOwners.get(id);
      const surveyId = first.surveyId ?? (owners?.size === 1 ? [...owners][0] : undefined);
      return { ...first, responseId: id, surveyId, score: scores.get(id) ?? null,
        submissionTimestamp: parseSubmissionTimestamp(first.submissionDate),
        formTitle: surveyId ? formTitles.get(surveyId) ?? 'Unknown form' : 'Form unavailable' };
    })
    .sort((a, b) => {
      const left = a.submissionTimestamp ?? Number.NEGATIVE_INFINITY, right = b.submissionTimestamp ?? Number.NEGATIVE_INFINITY;
      return (left === right ? 0 : left > right ? -1 : 1) || a.responseId.localeCompare(b.responseId);
    }).slice(0, 5);
  return {
    forms: forms.filter(form => form.status === 'Running' || form.status === 'Paused').sort((a, b) =>
      Number(a.status === 'Paused') - Number(b.status === 'Paused')
      || String(a.survey.deadlineDate || '9999-12-31').localeCompare(String(b.survey.deadlineDate || '9999-12-31'))),
    results, recent,
  };
}
