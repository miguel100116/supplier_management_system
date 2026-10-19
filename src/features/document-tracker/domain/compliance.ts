import { BranchRecord, ComplianceDocument, DocumentAlertDetail, DocumentStatus, PartnerCompany } from '../../../types/survey';
import { getRequiredDocumentKeys, isExpiryDocument } from './documentRequirements';

// "Expiring Soon" threshold matches the Master List's own legend (30 days left).
export const EXPIRING_SOON_DAYS = 30;

// AFS doesn't gradually "expire" like a permit - the Master List's own AFS
// Status column (col X) is this exact formula:
//   =IF(YEAR(afsDate)>=YEAR(TODAY())-1,"Current","For Update")
// i.e. the filed fiscal year stays valid through the following year, then
// flips straight to "For Update" - a fiscal-year comparison, not a day count.
const AFS_FISCAL_YEAR_DOCUMENTS = new Set(['AFS']);

function computeAfsFiscalYearStatus(expiryDate: string, referenceDate: Date): 'Current' | 'For Update' {
  const docYear = Number(expiryDate.slice(0, 4));
  const refYear = referenceDate.getFullYear();
  return docYear >= refYear - 1 ? 'Current' : 'For Update';
}

export function daysUntil(dateStr: string, referenceDate: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match || Number.isNaN(referenceDate.getTime())) return Number.NaN;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const target = Date.UTC(year, month - 1, day);
  const parsedTarget = new Date(target);
  if (
    parsedTarget.getUTCFullYear() !== year ||
    parsedTarget.getUTCMonth() !== month - 1 ||
    parsedTarget.getUTCDate() !== day
  ) return Number.NaN;

  const today = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Always derives status/daysLeft from expiryDate rather than trusting any
// snapshot stored on the document - "today" changes what these mean, so a
// value computed at import time would go stale.
export function computeDocumentStatus(
  doc: Pick<ComplianceDocument, 'provided' | 'expiryDate'>,
  referenceDate: Date = new Date(),
  docName?: string
): { status: DocumentStatus; daysLeft?: number } {
  if (!doc.expiryDate) {
    const expiryDateRequired = Boolean(docName && isExpiryDocument(docName));
    return { status: doc.provided && !expiryDateRequired ? 'Current' : 'Missing' };
  }
  const daysLeft = daysUntil(doc.expiryDate, referenceDate);
  if (!Number.isFinite(daysLeft)) return { status: 'Missing' };
  if (docName && AFS_FISCAL_YEAR_DOCUMENTS.has(docName)) {
    return { status: computeAfsFiscalYearStatus(doc.expiryDate, referenceDate), daysLeft };
  }
  if (daysLeft < 0) return { status: 'Expired', daysLeft };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { status: 'Expiring Soon', daysLeft };
  return { status: 'Current', daysLeft };
}

// Company-wide status is never persisted - always rolled up live from the
// documents required for every branch in this company's category.
// 'Missing' means a required document or its required expiry date is absent;
// it must never fall through to 'Current' just because no date can be checked.
export type CompanyDocumentStatus = 'Current' | 'Expiring Soon' | 'Expired' | 'Missing';

export interface CompanyDocumentSummary {
  status: CompanyDocumentStatus;
  expiredCount: number;
  expiringSoonCount: number;
  forUpdateCount: number;
  missingCount: number;
  totalRequired: number;
  issues: DocumentAlertDetail[];
}

export function computeCompanyDocumentSummary(
  company: Pick<PartnerCompany, 'type' | 'supplierOrigin' | 'branches'>,
  referenceDate: Date = new Date()
): CompanyDocumentSummary {
  const requiredKeys = getRequiredDocumentKeys(company.type, company.supplierOrigin);
  const branches = company.branches ?? [];

  let expiredCount = 0;
  let expiringSoonCount = 0;
  let forUpdateCount = 0;
  let missingCount = 0;
  const issues: DocumentAlertDetail[] = [];
  const branchesToCheck: Array<BranchRecord | undefined> = branches.length > 0 ? branches : [undefined];

  branchesToCheck.forEach((branch) => {
    requiredKeys.forEach((key) => {
      const doc: ComplianceDocument | undefined = branch?.documents?.[key];
      const { status, daysLeft } = computeDocumentStatus(doc ?? {}, referenceDate, key);
      if (status === 'Expired' || status === 'Expiring Soon' || status === 'For Update') {
        issues.push({
          documentName: key,
          branchId: branch?.id,
          branchCode: branch?.bpCode,
          expiryDate: doc?.expiryDate,
          daysLeft,
          status,
        });
      }
      if (status === 'Expired') expiredCount++;
      else if (status === 'Expiring Soon') expiringSoonCount++;
      else if (status === 'For Update') forUpdateCount++;
      else if (status === 'Missing') missingCount++;
    });
  });

  const status: CompanyDocumentStatus =
    expiredCount > 0 || forUpdateCount > 0
      ? 'Expired'
      : missingCount > 0
        ? 'Missing'
        : expiringSoonCount > 0
          ? 'Expiring Soon'
          : 'Current';

  return {
    status,
    expiredCount,
    expiringSoonCount,
    forUpdateCount,
    missingCount,
    totalRequired: requiredKeys.length * branchesToCheck.length,
    issues,
  };
}

// A company can carry a normal BP Code and a separate "-NT" one (kept
// verbatim in bpCode/rawCategory, e.g. "ACC001-NT" / "Supplier-Local-NT") -
// same company, distinct accreditation branch with its own document set.
// Requiring the hyphen avoids false-positives from company/category names
// that merely end in the letters "NT".
export function isNTBranch(branch: Pick<BranchRecord, 'bpCode' | 'rawCategory'>): boolean {
  return /-NT$/i.test((branch.bpCode ?? '').trim()) || /-NT$/i.test((branch.rawCategory ?? '').trim());
}

// Disambiguates which branch an action/log entry applies to once a company
// has been split into multiple rows (NT vs non-NT) - falls back to the plain
// company name when there's only one branch, so the common case is untouched.
export function branchAwareCompanyLabel(company: Pick<PartnerCompany, 'name' | 'branches'>, branch?: BranchRecord): string {
  if (!branch || (company.branches ?? []).length <= 1) return company.name;
  return `${company.name} (${isNTBranch(branch) ? 'NT' : 'Non-NT'})`;
}
