import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import { FORM_SPECS, type ColumnDef } from '../../src/features/evaluation-imports/services/rawEvaluationImport';
import { getCanonicalQuestionId, questionWeights } from '../../src/data/questionWeights';
import type { SurveyType } from '../../src/types/survey';

const UUID_URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const FILES = {
  master: {
    sourceKey: 'master-list-v4-sms-copy',
    fileName: 'Master List Tracker_V4_SMS Copy.csv',
    headerSha256: '80bd0ac2cf31cd9d21cc79a53f97a7a7d98058b37882025f3606258558a20f70',
    fileSha256: '82e2c6c10ec516dc52f7680f49c467276c7ed98f58b67b9d488075178a085eaa',
  },
  Supplier: {
    sourceKey: 'evaluation-form-supplier',
    fileName: 'Microgenesis Supplier Evaluation Form.csv',
    headerSha256: 'fc5936926b6d2a01fb71758c22a1b96381ae88a7ae1a20f455186884c79fee4e',
    fileSha256: 'b01101f4330f344005002879b2c975c8d5d8f538db174f26de14a9371187f29b',
  },
  Courier: {
    sourceKey: 'evaluation-form-courier',
    fileName: 'Microgenesis Courier Evaluation Form.csv',
    headerSha256: '7bf26c053c41e24cadbb0b88552a2d515c30cf5f3cd4a4f60ec23eaedb11a196',
    fileSha256: '402ee678934ba6ea71299a817bfa5a7e93969563b246273c83d05e7b35b93212',
  },
  Subcontractor: {
    sourceKey: 'evaluation-form-subcontractor',
    fileName: 'Microgenesis Subcontractor Evaluation Form.csv',
    headerSha256: '55dbb5b9847c95ce003d18f0a993556827b924f2594f24d3f41d7de39375075b',
    fileSha256: '3df87c2d987c8f0b0792a40e57b10803dec1926f0a7327a971bf69c6a56b646b',
  },
} as const;

type Severity = 'warning' | 'error';

export interface ImportIssue {
  severity: Severity;
  code: string;
  source: string;
  sourceRow?: number;
  message: string;
}

interface CompanyResolutionReview {
  surveyType: SurveyType;
  sourceName: string;
  reviewedBy: string;
  reviewedAt: string;
}

export type CompanyAliasInput = CompanyResolutionReview & (
  | { resolution?: 'existing'; targetBpCode: string }
  | { resolution: 'distinct'; targetBpCode?: never }
);

export interface ImportPlan {
  sourceFiles: Record<string, unknown>[];
  companies: Record<string, unknown>[];
  companyBranches: Record<string, unknown>[];
  companyDocuments: Record<string, unknown>[];
  evaluationForms: Record<string, unknown>[];
  evaluationQuestions: Record<string, unknown>[];
  evaluators: Record<string, unknown>[];
  companyAliases: Record<string, unknown>[];
  evaluationSubmissions: Record<string, unknown>[];
  evaluationAnswers: Record<string, unknown>[];
  issues: ImportIssue[];
  summary: {
    masterNamedRows: number;
    masterUniqueRecords: number;
    masterExactDuplicatesSkipped: number;
    masterBlankBpCodes: number;
    evaluationSubmissions: Record<SurveyType, number>;
    answerStatuses: Record<'rated' | 'not_applicable' | 'populated' | 'missing', number>;
    unresolvedCompanyNames: number;
    blockingErrors: number;
  };
}

const MASTER = {
  sequence: 0,
  spendTier: 1,
  poActivity: 2,
  poCount: 3,
  remarks: 4,
  status: 5,
  category: 6,
  supplierRank: 7,
  bpCode: 8,
  bpName: 9,
  address: 10,
  creditLine: 11,
  federalTaxId: 12,
  industry: 13,
  contactPerson: 14,
  position: 15,
  mobilePhone: 16,
  email: 17,
  dateAccredited: 18,
} as const;

interface DocumentDefinition {
  key: string;
  label: string;
  section: 'Common' | 'Local' | 'Foreign';
  valueColumn: number;
  statusColumn?: number;
  daysLeftColumn?: number;
  dateCapable?: boolean;
}

