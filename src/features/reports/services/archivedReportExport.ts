import type { SurveyType } from '../../../types/survey';
import type { ReportRecipe } from '../domain/reportHistory';
import { exportTablesAsPDF, type ExportTable } from './exporters';

/** Shared branded table layout with the selected-item tables and saved recipe. */
export async function exportArchivedReportAsPDF(
  title: string,
  itemLabel: string,
  category: SurveyType,
  tables: ExportTable[],
  recipe: ReportRecipe,
): Promise<void> {
  await exportTablesAsPDF(title, tables, 'archived_report', recipe,
    `Archived ${category} evaluation report for ${itemLabel}. The following tables contain the stored records for the selected item, evaluated using the current rubric. This is not an immutable archive-time snapshot.`);
}
