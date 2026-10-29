import * as XLSX from 'xlsx';
import {
  BranchRecord,
  BranchStatus,
  ComplianceDocument,
  PartnerCompany,
  PartnerCompanyType,
  SupplierOrigin,
} from '../../../types/survey';
import { computeDocumentStatus } from '../../document-tracker/domain/compliance';
import { companyDocumentRemarksError } from '../../document-tracker/domain/documentValidation';
import { COMMON_DOCUMENTS, FOREIGN_SUPPLIER_DOCUMENTS, LOCAL_SUPPLIER_DOCUMENTS } from '../../document-tracker/domain/documentRequirements';

// The sheet opens with a legend/summary block before the real header row -
// its exact row count has varied between revisions, so findHeaderRowIndex
// locates it by content. This is only the last-known fallback position.
const HEADER_ROW_INDEX = 19;
export const MAX_MASTER_LIST_FILE_BYTES = 25 * 1024 * 1024;

export type MasterListDuplicateReason = 'matching-filename' | 'identical-content' | 'both';

export interface MasterListFileDuplicate {
  duplicateIndex: number;
  originalIndex: number;
  reason: MasterListDuplicateReason;
}

/** Find repeated files within one Master List selection. The registry does not
 * retain the uploaded workbook, so cross-session replacement is not offered. */
export async function findDuplicateMasterListFiles(files: readonly File[]): Promise<MasterListFileDuplicate[]> {
  const fingerprints: Array<{ name: string; fingerprint: string }> = [];
  for (const file of files) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLocaleLowerCase();
    if (extension !== '.xlsx' && extension !== '.xls') {
      throw new Error(`"${file.name}" must be an Excel workbook (.xlsx or .xls).`);
    }
    if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_MASTER_LIST_FILE_BYTES) {
      throw new Error(`"${file.name}" must be between 1 byte and 25 MB.`);
    }
    let rows: RawMasterListRow[];
    try {
      rows = parseMasterListWorkbook(await file.arrayBuffer());
    } catch (error) {
      throw new Error(`"${file.name}": ${error instanceof Error ? error.message : 'Unable to read this workbook.'}`);
    }
    if (rows.length === 0) throw new Error(`"${file.name}" has no partner company rows.`);
    const fingerprintRows = rows.map(({ cells }) => {
      const normalized = cells.map((cell) => String(cell ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase());
      while (normalized.at(-1) === '') normalized.pop();
      return normalized;
    });
    fingerprintRows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    fingerprints.push({
      name: file.name.trim().toLocaleLowerCase(),
      fingerprint: JSON.stringify(fingerprintRows),
    });
  }

  const duplicates: MasterListFileDuplicate[] = [];
  fingerprints.forEach((file, duplicateIndex) => {
    for (let originalIndex = 0; originalIndex < duplicateIndex; originalIndex++) {
      const original = fingerprints[originalIndex];
      const sameName = file.name === original.name;
      const sameContent = file.fingerprint === original.fingerprint;
      if (sameName || sameContent) {
        duplicates.push({
          duplicateIndex,
          originalIndex,
          reason: sameName && sameContent ? 'both' : sameName ? 'matching-filename' : 'identical-content',
        });
        break;
      }
    }
  });
  return duplicates;
}

// Column indices as laid out in "Masterlist Database" (0-based). Positional
// indexing is used instead of header-name lookups because the header cells
// contain inconsistent line breaks/trailing spaces.
//
// V2 layout (7-30-26 format revision): several columns were inserted into the
// "GENERAL INFORMATION" block (Credit Line; Open Checks Balance in FC, BP
// Currency, Sales Employee Code, Industry2, Conglomerate, FACT Code; Active,
// BP Type) ahead of the documents block, shifting every column after BP
// Address to the right relative to the prior layout. Indices below match
// that header row exactly - re-verify against row 19 (0-based 18) if the
// sheet layout changes again.
const COL = {
  status: 2,
  category: 3,
  supplierRank: 4,
  bpCode: 5,
  bpName: 6,
  bpAddress: 7,
  federalTaxId: 9,
  industry: 10,
  contactPerson: 17,
  position: 18,
  mobilePhone: 19,
  email: 20,
  dateAccredited: 23,
  confidentiality: 24,
  letterOfAccreditation: 25,
  codeOfConduct: 26,
  // Local supplier checklist
  local: {
    sif: 27,
    bir2303: 28,
    sec: 29,
    articlesOfIncorporation: 30,
    afs: 31,
    afsExpiry: 31,
    gis: 34,
    dti: 37,
    businessPermit: 40,
    importPermit: 43,
    productProfile: 46,
    proofOfAddress: 47,
    ownersId: 48,
    otherDocuments: 49,
  },
  // Foreign supplier checklist
  foreign: {
    sif: 50,
    articlesOfIncorporation: 51,
    certOfIncorporation: 52,
    afs: 53,
    businessPermitLicense: 56,
    ownersId: 59,
    productProfile: 60,
    otherDocuments: 61,
  },
} as const;

