import type { PartnerCompany } from '../../../types/survey';

/** Document completion must not reactivate a branch whose saved manual status is Inactive. */
export function isActiveEvaluationCompany(company: PartnerCompany): boolean {
  return !company.isArchived && !(company.branches?.length && company.branches.every(branch =>
    branch.status === 'Inactive' || (branch.status === 'Completed' && branch.manualStatus === 'Inactive')));
}

export function activeListsFromRegistry(companies: PartnerCompany[]) {
  return (['Courier', 'Supplier', 'Subcontractor'] as const).map(surveyType => ({
    surveyType,
    companies: [...new Set(companies.filter(company => company.type === surveyType && isActiveEvaluationCompany(company))
      .map(company => company.name))].sort((left, right) => left.localeCompare(right)),
  }));
}
