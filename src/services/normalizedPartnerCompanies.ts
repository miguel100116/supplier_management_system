import { type BranchRecord, type BranchStatus, type ComplianceDocument, type DocumentStatus, type PartnerCompany, type PartnerCompanyType, type SupplierOrigin } from '../types/survey';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export const DATABASE_DOCUMENT_KEY_LABELS: Readonly<Record<string, string>> = {
  'common.confidentiality_nda': 'Confidentiality and Non-Disclosure Agreement',
  'common.letter_of_accreditation': 'Letter of Accreditation',
  'common.supplier_code_of_conduct': 'Supplier Code of Business Conduct and Ethics',
  'local.sif': 'SIF',
  'local.bir_2303': 'BIR2303',
  'local.sec_corporation': 'SEC (Corp)',
  'local.articles_of_incorporation': 'Articles of Incorporation',
  'local.afs': 'AFS',
  'local.gis_corporation': 'GIS (Corp)',
  'local.dti_sole': 'DTI (Sole)',
  'local.business_permit': 'Business Permit',
  'local.import_permit': 'Import Permit',
  'local.product_profile': 'Product Profile',
  'local.proof_of_present_address': 'Proof of Present Address',
  'local.owners_id': "Sole Proprietorship (Owner's ID)",
  'local.other_documents': 'Other Documents',
  'foreign.sif': 'SIF',
  'foreign.articles_of_incorporation': 'Articles of Incorporation',
  'foreign.certificate_of_incorporation': 'Certificate of Incorporation',
  'foreign.afs': 'AFS',
  'foreign.business_permit_license': 'Business Permit/License',
  'foreign.owners_id': "Owner's ID",
  'foreign.product_profile': 'Product Profile',
  'foreign.other_documents': 'Other Documents',
};

export function normalizeDatabaseDocumentKeys(
  documents: Record<string, ComplianceDocument> | undefined,
  type: PartnerCompanyType,
  origin: SupplierOrigin | undefined,
): Record<string, ComplianceDocument> {
  const source = documents ?? {};
  const normalized: Record<string, ComplianceDocument> = {};
  const usesForeignBlock = type === 'Supplier' && origin === 'Foreign';
  const isApplicableDatabaseKey = (key: string) => {
    if (key.startsWith('common.')) return true;
    if (key.startsWith('foreign.')) return usesForeignBlock;
    if (key.startsWith('local.')) return type !== 'Uncategorized' && !usesForeignBlock;
    return true;
  };

  // Map imported database keys first, then let an already-canonical key win.
  // This preserves any later Document Tracker edit if a legacy key and its
  // display-label replacement temporarily coexist in the same branch.
  for (const [key, document] of Object.entries(source)) {
    const label = DATABASE_DOCUMENT_KEY_LABELS[key];
    if (label && isApplicableDatabaseKey(key) && normalized[label] === undefined) normalized[label] = document;
  }
  for (const [key, document] of Object.entries(source)) {
    if (!DATABASE_DOCUMENT_KEY_LABELS[key]) normalized[key] = document;
  }
  return normalized;
}

export function normalizeDatabasePartnerCompany(company: PartnerCompany): PartnerCompany {
  return {
    ...company,
    branches: (company.branches ?? []).map((branch) => ({
      ...branch,
      documents: normalizeDatabaseDocumentKeys(branch.documents, company.type, company.supplierOrigin),
    })),
  };
}

interface CompanyDocumentRow {
  document_key: string;
  raw_value: string | null;
  expiry_date: string | null;
  status: string | null;
  days_left: number | null;
}

interface CompanyBranchRow {
  id: string;
  bp_code: string | null;
  partner_type: string | null;
  supplier_origin: string | null;
  supplier_rank_raw: string | null;
  address: string | null;
  federal_tax_id: string | null;
  industry: string | null;
  contact_person: string | null;
  contact_position: string | null;
  mobile_phone: string | null;
  email: string | null;
  category_raw: string | null;
  date_accredited: string | null;
  status: string | null;
  source_row_number: number;
  company_documents: CompanyDocumentRow[] | null;
}

export interface NormalizedCompanyRow {
  id: string;
  canonical_name: string;
  created_at: string;
  company_branches: CompanyBranchRow[] | null;
}

const BRANCH_STATUSES = new Set<BranchStatus>([
  'Pending', 'Updated', 'Outdated', 'Incomplete', 'Completed', 'Inactive', 'Accredited',
]);
const DOCUMENT_STATUSES = new Set<DocumentStatus>([
  'Current', 'Expiring Soon', 'Expired', 'Missing', 'For Update',
]);

