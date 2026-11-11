import { BusinessClassification, PartnerCompanyType, SupplierOrigin } from '../../../types/survey';

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
  ...COMMON_DOCUMENTS,
  'SIF',
  'AFS',
  'Certificate of Incorporation',
  'Articles of Incorporation',
  'Business Permit/License',
  "Owner's ID",
  'Product Profile',
] as const;

export const FOREIGN_SUPPLIER_REQUIREMENTS = [
  { key: 'Confidentiality and Non-Disclosure Agreement', name: 'Confidentiality and Non-Disclosure Agreement (NDA)', description: 'Signed agreement governing confidential information shared with the supplier.', validity: 'One-time submission; renew if the agreement expires or is replaced.' },
  { key: 'Letter of Accreditation', name: 'Letter of Accreditation', description: 'Formal accreditation confirmation issued by Microgenesis.', validity: 'One-time submission; update if amended.' },
  { key: 'Supplier Code of Business Conduct and Ethics', name: 'Supplier Code of Business Conduct and Ethics', description: 'Acknowledged supplier code covering expected business conduct and ethical standards.', validity: 'Update when the applicable code changes.' },
  { key: 'SIF', name: 'Supplier Information Form (SIF)', description: 'Completed and signed form containing company profile, contact details, banking information, and authorized representatives.', validity: 'Update as necessary.' },
  { key: 'AFS', name: 'Audited Financial Statements (AFS)', description: "Latest audited financial statements showing the supplier's financial standing and capability. Accept current fiscal or calendar year AFS.", validity: 'Renewable annually; accept the current fiscal or calendar year.' },
  { key: 'Certificate of Incorporation', name: 'Certificate of Incorporation / Registration', description: 'Proof of legal registration issued by the appropriate government agency or foreign equivalent.', validity: 'One-time submission; update if amended.' },
  { key: 'Articles of Incorporation', name: 'Articles of Incorporation', description: "Document outlining the company's purpose, structure, and governance.", validity: 'One-time submission; update if amended.' },
  { key: 'Business Permit/License', name: 'Business Permit / Licenses', description: 'Current business permit and applicable industry-specific licenses required for operations.', validity: 'Renewable annually; must be valid for the current year or until its stated expiration date.' },
  { key: "Owner's ID", name: "Owner's Government-Issued Identification (ID)", description: 'Valid government-issued ID of the owner, president, or authorized representative.', validity: 'Must be valid at the time of submission.' },
  { key: 'Product Profile', name: 'Product Profile', description: 'Product catalog, company brochure, service portfolio, or detailed description of goods and services offered.', validity: 'Update as necessary.' },
] as const;

export type ForeignSupplierRequirement = (typeof FOREIGN_SUPPLIER_REQUIREMENTS)[number];

export function getForeignSupplierRequirement(docName: string): ForeignSupplierRequirement | undefined {
  return FOREIGN_SUPPLIER_REQUIREMENTS.find((requirement) => requirement.key === docName);
}

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

export function isExpiryDocument(docName: string, type?: PartnerCompanyType, origin?: SupplierOrigin): boolean {
  if (type === 'Supplier' && origin === 'Foreign') return docName === 'AFS' || docName === 'Business Permit/License' || docName === "Owner's ID";
  return EXPIRY_DOCUMENTS.has(docName);
}

/** Whether a registration-specific local requirement belongs in the current checklist. */
export function isDocumentApplicableToClassification(
  docName: string,
  businessClassification: BusinessClassification | undefined,
): boolean {
  if (['SEC (Corp)', 'GIS (Corp)', 'Articles of Incorporation'].includes(docName)) return businessClassification === 'CORP';
  if (['DTI (Sole)', "Sole Proprietorship (Owner's ID)"].includes(docName)) return businessClassification === 'SOL';
  return true;
}

/** Keep classification history visible until the Directory record is classified; once set, omit excluded documents from the active UI. */
export function shouldShowHistoricalDocument(
  docName: string,
  type: PartnerCompanyType,
  origin: SupplierOrigin | undefined,
  businessClassification: BusinessClassification | undefined,
): boolean {
  if (type === 'Supplier' && origin === 'Foreign') return true;
  if (!businessClassification) return true;
  return isDocumentApplicableToClassification(docName, businessClassification);
}

// Full ordered list of required document keys. A Foreign Supplier's added
// Other: documents become requirements for that branch only.
export function getRequiredDocumentKeys(
  type: PartnerCompanyType,
  origin: SupplierOrigin | undefined,
  businessClassification?: BusinessClassification,
  branchDocuments?: Record<string, unknown>,
): string[] {
  if (type === 'Uncategorized') return [...COMMON_DOCUMENTS];
  if (type === 'Supplier' && origin === 'Foreign') {
    const addedDocuments = Object.keys(branchDocuments ?? {})
      .filter((name) => name.startsWith('Other: ') && name.slice(7).trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
    return [...FOREIGN_SUPPLIER_DOCUMENTS, ...addedDocuments];
  }
  const originDocs = LOCAL_SUPPLIER_DOCUMENTS;
  const applicable = originDocs.filter((name) => {
    if (type === 'Supplier' && name === 'Other Documents') return false;
    return (type === 'Supplier' && origin === 'Foreign') || isDocumentApplicableToClassification(name, businessClassification);
  });
  return [...COMMON_DOCUMENTS, ...applicable];
}

// Used to build category filters. Local requirements intentionally include
// both CORP/SOL alternatives; compliance uses the confirmed classification.
export function getAvailableDocumentKeys(type: PartnerCompanyType, origin: SupplierOrigin | undefined): string[] {
  if (type === 'Uncategorized') return [...COMMON_DOCUMENTS];
  if (type === 'Supplier' && origin === 'Foreign') return [...FOREIGN_SUPPLIER_DOCUMENTS];
  const originDocs = LOCAL_SUPPLIER_DOCUMENTS;
  return [...COMMON_DOCUMENTS, ...originDocs];
}