export interface RawMasterListRow {
  sourceRow: number; // 1-based sheet row number, for audit
  status: string;
  category: string;
  supplierRank: string;
  bpCode: string;
  bpName: string;
  bpAddress: string;
  federalTaxId: string;
  industry: string;
  contactPerson: string;
  position: string;
  mobilePhone: string;
  email: string;
  dateAccredited: unknown;
  cells: unknown[]; // full row, for column-index based document extraction
}

// --- Parsing ---------------------------------------------------------------

// The legend/summary block above the header has grown by a row between sheet
// revisions (a "GENERAL INFORMATION" banner row got inserted ahead of the
// header in the 7-31-26 file), so the header row is located by content
// instead of trusting a fixed index - COL's column positions are unaffected,
// only which row they start counting from.
function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[0] ?? '').trim() === '#' && String(row[COL.bpName] ?? '').trim().toUpperCase() === 'BP NAME') {
      return i;
    }
  }
  return HEADER_ROW_INDEX; // fallback to the last-known layout
}

export function parseMasterListWorkbook(data: ArrayBuffer | Uint8Array): RawMasterListRow[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames.includes('Masterlist Database')
    ? 'Masterlist Database'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const str = (v: unknown) => (v == null ? '' : String(v).trim());
  const dataStartRowIndex = findHeaderRowIndex(rows) + 1;

  return rows
    .slice(dataStartRowIndex)
    .map((cells, i) => ({
      sourceRow: dataStartRowIndex + i + 1, // 1-based Excel row number
      status: str(cells[COL.status]),
      category: str(cells[COL.category]),
      supplierRank: str(cells[COL.supplierRank]),
      bpCode: str(cells[COL.bpCode]),
      bpName: str(cells[COL.bpName]),
      bpAddress: str(cells[COL.bpAddress]),
      federalTaxId: str(cells[COL.federalTaxId]),
      industry: str(cells[COL.industry]),
      contactPerson: str(cells[COL.contactPerson]),
      position: str(cells[COL.position]),
      mobilePhone: str(cells[COL.mobilePhone]),
      email: str(cells[COL.email]),
      dateAccredited: cells[COL.dateAccredited],
      cells,
    }))
    .filter((row) => row.bpName); // the sheet has one trailing/blank row with no BP Name
}

// --- Name normalization + fuzzy matching -----------------------------------

const LEGAL_SUFFIXES = new Set([
  'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD',
  'LIMITED', 'LLC', 'OPC', 'PHILS', 'PHILIPPINES', 'PHIL',
]);

