import type { EvaluationImportArchive } from './importArchive';

export type EvaluationImportTab = 'active' | 'history';

/** Persisted replacement state is authoritative; legacy records use their current response linkage. */
export function classifyEvaluationImport(
  archive: EvaluationImportArchive,
  responseCounts: ReadonlyMap<string, number>,
): EvaluationImportTab {
  if (archive.importStatus === 'historical') return 'history';
  return (responseCounts.get(archive.importBatchId) ?? 0) > 0 ? 'active' : 'history';
}

export function filterEvaluationImportArchives(
  archives: readonly EvaluationImportArchive[],
  responseCounts: ReadonlyMap<string, number>,
  tab: EvaluationImportTab,
  category: 'all' | EvaluationImportArchive['surveyType'],
): EvaluationImportArchive[] {
  return archives.filter((archive) =>
    classifyEvaluationImport(archive, responseCounts) === tab
      && (category === 'all' || archive.surveyType === category || archive.surveyType === 'Combined'));
}
