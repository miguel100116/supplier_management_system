import type { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { getPendingEvaluationCompanies } from '../../evaluations/domain/evaluationProgress';
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
  knownSurveys: CustomForm[] = surveys,
): PendingEvaluation[] {
  return surveys
    .filter((survey) => getSurveyStatus(survey, now) === 'Running')
    .flatMap((survey) => {
      const deadline = parseDDMMYYYY(survey.deadlineDate);

      return getPendingEvaluationCompanies(survey, knownSurveys, partnerCompanies, responses, userEmail)
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
