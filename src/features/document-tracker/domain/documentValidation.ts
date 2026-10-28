import type { BusinessClassification, ComplianceDocument, PartnerCompany } from '../../../types/survey';

const LEGAL_DOCUMENTS = new Set(['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)']);

export function isApplicableLegalDocument(
  docName: string,
  classification: BusinessClassification | undefined,
  isForeignSupplier = false,
): boolean {
  if (!LEGAL_DOCUMENTS.has(docName) || isForeignSupplier) return false;
  if (docName === 'DTI (Sole)') return classification === 'SOL';
  return classification === 'CORP';
}

export function documentRemarksError(
  docName: string,
  document: Pick<ComplianceDocument, 'provided' | 'expiryDate' | 'remarks'>,
  classification: BusinessClassification | undefined,
  isForeignSupplier = false,
): string | null {
  if (!isApplicableLegalDocument(docName, classification, isForeignSupplier)) return null;
  const missing = document.provided !== true || (docName !== 'SEC (Corp)' && !document.expiryDate?.trim());
  return missing && !document.remarks?.trim() ? `${docName} requires remarks while missing or not provided.` : null;
}

export function companyDocumentRemarksError(
  company: Pick<PartnerCompany, 'type' | 'supplierOrigin' | 'businessClassification'>,
  docName: string,
  document: Pick<ComplianceDocument, 'provided' | 'expiryDate' | 'remarks'>,
): string | null {
  return documentRemarksError(
    docName,
    document,
    company.businessClassification,
    company.type === 'Supplier' && company.supplierOrigin === 'Foreign',
  );
}
