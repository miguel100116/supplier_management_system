import type { PartnerCompany, PartnerCompanyType, SupplierOrigin } from '../../../types/survey';
import { isNTBranch } from '../../document-tracker/domain/compliance';

export type DirectoryBusinessType = 'Trade' | 'Non-Trade';
export type DirectoryCategoryFilter = PartnerCompanyType | 'All' | 'Supplier (Local)' | 'Supplier (Foreign)';

export function matchesDirectoryClassificationFilters(
  company: Pick<PartnerCompany, 'type' | 'supplierOrigin' | 'branches'>,
  origins: SupplierOrigin[],
  businessTypes: DirectoryBusinessType[],
  activeCategory: DirectoryCategoryFilter = 'All',
): boolean {
  const companyOrigin = company.supplierOrigin ?? 'Local';
  const supplierCategory = activeCategory === 'Supplier' || activeCategory === 'Supplier (Local)' || activeCategory === 'Supplier (Foreign)';
  const categoryMatches = activeCategory === 'All'
    || (activeCategory === 'Supplier (Local)' && company.type === 'Supplier' && companyOrigin === 'Local')
    || (activeCategory === 'Supplier (Foreign)' && company.type === 'Supplier' && companyOrigin === 'Foreign')
    || (activeCategory !== 'Supplier (Local)' && activeCategory !== 'Supplier (Foreign)' && company.type === activeCategory);
  const originsMatch = origins.length === 2 || (activeCategory !== 'All' && !supplierCategory)
    || (company.type === 'Supplier' && origins.includes(companyOrigin));
  const businessTypeMatches = businessTypes.length === 2
    || (company.branches ?? []).some((branch) => businessTypes.includes(isNTBranch(branch) ? 'Non-Trade' : 'Trade'));
  return categoryMatches && originsMatch && businessTypeMatches;
}
