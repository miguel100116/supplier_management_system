import type { PartnerCompany, PartnerCompanyType, SupplierOrigin } from '../../../types/survey';
import { isNTBranch } from '../../document-tracker/domain/compliance';

export type DirectoryBusinessType = 'Trade' | 'Non-Trade';

export function matchesDirectoryClassificationFilters(
  company: Pick<PartnerCompany, 'type' | 'supplierOrigin' | 'branches'>,
  origins: SupplierOrigin[],
  businessTypes: DirectoryBusinessType[],
  activeCategory: PartnerCompanyType | 'All' = 'All',
): boolean {
  const originsMatch = origins.length === 2 || (activeCategory !== 'All' && activeCategory !== 'Supplier')
    || (company.type === 'Supplier' && origins.includes(company.supplierOrigin ?? 'Local'));
  const businessTypeMatches = businessTypes.length === 2
    || (company.branches ?? []).some((branch) => businessTypes.includes(isNTBranch(branch) ? 'Non-Trade' : 'Trade'));
  return originsMatch && businessTypeMatches;
}