const DOCUMENTS: DocumentDefinition[] = [
  { key: 'common.confidentiality_nda', label: 'Confidentiality and Non-Disclosure Agreement', section: 'Common', valueColumn: 19 },
  { key: 'common.letter_of_accreditation', label: 'Letter of Accreditation', section: 'Common', valueColumn: 20 },
  { key: 'common.supplier_code_of_conduct', label: 'Supplier Code of Business Conduct and Ethics', section: 'Common', valueColumn: 21 },
  { key: 'local.sif', label: 'SIF', section: 'Local', valueColumn: 22 },
  { key: 'local.bir_2303', label: 'BIR2303', section: 'Local', valueColumn: 23 },
  { key: 'local.sec_corporation', label: 'SEC(Corp)', section: 'Local', valueColumn: 24 },
  { key: 'local.articles_of_incorporation', label: 'Articles of Incoporation', section: 'Local', valueColumn: 25 },
  { key: 'local.afs', label: 'AFS', section: 'Local', valueColumn: 26, statusColumn: 27, daysLeftColumn: 28, dateCapable: true },
  { key: 'local.gis_corporation', label: 'GIS (Corp)', section: 'Local', valueColumn: 29, statusColumn: 30, daysLeftColumn: 31, dateCapable: true },
  { key: 'local.dti_sole', label: 'DTI(Sole)', section: 'Local', valueColumn: 32, statusColumn: 33, daysLeftColumn: 34, dateCapable: true },
  { key: 'local.business_permit', label: 'Business Permit', section: 'Local', valueColumn: 35, statusColumn: 36, daysLeftColumn: 37, dateCapable: true },
  { key: 'local.import_permit', label: 'Import Permit', section: 'Local', valueColumn: 38, statusColumn: 39, daysLeftColumn: 40, dateCapable: true },
  { key: 'local.product_profile', label: 'Product Profile', section: 'Local', valueColumn: 41 },
  { key: 'local.proof_of_present_address', label: 'Proof of Present Address', section: 'Local', valueColumn: 42 },
  { key: 'local.owners_id', label: 'Sole Proprietorship (Owners ID)', section: 'Local', valueColumn: 43 },
  { key: 'local.other_documents', label: 'Other Documents', section: 'Local', valueColumn: 44 },
  { key: 'foreign.sif', label: 'SIF', section: 'Foreign', valueColumn: 45 },
  { key: 'foreign.articles_of_incorporation', label: 'Articles of Incorporation', section: 'Foreign', valueColumn: 46 },
  { key: 'foreign.certificate_of_incorporation', label: 'Cert. of Inc/Corp.', section: 'Foreign', valueColumn: 47 },
  { key: 'foreign.afs', label: 'AFS', section: 'Foreign', valueColumn: 48, statusColumn: 49, daysLeftColumn: 50, dateCapable: true },
  { key: 'foreign.business_permit_license', label: 'Business Permit/License Expiry', section: 'Foreign', valueColumn: 51, statusColumn: 52, daysLeftColumn: 53, dateCapable: true },
  { key: 'foreign.owners_id', label: 'Owners ID', section: 'Foreign', valueColumn: 54 },
  { key: 'foreign.product_profile', label: 'Product Profile', section: 'Foreign', valueColumn: 55 },
  { key: 'foreign.other_documents', label: 'Other Documents', section: 'Foreign', valueColumn: 56 },
];

const LEGAL_SUFFIXES = new Set([
  'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD',
  'LIMITED', 'LLC', 'OPC', 'PHILS', 'PHILIPPINES', 'PHIL',
]);

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\uFEFF/g, '').replace(/\s+/gu, ' ').trim();
}

function nullableText(value: unknown): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

