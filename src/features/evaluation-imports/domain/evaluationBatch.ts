import type { PartnerCompany } from '../../../types/survey';
import { normalizeCompanyName } from '../../partner-companies/services/masterListImport';
import type { RawEvalCommitResult, RawEvalPreview } from '../services/rawEvaluationImport';
import type { EvaluationImportArchive } from './importArchive';
import { testImportToken } from './testImport';

export type PreparedEvaluationBatchEntry = { preview: RawEvalPreview } & RawEvalCommitResult;

/** Source IDs are stable only within a category. Never let one file silently replace another in a batch. */
export function validateEvaluationBatchPreviews(previews: readonly RawEvalPreview[]): void {
  const seen = new Map<string, string>();
  for (const preview of previews) {
    for (const row of preview.rows) {
      const key = row.responseId;
      const previousFile = seen.get(key);
      if (previousFile) {
        throw new Error(`${preview.surveyType} response ID ${key} appears more than once in this batch (${previousFile} and ${preview.fileName}). Choose files with non-overlapping response IDs.`);
      }
      seen.set(key, preview.fileName);
    }
  }
}

/** A new registry partner appearing in several files is created once for normal imports. */
export function reconcileEvaluationBatchPartners(entries: readonly PreparedEvaluationBatchEntry[]): PreparedEvaluationBatchEntry[] {
  const companyByName = new Map<string, PartnerCompany>();
  return entries.map((entry) => {
    if (testImportToken(entry.preview.importBatchId)) return entry;
    const replacements = new Map<string, PartnerCompany>();
    const newPartnerCompanies = entry.newPartnerCompanies.filter((company) => {
      const normalized = normalizeCompanyName(company.name);
      const existing = companyByName.get(normalized);
      if (existing) {
        replacements.set(company.id, existing);
        return false;
      }
      companyByName.set(normalized, company);
      return true;
    });
    return {
      ...entry,
      newPartnerCompanies,
      responses: entry.responses.map((response) => {
        const canonical = response.companyId ? replacements.get(response.companyId) : undefined;
        return canonical ? { ...response, companyId: canonical.id, company: canonical.name } : response;
      }),
      summary: { ...entry.summary, addedCompanies: newPartnerCompanies.map((company) => company.name) },
    };
  });
}

/** Source files are archived before any response write; undo staged archives if that phase fails. */
export async function archiveEvaluationBatch<T>(
  items: readonly T[],
  archive: (item: T) => Promise<EvaluationImportArchive>,
  discard: (archive: EvaluationImportArchive) => Promise<void>,
): Promise<EvaluationImportArchive[]> {
  const archiveConcurrency = 3;
  const results: PromiseSettledResult<EvaluationImportArchive>[] = [];
  for (let index = 0; index < items.length; index += archiveConcurrency) {
    const batch = await Promise.allSettled(items.slice(index, index + archiveConcurrency).map(archive));
    results.push(...batch);
    if (batch.some((result) => result.status === 'rejected')) break;
  }
  const staged: EvaluationImportArchive[] = [];
  results.forEach((result) => {
    if (result.status === 'fulfilled') staged.push(result.value);
  });
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected?.status === 'rejected') {
    const failedCleanup: string[] = [];
    for (const stored of [...staged].reverse()) {
      try {
        await discard(stored);
      } catch {
        failedCleanup.push(stored.sourceFileName);
      }
    }
    if (failedCleanup.length) {
      const reason = rejected.reason instanceof Error ? rejected.reason.message : 'Unable to archive a source file.';
      throw new Error(`${reason} Earlier files could not be removed: ${failedCleanup.join(', ')}. No responses were imported.`);
    }
    throw rejected.reason;
  }
  // Promise.allSettled preserves input order, so keep archive cards aligned
  // with their corresponding selected files.
  return results.map((result) => (result as PromiseFulfilledResult<EvaluationImportArchive>).value);
}
