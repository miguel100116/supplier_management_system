import { PartnerCompanyType, SupplierOrigin } from '../../../types/survey';

// Single source of truth for which compliance-document keys apply to which
// partner category. Mirrors the Master List's "DOCUMENTS ONCE ACCREDITED" /
// "LOCAL SUPPLIER" / "FOREIGN SUPPLIER" column blocks - masterListImport.ts
// and the document-expiry/compliance UI both read from this list so the
// three stay in sync.

// Applies to every accredited partner regardless of category.
export const COMMON_DOCUMENTS = [
  'Confidentiality and Non-Disclosure Agreement',
  'Letter of Accreditation',
  'Supplier Code of Business Conduct and Ethics',
] as const;

export const LOCAL_SUPPLIER_DOCUMENTS = [
  'SIF',
  'BIR2303',
  'SEC (Corp)',
  'Articles of Incorporation',
  'AFS',
  'GIS (Corp)',
  'DTI (Sole)',
  'Business Permit',
  'Import Permit',
  'Product Profile',
  'Proof of Present Address',
  "Sole Proprietorship (Owner's ID)",
  'Other Documents',
] as const;

export const FOREIGN_SUPPLIER_DOCUMENTS = [
  'SIF',
  'Articles of Incorporation',
  'Certificate of Incorporation',
  'AFS',
  'Business Permit/License',
  "Owner's ID",
  'Product Profile',
  'Other Documents',
] as const;

// Document keys whose value is an expiry date (renewable, drives Expired/
// Expiring Soon status) as opposed to a plain Yes/No accreditation flag.
export const EXPIRY_DOCUMENTS = new Set<string>([
  'AFS',
  'GIS (Corp)',
  'DTI (Sole)',
  'Business Permit',
  'Import Permit',
  'Business Permit/License',
]);

export function isExpiryDocument(docName: string): boolean {
  return EXPIRY_DOCUMENTS.has(docName);
}

// Full ordered list of document keys required for a given partner category.
// Per the client: Supplier, Courier, and Subcontractor all carry the same
// (local) checklist - only Supplier ever splits into Local/Foreign, since
// Courier and Subcontractor have no Foreign variant in the Master List.
// Uncategorized carries just the common once-accredited checklist.
export function getRequiredDocumentKeys(
  type: PartnerCompanyType,
  origin: SupplierOrigin | undefined
): string[] {
  if (type === 'Uncategorized') return [...COMMON_DOCUMENTS];
  const originDocs = type === 'Supplier' && origin === 'Foreign' ? FOREIGN_SUPPLIER_DOCUMENTS : LOCAL_SUPPLIER_DOCUMENTS;
  return [...COMMON_DOCUMENTS, ...originDocs];
}
