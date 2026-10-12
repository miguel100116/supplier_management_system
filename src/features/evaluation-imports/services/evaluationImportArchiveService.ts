import {
  APPLICATION_RECORD_CHANGED_EVENT,
  deleteApplicationRecords,
  loadApplicationRecords,
  surveyResponseRecordId,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';
import { isSupabaseConfigured, supabase } from '../../../services/supabaseClient';
import {
  EVALUATION_IMPORT_ARCHIVE_BUCKET,
  EvaluationImportArchive,
  evaluationImportContentType,
  evaluationImportFileExtension,
  MAX_EVALUATION_IMPORT_FILE_BYTES,
  parseEvaluationImportArchive,
} from '../domain/importArchive';
import type { SurveyType } from '../../../types/survey';
import type { PartnerCompany, SurveyResponse } from '../../../types/survey';
import { isTestImportArchive, selectTestImportCleanup } from '../domain/testImport';

function archiveSetupError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Unknown Supabase error.';
  if (/bucket not found|evaluation-import-archives/i.test(message) && /bucket not found|not found/i.test(message)) {
    return new Error('Evaluation source-file storage is not enabled in this Supabase project yet. Apply migration 202609300001_evaluation_import_archives.sql, then retry.');
  }
  if (message.includes('application_records_record_type_check')) {
    return new Error('Evaluation source-file archives are not enabled in this Supabase project yet. Apply migration 202609300001_evaluation_import_archives.sql, then retry.');
  }
  return error instanceof Error ? error : new Error(message);
}

export async function loadEvaluationImportArchives(): Promise<EvaluationImportArchive[]> {
  const records = await loadApplicationRecords<unknown>('evaluation_import_archive');
  return records
    .map(parseEvaluationImportArchive)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

export async function loadEvaluationImportResponseCounts(): Promise<Map<string, number>> {
  const responses = await loadApplicationRecords<SurveyResponse>('survey_response');
  const uniqueByBatch = new Map<string, Set<string>>();
  for (const response of responses) {
    if (response.dataSource !== 'client_csv' || !response.importBatchId) continue;
    const ids = uniqueByBatch.get(response.importBatchId) ?? new Set<string>();
    ids.add(response.responseId);
    uniqueByBatch.set(response.importBatchId, ids);
  }
  return new Map([...uniqueByBatch].map(([batchId, ids]) => [batchId, ids.size]));
}

export async function markEvaluationImportReplaced(
  existingArchive: EvaluationImportArchive,
  replacementArchive: EvaluationImportArchive,
  originalResponseCount: number,
): Promise<EvaluationImportArchive | null> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const [archives, responseCounts] = await Promise.all([
    loadEvaluationImportArchives(),
    loadEvaluationImportResponseCounts(),
  ]);
  const current = archives.find((archive) => archive.id === existingArchive.id);
  if (!current || current.importBatchId !== existingArchive.importBatchId) {
    throw new Error('The selected source file changed during replacement. Refresh Stored Source Files.');
  }
  // Content-addressed batch IDs can be shared by identical source versions, so they cannot prove ownership.
  if (current.importBatchId === replacementArchive.importBatchId) return null;
  if (archives.filter((archive) => archive.importBatchId === current.importBatchId).length !== 1) return null;
  // Retain ambiguous/partial relationships as active; only mark history after every linked row moved.
  if ((responseCounts.get(current.importBatchId) ?? 0) > 0) return null;
  const historical = {
    ...current,
    importStatus: 'historical' as const,
    historicalStatus: 'Replaced' as const,
    replacedAt: replacementArchive.uploadedAt,
    replacedByArchiveId: replacementArchive.id,
    originalResponseCount,
  };
  await upsertApplicationRecords('evaluation_import_archive', [historical], (archive) => archive.id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APPLICATION_RECORD_CHANGED_EVENT, { detail: { recordType: 'evaluation_import_archive' } }));
  }
  return historical;
}

/** Move selected imports to history while keeping both stored files and linked responses intact. */
export async function archiveEvaluationImports(
  selectedArchives: readonly EvaluationImportArchive[],
): Promise<EvaluationImportArchive[]> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const currentArchives = await loadEvaluationImportArchives();
  const updates = selectedArchives.map((selected) => {
    const current = currentArchives.find((archive) => archive.id === selected.id);
    if (!current || current.importBatchId !== selected.importBatchId || current.storagePath !== selected.storagePath) {
      throw new Error(`The source file "${selected.sourceFileName}" changed. Refresh Stored Source Files and try again.`);
    }
    if (current.importStatus === 'historical') return current;
    return { ...current, importStatus: 'historical' as const, historicalStatus: 'Archived' as const };
  }).filter((archive) => archive.importStatus === 'historical' && archive.historicalStatus === 'Archived');
  const changedArchives = updates.filter((archive) => !selectedArchives.some((selected) =>
    selected.id === archive.id && selected.importStatus === 'historical' && selected.historicalStatus === 'Archived'));
  if (changedArchives.length === 0) return [];
  await upsertApplicationRecords('evaluation_import_archive', changedArchives, (archive) => archive.id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APPLICATION_RECORD_CHANGED_EVENT, { detail: { recordType: 'evaluation_import_archive' } }));
  }
  return changedArchives;
}

