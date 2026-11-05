import type { PartnerCompany } from '../../../types/survey';

/** Unset legacy branch status remains eligible; explicitly inactive-only partners do not. */
export function isActiveEvaluationCompany(company: PartnerCompany): boolean {
  return !company.isArchived && !(company.branches?.length && company.branches.every(branch => branch.status === 'Inactive'));
}
