import type { SurveyType } from '../../../types/survey';
import type { ArchiveAnalyticsData } from '../domain/archiveAnalyticsVisuals';
import type { ReportRecipe } from '../domain/reportHistory';
import { createTablesPdf, type ExportTable } from './exporters';
import { createArchiveAnalyticsImages } from './archiveAnalyticsImages';
import { createArchivedSurveyPdf } from './archivedSurveyPdf';
import { saveReportDownload } from './exportHistory';
import { ARCHIVED_SURVEY_PAPER } from '../domain/archivedReportLayout';

/** Shared branded table layout with the selected-item tables and saved recipe. */
export async function createArchivedReportPdf(
  title: string,
  itemLabel: string,
  category: SurveyType,
  tables: ExportTable[],
  recipe: ReportRecipe,
  analytics: ArchiveAnalyticsData[] = [],
  options: { preview?: boolean } = {},
): Promise<Blob> {
  if (recipe.kind === 'archived-survey') {
    return createArchivedSurveyPdf(title, itemLabel, category, tables, analytics, recipe.parameters.paperSize ?? ARCHIVED_SURVEY_PAPER);
  }
  const reportTables = analytics.some(item => item.summary.companies.length) ? tables.filter(table => table.title !== 'Company leaderboard') : tables;
  const categoryAnalytics = analytics.every(item => item.category === category) ? analytics : analytics.filter(item => item.category === category);
  return createTablesPdf(title, reportTables,
    `Archived ${category} evaluation report for ${itemLabel}. The following tables and Analytics visuals contain the stored records for the selected item, evaluated using the current rubric. This is not an immutable archive-time snapshot.`,
    recipe.parameters.paperSize ?? 'a4', await createArchiveAnalyticsImages(categoryAnalytics, options.preview ? 1.25 : 2));
}

export async function exportArchivedReportAsPDF(title: string, itemLabel: string, category: SurveyType, tables: ExportTable[], recipe: ReportRecipe, analytics: ArchiveAnalyticsData[] = []): Promise<void> {
  return saveReportDownload(await createArchivedReportPdf(title, itemLabel, category, tables, recipe, analytics), title, 'pdf', recipe);
}
