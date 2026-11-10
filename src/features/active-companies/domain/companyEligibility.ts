import type { PartnerCompany } from '../../../types/survey';

/** Document completion must not reactivate a branch whose saved manual status is Inactive. */
export function isActiveEvaluationCompany(company: PartnerCompany): boolean {
  return !company.isArchived && !(company.branches?.length && company.branches.every(branch =>
    branch.status === 'Inactive' || (branch.status === 'Completed' && branch.manualStatus === 'Inactive')));
}

export function reactivateEvaluationCompany(company: PartnerCompany): PartnerCompany {
  return {
    ...company,
    branches: (company.branches ?? []).map(branch => {
      if (branch.status !== 'Inactive' && !(branch.status === 'Completed' && branch.manualStatus === 'Inactive')) return branch;
      const reactivated = { ...branch, status: 'Pending' as const };
      delete reactivated.manualStatus;
      return reactivated;
    }),
  };
}

export function activeListsFromRegistry(companies: PartnerCompany[]) {
  return (['Courier', 'Supplier', 'Subcontractor'] as const).map(surveyType => ({
    surveyType,
    companies: [...new Set(companies.filter(company => company.type === surveyType && isActiveEvaluationCompany(company))
      .map(company => company.name))].sort((left, right) => left.localeCompare(right)),
  }));
}
