import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SurveyResponse, SurveyType } from '../../../types/survey';
import { ExportTable, exportTablesAsCSV, exportTablesAsExcel } from './exporters';
import { saveReportDownload } from './exportHistory';
import { FORM_SPECS, MetaFieldKind } from '../../evaluation-imports/services/rawEvaluationImport';
import { getCanonicalQuestionId } from '../../../data/questionWeights';

// Reproduces the original MBS Partner Evaluation Forms export layout (one
// row per submission, per-company sheet, official header text/column order
// taken verbatim from FORM_SPECS in rawEvaluationImport.ts - the same file
// this app parses when an admin imports one of those forms) from this app's
// normalized, one-row-per-question SurveyResponse records.
//
// A submission's questionId may be stored either in the official
// Q-SUP-xx/Q-CON-xx/Q-SUB-xx-y scheme (imports, and live submissions built
// from the official survey templates) or in the legacy Q01-Q45 scheme from
// data/questions.ts - getCanonicalQuestionId bridges the two so both resolve
// into the same official column. Anything that still doesn't match a known
// official question (fully custom admin-authored surveys) isn't dropped -
// it's appended as its own trailing column, same as this export always did.

interface ResolvedColumn {
  header: string;
  isText: boolean;
  getValue: (byQuestionId: Map<string, SurveyResponse>) => string | number;
}

function lookupAnswer(byQuestionId: Map<string, SurveyResponse>, questionId: string): SurveyResponse | undefined {
  return byQuestionId.get(questionId) ?? byQuestionId.get(getCanonicalQuestionId(questionId));
}

function ratingCellValue(answer: SurveyResponse | undefined): string | number {
  if (!answer) return '';
  return typeof answer.rating === 'number' ? answer.rating : 'N/A';
}

function textCellValue(answer: SurveyResponse | undefined): string {
  if (!answer) return '';
  return answer.comment && answer.comment.trim() !== '' ? answer.comment : 'N/A';
}

function officialColumns(surveyType: SurveyType): ResolvedColumn[] {
  return FORM_SPECS[surveyType].columns.map((col): ResolvedColumn => {
    if (col.kind === 'matrix-remark') {
      return {
        header: col.originalHeader,
        isText: true,
        getValue: (byQuestionId) => {
          for (const qid of col.appliesTo) {
            const remark = lookupAnswer(byQuestionId, qid)?.comment;
            if (remark && remark.trim() !== '') return remark;
          }
          return '';
        },
      };
    }
    if (col.kind === 'rating') {
      return {
        header: col.originalHeader,
        isText: false,
        getValue: (byQuestionId) => ratingCellValue(lookupAnswer(byQuestionId, col.questionId)),
      };
    }
    return {
      header: col.originalHeader,
      isText: true,
      getValue: (byQuestionId) => textCellValue(lookupAnswer(byQuestionId, col.questionId)),
    };
  });
}

// Every questionId (raw + canonical) already covered by an official column -
// anything else found in the actual response data is a genuinely custom
// question and gets appended past the official columns instead of dropped.
function claimedQuestionIds(surveyType: SurveyType): Set<string> {
  const claimed = new Set<string>();
  FORM_SPECS[surveyType].columns.forEach((col) => {
    if (col.kind === 'matrix-remark') return;
    claimed.add(col.questionId);
    claimed.add(getCanonicalQuestionId(col.questionId));
  });
  return claimed;
}

function extraColumns(typeResponses: SurveyResponse[], claimed: Set<string>): ResolvedColumn[] {
  const byId = new Map<string, { questionNumber: number; question: string; allNa: boolean }>();
  typeResponses.forEach((r) => {
    if (claimed.has(r.questionId)) return;
    const isNa = typeof r.rating !== 'number';
    const existing = byId.get(r.questionId);
    if (!existing) {
      byId.set(r.questionId, { questionNumber: r.questionNumber, question: r.question, allNa: isNa });
    } else if (!isNa) {
      existing.allNa = false;
    }
  });
  return [...byId.entries()]
    .sort((a, b) => a[1].questionNumber - b[1].questionNumber)
    .map(([questionId, v]): ResolvedColumn => ({
      header: v.question,
      isText: v.allNa,
      getValue: (byQuestionId) => {
        const answer = byQuestionId.get(questionId);
        return v.allNa ? textCellValue(answer) : ratingCellValue(answer);
      },
    }));
}

function getResolvedColumns(surveyType: SurveyType, typeResponses: SurveyResponse[]): ResolvedColumn[] {
  return [...officialColumns(surveyType), ...extraColumns(typeResponses, claimedQuestionIds(surveyType))];
}

function formatSubmissionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatOptionalDate(value: string | undefined): string {
  return value ? formatSubmissionDate(value) : '';
}

