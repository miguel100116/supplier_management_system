import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { ArchiveSeries, SurveyResponse, SurveyType } from '../types/survey';
import { ExportTable, exportTablesAsCSV, exportTablesAsExcel } from './exporters';
import { FORM_SPECS } from './rawEvaluationImport';

// Single source of truth for the archived-response export/import shape, so
// a file exported here can always be re-imported losslessly by the parser
// below - every SurveyResponse field, verbatim, one row per response record.
// 'seriesLabel' is denormalized onto every row (looked up from seriesId) so
// the spreadsheet is self-describing without needing a second sheet.
//
// The importer (parseArchivedResponsesWorkbook, below) also accepts the
// wide "Raw Data Export" format from rawResponseExport.ts - one row per
// submission, question text as column headers, one sheet/block per company
// - converting it into this same long-format shape before merging. See
// convertWideBlocksToLegacyRows for that side.
const COLUMNS = [
  'responseId', 'surveyType', 'respondentType', 'startTime', 'submissionDate', 'company',
  'department', 'address', 'questionId', 'questionNumber', 'question',
  'questionCategory', 'rating', 'comment', 'respondentEmail',
  'archived', 'archivedAt', 'archivedBySurveyId', 'archivedBySurveyTitle',
  'seriesId', 'seriesLabel',
] as const;

function toExportTable(responses: SurveyResponse[], seriesList: ArchiveSeries[]): ExportTable {
  const labelById = new Map(seriesList.map((s) => [s.id, s.label]));
  return {
    title: 'Archived Responses',
    columns: [...COLUMNS],
    rows: responses.map((r) => COLUMNS.map((col) => {
      if (col === 'seriesLabel') return r.seriesId ? (labelById.get(r.seriesId) ?? '') : '';
      const value = r[col as keyof SurveyResponse];
      if (value === undefined || value === null) return '';
      return typeof value === 'boolean' ? String(value) : value;
    })),
  };
}

export function exportArchivedResponsesAsCSV(responses: SurveyResponse[], filenameBase: string, seriesList: ArchiveSeries[] = []) {
  exportTablesAsCSV([toExportTable(responses, seriesList)], filenameBase);
}

export function exportArchivedResponsesAsExcel(responses: SurveyResponse[], filenameBase: string, seriesList: ArchiveSeries[] = []) {
  exportTablesAsExcel([toExportTable(responses, seriesList)], filenameBase);
}

/* ------------------------------------------------------------------ */
/* Re-import                                                            */
/* ------------------------------------------------------------------ */

export interface ArchiveImportLogEntry {
  row: number; // 1-based row within the sheet's data rows
  responseId: string;
  action: 'imported' | 'skipped-duplicate' | 'skipped-invalid';
  reason?: string;
}

export interface ArchiveImportResult {
  responses: SurveyResponse[]; // the full merged list (existing + newly imported)
  log: ArchiveImportLogEntry[];
  stats: { totalRows: number; imported: number; skippedDuplicate: number; skippedInvalid: number };
}

const VALID_SURVEY_TYPES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

