import type { CustomForm, PartnerCompany, SurveyType } from '../../../types/survey';
import { normalizeCompanyName } from '../../partner-companies/domain/companyName';

export interface ActiveEvaluationList {
  surveyType: SurveyType;
  companies: string[];
}

/** A read-only projection. Uploaded lists are authoritative; registry growth never adds assignments. */
export function scopeSurveysToActiveLists(surveys: CustomForm[], companies: PartnerCompany[], lists: ActiveEvaluationList[]): CustomForm[] {
  return surveys.map(survey => {
    const list = lists.find(item => item.surveyType === survey.surveyType);
    const registry = companies.filter(company => company.type === survey.surveyType && !company.isArchived);
    const byName = new Map<string, PartnerCompany[]>();
    for (const company of registry) {
      const key = normalizeCompanyName(company.name);
      byName.set(key, [...(byName.get(key) ?? []), company]);
    }
    const ids = new Set<string>();
    let unresolved = 0;
    for (const name of list?.companies ?? []) {
      // Prefer an unambiguous exact name; otherwise use the existing import normalization.
      const exact = registry.filter(company => company.name.normalize('NFKC').trim().toLocaleLowerCase() === name.normalize('NFKC').trim().toLocaleLowerCase());
      const matches = exact.length ? exact : byName.get(normalizeCompanyName(name)) ?? [];
      if (matches.length === 1) ids.add(matches[0].id);
      else unresolved++;
    }
    return { ...survey, activeEvaluationCompanyIds: [...ids],
      activeEvaluationListIssue: !list ? 'No uploaded Active Companies list is available for this category.'
        : unresolved ? `${unresolved} uploaded company name${unresolved === 1 ? '' : 's'} could not be matched uniquely to a registered ${survey.surveyType.toLowerCase()}. Review the Active Companies upload and Partner Registry.` : undefined };
  });
}
