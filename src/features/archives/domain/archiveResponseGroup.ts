import type { ArchiveSeries, SurveyResponse } from '../../../types/survey';

export function describeArchiveResponseGroup(response: SurveyResponse, seriesById: ReadonlyMap<string, ArchiveSeries>) {
  const series = response.seriesId ? seriesById.get(response.seriesId) : undefined;
  const archivedAt = response.archivedAt || response.submissionDate;
  return {
    id: series?.id ?? `legacy_${response.archivedBySurveyId || response.surveyType}_${archivedAt}`,
    label: series?.label ?? (response.archivedBySurveyTitle || response.surveyType + ' Form'),
    seriesId: series?.id,
    sortKey: archivedAt,
  };
}