function submissionDateFromResponseId(responseId: string): string {
  const rawTimestamp = /^RESP-(\d{13})-/.exec(responseId)?.[1];
  if (!rawTimestamp) return '';
  const date = new Date(Number(rawTimestamp));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function coerceRating(value: unknown): SurveyResponse['rating'] | undefined {
  if (value === 'N/A' || value === '') return value === '' ? undefined : 'N/A';
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function rowToResponse(row: Record<string, unknown>): { response?: SurveyResponse; reason?: string } {
  const responseId = String(row.responseId ?? '').trim();
  const company = String(row.company ?? '').trim();
  const questionId = String(row.questionId ?? '').trim();
  const surveyType = String(row.surveyType ?? '').trim() as SurveyType;
  const respondentType = String(row.respondentType ?? '').trim() || 'Unspecified';
  const rawStartTime = String(row.startTime ?? '').trim();
  const rawSubmissionDate = String(row.submissionDate ?? '').trim();
  const recoveredSubmissionDate = rawSubmissionDate
    || rawStartTime
    || submissionDateFromResponseId(responseId);

  if (!responseId) return { reason: 'Missing responseId' };
  if (!company) return { reason: 'Missing partner' };
  if (!questionId) return { reason: 'Missing questionId' };
  if (!VALID_SURVEY_TYPES.includes(surveyType)) return { reason: `Invalid surveyType "${row.surveyType}"` };
  if (!recoveredSubmissionDate || Number.isNaN(Date.parse(recoveredSubmissionDate))) {
    return { reason: 'Missing or invalid submissionDate with no recoverable startTime/responseId timestamp' };
  }

  const rating = coerceRating(row.rating);
  if (rating === undefined) return { reason: `Invalid rating "${row.rating}"` };

  return {
    response: {
      responseId,
      surveyType,
      respondentType,
      startTime: rawStartTime || undefined,
      submissionDate: recoveredSubmissionDate,
      ...(!rawSubmissionDate
        ? { submissionDateInferredFrom: rawStartTime ? 'startTime' as const : 'responseId' as const }
        : {}),
      company,
      department: row.department ? String(row.department) : undefined,
      address: row.address ? String(row.address) : undefined,
      questionId,
      questionNumber: Number(row.questionNumber) || 0,
      question: String(row.question ?? ''),
      questionCategory: String(row.questionCategory ?? ''),
      rating,
      comment: String(row.comment ?? ''),
      respondentEmail: row.respondentEmail ? String(row.respondentEmail) : undefined,
      // Re-imported historical data is always archived, regardless of what
      // the "archived" column says - this path exists to restore deleted
      // history, never to sneak rows back into the active/current period.
      archived: true,
      archivedAt: row.archivedAt ? String(row.archivedAt) : undefined,
      archivedBySurveyId: row.archivedBySurveyId ? String(row.archivedBySurveyId) : undefined,
      archivedBySurveyTitle: row.archivedBySurveyTitle ? String(row.archivedBySurveyTitle) : undefined,
      // seriesId is intentionally NOT read from the row here - it's resolved
      // from seriesLabel in mergeImportedResponses so re-imports land in the
      // matching series by name rather than trusting a raw id from a hand-edited file.
    },
  };
}

/* ------------------------------------------------------------------ */
/* Import: also accepts the "Raw Data Export" wide format             */
/* (rawResponseExport.ts) - one row per submission, question text as  */
/* column headers, one sheet/block per company - alongside this       */
/* module's own long/normalized export shape.                         */
/* ------------------------------------------------------------------ */

interface ParsedBlock {
  title: string; // sheet name (Excel) or the title line above the table (CSV)
  header: string[];
  rows: unknown[][];
}

function isZipBuffer(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // 'PK' - xlsx is a zip archive
}

function parseXlsxBlocks(data: ArrayBuffer | Uint8Array): ParsedBlock[] {
  const workbook = XLSX.read(data, { type: 'array' });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    const [header = [], ...rows] = aoa;
    return { title: name, header: header.map(String), rows };
  });
}

// Mirrors exportTablesAsCSV's layout: each table is a title line, then a
// normal CSV header+rows, and tables are separated by a blank line - so a
// legacy archive export (always exactly one table) and a raw data export
// (one table per company) both split the same way.
function parseCsvBlocks(data: ArrayBuffer | Uint8Array): ParsedBlock[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const text = new TextDecoder('utf-8').decode(bytes);
  const chunks = text.split(/\r?\n\r?\n/).map((c) => c.trim()).filter(Boolean);

  return chunks.map((chunk) => {
    const newlineIdx = chunk.indexOf('\n');
    const title = (newlineIdx === -1 ? chunk : chunk.slice(0, newlineIdx)).trim();
    const rest = newlineIdx === -1 ? '' : chunk.slice(newlineIdx + 1);
    const parsed = Papa.parse<unknown[]>(rest, { skipEmptyLines: true });
    const [header = [], ...rows] = parsed.data;
    return { title, header: header.map(String), rows };
  });
}

function isLegacyHeader(header: string[]): boolean {
  return header.some((h) => h.trim().toLowerCase() === 'responseid');
}

