import type { SurveyType } from '../../../types/survey';
import type { ArchiveAnalyticsData } from '../domain/archiveAnalyticsVisuals';
import type { ReportRecipe } from '../domain/reportHistory';
import { exportTablesAsPDF, type ExportTable } from './exporters';
import { createArchiveAnalyticsImages } from './archiveAnalyticsImages';

/** Shared branded table layout with the selected-item tables and saved recipe. */
export async function exportArchivedReportAsPDF(
  title: string,
  itemLabel: string,
  category: SurveyType,
  tables: ExportTable[],
  recipe: ReportRecipe,
  analytics: ArchiveAnalyticsData[] = [],
): Promise<void> {
  const reportTables = analytics.some(item => item.summary.companies.length) ? tables.filter(table => table.title !== 'Company leaderboard') : tables;
  await exportTablesAsPDF(title, reportTables, 'archived_report', recipe,
    `Archived ${category} evaluation report for ${itemLabel}. The following tables and Analytics visuals contain the stored records for the selected item, evaluated using the current rubric. This is not an immutable archive-time snapshot.`,
    recipe.parameters.paperSize ?? 'a4', await createArchiveAnalyticsImages(analytics.filter(item => item.category === category)));
}
