import type { PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { hasAnsweredItem } from '../../analytics/domain/analytics';

export function getEvaluatedCompanyNames(responses: SurveyResponse[], partners: PartnerCompany[], type: SurveyType): string[] {
  const names = new Map(partners.filter((partner) => partner.type === type).map((partner) => [partner.id, partner.name]));
  return [...new Set(responses.filter((response) => response.surveyType === type && hasAnsweredItem(response))
    .map((response) => (response.companyId && names.get(response.companyId)) || response.company))].sort();
}