function blockToLegacyRows(block: ParsedBlock): Record<string, unknown>[] {
  return block.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    block.header.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

// Legacy headers (pre-original-format-fidelity raw exports) plus every
// metadata header the current FORM_SPECS-driven export can produce, across
// all 3 survey types - a blanket "not a question column" filter that works
// regardless of which era exported the file, or which survey type it's for
// (Courier has no Designation:/Department:, Supplier/Subcontractor have no
// Address, etc. - see rawResponseExport.ts).
const RAW_EXPORT_METADATA_HEADERS = new Set([
  'id', 'submission date', 'email', 'designation', 'department', 'company name',
  ...Object.values(FORM_SPECS).flatMap((spec) => spec.metaHeaders).map((h) => h.trim().toLowerCase()),
]);

interface QuestionLookupEntry {
  questionId: string;
  questionNumber: number;
  questionCategory: string;
  // See rawResponseExport.ts's identical heuristic: a question is
  // text/select-type if every recorded answer for it is 'N/A' (the real
  // value living in `comment` instead of `rating`).
  isText: boolean;
}

// Matches a wide-export column header against the official form layout
// (verbatim header text, e.g. "Reliablity/Delivery Remarks") - always
// available, independent of whatever data already happens to be loaded.
// Matrix-remark columns aren't included here: on export their text isn't
// its own question, it's folded into the comment of the sub-questions it
// applies to (see attachOfficialMatrixRemarks below), mirroring how
// rawEvaluationImport.ts's forward import handles the same column.
function buildOfficialQuestionLookup(surveyType: SurveyType): Map<string, QuestionLookupEntry> {
  const lookup = new Map<string, QuestionLookupEntry>();
  FORM_SPECS[surveyType].columns.forEach((col) => {
    if (col.kind === 'matrix-remark') return;
    lookup.set(col.originalHeader.trim().toLowerCase(), {
      questionId: col.questionId,
      questionNumber: col.questionNumber,
      questionCategory: col.questionCategory,
      isText: col.kind === 'text',
    });
  });
  return lookup;
}

// Falls back to whatever's already in the app's data for this survey type -
// covers older raw exports (headers were the app's own paraphrased question
// text, not the verbatim form headers) and fully custom admin-authored
// questions that were never part of an official form.
function buildQuestionLookup(existingResponses: SurveyResponse[], surveyType: SurveyType): Map<string, QuestionLookupEntry> {
  const byId = new Map<string, { questionNumber: number; question: string; questionCategory: string; allNa: boolean }>();
  existingResponses
    .filter((r) => r.surveyType === surveyType)
    .forEach((r) => {
      const isNa = typeof r.rating !== 'number';
      const existing = byId.get(r.questionId);
      if (!existing) {
        byId.set(r.questionId, { questionNumber: r.questionNumber, question: r.question, questionCategory: r.questionCategory, allNa: isNa });
      } else if (!isNa) {
        existing.allNa = false;
      }
    });

  const lookup = new Map<string, QuestionLookupEntry>();
  byId.forEach((v, questionId) => {
    lookup.set(v.question.trim().toLowerCase(), {
      questionId,
      questionNumber: v.questionNumber,
      questionCategory: v.questionCategory,
      isText: v.allNa,
    });
  });
  return lookup;
}

// Header text -> the questionIds a matrix-remark column's value should be
// attached to as `comment` (see attachOfficialMatrixRemarks).
function buildOfficialMatrixRemarkLookup(surveyType: SurveyType): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  FORM_SPECS[surveyType].columns.forEach((col) => {
    if (col.kind === 'matrix-remark') lookup.set(col.originalHeader.trim().toLowerCase(), col.appliesTo);
  });
  return lookup;
}

function findColIndex(header: string[], candidates: string[]): number {
  const lowered = header.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = lowered.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  return -1;
}

// The raw export's filename always starts with "<surveytype>_raw_evaluations"
// (see rawResponseExport.ts) - trust that first, since a header-overlap
// guess only works once the app already has some live data of that type to
// compare against.
function resolveSurveyTypeForImport(
  fileName: string,
  questionHeaders: string[],
  existingResponses: SurveyResponse[]
): SurveyType {
  const lowerName = fileName.toLowerCase();
  const byFileName = VALID_SURVEY_TYPES.find((type) => lowerName.includes(type.toLowerCase()));
  if (byFileName) return byFileName;

  const headerSet = new Set(questionHeaders.map((h) => h.trim().toLowerCase()));
  let bestType: SurveyType = VALID_SURVEY_TYPES[0];
  let bestScore = -1;
  VALID_SURVEY_TYPES.forEach((type) => {
    // Official form headers are always known, even before any data of this
    // type exists yet - existing live/imported question text is folded in
    // too, so a still-unmatched older export (paraphrased headers) keeps working.
    const known = new Set([
      ...FORM_SPECS[type].columns.map((col) => col.originalHeader.trim().toLowerCase()),
      ...existingResponses.filter((r) => r.surveyType === type).map((r) => r.question.trim().toLowerCase()),
    ]);
    const overlap = [...headerSet].filter((h) => known.has(h)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestType = type;
    }
  });
  return bestType;
}

