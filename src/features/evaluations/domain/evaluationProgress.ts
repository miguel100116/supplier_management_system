import type { CustomForm, PartnerCompany, SurveyResponse } from '../../../types/survey';
import { getSurveyEvaluationCompanies, hasAnsweredItem } from '../../analytics/domain/analytics';
import { selectSurveyResponses } from './surveyResponses';

export function getPendingEvaluationCompanies(
  survey: CustomForm,
  surveys: CustomForm[],
  companies: PartnerCompany[],
  responses: SurveyResponse[],
  userEmail: string,
): PartnerCompany[] {
  const email = userEmail.trim().toLowerCase();
  const evaluated = new Set<string>();
  const registry = companies.filter((company) => company.type === survey.surveyType);
  for (const row of selectSurveyResponses(survey, surveys, responses)) {
    if (row.archived || !hasAnsweredItem(row) || row.respondentEmail?.trim().toLowerCase() !== email) continue;
    if (row.companyId) evaluated.add(row.companyId);
    else {
      const matches = registry.filter((company) => company.name.trim().toLowerCase() === row.company.trim().toLowerCase());
      if (matches.length === 1) evaluated.add(matches[0].id);
    }
  }
  return getSurveyEvaluationCompanies(survey, companies).filter((company) => !evaluated.has(company.id));
}
