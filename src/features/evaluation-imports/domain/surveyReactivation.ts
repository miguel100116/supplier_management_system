import type { CustomForm, SurveyType } from '../../../types/survey';
import { parseDDMMYYYY } from '../../../utils/time';
import { getSurveyStatus } from '../../evaluations/domain/surveyStatus';

export const DEFAULT_SURVEY_IDS: Record<SurveyType, string> = {
  Courier: 'default-courier',
  Supplier: 'default-supplier',
  Subcontractor: 'default-subcontractor',
};

/** Reopens only the standard form represented by each imported category. */
export function prepareDefaultSurveysForReactivation(
  surveys: readonly CustomForm[],
  importedSurveyTypes: readonly SurveyType[],
  now = new Date(),
): CustomForm[] {
  const importedTypes = new Set(importedSurveyTypes);

  return surveys.flatMap((survey) => {
    if (survey.id !== DEFAULT_SURVEY_IDS[survey.surveyType]) return [];
    if (!importedTypes.has(survey.surveyType) || getSurveyStatus(survey, now) !== 'Completed') return [];

    const deadline = parseDDMMYYYY(survey.deadlineDate);
    const deadlineExpired = deadline !== null
      && now >= new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate() + 1);

    return [{
      ...survey,
      status: 'Running',
      manuallyEndedAt: undefined,
      archivedAt: undefined,
      ...(deadlineExpired ? { deadlineDate: undefined } : {}),
    }];
  });
}