// 'name'/'lastModified' still have no backing data in this app's
// SurveyResponse model (Microsoft Forms captures the respondent's typed
// display name and a "last edited" timestamp; this app has neither) - those
// two stay blank. 'start' is populated when available - recorded live from
// the moment the respondent opens the Questions Form, or read straight from
// the source file's own Start time column on import - and blank only for
// responses recorded before this field existed (see SurveyResponse.startTime).
function metaCellValue(kind: MetaFieldKind, index: number, first: SurveyResponse, company: string): string | number {
  switch (kind) {
    case 'id': return index + 1;
    case 'start': return formatOptionalDate(first.startTime);
    case 'completion': return formatSubmissionDate(first.submissionDate);
    case 'email': return first.respondentEmail ?? '';
    case 'designation': return first.respondentType ?? '';
    case 'department': return first.department ?? '';
    case 'address': return first.address ?? '';
    case 'company': return company;
    case 'name':
    case 'lastModified':
    default:
      return '';
  }
}

interface GroupedRow {
  index: number;
  first: SurveyResponse;
  byQuestionId: Map<string, SurveyResponse>;
}

interface CompanyGroup {
  company: string;
  rows: GroupedRow[];
}

function groupResponsesByCompany(typeResponses: SurveyResponse[]): CompanyGroup[] {
  const companies = [...new Set(typeResponses.map((r) => r.company))].sort();

  return companies.map((company) => {
    const companyResponses = typeResponses.filter((r) => r.company === company);
    const firstByResponseId = new Map<string, SurveyResponse>();
    companyResponses.forEach((r) => {
      if (!firstByResponseId.has(r.responseId)) firstByResponseId.set(r.responseId, r);
    });

    const responseIds = [...firstByResponseId.keys()].sort((a, b) =>
      (firstByResponseId.get(a)!.submissionDate ?? '').localeCompare(firstByResponseId.get(b)!.submissionDate ?? '')
    );

    const rows = responseIds.map((responseId, index) => {
      const first = firstByResponseId.get(responseId)!;
      const byQuestionId = new Map(
        companyResponses.filter((r) => r.responseId === responseId).map((a) => [a.questionId, a] as const)
      );
      return { index, first, byQuestionId };
    });

    return { company, rows };
  });
}

interface SubmissionRow extends GroupedRow {
  company: string;
}

// Unlike groupResponsesByCompany (still used by the PDF export, one page
// block per company for print readability), this mirrors the official
// Microsoft Forms export's actual shape: a single flat table across the
// whole survey type, in submission order - Forms just appends each new
// response as the next row, regardless of which company it's for. `index`
// is therefore one running sequence over the whole sheet (matching the
// original file's own "ID" column), not reset per company.
function groupResponsesBySubmission(typeResponses: SurveyResponse[]): SubmissionRow[] {
  const firstByResponseId = new Map<string, SurveyResponse>();
  typeResponses.forEach((r) => {
    if (!firstByResponseId.has(r.responseId)) firstByResponseId.set(r.responseId, r);
  });

  const responseIds = [...firstByResponseId.keys()].sort((a, b) =>
    (firstByResponseId.get(a)!.submissionDate ?? '').localeCompare(firstByResponseId.get(b)!.submissionDate ?? '')
  );

  return responseIds.map((responseId, index) => {
    const first = firstByResponseId.get(responseId)!;
    const byQuestionId = new Map(
      typeResponses.filter((r) => r.responseId === responseId).map((a) => [a.questionId, a] as const)
    );
    return { index, first, byQuestionId, company: first.company };
  });
}

// One merged, sortable sheet per survey type - not one sheet per company -
// so it matches the official form exports the admin already imports (every
// company's submissions mixed together in one flat table, ordered by when
// the form was answered).
export function buildRawResponseExportTables(responses: SurveyResponse[], surveyType: SurveyType): ExportTable[] {
  const typeResponses = responses.filter((r) => r.surveyType === surveyType);
  const spec = FORM_SPECS[surveyType];
  const resolvedColumns = getResolvedColumns(surveyType, typeResponses);
  const columns = [...spec.metaHeaders, ...resolvedColumns.map((c) => c.header)];
  const rows = groupResponsesBySubmission(typeResponses);

  if (rows.length === 0) return [];

  return [{
    title: `${surveyType} Raw Responses`,
    columns,
    rows: rows.map(({ index, first, byQuestionId, company }) => [
      ...spec.metaFields.map((kind) => metaCellValue(kind, index, first, company)),
      ...resolvedColumns.map((c) => c.getValue(byQuestionId)),
    ]),
  }];
}

export function exportRawResponsesAsExcel(responses: SurveyResponse[], surveyType: SurveyType, filenameBase: string) {
  return exportTablesAsExcel(buildRawResponseExportTables(responses, surveyType), filenameBase, { kind: 'raw', parameters: { category: surveyType } });
}