export function normalizeCompanyName(name: string): string {
  const tokens = name
    .toUpperCase()
    .replace(/[.,'"()&/\\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !LEGAL_SUFFIXES.has(t));
  return tokens.join(' ').trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// 1.0 = identical, 0.0 = completely different.
export function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// --- Field normalization -----------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// The sheet mixes "25-May-1999" / "5-Aug-2026" style dates with "7/20/26"
// style dates, plus junk text ("No", "Not yet", "N/A", "Missing") in the same
// columns. Returns undefined for anything that isn't a real date - the
// built-in Date parser is not used because it treats 2-digit years as 19xx.
export function parseFlexibleDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  const str = String(value).trim();
  if (!str) return undefined;

  const dMonY = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
  if (dMonY) {
    const month = MONTHS[dMonY[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const day = Number(dMonY[1]);
      const year = Number(dMonY[3]);
      return toIsoDate(year, month, day);
    }
  }

  const slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return toIsoDate(year, month, day);
  }

  return undefined;
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function normalizeBranchStatus(raw: string): BranchStatus | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'pending') return 'Pending';
  if (v === 'updated') return 'Updated';
  if (v === 'outdated') return 'Outdated';
  if (v === 'incomplete') return 'Incomplete';
  if (v === 'completed' || v === 'complete') return 'Completed';
  if (v === 'accredited') return 'Accredited';
  if (v === 'inactive') return 'Inactive';
  return undefined; // blank / other noise - not a recognized status
}

export interface CategoryResolution {
  type: PartnerCompanyType;
  supplierOrigin?: SupplierOrigin;
}

// Handles the sheet's own "Subcontructor" typo and "-NT" suffix (kept
// verbatim in rawCategory for audit, but stripped here since its exact
// operational meaning hasn't been defined yet).
export function resolveCategory(rawCategory: string): CategoryResolution {
  const cleaned = rawCategory
    .trim()
    .replace(/subcontructor/i, 'Subcontractor')
    .replace(/-?\s*NT$/i, '')
    .trim();

  if (!cleaned) return { type: 'Uncategorized' };
  if (/^courier$/i.test(cleaned)) return { type: 'Courier' };
  if (/^subcontractor$/i.test(cleaned)) return { type: 'Subcontractor' };
  if (/^supplier-local$/i.test(cleaned)) return { type: 'Supplier', supplierOrigin: 'Local' };
  if (/^supplier-foreign$/i.test(cleaned)) return { type: 'Supplier', supplierOrigin: 'Foreign' };
  return { type: 'Uncategorized' };
}

// --- Compliance documents ----------------------------------------------------

function yesNo(value: unknown): boolean | undefined {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return undefined;
}

function expiryDoc(value: unknown, docName: string): ComplianceDocument {
  const v = String(value ?? '').trim();
  if (!v || /^n\/a$/i.test(v)) return {};
  if (/^missing$/i.test(v)) return { provided: false };
  const expiryDate = parseFlexibleDate(v);
  if (!expiryDate) return {};
  const { status, daysLeft } = computeDocumentStatus({ expiryDate }, new Date(), docName);
  return { provided: true, expiryDate, status, daysLeft };
}

function flagDoc(value: unknown): ComplianceDocument {
  const provided = yesNo(value);
  if (provided === undefined) return {};
  return { provided, status: provided ? 'Current' : 'Missing' };
}

function buildDocuments(
  cells: unknown[],
  type: PartnerCompanyType,
  origin: SupplierOrigin | undefined
): Record<string, ComplianceDocument> {
  const docs: Record<string, ComplianceDocument> = {};

  const setFlag = (label: string, idx: number) => {
    const doc = flagDoc(cells[idx]);
    if (Object.keys(doc).length) docs[label] = doc;
  };
  const setExpiry = (label: string, idx: number) => {
    const doc = expiryDoc(cells[idx], label);
    if (Object.keys(doc).length) docs[label] = doc;
  };

  // Common, once-accredited checklist (applies regardless of type) - keys
  // must match COMMON_DOCUMENTS in documentRequirements.ts.
  const [confidentiality, letterOfAccreditation, codeOfConduct] = COMMON_DOCUMENTS;
  setFlag(confidentiality, COL.confidentiality);
  setFlag(letterOfAccreditation, COL.letterOfAccreditation);
  setFlag(codeOfConduct, COL.codeOfConduct);

  if (type === 'Uncategorized') return docs;

  // Only Supplier ever splits into Local/Foreign - Courier and Subcontractor
  // always carry the same checklist as a local supplier (per client: "all
  // those categories have the same list of requirements, except the foreign
  // one", and there's no Courier-Foreign/Subcontractor-Foreign category).
  if (type === 'Supplier' && origin === 'Foreign') {
    const [sif, articles, cert, afs, bpLicense, ownersId, productProfile, otherDocs] = FOREIGN_SUPPLIER_DOCUMENTS;
    setFlag(sif, COL.foreign.sif);
    setFlag(articles, COL.foreign.articlesOfIncorporation);
    setFlag(cert, COL.foreign.certOfIncorporation);
    setExpiry(afs, COL.foreign.afs);
    setExpiry(bpLicense, COL.foreign.businessPermitLicense);
    setFlag(ownersId, COL.foreign.ownersId);
    setFlag(productProfile, COL.foreign.productProfile);
    setFlag(otherDocs, COL.foreign.otherDocuments);
  } else {
    const [sif, bir, sec, articles, afs, gis, dti, bp, ip, productProfile, proofOfAddress, ownersId, otherDocs] = LOCAL_SUPPLIER_DOCUMENTS;
    setFlag(sif, COL.local.sif);
    setFlag(bir, COL.local.bir2303);
    setFlag(sec, COL.local.sec);
    setFlag(articles, COL.local.articlesOfIncorporation);
    setExpiry(afs, COL.local.afs);
    setExpiry(gis, COL.local.gis);
    setExpiry(dti, COL.local.dti);
    setExpiry(bp, COL.local.businessPermit);
    setExpiry(ip, COL.local.importPermit);
    setFlag(productProfile, COL.local.productProfile);
    setFlag(proofOfAddress, COL.local.proofOfAddress);
    setFlag(ownersId, COL.local.ownersId);
    setFlag(otherDocs, COL.local.otherDocuments);
  }

  return docs;
}

/** Merge explicit workbook values while retaining unprovided history and
 * administrator metadata such as remarks and supplementary documents. */
export function mergeExistingDocuments(
  existing: Record<string, ComplianceDocument> | undefined,
  imported: Record<string, ComplianceDocument>,
): Record<string, ComplianceDocument> {
  const merged: Record<string, ComplianceDocument> = { ...(existing ?? {}) };
  Object.entries(imported).forEach(([name, incoming]) => {
    merged[name] = { ...(existing?.[name] ?? {}), ...incoming };
  });
  return merged;
}

// --- Merge engine ------------------------------------------------------------

export interface ImportLogEntry {
  sourceRow: number;
  bpCode: string;
  bpName: string;
  action: 'merged' | 'created' | 'updated-branch' | 'skipped';
  matchedCompanyName?: string;
  matchedCompanyId?: string;
  similarity?: number;
  reason?: string;
}

export interface ImportOptions {
  similarityThreshold?: number; // default 0.88
}

// Human-readable category label, shared between the merge engine's before/
// after snapshots and the review-changes UI so both say the same thing.
export function categoryLabel(type: PartnerCompanyType, origin?: SupplierOrigin): string {
  if (type === 'Supplier') return `Supplier (${origin ?? 'Local'})`;
  return type;
}

// Per-company summary of what an import would change on an already-existing
// company, so the caller can show an admin a before/after preview and let
// them confirm or cancel before anything is actually saved.
export interface CompanyChangeSummary {
  companyId: string;
  companyName: string;
  categoryChanged: boolean;
  previousCategory: string;
  newCategory: string;
  branchesAdded: number;
  documentsChanged: number;
}

export interface ImportResult {
  companies: PartnerCompany[];
  log: ImportLogEntry[];
  changes: CompanyChangeSummary[];
  stats: {
    totalRows: number;
    mergedAsBranch: number;
    createdCompanies: number;
    updatedBranches: number;
    skipped: number;
    accredited: number;
    uncategorized: number;
    // Tally of every parsed row's resolved category (e.g. "Supplier-Local",
    // "Courier", "Uncategorized"), independent of whether it matched an
    // existing company - mirrors the file's own category mix.
    categoryBreakdown: Record<string, number>;
  };
}

export interface MasterListSourceFile {
  id: string;
  fileName: string;
  rows: RawMasterListRow[];
}

export interface MasterListImportReview {
  files: MasterListSourceFile[];
  excludedRowKeys: string[];
  result: ImportResult;
}

export function masterListRowKey(fileId: string, sourceRow: number): string {
  return `${fileId}:${sourceRow}`;
}

export async function prepareMasterListSourceFiles(files: File[]): Promise<MasterListSourceFile[]> {
  return Promise.all(files.map(async (file, index) => {
    try {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLocaleLowerCase();
      if (extension !== '.xlsx' && extension !== '.xls') {
        throw new Error('Choose an Excel workbook (.xlsx or .xls).');
      }
      if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_MASTER_LIST_FILE_BYTES) {
        throw new Error('The file must be between 1 byte and 25 MB.');
      }
      const rows = parseMasterListWorkbook(await file.arrayBuffer());
      if (rows.length === 0) throw new Error('No partner company rows were found. Check that this is a populated Master List workbook.');
      return { id: `file-${index}`, fileName: file.name, rows };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read this workbook.';
      throw new Error(`${file.name}: ${message}`);
    }
  }));
}

