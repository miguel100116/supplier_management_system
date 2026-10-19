import type { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { getSurveyEvaluationCompanies } from '../../analytics/domain/analytics';
import { getSurveyStatus } from '../../evaluations/domain/surveyStatus';
import { parseDDMMYYYY } from '../../../utils/time';

export type EmployeeEvaluationFilter = 'All evaluations' | SurveyType;

export interface PendingEvaluation {
  id: string;
  surveyId: string;
  company: string;
  type: SurveyType;
  title: string;
  companyId: string;
  deadline: Date | null;
}

export function getPendingEmployeeEvaluations(
  surveys: CustomForm[],
  partnerCompanies: PartnerCompany[],
  responses: SurveyResponse[],
  userEmail: string,
  now = new Date(),
): PendingEvaluation[] {
  const normalizedEmail = userEmail.trim().toLowerCase();
  const completedByType = new Map<SurveyType, Set<string>>();

  responses
    .filter((response) => response.respondentEmail?.trim().toLowerCase() === normalizedEmail)
    .forEach((response) => {
      const completedCompanies = completedByType.get(response.surveyType) ?? new Set<string>();
      completedCompanies.add(response.company.trim().toLowerCase());
      completedByType.set(response.surveyType, completedCompanies);
    });

  return surveys
    .filter((survey) => getSurveyStatus(survey, now) === 'Running')
    .flatMap((survey) => {
      const deadline = parseDDMMYYYY(survey.deadlineDate);
      const completedCompanies = completedByType.get(survey.surveyType);

      return getSurveyEvaluationCompanies(survey, partnerCompanies)
        .filter((company) => !completedCompanies?.has(company.name.trim().toLowerCase()))
        .map((company) => ({
          id: `${survey.id}:${company.id}`,
          surveyId: survey.id,
          company: company.name,
          companyId: company.id,
          type: survey.surveyType,
          title: survey.title,
          deadline,
        }));
    })
    .sort((left, right) => {
      const deadlineDifference = (left.deadline?.getTime() ?? Number.POSITIVE_INFINITY)
        - (right.deadline?.getTime() ?? Number.POSITIVE_INFINITY);
      return deadlineDifference || left.company.localeCompare(right.company) || left.title.localeCompare(right.title);
    });
}

export function filterPendingEvaluations(
  evaluations: PendingEvaluation[],
  filter: EmployeeEvaluationFilter,
  search = '',
): PendingEvaluation[] {
  const query = search.trim().toLowerCase();
  return evaluations.filter((evaluation) =>
    (filter === 'All evaluations' || evaluation.type === filter) &&
    (!query || `${evaluation.company} ${evaluation.title}`.toLowerCase().includes(query)),
  );
}
