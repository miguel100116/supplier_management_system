import type { CustomForm, PartnerCompany, SurveyType } from '../../../types/survey';
import { normalizeCompanyName } from '../../partner-companies/domain/companyName';
import { isActiveEvaluationCompany } from './companyEligibility';

export interface ActiveEvaluationList {
  surveyType: SurveyType;
  companies: string[];
  membershipComplete?: boolean;
}

/** A read-only projection. Uploaded lists are authoritative; registry growth never adds assignments. */
export function scopeSurveysToActiveLists(surveys: CustomForm[], companies: PartnerCompany[], lists: ActiveEvaluationList[]): CustomForm[] {
  return surveys.map(survey => {
    const list = lists.find(item => item.surveyType === survey.surveyType);
    const registry = companies.filter(company => company.type === survey.surveyType && !company.isArchived
      && (list?.membershipComplete === true || isActiveEvaluationCompany(company)));
    const byName = new Map<string, PartnerCompany[]>();
    for (const company of registry) {
      const key = normalizeCompanyName(company.name);
      byName.set(key, [...(byName.get(key) ?? []), company]);
    }
    const uploadedIds = new Set<string>();
    const activeIds = new Set<string>();
    let unresolved = 0;
    const issues: string[] = [];
    for (const name of list?.companies ?? []) {
      // Prefer an unambiguous exact name; otherwise use the existing import normalization.
      const exact = registry.filter(company => company.name.normalize('NFKC').trim().toLocaleLowerCase() === name.normalize('NFKC').trim().toLocaleLowerCase());
      const matches = exact.length ? exact : byName.get(normalizeCompanyName(name)) ?? [];
      if (matches.length === 1) {
        uploadedIds.add(matches[0].id);
        if (isActiveEvaluationCompany(matches[0])) activeIds.add(matches[0].id);
      }
      else {
        unresolved++;
        const candidates = companies.filter(company => normalizeCompanyName(company.name) === normalizeCompanyName(name));
        const reason = matches.length > 1 ? 'ambiguous registry matches'
          : !candidates.length ? 'not registered'
          : candidates.every(company => !isActiveEvaluationCompany(company)) ? 'archived or inactive'
          : candidates.every(company => company.type !== survey.surveyType) ? 'different or unclassified category'
          : 'no unique eligible registry match';
        issues.push(`${name} (${reason})`);
      }
    }
    return { ...survey, activeEvaluationCompanyIds: [...activeIds], uploadedEvaluationCompanyIds: [...uploadedIds],
      evaluationCompanyMembershipComplete: list?.membershipComplete === true,
      activeEvaluationListIssue: !list ? 'No uploaded Active Companies list is available for this category.'
        : unresolved ? `${unresolved} uploaded company name${unresolved === 1 ? '' : 's'} could not be matched uniquely to a registered ${survey.surveyType.toLowerCase()}. Review the Active Companies upload and Partner Registry: ${issues.join('; ')}.` : undefined };
  });
}
