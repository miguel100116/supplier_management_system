import type { SurveyResponse, SurveyType } from '../../../types/survey';
import { groupCompanyResponses } from '../../evaluations/domain/scoring';
import { compareAnalyticsCompanies, getAnalyticsCompanyRankings, type AnalyticsCompanySummary } from './rankings';

// Owned by one mounted Analytics view: permission/filter changes cannot reuse another view's data.
export function createCompanyRankingUpdater() {
  let cache = new Map<string, { rows: SurveyResponse[]; ranking: AnalyticsCompanySummary | undefined }>();
  let previous: AnalyticsCompanySummary[] = [];
  return (responses: SurveyResponse[], types: SurveyType[]): AnalyticsCompanySummary[] => {
    const next: typeof cache = new Map();
    const rankings: AnalyticsCompanySummary[] = [];
    for (const type of types) {
      for (const [key, group] of groupCompanyResponses(responses, type)) {
        const identity = `${type}:${key}`;
        const cached = cache.get(identity);
        const unchanged = cached && cached.rows.length === group.responses.length
          && cached.rows.every((row, index) => row === group.responses[index]);
        const value = unchanged ? cached : {
          rows: group.responses,
          ranking: getAnalyticsCompanyRankings(group.responses, [type])[0],
        };
        // An answer edit that leaves the displayed result unchanged keeps the row stable too.
        if (cached && JSON.stringify(cached.ranking) === JSON.stringify(value.ranking)) value.ranking = cached.ranking;
        next.set(identity, value);
        if (value.ranking) rankings.push(value.ranking);
      }
    }
    cache = next;
    rankings.sort(compareAnalyticsCompanies);
    if (rankings.length === previous.length && rankings.every((row, index) => row === previous[index])) return previous;
    previous = rankings;
    return rankings;
  };
}