export function exportRawResponsesAsCSV(responses: SurveyResponse[], surveyType: SurveyType, filenameBase: string) {
  return exportTablesAsCSV(buildRawResponseExportTables(responses, surveyType), filenameBase, { kind: 'raw', parameters: { category: surveyType } });
}

// Short informational columns ("Period Covered", "Project Name") stay
// pencil-thin, so they can only fit a couple of short lines before a cell
// starts dominating row height. The one overall-comment column gets real
// width (see overallCommentWidth below), so it can hold much more before
// hitting the same problem. No ellipsis suffix - jsPDF's built-in
// "helvetica" font doesn't reliably render the U+2026 glyph.
const INFO_TEXT_CHAR_LIMIT = 30;
const COMMENT_CHAR_LIMIT = 140;

function truncateForPrint(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

// Which metadata columns are worth printing on the PDF (unlike Excel/CSV,
// which shows every official column for layout fidelity, the PDF stays
// space-constrained) - and their short labels/widths. 'start'/'name'/
// 'lastModified' are always blank (see metaCellValue) so they're skipped
// here entirely, and 'company' is dropped because the page heading already
// names the company for every row on that sheet.
const PDF_META_KINDS: MetaFieldKind[] = ['id', 'completion', 'email', 'designation', 'department', 'address'];
const META_LABELS: Partial<Record<MetaFieldKind, string>> = {
  id: 'ID', completion: 'Date', email: 'Email', designation: 'Designation', department: 'Department', address: 'Address',
};
const META_WIDTHS: Partial<Record<MetaFieldKind, number>> = {
  id: 16, completion: 42, email: 78, designation: 48, department: 46, address: 70,
};

/**
 * One 8.5x13in (Folio) landscape PDF, one dedicated page block per company (autoTable
 * spills a company onto a 2nd+ page on its own if it has enough respondents
 * to overflow the first), so page count naturally tracks response volume
 * instead of being hardcoded.
 *
 * Several adaptations from the Excel/CSV layout, all needed to keep that
 * page count near "1-2 pages" instead of a dozen+ (Excel/CSV are unaffected
 * by any of this - full question text, every column, no truncation):
 *  - Question columns use short "Q1..Qn" codes instead of the full question
 *    text (a full sentence wrapped into a ~25pt-wide column runs to dozens
 *    of lines). A one-time legend page maps the codes back to full text.
 *  - Per-section remarks/comment fields are dropped, keeping only the
 *    form's one closing overall-comment field - repeating the same kind of
 *    free-text answer across 5+ columns is what mainly blew up row height.
 *  - That one remaining comment column gets real column width and a
 *    generous character cap (COMMENT_CHAR_LIMIT); every other column
 *    (ratings and short informational fields like "Period Covered") stays
 *    pencil-thin, capped at INFO_TEXT_CHAR_LIMIT.
 */
const REMARKS_LIKE_PATTERN = /remarks|comment/i;

export function exportRawResponsesAsPDF(responses: SurveyResponse[], surveyType: SurveyType, filenameBase: string) {
  const typeResponses = responses.filter((r) => r.surveyType === surveyType);
  const spec = FORM_SPECS[surveyType];
  const allColumns = getResolvedColumns(surveyType, typeResponses);
  const groups = groupResponsesByCompany(typeResponses);

  // Per-section remarks/comment fields (e.g. "Delivery Remarks", "Please
  // provide any additional comments on Security and safety.") repeat the
  // same kind of free-text answer many times over - each one needs real
  // column width to avoid wrapping into a dozen+ lines, which is what was
  // blowing the per-company page count past "1-2 pages". So the PDF keeps
  // only the form's closing overall-comment field and drops the rest;
  // informational text fields ("Period Covered", "Project Name", etc.)
  // don't match the remarks/comment wording and are always kept.
  const lastTextIndex = allColumns.reduce((lastIdx, q, i) => (q.isText ? i : lastIdx), -1);
  const keepFlags = allColumns.map(
    (q, i) => !(q.isText && i !== lastTextIndex && REMARKS_LIKE_PATTERN.test(q.header))
  );
  const questionColumns = allColumns.filter((_, i) => keepFlags[i]);
  // Among the (few) text columns still kept, only the very last one is the
  // form's closing free-form comment - that's the one column worth real
  // width. Short informational fields like "Period Covered" only ever hold
  // a couple of words and get the same pencil-thin treatment as ratings;
  // giving them an even share alongside the real comment column (as an
  // earlier version of this did) starved the comment column for room while
  // leaving these short fields absurdly wide for their actual content.
  const lastKeptTextIndex = questionColumns.reduce((lastIdx, q, i) => (q.isText ? i : lastIdx), -1);
  const questionMeta = questionColumns.map((q, i) => ({
    label: `Q${i + 1}`,
    isText: q.isText,
    isOverallComment: q.isText && i === lastKeptTextIndex,
  }));

  // 8.5 x 13in (Folio/Long) in points, landscape.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [612, 936] });
  const marginLeft = 24;
  const marginRight = 24;
  const headerHeight = 58;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginLeft - marginRight;

  // --- Page 1: question key, mapping each short "Qn" code to its full text.
  doc.setFontSize(16);
  doc.setTextColor(0, 99, 169);
  doc.setFont('helvetica', 'bold');
  doc.text(`${surveyType} Raw Data Export - Question Key`, marginLeft, 34);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text('Column codes used on every company sheet in this document map to the questions below. Free-text answers are truncated on those sheets to keep the page count down - see the Excel/CSV export for full remarks.', marginLeft, 50, { maxWidth: usableWidth });

  let legendY = 74;
  const legendLineHeight = 10;
  doc.setFontSize(8);
  questionColumns.forEach((q, i) => {
    const lines = doc.splitTextToSize(`Q${i + 1}. ${q.header}`, usableWidth);
    if (legendY + lines.length * legendLineHeight > pageHeight - 30) {
      doc.addPage();
      legendY = 34;
    }
    doc.setTextColor(20, 20, 20);
    doc.text(lines, marginLeft, legendY);
    legendY += lines.length * legendLineHeight + 4;
  });

  // Metadata columns vary by survey type (Courier has no Designation/
  // Department; Supplier/Subcontractor have no Address) - see PDF_META_KINDS.
  const printedMetaFields = spec.metaFields.filter((k) => PDF_META_KINDS.includes(k));
  const metaHeaders = printedMetaFields.map((k) => META_LABELS[k]!);
  const metaWidths = printedMetaFields.map((k) => META_WIDTHS[k]!);
  // Wide enough that a 3-char header ("Q10"+, once there are 10+ kept
  // columns) still fits on one line instead of wrapping to "Q1" / "0".
  const ratingColWidth = 18;
  const infoTextColWidth = 44;
  const hasOverallComment = questionMeta.some((q) => q.isOverallComment);
  const usedByNarrowCols = metaWidths.reduce((a, b) => a + b, 0)
    + questionMeta.filter((q) => !q.isText).length * ratingColWidth
    + questionMeta.filter((q) => q.isText && !q.isOverallComment).length * infoTextColWidth;
  const overallCommentWidth = hasOverallComment ? Math.max(140, usableWidth - usedByNarrowCols) : 0;

  const columnStyles: Record<number, { cellWidth: number }> = {};
  metaWidths.forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
  questionMeta.forEach((q, i) => {
    const width = q.isOverallComment ? overallCommentWidth : q.isText ? infoTextColWidth : ratingColWidth;
    columnStyles[metaWidths.length + i] = { cellWidth: width };
  });

  const shortHeaders = [...metaHeaders, ...questionMeta.map((q) => q.label)];

  groups.forEach(({ company, rows }) => {
    doc.addPage();

    const bodyRows = rows.map(({ index, first, byQuestionId }) => {
      const metaValues = printedMetaFields.map((kind) => {
        const value = metaCellValue(kind, index, first, company);
        return kind === 'completion' ? String(value).split(',')[0] : value;
      });
      const answers = questionColumns.map((c) => c.getValue(byQuestionId));
      return [
        ...metaValues,
        ...answers.map((value, i) => {
          const str = String(value);
          if (!questionMeta[i].isText) return str;
          return truncateForPrint(str, questionMeta[i].isOverallComment ? COMMENT_CHAR_LIMIT : INFO_TEXT_CHAR_LIMIT);
        }),
      ];
    });

    autoTable(doc, {
      startY: headerHeight,
      head: [shortHeaders],
      body: bodyRows,
      margin: { top: headerHeight, left: marginLeft, right: marginRight, bottom: 28 },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      theme: 'grid',
      // Redrawn on every page this company's table spans, so the company
      // name/subtitle stays visible even if the table overflows to a 2nd page.
      didDrawPage: () => {
        doc.setFontSize(14);
        doc.setTextColor(0, 99, 169);
        doc.setFont('helvetica', 'bold');
        doc.text(company, marginLeft, 26);

        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `${surveyType} - Raw Evaluation Submissions - ${rows.length} respondent(s) - Generated ${new Date().toLocaleString()} - see Question Key on page 1`,
          marginLeft,
          40
        );
      },
    });
  });

  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} - Microgenesis Supplier Management System`,
      marginLeft,
      pageHeight - 14
    );
  }

  return saveReportDownload(doc.output('blob'), `Raw Data Export (${surveyType})`, 'pdf', { kind: 'raw', parameters: { category: surveyType } });
}