export function normalizeCompanyName(name: string): string {
  return cleanText(name)
    .toUpperCase()
    .replace(/[.,'"()&/\\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !LEGAL_SUFFIXES.has(token))
    .join(' ')
    .trim();
}

function exactCompanyKey(name: string): string {
  return cleanText(name).toLocaleLowerCase('en-US');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

// Git may materialize tracked CSVs with CRLF on Windows even when the
// reviewed repository bytes use LF. Verify the canonical text content so a
// checkout-only line-ending conversion does not look like a client-data
// change; every other byte remains covered by the pinned SHA-256 digest.
function canonicalCsvContents(contents: Buffer): Buffer {
  return Buffer.from(contents.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

export function stableUuid(name: string): string {
  const digest = createHash('sha1')
    .update(uuidBytes(UUID_URL_NAMESPACE))
    .update(Buffer.from(`supplier-management-system:${name}`, 'utf8'))
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function headerFingerprint(row: unknown[]): string {
  return sha256(JSON.stringify(row.map(cleanText)));
}

function parseCsv(path: string): unknown[][] {
  const result = Papa.parse<unknown[]>(readFileSync(path, 'utf8'), {
    skipEmptyLines: false,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(`${path}: CSV parse error at row ${first.row ?? 'unknown'}: ${first.message}`);
  }
  return result.data;
}

function sourceFileRow(sourceKey: string, fileName: string, contents: Buffer, recordCount: number) {
  return {
    id: stableUuid(`source-file:${sourceKey}`),
    source_key: sourceKey,
    file_name: fileName,
    sha256: sha256(contents),
    source_record_count: recordCount,
  };
}

function validDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isIsoTimestampWithTimezone(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/,
  );
  if (!match) return false;
  const [, year, month, day, hour, minute, second = '0', zone, offsetHour = '0', offsetMinute = '0'] = match;
  const zoneHour = Number(offsetHour);
  const zoneMinute = Number(offsetMinute);
  return validDateParts(Number(year), Number(month), Number(day))
    && Number(hour) <= 23
    && Number(minute) <= 59
    && Number(second) <= 59
    && (zone === 'Z' || (zoneHour <= 14 && zoneMinute <= 59 && (zoneHour < 14 || zoneMinute === 0)));
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!validDateParts(year, month, day)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NUMBER: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function parseSourceDate(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const monthName = raw.match(/^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})$/);
  if (monthName) {
    const month = MONTH_NUMBER[monthName[2].slice(0, 3).toLowerCase()];
    return month ? isoDate(Number(monthName[3]), month, Number(monthName[1])) : null;
  }
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return isoDate(year, Number(slash[1]), Number(slash[2]));
  }
  const standard = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return standard ? isoDate(Number(standard[1]), Number(standard[2]), Number(standard[3])) : null;
}

export function parseSourceTimestamp(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const meridiem = match[7]?.toUpperCase();
  if (!validDateParts(year, month, day) || minute > 59 || second > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${isoDate(year, month, day)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function nullableInteger(value: unknown): number | null {
  const raw = cleanText(value);
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function categoryFields(rawValue: unknown): { partner_type: SurveyType | null; supplier_origin: 'Local' | 'Foreign' | null } {
  const raw = cleanText(rawValue).replace(/^Subcontructor/i, 'Subcontractor');
  if (/^Courier(?:-NT)?$/i.test(raw)) return { partner_type: 'Courier', supplier_origin: null };
  if (/^Subcontractor(?:-NT)?$/i.test(raw)) return { partner_type: 'Subcontractor', supplier_origin: null };
  if (/^Supplier-Local(?:-NT)?$/i.test(raw)) return { partner_type: 'Supplier', supplier_origin: 'Local' };
  if (/^Supplier-Foreign(?:-NT)?$/i.test(raw)) return { partner_type: 'Supplier', supplier_origin: 'Foreign' };
  return { partner_type: null, supplier_origin: null };
}

function findMasterHeader(rows: unknown[][]): number {
  return rows.findIndex((row) => cleanText(row[0]) === '#'
    && cleanText(row[MASTER.bpCode]).toUpperCase() === 'BP CODE'
    && cleanText(row[MASTER.bpName]).toUpperCase() === 'BP NAME');
}

function questionKey(form: SurveyType, column: ColumnDef): string {
  return column.kind === 'matrix-remark'
    ? `REMARK-${form.toUpperCase()}-${String(column.col + 1).padStart(2, '0')}`
    : column.questionId;
}

function questionCategory(column: ColumnDef, columns: ColumnDef[]): string {
  if (column.kind !== 'matrix-remark') return column.questionCategory;
  const target = columns.find((candidate) => candidate.kind !== 'matrix-remark' && column.appliesTo.includes(candidate.questionId));
  return target && target.kind !== 'matrix-remark' ? target.questionCategory : 'General';
}

function maxPoints(form: SurveyType, column: ColumnDef): number | null {
  if (column.kind !== 'rating') return null;
  const canonical = getCanonicalQuestionId(column.questionId);
  return questionWeights[form].find((item) => item.questionId === canonical)?.maxPoints ?? null;
}

function parseRating(rawValue: unknown, allowedMax: number | null) {
  const raw = cleanText(rawValue);
  if (!raw) return { status: 'missing' as const, rating: null, text: null, raw: null, valid: true };
  if (/^N\/?A(?:\s|\(|$)/i.test(raw)) {
    return { status: 'not_applicable' as const, rating: null, text: null, raw, valid: true };
  }
  const rating = Number(raw);
  const valid = Number.isFinite(rating) && rating >= 0 && (allowedMax === null || rating <= allowedMax);
  return { status: 'rated' as const, rating: valid ? rating : null, text: null, raw, valid };
}

function parseTextAnswer(rawValue: unknown) {
  const raw = cleanText(rawValue);
  if (!raw) return { status: 'missing' as const, rating: null, text: null, raw: null };
  return { status: 'populated' as const, rating: null, text: raw, raw };
}

function closestCompanyNames(rawName: string, companies: Record<string, unknown>[], limit = 3): string[] {
  const target = normalizeCompanyName(rawName);
  const distance = (a: string, b: string) => {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length];
  };
  return companies
    .map((company) => {
      const normalized = String(company.normalized_name);
      const score = 1 - distance(target, normalized) / Math.max(1, target.length, normalized.length);
      return { name: String(company.canonical_name), score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((candidate) => candidate.name);
}

export function buildImportPlan(projectRoot: string, aliases: CompanyAliasInput[] = []): ImportPlan {
  const repositorySources = resolve(projectRoot, 'reference-materials', 'source-data');
  const sourceRoot = existsSync(repositorySources) ? repositorySources : projectRoot;
  const issues: ImportIssue[] = [];
  const sourceFiles: Record<string, unknown>[] = [];
  const companiesByKey = new Map<string, Record<string, unknown>>();
  const branches: Record<string, unknown>[] = [];
  const documents: Record<string, unknown>[] = [];
  const bpCodeToCompanyId = new Map<string, string>();
  let masterNamedRows = 0;
  let masterExactDuplicatesSkipped = 0;
  let masterBlankBpCodes = 0;

  const masterPath = resolve(sourceRoot, FILES.master.fileName);
  const masterContents = readFileSync(masterPath);
  const canonicalMasterContents = canonicalCsvContents(masterContents);
  if (sha256(canonicalMasterContents) !== FILES.master.fileSha256) {
    throw new Error(`${FILES.master.fileName}: full-file checksum differs from the reviewed production source.`);
  }
  const masterRows = parseCsv(masterPath);
  const masterHeaderIndex = findMasterHeader(masterRows);
  if (masterHeaderIndex < 0) throw new Error(`${FILES.master.fileName}: actual dataset header was not found.`);
  if (headerFingerprint(masterRows[masterHeaderIndex]) !== FILES.master.headerSha256) {
    throw new Error(`${FILES.master.fileName}: header fingerprint differs from the inspected 57-column source.`);
  }

  const masterSourceFileId = stableUuid(`source-file:${FILES.master.sourceKey}`);
  const seenBranchKey = new Map<string, string>();
  for (let index = masterHeaderIndex + 1; index < masterRows.length; index += 1) {
    const cells = masterRows[index];
    const bpName = cleanText(cells[MASTER.bpName]);
    if (!bpName) continue;
    masterNamedRows += 1;
    const sourceRow = index + 1;
    const canonicalRow = JSON.stringify(cells.map((cell) => cell === null || cell === undefined ? '' : String(cell)));
    const rowHash = sha256(canonicalRow);
    const bpCode = cleanText(cells[MASTER.bpCode]);
    const sourceRecordKey = bpCode ? `master:bp:${bpCode.toUpperCase()}` : `master:row-sha256:${rowHash}`;
    const priorHash = seenBranchKey.get(sourceRecordKey);
    if (priorHash) {
      if (priorHash === rowHash) {
        masterExactDuplicatesSkipped += 1;
        issues.push({ severity: 'warning', code: 'MASTER_EXACT_DUPLICATE', source: FILES.master.fileName, sourceRow, message: `Exact duplicate source record ${sourceRecordKey} was collapsed.` });
        continue;
      }
      issues.push({ severity: 'error', code: 'MASTER_DUPLICATE_SOURCE_KEY', source: FILES.master.fileName, sourceRow, message: `Conflicting rows share source key ${sourceRecordKey}.` });
      continue;
    }
    seenBranchKey.set(sourceRecordKey, rowHash);
    if (!bpCode) {
      masterBlankBpCodes += 1;
      issues.push({ severity: 'warning', code: 'MASTER_BLANK_BP_CODE', source: FILES.master.fileName, sourceRow, message: 'Business record has a BP Name but no BP Code; its row hash is used as the stable source key.' });
    }

    const sourceNameKey = exactCompanyKey(bpName);
    let company = companiesByKey.get(sourceNameKey);
    if (!company) {
      company = {
        id: stableUuid(`company:${sourceNameKey}`),
        canonical_name: bpName,
        source_name_key: sourceNameKey,
        normalized_name: normalizeCompanyName(bpName),
      };
      companiesByKey.set(sourceNameKey, company);
    }
    const branchId = stableUuid(`company-branch:${sourceRecordKey}`);
    const category = categoryFields(cells[MASTER.category]);
    branches.push({
      id: branchId,
      company_id: company.id,
      source_file_id: masterSourceFileId,
      source_record_key: sourceRecordKey,
      source_row_number: sourceRow,
      source_sequence: nullableText(cells[MASTER.sequence]),
      bp_code: bpCode || null,
      spend_tier: nullableText(cells[MASTER.spendTier]),
      po_activity: nullableText(cells[MASTER.poActivity]),
      po_count_raw: nullableText(cells[MASTER.poCount]),
      po_count: nullableInteger(cells[MASTER.poCount]),
      remarks: nullableText(cells[MASTER.remarks]),
      status: nullableText(cells[MASTER.status]),
      category_raw: nullableText(cells[MASTER.category]),
      ...category,
      supplier_rank_raw: nullableText(cells[MASTER.supplierRank]),
      supplier_rank: nullableInteger(cells[MASTER.supplierRank]),
      address: nullableText(cells[MASTER.address]),
      credit_line: nullableText(cells[MASTER.creditLine]),
      federal_tax_id: nullableText(cells[MASTER.federalTaxId]),
      industry: nullableText(cells[MASTER.industry]),
      contact_person: nullableText(cells[MASTER.contactPerson]),
      contact_position: nullableText(cells[MASTER.position]),
      mobile_phone: nullableText(cells[MASTER.mobilePhone]),
      email: nullableText(cells[MASTER.email]),
      date_accredited_raw: nullableText(cells[MASTER.dateAccredited]),
      date_accredited: parseSourceDate(cells[MASTER.dateAccredited]),
    });
    if (bpCode) bpCodeToCompanyId.set(bpCode.toUpperCase(), String(company.id));

    for (const definition of DOCUMENTS) {
      const rawValue = nullableText(cells[definition.valueColumn]);
      const status = definition.statusColumn === undefined ? null : nullableText(cells[definition.statusColumn]);
      const daysLeft = definition.daysLeftColumn === undefined ? null : nullableInteger(cells[definition.daysLeftColumn]);
      if (rawValue === null && status === null && daysLeft === null) continue;
      documents.push({
        id: stableUuid(`company-document:${sourceRecordKey}:${definition.key}`),
        branch_id: branchId,
        document_key: definition.key,
        document_label: definition.label,
        supplier_section: definition.section,
        raw_value: rawValue,
        expiry_date: definition.dateCapable ? parseSourceDate(rawValue) : null,
        status,
        days_left_raw: definition.daysLeftColumn === undefined ? null : nullableText(cells[definition.daysLeftColumn]),
        days_left: daysLeft,
      });
    }
  }
  sourceFiles.push(sourceFileRow(FILES.master.sourceKey, FILES.master.fileName, canonicalMasterContents, masterNamedRows));

  const companies = [...companiesByKey.values()];
  const companiesByNormalized = new Map<string, string[]>();
  for (const company of companies) {
    const key = String(company.normalized_name);
    companiesByNormalized.set(key, [...(companiesByNormalized.get(key) ?? []), String(company.id)]);
  }

  const aliasRows: Record<string, unknown>[] = [];
  const aliasTargetByKey = new Map<string, string>();
  for (const alias of aliases) {
    const normalized = normalizeCompanyName(alias.sourceName);
    const key = `${alias.surveyType}:${normalized}`;
    let companyId: string | undefined;
    if (alias.resolution === 'distinct') {
      const sourceName = cleanText(alias.sourceName);
      const sourceNameKey = `evaluation-only:${exactCompanyKey(sourceName)}`;
      let company = companiesByKey.get(sourceNameKey);
      if (!company) {
        company = {
          id: stableUuid(`company:${sourceNameKey}`),
          canonical_name: sourceName,
          source_name_key: sourceNameKey,
          normalized_name: normalized,
        };
        companiesByKey.set(sourceNameKey, company);
        companies.push(company);
        companiesByNormalized.set(normalized, [
          ...(companiesByNormalized.get(normalized) ?? []),
          String(company.id),
        ]);
      }
      companyId = String(company.id);
    } else {
      companyId = bpCodeToCompanyId.get(cleanText(alias.targetBpCode).toUpperCase());
      if (!companyId) {
        issues.push({ severity: 'error', code: 'ALIAS_TARGET_NOT_FOUND', source: 'company aliases', message: `${alias.surveyType} alias target BP Code was not found in the Master List.` });
        continue;
      }
    }
    if (aliasTargetByKey.has(key)) {
      if (aliasTargetByKey.get(key) !== companyId) {
        issues.push({ severity: 'error', code: 'ALIAS_CONFLICT', source: 'company aliases', message: `${alias.surveyType} alias has conflicting target companies.` });
      } else {
        issues.push({ severity: 'warning', code: 'ALIAS_DUPLICATE', source: 'company aliases', message: `${alias.surveyType} alias was repeated and collapsed.` });
      }
      continue;
    }
    aliasTargetByKey.set(key, companyId);
    aliasRows.push({
      id: stableUuid(`company-alias:${key}`),
      form_code: alias.surveyType,
      source_name: cleanText(alias.sourceName),
      normalized_source_name: normalized,
      company_id: companyId,
      reviewed_by: nullableText(alias.reviewedBy),
      reviewed_at: nullableText(alias.reviewedAt),
    });
  }

  const forms: Record<string, unknown>[] = [];
  const questions: Record<string, unknown>[] = [];
  const evaluatorsByEmail = new Map<string, Record<string, unknown>>();
  const submissions: Record<string, unknown>[] = [];
  const answers: Record<string, unknown>[] = [];
  const unresolvedKeys = new Set<string>();
  const submissionCounts: Record<SurveyType, number> = { Courier: 0, Supplier: 0, Subcontractor: 0 };
  const answerStatuses = { rated: 0, not_applicable: 0, populated: 0, missing: 0 };

  for (const surveyType of ['Supplier', 'Courier', 'Subcontractor'] as const) {
    const file = FILES[surveyType];
    const filePath = resolve(sourceRoot, file.fileName);
    const contents = readFileSync(filePath);
    const canonicalContents = canonicalCsvContents(contents);
    if (sha256(canonicalContents) !== file.fileSha256) {
      throw new Error(`${file.fileName}: full-file checksum differs from the reviewed production source.`);
    }
    const rows = parseCsv(filePath);
    if (rows.length === 0 || headerFingerprint(rows[0]) !== file.headerSha256) {
      throw new Error(`${file.fileName}: header fingerprint differs from the inspected source.`);
    }
    const spec = FORM_SPECS[surveyType];
    const sourceFileId = stableUuid(`source-file:${file.sourceKey}`);
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => cleanText(cell)));
    const businessRows = dataRows.filter((row) => cleanText(row[spec.nameCol]));
    sourceFiles.push(sourceFileRow(file.sourceKey, file.fileName, canonicalContents, businessRows.length));
    forms.push({ code: surveyType, source_file_id: sourceFileId, source_name: file.fileName });

    const questionIdByKey = new Map<string, string>();
    for (let index = 0; index < spec.columns.length; index += 1) {
      const column = spec.columns[index];
      const key = questionKey(surveyType, column);
      const id = stableUuid(`evaluation-question:${surveyType}:${key}`);
      questionIdByKey.set(key, id);
      questions.push({
        id,
        form_code: surveyType,
        question_key: key,
        canonical_question_key: column.kind === 'rating' ? getCanonicalQuestionId(column.questionId) : null,
        question_number: column.kind === 'matrix-remark' ? null : column.questionNumber,
        display_order: index + 1,
        answer_kind: column.kind === 'matrix-remark' ? 'remark' : column.kind,
        category: questionCategory(column, spec.columns),
        question_text: column.kind === 'matrix-remark' ? cleanText(rows[0][column.col]) : column.question,
        source_header: cleanText(rows[0][column.col]),
        max_points: maxPoints(surveyType, column),
      });
    }

    const seenIds = new Set<string>();
    for (let dataIndex = 0; dataIndex < businessRows.length; dataIndex += 1) {
      const row = businessRows[dataIndex];
      const sourceRow = rows.indexOf(row) + 1;
      const recordId = cleanText(row[spec.idCol]);
      if (!recordId) {
        issues.push({ severity: 'error', code: 'EVALUATION_MISSING_ID', source: file.fileName, sourceRow, message: 'Evaluation row has no source ID.' });
      } else if (seenIds.has(recordId)) {
        issues.push({ severity: 'error', code: 'EVALUATION_DUPLICATE_ID', source: file.fileName, sourceRow, message: `Duplicate source ID ${recordId}.` });
      }
      seenIds.add(recordId);

      const rawCompanyName = cleanText(row[spec.nameCol]);
      const normalizedCompany = normalizeCompanyName(rawCompanyName);
      const aliasKey = `${surveyType}:${normalizedCompany}`;
      const exactCandidates = companiesByNormalized.get(normalizedCompany) ?? [];
      const companyId = aliasTargetByKey.get(aliasKey) ?? (exactCandidates.length === 1 ? exactCandidates[0] : null);
      if (!companyId && !unresolvedKeys.has(aliasKey)) {
        unresolvedKeys.add(aliasKey);
        const reason = exactCandidates.length > 1 ? 'ambiguous' : 'unmatched';
        const suggestions = closestCompanyNames(rawCompanyName, companies).join(', ');
        issues.push({
          severity: 'error',
          code: reason === 'ambiguous' ? 'COMPANY_MATCH_AMBIGUOUS' : 'COMPANY_MATCH_UNRESOLVED',
          source: file.fileName,
          sourceRow,
          message: `${surveyType} company "${rawCompanyName}" is ${reason}. Review an alias to a Master List BP Code. Closest names: ${suggestions}`,
        });
      }

      const rawEmail = cleanText(row[spec.emailCol]);
      const normalizedEmail = rawEmail.toLocaleLowerCase('en-US');
      let evaluatorId: string | null = null;
      if (normalizedEmail) {
        evaluatorId = stableUuid(`evaluator:${normalizedEmail}`);
        if (!evaluatorsByEmail.has(normalizedEmail)) {
          evaluatorsByEmail.set(normalizedEmail, {
            id: evaluatorId,
            email: rawEmail,
            normalized_email: normalizedEmail,
            display_name: nullableText(row[4]),
          });
        }
      }

      const startedAt = parseSourceTimestamp(row[spec.startTimeCol]);
      const submittedAt = parseSourceTimestamp(row[spec.completionTimeCol]);
      if (!submittedAt) {
        issues.push({ severity: 'error', code: 'EVALUATION_INVALID_SUBMISSION_DATE', source: file.fileName, sourceRow, message: 'Completion time is missing or has an unsupported format.' });
      }
      if (cleanText(row[spec.startTimeCol]) && !startedAt) {
        issues.push({ severity: 'error', code: 'EVALUATION_INVALID_START_DATE', source: file.fileName, sourceRow, message: 'Start time has an unsupported format.' });
      }

      const safeRecordId = recordId || `MISSING-ROW-${sourceRow}`;
      const submissionId = stableUuid(`evaluation-submission:${file.sourceKey}:${safeRecordId}`);
      submissions.push({
        id: submissionId,
        source_file_id: sourceFileId,
        source_record_id: safeRecordId,
        form_code: surveyType,
        company_id: companyId,
        evaluator_id: evaluatorId,
        company_name_raw: rawCompanyName,
        evaluator_name_raw: nullableText(row[4]),
        respondent_email_raw: rawEmail || null,
        respondent_designation: spec.designationCol === undefined ? null : nullableText(row[spec.designationCol]),
        respondent_department: spec.departmentCol === undefined ? null : nullableText(row[spec.departmentCol]),
        company_address_raw: spec.addressCol === undefined ? null : nullableText(row[spec.addressCol]),
        started_at_raw: nullableText(row[spec.startTimeCol]),
        submitted_at_raw: nullableText(row[spec.completionTimeCol]),
        started_at: startedAt,
        submitted_at: submittedAt,
      });
      submissionCounts[surveyType] += 1;

      for (const column of spec.columns) {
        const key = questionKey(surveyType, column);
        const allowedMax = maxPoints(surveyType, column);
        const parsed = column.kind === 'rating' ? parseRating(row[column.col], allowedMax) : parseTextAnswer(row[column.col]);
        if ('valid' in parsed && !parsed.valid) {
          issues.push({ severity: 'error', code: 'EVALUATION_INVALID_RATING', source: file.fileName, sourceRow, message: `${key} contains a non-numeric or out-of-range rating.` });
        }
        answerStatuses[parsed.status] += 1;
        answers.push({
          id: stableUuid(`evaluation-answer:${submissionId}:${key}`),
          submission_id: submissionId,
          question_id: questionIdByKey.get(key),
          answer_status: parsed.status,
          rating_value: parsed.rating,
          text_value: parsed.text,
          raw_value: parsed.raw,
        });
      }
    }
  }

  return {
    sourceFiles,
    companies,
    companyBranches: branches,
    companyDocuments: documents,
    evaluationForms: forms,
    evaluationQuestions: questions,
    evaluators: [...evaluatorsByEmail.values()],
    companyAliases: aliasRows,
    evaluationSubmissions: submissions,
    evaluationAnswers: answers,
    issues,
    summary: {
      masterNamedRows,
      masterUniqueRecords: branches.length,
      masterExactDuplicatesSkipped,
      masterBlankBpCodes,
      evaluationSubmissions: submissionCounts,
      answerStatuses,
      unresolvedCompanyNames: unresolvedKeys.size,
      blockingErrors: issues.filter((issue) => issue.severity === 'error').length,
    },
  };
}

export function loadCompanyAliases(path: string): CompanyAliasInput[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Company alias file must contain a JSON array.');
  return parsed.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Alias ${index + 1} must be an object.`);
    const candidate = value as Record<string, unknown>;
    const surveyType = cleanText(candidate.surveyType);
    const sourceName = cleanText(candidate.sourceName);
    const resolution = cleanText(candidate.resolution) || 'existing';
    const targetBpCode = cleanText(candidate.targetBpCode);
    const reviewedBy = cleanText(candidate.reviewedBy);
    const reviewedAt = cleanText(candidate.reviewedAt);
    if (!['Courier', 'Supplier', 'Subcontractor'].includes(surveyType)
      || !sourceName
      || !reviewedBy
      || !reviewedAt) {
      throw new Error(`Alias ${index + 1} must include surveyType, sourceName, reviewedBy, and reviewedAt.`);
    }
    if (!isIsoTimestampWithTimezone(reviewedAt)) {
      throw new Error(`Alias ${index + 1} reviewedAt must be an ISO timestamp with a timezone.`);
    }
    if (resolution === 'distinct') {
      if (targetBpCode) throw new Error(`Alias ${index + 1} cannot include targetBpCode when resolution is distinct.`);
      return { surveyType: surveyType as SurveyType, sourceName, resolution, reviewedBy, reviewedAt };
    }
    if (resolution !== 'existing') {
      throw new Error(`Alias ${index + 1} resolution must be existing or distinct.`);
    }
    if (!targetBpCode) throw new Error(`Alias ${index + 1} requires targetBpCode when resolution is existing.`);
    return { surveyType: surveyType as SurveyType, sourceName, resolution, targetBpCode, reviewedBy, reviewedAt };
  });
}

export const IMPORT_TABLE_ROWS = [
  ['import_source_files', 'sourceFiles', 'id'],
  ['companies', 'companies', 'id'],
  ['company_branches', 'companyBranches', 'id'],
  ['company_documents', 'companyDocuments', 'id'],
  ['evaluation_forms', 'evaluationForms', 'code'],
  ['evaluation_questions', 'evaluationQuestions', 'id'],
  ['evaluators', 'evaluators', 'id'],
  ['company_aliases', 'companyAliases', 'id'],
  ['evaluation_submissions', 'evaluationSubmissions', 'id'],
  ['evaluation_answers', 'evaluationAnswers', 'id'],
] as const satisfies ReadonlyArray<readonly [string, keyof ImportPlan, string]>;