export function mergeMasterListSourceFiles(
  files: MasterListSourceFile[],
  excludedRowKeys: string[],
  existingCompanies: PartnerCompany[],
  options?: ImportOptions,
): ImportResult {
  const excluded = new Set(excludedRowKeys);
  const rows = files.flatMap((file) => file.rows.filter(
    (row) => !excluded.has(masterListRowKey(file.id, row.sourceRow)),
  ));
  return mergeRowsIntoCompanies(rows, existingCompanies, options);
}

function categoryBucketKey(category: CategoryResolution): string {
  return category.type === 'Supplier' ? `Supplier-${category.supplierOrigin ?? 'Local'}` : category.type;
}

// Counts document fields whose value differs between two documents maps -
// used to summarize "N document(s) changed" without caring which fields.
function countDocumentDiffs(
  before: Record<string, ComplianceDocument> | undefined,
  after: Record<string, ComplianceDocument> | undefined
): number {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  let count = 0;
  keys.forEach((key) => {
    if (JSON.stringify(beforeObj[key] ?? {}) !== JSON.stringify(afterObj[key] ?? {})) count++;
  });
  return count;
}

function rowToBranch(row: RawMasterListRow, category: CategoryResolution): BranchRecord {
  return {
    id: `branch-${row.bpCode || row.sourceRow}-${row.sourceRow}`,
    bpCode: row.bpCode,
    address: row.bpAddress || undefined,
    federalTaxId: row.federalTaxId || undefined,
    industry: row.industry || undefined,
    contactPerson: row.contactPerson || undefined,
    position: row.position || undefined,
    mobilePhone: row.mobilePhone || undefined,
    email: row.email || undefined,
    rawCategory: row.category || undefined,
    supplierRank: row.supplierRank || undefined,
    dateAccredited: parseFlexibleDate(row.dateAccredited),
    status: normalizeBranchStatus(row.status),
    sourceRow: row.sourceRow,
    documents: buildDocuments(row.cells, category.type, category.supplierOrigin),
  };
}