// Reconstructs one long-format raw row per (submission, question) answer
// from the wide "one row per submission" layout - the inverse of
// buildRawResponseExportTables in rawResponseExport.ts.
function convertWideBlocksToLegacyRows(
  blocks: ParsedBlock[],
  fileName: string,
  existingResponses: SurveyResponse[]
): Record<string, unknown>[] {
  const firstHeader = blocks[0]?.header ?? [];
  const questionHeaders = firstHeader.filter((h) => !RAW_EXPORT_METADATA_HEADERS.has(h.trim().toLowerCase()));
  const surveyType = resolveSurveyTypeForImport(fileName, questionHeaders, existingResponses);
  const officialLookup = buildOfficialQuestionLookup(surveyType);
  const officialMatrixRemarks = buildOfficialMatrixRemarkLookup(surveyType);
  const fallbackLookup = buildQuestionLookup(existingResponses, surveyType);

  const rows: Record<string, unknown>[] = [];

  blocks.forEach((block) => {
    const dateIdx = findColIndex(block.header, ['completion time', 'submission date']);
    const startTimeIdx = findColIndex(block.header, ['start time']);
    const emailIdx = findColIndex(block.header, ['email']);
    const designationIdx = findColIndex(block.header, ['designation:', 'designation']);
    const departmentIdx = findColIndex(block.header, ['department:', 'department']);
    const companyNameIdx = findColIndex(
      block.header,
      [...FORM_SPECS[surveyType].metaHeaders.filter((h) => h.toLowerCase().endsWith('name:')).map((h) => h.toLowerCase()), 'company name']
    );
    const questionCols = block.header
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => !RAW_EXPORT_METADATA_HEADERS.has(h.trim().toLowerCase()));

    block.rows.forEach((row) => {
      const company = (companyNameIdx >= 0 ? String(row[companyNameIdx] ?? '') : block.title).trim() || block.title;
      const email = emailIdx >= 0 ? String(row[emailIdx] ?? '').trim() : '';
      const submissionDate = dateIdx >= 0 ? String(row[dateIdx] ?? '').trim() : '';
      const startTime = startTimeIdx >= 0 ? String(row[startTimeIdx] ?? '').trim() : '';
      const designation = designationIdx >= 0 ? String(row[designationIdx] ?? '').trim() : '';
      const department = departmentIdx >= 0 ? String(row[departmentIdx] ?? '').trim() : '';
      // Deterministic (not random), so re-importing the same export twice
      // is recognized as a duplicate instead of creating copies.
      const responseId = `WIDE::${surveyType}::${company}::${email}::${submissionDate}`;

      // Matrix-remark columns (Subcontractor only) don't produce their own
      // row - their text attaches as `comment` on every sub-question row it
      // applies to, mirroring rawEvaluationImport.ts's forward-import behavior.
      const remarkByQuestionId = new Map<string, string>();
      questionCols.forEach(({ h, i }) => {
        const appliesTo = officialMatrixRemarks.get(h.trim().toLowerCase());
        if (!appliesTo) return;
        const raw = row[i];
        const remark = raw === undefined || raw === null ? '' : String(raw).trim();
        if (remark) appliesTo.forEach((qid) => remarkByQuestionId.set(qid, remark));
      });

      questionCols.forEach(({ h, i }, qIdx) => {
        if (officialMatrixRemarks.has(h.trim().toLowerCase())) return; // handled above, not its own question row
        const raw = row[i];
        const value = raw === undefined || raw === null ? '' : String(raw).trim();
        if (value === '') return; // nothing recorded for this question on this row

        const known = officialLookup.get(h.trim().toLowerCase()) ?? fallbackLookup.get(h.trim().toLowerCase());
        const questionId = known?.questionId ?? `IMPORTED-${surveyType}-${qIdx}`;
        const questionNumber = known?.questionNumber ?? qIdx + 1;
        const questionCategory = known?.questionCategory ?? 'Imported';
        // No match for this exact question text anywhere in the official
        // form or the live dataset (a brand-new deployment, or a renamed
        // question) - fall back to a plain numeric-vs-text guess so the
        // row still imports.
        const isText = known ? known.isText : !(value !== 'N/A' && Number.isFinite(Number(value)));
        const rating = !isText && value !== 'N/A' ? Number(value) : 'N/A';
        const comment = isText && value !== 'N/A' ? value : (remarkByQuestionId.get(questionId) ?? '');

        rows.push({
          responseId,
          surveyType,
          respondentType: designation,
          startTime: startTime || undefined,
          submissionDate,
          company,
          department,
          questionId,
          questionNumber,
          question: h,
          questionCategory,
          rating,
          comment,
          respondentEmail: email,
        });
      });
    });
  });

  return rows;
}

