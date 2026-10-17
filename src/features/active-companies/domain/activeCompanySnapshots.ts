import * as XLSX from 'xlsx';
import type { SurveyType } from '../../../types/survey';

export const ACTIVE_COMPANY_FILE_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;

export interface ActiveCompanySnapshot {
  id: string;
  surveyType: SurveyType;
  uploadedAt: string;
  uploadedBy: string;
  sourceFileName: string;
  companies: string[];
}

function normalizeCompanyKey(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TYPE_HEADER_TERMS: Record<SurveyType, string[]> = {
  Courier: ['courier', 'couriers'],
  Supplier: ['supplier', 'suppliers', 'vendor', 'vendors'],
  Subcontractor: ['subcontractor', 'subcontractors', 'sub contractor', 'sub contractors'],
};

const GENERIC_COMPANY_HEADERS = new Set([
  'company',
  'company name',
  'business name',
  'active company',
  'active companies',
]);

function companyHeaderScore(value: unknown, surveyType: SurveyType): number {
  const header = normalizeHeader(value);
  if (!header) return 0;

  const selectedTypeHeader = TYPE_HEADER_TERMS[surveyType].some((term) => header.includes(term));
  const describesAList = header.includes('name')
    || header.includes('company')
    || header.includes('companies')
    || header.includes('active')
    || TYPE_HEADER_TERMS[surveyType].includes(header);
  if (selectedTypeHeader && describesAList) return 3;
  if (GENERIC_COMPANY_HEADERS.has(header)) return 2;
  return 0;
}

function findCompanyColumn(rows: unknown[][], surveyType: SurveyType): { columnIndex: number; firstDataRow: number } {
  let bestMatch: { columnIndex: number; firstDataRow: number; score: number } | null = null;
  const rowsToInspect = rows.slice(0, 20);

  rowsToInspect.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const score = companyHeaderScore(cell, surveyType);
      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { columnIndex, firstDataRow: rowIndex + 1, score };
      }
    });
  });

  if (bestMatch) return bestMatch;

  const populatedColumns = new Set<number>();
  rows.forEach((row) => {
    row.forEach((cell, columnIndex) => {
      if (String(cell ?? '').trim()) populatedColumns.add(columnIndex);
    });
  });
  if (populatedColumns.size === 1) {
    return { columnIndex: [...populatedColumns][0], firstDataRow: 0 };
  }

  throw new Error(
    `Could not find a partner-name column for ${surveyType}. Label one column "${surveyType} Name", or upload a one-column partner list.`,
  );
}

export function hasActiveCompanyFileExtension(fileName: string): boolean {
  const lowerName = fileName.toLocaleLowerCase();
  return ACTIVE_COMPANY_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function parseActiveCompanyWorkbook(
  data: ArrayBuffer,
  fileName: string,
  surveyType: SurveyType,
): string[] {
  if (!hasActiveCompanyFileExtension(fileName)) {
    throw new Error('Choose a CSV or Excel file (.csv, .xlsx, or .xls).');
  }

  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The uploaded file has no sheets.');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) throw new Error('The uploaded file has no partner rows.');

  const { columnIndex, firstDataRow } = findCompanyColumn(rows, surveyType);

  const uniqueCompanies = new Map<string, string>();
  for (const row of rows.slice(firstDataRow)) {
    const company = String(row[columnIndex] ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!company) continue;
    const key = normalizeCompanyKey(company);
    if (!uniqueCompanies.has(key)) uniqueCompanies.set(key, company);
  }

  const companies = [...uniqueCompanies.values()].sort((left, right) => left.localeCompare(right));
  if (companies.length === 0) throw new Error('No partner names were found in the uploaded file.');
  return companies;
}

export function createActiveCompanySnapshot(
  surveyType: SurveyType,
  sourceFileName: string,
  companies: string[],
  uploadedBy: string,
  uploadedAt = new Date().toISOString(),
  randomId = crypto.randomUUID(),
): ActiveCompanySnapshot {
  return {
    id: `${surveyType.toLocaleLowerCase()}-${uploadedAt}-${randomId}`,
    surveyType,
    uploadedAt,
    uploadedBy: uploadedBy.trim().toLocaleLowerCase(),
    sourceFileName,
    companies: [...companies],
  };
}

export function parseActiveCompanySnapshot(value: unknown): ActiveCompanySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('An active-partner snapshot is not an object.');
  }
  const candidate = value as Partial<ActiveCompanySnapshot>;
  const validSurveyType = candidate.surveyType === 'Courier'
    || candidate.surveyType === 'Supplier'
    || candidate.surveyType === 'Subcontractor';
  const validCompanies = Array.isArray(candidate.companies)
    && candidate.companies.length > 0
    && candidate.companies.length <= 10_000
    && candidate.companies.every((company) => typeof company === 'string' && company.trim().length > 0 && company.length <= 500);
  const validDate = typeof candidate.uploadedAt === 'string' && !Number.isNaN(Date.parse(candidate.uploadedAt));

  if (
    typeof candidate.id !== 'string'
    || candidate.id.length === 0
    || candidate.id.length > 500
    || !validSurveyType
    || !validDate
    || typeof candidate.uploadedBy !== 'string'
    || candidate.uploadedBy.length > 500
    || typeof candidate.sourceFileName !== 'string'
    || candidate.sourceFileName.length > 2_000
    || !validCompanies
  ) {
    throw new Error('An active-partner snapshot has an invalid stored shape.');
  }

  return candidate as ActiveCompanySnapshot;
}

export function snapshotsBySurveyType(
  snapshots: ActiveCompanySnapshot[],
  surveyType: SurveyType,
): ActiveCompanySnapshot[] {
  return snapshots
    .filter((snapshot) => snapshot.surveyType === surveyType)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}
