import type { PartnerCompany, PartnerCompanyType, SupplierOrigin } from '../../../types/survey';

export const DOCUMENT_CATEGORIES: { key: string; label: string; type: PartnerCompanyType; origin?: SupplierOrigin }[] = [
  { key: 'supplier-local', label: 'Supplier (Local)', type: 'Supplier', origin: 'Local' },
  { key: 'supplier-foreign', label: 'Supplier (Foreign)', type: 'Supplier', origin: 'Foreign' },
  { key: 'courier', label: 'Courier', type: 'Courier' },
  { key: 'subcontractor', label: 'Subcontractor', type: 'Subcontractor' },
];

export function resolveDocumentCategory(value: unknown): string {
  return typeof value === 'string' && DOCUMENT_CATEGORIES.some(category => category.key === value) ? value : 'all';
}

export function companiesForDocumentCategory(companies: PartnerCompany[], value: unknown): PartnerCompany[] {
  const key = resolveDocumentCategory(value);
  const category = DOCUMENT_CATEGORIES.find(item => item.key === key);
  return companies.filter(company => !company.isArchived && (!category || (
    company.type === category.type && (category.type !== 'Supplier' || (company.supplierOrigin ?? 'Local') === category.origin)
  )));
}