function toPartnerType(value: string | null): PartnerCompanyType {
  return value === 'Courier' || value === 'Supplier' || value === 'Subcontractor'
    ? value
    : 'Uncategorized';
}

function toSupplierOrigin(value: string | null): SupplierOrigin | undefined {
  return value === 'Local' || value === 'Foreign' ? value : undefined;
}

function toBranchStatus(value: string | null): BranchStatus | undefined {
  return value && BRANCH_STATUSES.has(value as BranchStatus) ? value as BranchStatus : undefined;
}

function toDocumentStatus(value: string | null): DocumentStatus | undefined {
  return value && DOCUMENT_STATUSES.has(value as DocumentStatus) ? value as DocumentStatus : undefined;
}

function mapBranch(row: CompanyBranchRow): BranchRecord {
  const type = toPartnerType(row.partner_type);
  const origin = toSupplierOrigin(row.supplier_origin);
  const documents = normalizeDatabaseDocumentKeys(Object.fromEntries(
    (row.company_documents ?? []).map((document) => [
      document.document_key,
      {
        provided: Boolean(document.raw_value?.trim() || document.expiry_date),
        ...(document.expiry_date ? { expiryDate: document.expiry_date } : {}),
        ...(toDocumentStatus(document.status) ? { status: toDocumentStatus(document.status) } : {}),
        ...(document.days_left !== null ? { daysLeft: document.days_left } : {}),
      },
    ]),
  ), type, origin);

  return {
    id: row.id,
    bpCode: row.bp_code ?? '',
    ...(row.address ? { address: row.address } : {}),
    ...(row.federal_tax_id ? { federalTaxId: row.federal_tax_id } : {}),
    ...(row.industry ? { industry: row.industry } : {}),
    ...(row.contact_person ? { contactPerson: row.contact_person } : {}),
    ...(row.contact_position ? { position: row.contact_position } : {}),
    ...(row.mobile_phone ? { mobilePhone: row.mobile_phone } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.category_raw ? { rawCategory: row.category_raw } : {}),
    ...(row.supplier_rank_raw ? { supplierRank: row.supplier_rank_raw } : {}),
    ...(row.date_accredited ? { dateAccredited: row.date_accredited } : {}),
    ...(toBranchStatus(row.status) ? { status: toBranchStatus(row.status) } : {}),
    sourceRow: row.source_row_number,
    documents,
  };
}

export function mapNormalizedCompany(row: NormalizedCompanyRow): PartnerCompany {
  const sourceBranches = row.company_branches ?? [];
  const typedBranch = sourceBranches.find((branch) => toPartnerType(branch.partner_type) !== 'Uncategorized');
  const supplierBranch = sourceBranches.find((branch) => branch.supplier_origin);
  const emailBranch = sourceBranches.find((branch) => branch.email);
  const accreditedBranch = sourceBranches.find((branch) => branch.date_accredited);
  const type = toPartnerType(typedBranch?.partner_type ?? null);

  return {
    id: row.id,
    name: row.canonical_name,
    type,
    ...(type === 'Supplier' && toSupplierOrigin(supplierBranch?.supplier_origin ?? null)
      ? { supplierOrigin: toSupplierOrigin(supplierBranch?.supplier_origin ?? null) }
      : {}),
    ...(emailBranch?.email ? { email: emailBranch.email } : {}),
    createdAt: row.created_at,
    ...(accreditedBranch?.date_accredited ? { registeredAt: accreditedBranch.date_accredited } : {}),
    isArchived: false,
    accreditationStatus: sourceBranches.some((branch) => branch.status?.toLowerCase() === 'accredited')
      ? 'Accredited'
      : 'Unaccredited',
    branches: sourceBranches.map(mapBranch),
  };
}

const COMPANY_SELECT = `
  id,
  canonical_name,
  created_at,
  company_branches (
    id,
    bp_code,
    partner_type,
    supplier_origin,
    supplier_rank_raw,
    address,
    federal_tax_id,
    industry,
    contact_person,
    contact_position,
    mobile_phone,
    email,
    category_raw,
    date_accredited,
    status,
    source_row_number,
    company_documents (
      document_key,
      raw_value,
      expiry_date,
      status,
      days_left
    )
  )
`;

export async function loadNormalizedPartnerCompanies(): Promise<PartnerCompany[]> {
  if (!isSupabaseConfigured) return [];
  const pageSize = 500;
  const companies: PartnerCompany[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('companies')
      .select(COMPANY_SELECT)
      .order('canonical_name')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to load staging partner records: ${error.message}`);
    const rows = (data ?? []) as unknown as NormalizedCompanyRow[];
    companies.push(...rows.map(mapNormalizedCompany));
    if (rows.length < pageSize) break;
  }

  return companies;
}