export async function saveEvaluationImportArchive(
  file: File,
  surveyType: SurveyType | 'Combined',
  uploadedBy: string,
  importBatchId: string,
): Promise<EvaluationImportArchive> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured. The source file was not imported.');
  if (file.size <= 0 || file.size > MAX_EVALUATION_IMPORT_FILE_BYTES) {
    throw new Error('The source file must be between 1 byte and 25 MB.');
  }
  const extension = evaluationImportFileExtension(file.name);
  const id = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const storagePath = `${surveyType.toLocaleLowerCase()}/${uploadedAt.slice(0, 10)}/${id}${extension}`;
  const contentType = evaluationImportContentType(file.name);

  const { error: uploadError } = await supabase.storage
    .from(EVALUATION_IMPORT_ARCHIVE_BUCKET)
    .upload(storagePath, file, { contentType, cacheControl: '3600', upsert: false });
  if (uploadError) {
    throw archiveSetupError(new Error(`Unable to store the source file in Supabase Storage: ${uploadError.message}`));
  }

  const archive = parseEvaluationImportArchive({
    id,
    surveyType,
    uploadedAt,
    uploadedBy: uploadedBy.trim().toLocaleLowerCase(),
    sourceFileName: file.name,
    storagePath,
    contentType,
    fileSize: file.size,
    importBatchId,
  });

  try {
    await upsertApplicationRecords('evaluation_import_archive', [archive], (record) => record.id);
  } catch (error) {
    const { error: rollbackError } = await supabase.storage
      .from(EVALUATION_IMPORT_ARCHIVE_BUCKET)
      .remove([storagePath]);
    if (rollbackError) {
      throw new Error(`Archive metadata could not be saved, and the uploaded object could not be removed: ${rollbackError.message}`);
    }
    throw archiveSetupError(error);
  }

  return archive;
}

export async function downloadEvaluationImportArchive(archive: EvaluationImportArchive): Promise<Blob> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.storage
    .from(EVALUATION_IMPORT_ARCHIVE_BUCKET)
    .download(archive.storagePath);
  if (error) throw new Error(`Unable to download the archived source file: ${error.message}`);
  return data;
}

export async function discardPendingEvaluationImportArchive(archive: EvaluationImportArchive): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const stored = (await loadEvaluationImportArchives()).find((item) => item.id === archive.id);
  if (!stored || stored.importBatchId !== archive.importBatchId || stored.storagePath !== archive.storagePath) {
    throw new Error('The staged source file changed before it could be removed.');
  }
  const { error } = await supabase.storage.from(EVALUATION_IMPORT_ARCHIVE_BUCKET).remove([stored.storagePath]);
  if (error) throw new Error(`Unable to remove staged source file: ${error.message}`);
  await deleteApplicationRecords('evaluation_import_archive', [stored.id]);
}

export async function removeOrdinaryEvaluationImport(archive: EvaluationImportArchive): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const archives = await loadEvaluationImportArchives();
  const storedArchive = archives.find((item) => item.id === archive.id);
  if (!storedArchive || storedArchive.importBatchId !== archive.importBatchId || storedArchive.storagePath !== archive.storagePath) {
    throw new Error('This source file archive has changed. Refresh the page before removing it.');
  }
  const responses = await loadApplicationRecords<SurveyResponse>('survey_response');
  const linkedResponses = responses.filter((response) => response.importBatchId === storedArchive.importBatchId);
  if (storedArchive.importStatus !== 'historical' && linkedResponses.length > 0) {
    throw new Error('Archive this import before permanently removing it. Active imports cannot be permanently removed.');
  }
  if (storedArchive.importStatus === 'historical' || linkedResponses.length === 0) {
    const { error } = await supabase.storage.from(EVALUATION_IMPORT_ARCHIVE_BUCKET).remove([storedArchive.storagePath]);
    if (error) throw new Error(`Unable to remove the historical source file: ${error.message}`);
    await deleteApplicationRecords('evaluation_import_archive', [storedArchive.id]);
    return;
  }
  throw new Error('Archive this import before permanently removing it.');
}

export async function removeTestEvaluationImport(archive: EvaluationImportArchive): Promise<{ responsesRemoved: number; companiesRemoved: number }> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (!isTestImportArchive(archive)) throw new Error('Only isolated test imports can be removed.');

  const storedArchive = (await loadEvaluationImportArchives()).find((item) => item.id === archive.id);
  if (!storedArchive || storedArchive.importBatchId !== archive.importBatchId || storedArchive.storagePath !== archive.storagePath) {
    throw new Error('This test import archive has changed. Refresh the page before removing it.');
  }
  const [responses, companies] = await Promise.all([
    loadApplicationRecords<SurveyResponse>('survey_response'),
    loadApplicationRecords<PartnerCompany>('partner_company'),
  ]);
  if (storedArchive.importStatus !== 'historical' && responses.some((response) => response.importBatchId === storedArchive.importBatchId)) {
    throw new Error('Archive this test import before permanently removing it.');
  }
  const selected = selectTestImportCleanup(storedArchive, responses, companies);

  try {
    await deleteApplicationRecords('survey_response', selected.responses.map(surveyResponseRecordId));
    await deleteApplicationRecords('partner_company', selected.companies.map((company) => company.id));
    const { error: storageError } = await supabase.storage
      .from(EVALUATION_IMPORT_ARCHIVE_BUCKET)
      .remove([storedArchive.storagePath]);
    if (storageError) throw new Error(`The test responses were removed, but the source file could not be deleted: ${storageError.message}`);
    await deleteApplicationRecords('evaluation_import_archive', [storedArchive.id]);
  } finally {
    if (typeof window !== 'undefined') {
      for (const recordType of ['survey_response', 'partner_company'] as const) {
        window.dispatchEvent(new CustomEvent(APPLICATION_RECORD_CHANGED_EVENT, { detail: { recordType } }));
      }
    }
  }

  return { responsesRemoved: new Set(selected.responses.map((response) => response.responseId)).size, companiesRemoved: selected.companies.length };
}
