import type { SurveyType } from '../../../types/survey';
import { EvaluationFormMismatchError, type RawEvalPreview } from '../services/rawEvaluationImport';

const SURVEY_TYPES: SurveyType[] = ['Supplier', 'Subcontractor', 'Courier'];
const EXTENSION_BY_MIME: Record<string, string> = {
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

export function normalizeEvaluationFile(candidate: File): File {
  const name = candidate.name.trim();
  if (/\.(csv|xlsx|xls)$/i.test(name)) {
    return name === candidate.name ? candidate : new File([candidate], name, { type: candidate.type, lastModified: candidate.lastModified });
  }
  if (!/\.[^.]+$/.test(name)) {
    const extension = EXTENSION_BY_MIME[candidate.type.toLowerCase()];
    if (extension) return new File([candidate], `${name}${extension}`, { type: candidate.type, lastModified: candidate.lastModified });
  }
  throw new Error(`"${candidate.name}" is not a supported evaluation file. Choose a .csv, .xlsx, or .xls export.`);
}

export async function detectEvaluationPreviews(
  file: File,
  preview: (file: File, surveyType: SurveyType) => Promise<RawEvalPreview>,
): Promise<RawEvalPreview[]> {
  const results = await Promise.allSettled(SURVEY_TYPES.map((surveyType) => preview(file, surveyType)));
  const fatal = results.find((result) => result.status === 'rejected' && !(result.reason instanceof EvaluationFormMismatchError));
  if (fatal?.status === 'rejected') throw fatal.reason;
  const found = results.filter((result): result is PromiseFulfilledResult<RawEvalPreview> => result.status === 'fulfilled')
    .map((result) => result.value);
  if (found.length === 0) {
    throw new Error('No supported evaluation form was found. Use the original Supplier, Subcontractor, or Courier response export with its company-name column.');
  }
  return found;
}