export function parseArchivedResponsesWorkbook(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  existingResponses: SurveyResponse[]
): { row: number; raw: Record<string, unknown> }[] {
  const blocks = isZipBuffer(data) ? parseXlsxBlocks(data) : parseCsvBlocks(data);
  const legacyBlocks = blocks.filter((b) => isLegacyHeader(b.header));
  const wideBlocks = blocks.filter((b) => !isLegacyHeader(b.header));

  const legacyRows = legacyBlocks.flatMap((b) => blockToLegacyRows(b));
  const wideRows = wideBlocks.length > 0
    ? convertWideBlocksToLegacyRows(wideBlocks, fileName, existingResponses)
    : [];

  return [...legacyRows, ...wideRows].map((raw, i) => ({ row: i + 1, raw }));
}

// One submission produces many rows (one per question) that all share the
// same responseId - so responseId alone is NOT a unique row key. The unique
// key for a single row is (responseId, questionId).
function rowKey(responseId: string, questionId: string): string {
  return `${responseId}::${questionId}`;
}

export function mergeImportedResponses(
  parsedRows: { row: number; raw: Record<string, unknown> }[],
  existingResponses: SurveyResponse[],
  resolveSeriesId?: (label: string) => string
): ArchiveImportResult {
  const existingKeys = new Set(existingResponses.map((r) => rowKey(r.responseId, r.questionId)));
  const merged = [...existingResponses];
  const log: ArchiveImportLogEntry[] = [];
  const stats = { totalRows: parsedRows.length, imported: 0, skippedDuplicate: 0, skippedInvalid: 0 };
  // Resolve each distinct label at most once per import batch, so re-importing
  // a file with many rows sharing a label doesn't create duplicate series.
  const seriesIdByLabel = new Map<string, string>();

  for (const { row, raw } of parsedRows) {
    const responseId = String(raw.responseId ?? '').trim();
    const questionId = String(raw.questionId ?? '').trim();
    const key = rowKey(responseId, questionId);
    if (existingKeys.has(key) && responseId && questionId) {
      log.push({ row, responseId, action: 'skipped-duplicate' });
      stats.skippedDuplicate++;
      continue;
    }

    const { response, reason } = rowToResponse(raw);
    if (!response) {
      log.push({ row, responseId, action: 'skipped-invalid', reason });
      stats.skippedInvalid++;
      continue;
    }

    const seriesLabel = String(raw.seriesLabel ?? '').trim();
    if (seriesLabel && resolveSeriesId) {
      const cacheKey = seriesLabel.toLowerCase();
      let seriesId = seriesIdByLabel.get(cacheKey);
      if (!seriesId) {
        seriesId = resolveSeriesId(seriesLabel);
        seriesIdByLabel.set(cacheKey, seriesId);
      }
      response.seriesId = seriesId;
    }

    merged.push(response);
    existingKeys.add(key);
    log.push({ row, responseId: response.responseId, action: 'imported' });
    stats.imported++;
  }

  return { responses: merged, log, stats };
}

export async function importArchivedResponsesFromFile(
  file: File,
  existingResponses: SurveyResponse[],
  resolveSeriesId?: (label: string) => string
): Promise<ArchiveImportResult> {
  const buffer = await file.arrayBuffer();
  const rows = parseArchivedResponsesWorkbook(buffer, file.name, existingResponses);
  return mergeImportedResponses(rows, existingResponses, resolveSeriesId);
}
