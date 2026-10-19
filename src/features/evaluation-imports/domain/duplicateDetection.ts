import type { RawEvalPreview } from '../services/rawEvaluationImport';
import type { EvaluationImportArchive } from './importArchive';

export type EvaluationImportDuplicateReason = 'matching-filename' | 'identical-content' | 'both';

export interface EvaluationImportDuplicate {
  archive: EvaluationImportArchive;
  reason: EvaluationImportDuplicateReason;
  existingResponseCount?: number;
}

/**
 * Compare what the import parser will actually turn into submissions. Source IDs,
 * workbook formatting, sheet order, and file metadata do not affect the match.
 */
export function evaluationPreviewFingerprint(previews: readonly RawEvalPreview[]): string {
  const rows = previews.flatMap((preview) => preview.rows.map((row) => ({
    surveyType: preview.surveyType,
    // Keep every parsed cell: this includes company, dates, ratings and comments.
    // Source response IDs are identifiers, not evaluation content.
    cells: row.cells.slice(1).map((cell) => normalizeCell(cell)),
  })));
  rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(rows);
}

function normalizeCell(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

export function findEvaluationImportDuplicates(
  fileName: string,
  previews: readonly RawEvalPreview[],
  existing: ReadonlyArray<{ archive: EvaluationImportArchive; previews: RawEvalPreview[] }>,
): EvaluationImportDuplicate[] {
  const incomingName = fileName.trim().toLocaleLowerCase();
  const incomingContent = evaluationPreviewFingerprint(previews);
  return existing.flatMap(({ archive, previews: existingPreviews }) => {
    if (archive.surveyType !== 'Combined' && !previews.some((preview) => preview.surveyType === archive.surveyType)) return [];
    const sameName = archive.sourceFileName.trim().toLocaleLowerCase() === incomingName;
    const sameContent = incomingContent === evaluationPreviewFingerprint(existingPreviews);
    if (!sameName && !sameContent) return [];
    return [{ archive, reason: sameName && sameContent ? 'both' : sameName ? 'matching-filename' : 'identical-content' }];
  });
}
