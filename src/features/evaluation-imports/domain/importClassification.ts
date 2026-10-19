import type { EvaluationImportArchive } from './importArchive';
import type { CustomForm, SurveyResponse, SurveyType } from '../../../types/survey';
import { getSurveyStatus } from '../../evaluations/domain/surveyStatus';
import { DEFAULT_SURVEY_IDS } from './surveyReactivation';
import { isTestImportArchive } from './testImport';

export type EvaluationImportTab = 'active' | 'history';

export function getLegacyActiveEvaluationImportIds(
  archives: readonly EvaluationImportArchive[],
  surveys: readonly Pick<CustomForm, 'id' | 'surveyType' | 'status' | 'deadlineDate' | 'manuallyEndedAt'>[],
  responses: readonly Pick<SurveyResponse, 'importBatchId'>[],
  now = new Date(),
): ReadonlySet<string> {
  const knownBatches = new Set(responses.map((response) => response.importBatchId));
  const selected = new Set<string>();
  for (const survey of surveys) {
    if (survey.id !== DEFAULT_SURVEY_IDS[survey.surveyType] || getSurveyStatus(survey, now) !== 'Running') continue;
    // shortcut: legacy standard CSVs lack batch links; use only their newest copy until explicit source/form links are stored.
    const source = archives.filter((archive) => archive.surveyType === survey.surveyType
      && archive.sourceFileName.trim().toLowerCase() === `Microgenesis ${survey.surveyType} Evaluation Form.csv`.toLowerCase()
      && !isTestImportArchive(archive))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id))[0];
    if (source && source.importStatus !== 'historical' && !knownBatches.has(source.importBatchId)) selected.add(source.id);
  }
  return selected;
}

export function getActiveEvaluationImportBatches(
  surveys: readonly Pick<CustomForm, 'id' | 'surveyType' | 'status' | 'deadlineDate' | 'manuallyEndedAt'>[],
  responses: readonly Pick<SurveyResponse, 'surveyId' | 'surveyType' | 'importBatchId' | 'dataSource' | 'archived'>[],
  now = new Date(),
): ReadonlyMap<string, ReadonlySet<SurveyType>> {
  const activeForms = new Map(surveys.filter((survey) => getSurveyStatus(survey, now) === 'Running').map((survey) => [survey.id, survey.surveyType]));
  const batches = new Map<string, Set<SurveyType>>();
  for (const response of responses) {
    if (response.archived || response.dataSource !== 'client_csv' || !response.importBatchId) continue;
    const surveyId = response.surveyId ?? DEFAULT_SURVEY_IDS[response.surveyType];
    if (activeForms.get(surveyId) !== response.surveyType) continue;
    const types = batches.get(response.importBatchId) ?? new Set<SurveyType>();
    types.add(response.surveyType);
    batches.set(response.importBatchId, types);
  }
  return batches;
}

/** Explicit archival wins over linked active forms and standard-source legacy recovery. */
export function classifyEvaluationImport(
  archive: EvaluationImportArchive,
  activeBatches: ReadonlyMap<string, ReadonlySet<SurveyType>>,
  legacyActiveIds: ReadonlySet<string> = new Set(),
): EvaluationImportTab {
  if (archive.importStatus === 'historical') return 'history';
  if (legacyActiveIds.has(archive.id)) return 'active';
  const types = activeBatches.get(archive.importBatchId);
  return (archive.surveyType === 'Combined' ? !!types?.size : types?.has(archive.surveyType)) ? 'active' : 'history';
}

export function filterEvaluationImportArchives(
  archives: readonly EvaluationImportArchive[],
  activeBatches: ReadonlyMap<string, ReadonlySet<SurveyType>>,
  tab: EvaluationImportTab,
  category: 'all' | EvaluationImportArchive['surveyType'],
  legacyActiveIds: ReadonlySet<string> = new Set(),
): EvaluationImportArchive[] {
  return archives.filter((archive) =>
    classifyEvaluationImport(archive, activeBatches, legacyActiveIds) === tab
      && (category === 'all' || archive.surveyType === category || archive.surveyType === 'Combined'));
}
