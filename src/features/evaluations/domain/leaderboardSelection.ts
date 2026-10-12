import type { PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { isOfficialAnalyticsResponse } from '../../analytics/domain/responseProvenance';
import { getLeaderboard } from '../../../utils/scoring';

export const EVALUATION_LEADERBOARD_SELECTION_SIZE = 20;

/**
 * Resolves up to 20 active registered companies in the category's current
 * volume-weighted Analytics leaderboard order. Active companies without a
 * scored official response fill any remaining slots after ranked companies.
 */
export function getEvaluationLeaderboardTopTwenty(
  partnerCompanies: PartnerCompany[],
  currentResponses: SurveyResponse[],
  surveyType: SurveyType,
): PartnerCompany[] {
  const activeCompanies = partnerCompanies.filter((company) => company.type === surveyType && !company.isArchived);
  const companiesById = new Map(activeCompanies.map((company) => [company.id, company]));
  const companiesByName = new Map<string, PartnerCompany[]>();
  activeCompanies.forEach((company) => {
    const key = company.name.trim().toLocaleLowerCase();
    companiesByName.set(key, [...(companiesByName.get(key) ?? []), company]);
  });

  const selected = new Map<string, PartnerCompany>();
  const officialResponses = currentResponses.filter(isOfficialAnalyticsResponse);
  for (const ranking of getLeaderboard(officialResponses, surveyType)) {
    const nameMatches = companiesByName.get(ranking.company.trim().toLocaleLowerCase()) ?? [];
    const company = ranking.companyId
      ? companiesById.get(ranking.companyId)
      : nameMatches.length === 1 ? nameMatches[0] : undefined;
    if (company) selected.set(company.id, company);
    if (selected.size >= EVALUATION_LEADERBOARD_SELECTION_SIZE) break;
  }

  if (selected.size < EVALUATION_LEADERBOARD_SELECTION_SIZE) {
    for (const company of activeCompanies.slice().sort((left, right) => left.name.localeCompare(right.name))) {
      if (!selected.has(company.id)) selected.set(company.id, company);
      if (selected.size >= EVALUATION_LEADERBOARD_SELECTION_SIZE) break;
    }
  }

  return [...selected.values()];
}