function newCompanyId(row: RawMasterListRow): string {
  return `pc-import-${row.bpCode || row.sourceRow}`;
}

export function mergeRowsIntoCompanies(
  rows: RawMasterListRow[],
  existingCompanies: PartnerCompany[],
  options: ImportOptions = {}
): ImportResult {
  const threshold = options.similarityThreshold ?? 0.88;
  const nowIso = new Date().toISOString();

  // Deep-clone so callers can diff/rollback against their original state.
  const companies: PartnerCompany[] = existingCompanies.map((c) => ({
    ...c,
    branches: c.branches ? c.branches.map((b) => ({ ...b, documents: { ...b.documents } })) : [],
  }));

  const exactIndex = new Map<string, PartnerCompany>();
  const bucketIndex = new Map<string, PartnerCompany[]>();

  const indexCompany = (company: PartnerCompany) => {
    const norm = normalizeCompanyName(company.name);
    if (!exactIndex.has(norm)) exactIndex.set(norm, company);
    const bucket = norm.charAt(0) || '#';
    if (!bucketIndex.has(bucket)) bucketIndex.set(bucket, []);
    bucketIndex.get(bucket)!.push(company);
  };
  companies.forEach(indexCompany);

  const log: ImportLogEntry[] = [];
  const changesById = new Map<string, CompanyChangeSummary>();
  const stats: ImportResult['stats'] = {
    totalRows: rows.length,
    mergedAsBranch: 0,
    createdCompanies: 0,
    updatedBranches: 0,
    skipped: 0,
    accredited: 0,
    uncategorized: 0,
    categoryBreakdown: {},
  };

  for (const row of rows) {
    if (!row.bpName) {
      log.push({ sourceRow: row.sourceRow, bpCode: row.bpCode, bpName: row.bpName, action: 'skipped', reason: 'Missing BP Name' });
      stats.skipped++;
      continue;
    }

    const category = resolveCategory(row.category);
    const bucketKey = categoryBucketKey(category);
    stats.categoryBreakdown[bucketKey] = (stats.categoryBreakdown[bucketKey] ?? 0) + 1;
    const branch = rowToBranch(row, category);
    const normName = normalizeCompanyName(row.bpName);

    let match: PartnerCompany | undefined = exactIndex.get(normName);
    let similarity = match ? 1 : undefined;

    if (!match) {
      const bucket = bucketIndex.get(normName.charAt(0) || '#') ?? [];
      let best: { company: PartnerCompany; score: number } | undefined;
      for (const candidate of bucket) {
        const score = nameSimilarity(normName, normalizeCompanyName(candidate.name));
        if (score >= threshold && (!best || score > best.score)) {
          best = { company: candidate, score };
        }
      }
      if (best) {
        match = best.company;
        similarity = best.score;
      }
    }

    if (match) {
      const beforeType = match.type;
      const beforeOrigin = match.supplierOrigin;
      const existingBranchIdx = (match.branches ?? []).findIndex(
        (b) => b.bpCode && row.bpCode && b.bpCode === row.bpCode
      );
      const isNewBranch = existingBranchIdx < 0;
      const beforeDocs = isNewBranch ? undefined : match.branches![existingBranchIdx].documents;
      const mergedDocuments = isNewBranch ? (branch.documents ?? {}) : mergeExistingDocuments(beforeDocs, branch.documents ?? {});
      const docDiffs = isNewBranch ? 0 : countDocumentDiffs(beforeDocs, mergedDocuments);

      if (existingBranchIdx >= 0) {
        match.branches![existingBranchIdx] = { ...branch, documents: mergedDocuments };
        stats.updatedBranches++;
        log.push({
          sourceRow: row.sourceRow, bpCode: row.bpCode, bpName: row.bpName,
          action: 'updated-branch', matchedCompanyName: match.name, matchedCompanyId: match.id, similarity,
        });
      } else {
        match.branches = [...(match.branches ?? []), branch];
        stats.mergedAsBranch++;
        log.push({
          sourceRow: row.sourceRow, bpCode: row.bpCode, bpName: row.bpName,
          action: 'merged', matchedCompanyName: match.name, matchedCompanyId: match.id, similarity,
        });
      }
      // A row can carry a real category even if it matched an otherwise
      // uncategorized company (e.g. the -NT branch is the accredited one).
      if (category.type !== 'Uncategorized' && match.type === 'Uncategorized') {
        match.type = category.type;
        match.supplierOrigin = category.supplierOrigin;
        match.accreditationStatus = 'Accredited';
        match.isArchived = false;
      }

      const categoryChanged = beforeType !== match.type || beforeOrigin !== match.supplierOrigin;
      if (categoryChanged || docDiffs > 0 || isNewBranch) {
        const entry = changesById.get(match.id) ?? {
          companyId: match.id,
          companyName: match.name,
          categoryChanged: false,
          previousCategory: categoryLabel(beforeType, beforeOrigin),
          newCategory: categoryLabel(match.type, match.supplierOrigin),
          branchesAdded: 0,
          documentsChanged: 0,
        };
        if (categoryChanged) {
          entry.categoryChanged = true;
          entry.newCategory = categoryLabel(match.type, match.supplierOrigin);
        }
        if (isNewBranch) entry.branchesAdded += 1;
        entry.documentsChanged += docDiffs;
        changesById.set(match.id, entry);
      }
    } else {
      const isAccredited = category.type !== 'Uncategorized';
      const company: PartnerCompany = {
        id: newCompanyId(row),
        name: row.bpName,
        type: category.type,
        supplierOrigin: category.supplierOrigin,
        createdAt: nowIso,
        isArchived: !isAccredited,
        accreditationStatus: isAccredited ? 'Accredited' : 'Unaccredited',
        branches: [branch],
      };
      companies.push(company);
      indexCompany(company);
      stats.createdCompanies++;
      if (isAccredited) stats.accredited++; else stats.uncategorized++;
      log.push({ sourceRow: row.sourceRow, bpCode: row.bpCode, bpName: row.bpName, action: 'created' });
    }
  }

  // A workbook has no remarks column. Record the observable import condition,
  // without inventing a reason or treating a missing document as provided.
  const touchedIds = new Set(log.flatMap(entry => entry.matchedCompanyId ? [entry.matchedCompanyId] : []));
  companies.filter(company => touchedIds.has(company.id)).forEach(company => {
    company.branches?.forEach(branch => {
      for (const docName of ['GIS (Corp)', 'SEC (Corp)', 'DTI (Sole)']) {
        const document = branch.documents?.[docName] ?? {};
        if (!companyDocumentRemarksError(company, docName, document)) continue;
        branch.documents = { ...branch.documents, [docName]: {
          ...document,
          remarks: 'Master List import: required document or expiry date is missing; pending verification.',
        } };
      }
    });
  });
  return { companies, log, changes: Array.from(changesById.values()), stats };
}

export async function importMasterListFromFile(
  file: File,
  existingCompanies: PartnerCompany[],
  options?: ImportOptions
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const rows = parseMasterListWorkbook(buffer);
  return mergeRowsIntoCompanies(rows, existingCompanies, options);
}
