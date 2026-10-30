import type { CustomForm, PartnerCompany, SurveyType } from '../../../types/survey';
import { EVALUATION_LEADERBOARD_SELECTION_SIZE } from './leaderboardSelection';
import { getSurveyEvaluationCompanies } from '../../analytics/domain/analytics';

export function requiresDistributionCompanySelection(type: SurveyType): type is 'Courier' | 'Supplier' {
  return type === 'Courier' || type === 'Supplier';
}

export function applyDistributionCompanySelection(survey: CustomForm, selectedIds: string[] | null, companies: PartnerCompany[]): CustomForm {
  if (selectedIds === null) {
    if (requiresDistributionCompanySelection(survey.surveyType)) throw new Error('Select at least one company from the Top 20 list before confirming.');
    return survey;
  }
  const ids = [...new Set(selectedIds)];
  const activeIds = new Set(getSurveyEvaluationCompanies({ ...survey, evaluationCompanyIds: undefined }, companies).map(company => company.id));
  if (!requiresDistributionCompanySelection(survey.surveyType) || ids.length === 0 || ids.length > (survey.activeEvaluationCompanyIds?.length ?? EVALUATION_LEADERBOARD_SELECTION_SIZE)
    || ids.some((id) => !activeIds.has(id))) {
    throw new Error('The company selection is no longer valid. Select companies from the Top 20 list again before confirming.');
  }
  return { ...survey, evaluationCompanyIds: ids };
}
