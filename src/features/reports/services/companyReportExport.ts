import { paperSizePoints, paperSizeTwips } from '../domain/paperSize';
import { formatAnalyticsRatingRange } from '../../analytics/domain/rankings';
import { jsPDF } from 'jspdf';
import autoTableModule from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { saveReportDownload } from './exportHistory';
import type { ReportRecipe } from '../domain/reportHistory';
import { applyPdfBranding, loadPdfBranding } from './pdfBranding';
import {
  CompanyReportData,
  formatCategoryMetricLabel,
  formatReportNumber,
  formatReportPercentage,
  getReportAverageText,
} from '../../feedback-hub/reporting/index';

// jspdf-autotable exposes a direct default function in the browser bundle and
// a nested default when loaded through Node's ESM-to-CommonJS bridge. Supporting
// both keeps browser Preview/Print and the deterministic PDF QA runner aligned.
const autoTable: typeof autoTableModule = typeof autoTableModule === 'function'
  ? autoTableModule
  : (autoTableModule as unknown as { default: typeof autoTableModule }).default;

export type {
  CompanyReportChartImages,
  CompanyReportData,
  CompanyReportGraphSelection,
  CompanyReportQuestionRow,
} from '../../feedback-hub/reporting/index';

const BRAND = [0, 99, 169] as const;
const BRAND_HEX = '0063A9';
const INK_HEX = '1E293B';
const MUTED_HEX = '64748B';
const RULE_HEX = 'E2E8F0';

const LOGO_URL = '/microgenesis_logo.png';
const LOGO_ASPECT = 498 / 1921; // height / width, from the source asset

/** Renders one DOM node (a chart wrapper) to a PNG data URL for embedding in PDF/DOCX exports. */
export async function captureChartImage(node: HTMLElement | null): Promise<string | null> {
  if (!node) return null;
  try {
    const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2, logging: false });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function dataUrlDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 600, height: img.naturalHeight || 300 });
    img.onerror = () => resolve({ width: 600, height: 300 });
    img.src = dataUrl;
  });
}

/** Fetches the Microgenesis wordmark from /public and returns it as a data URL for embedding. */
export async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('logo read failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* PDF export                                                          */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return [0, 99, 169];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function drawCoverPage(
  doc: jsPDF,
  data: CompanyReportData,
  logoDataUrl: string | null,
  pageWidth: number,
  pageHeight: number,
) {
  if (logoDataUrl) {
    const coverLogoWidth = 192;
    doc.addImage(
      logoDataUrl,
      'PNG',
      (pageWidth - coverLogoWidth) / 2,
      172,
      coverLogoWidth,
      coverLogoWidth * LOGO_ASPECT,
      undefined,
      'FAST',
    );
  }

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1.1);
  doc.line(pageWidth / 2 - 70, 260, pageWidth / 2 + 70, 260);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(30, 41, 59);
  const titleLines = doc.splitTextToSize(data.template.reportTitle, 430) as string[];
  doc.text(titleLines, pageWidth / 2, 310, { align: 'center', lineHeightFactor: 1.08 });

  const companyY = 310 + titleLines.length * 26 + 6;
  doc.setFontSize(15.5);
  doc.setTextColor(...BRAND);
  const companyLines = doc.splitTextToSize(data.company.toUpperCase(), 455) as string[];
  doc.text(companyLines, pageWidth / 2, companyY, { align: 'center', lineHeightFactor: 1.08 });

  const dateY = companyY + companyLines.length * 18 + 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Report date: ${data.generatedOn}`, pageWidth / 2, dateY, { align: 'center' });
  const periodLines = doc.splitTextToSize(`Reporting period: ${data.reportingPeriod}`, 410) as string[];
  doc.text(periodLines, pageWidth / 2, dateY + 15, { align: 'center', lineHeightFactor: 1.1 });

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.7);
  doc.line(pageWidth / 2 - 90, dateY + 44, pageWidth / 2 + 90, dateY + 44);

  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Microgenesis | Supplier Management', pageWidth / 2, pageHeight - 54, { align: 'center' });
}

function getRatingRangeLabel(data: CompanyReportData, index: number): string {
  return formatAnalyticsRatingRange(data.surveyType, index);
}

function drawRatingScale(doc: jsPDF, data: CompanyReportData, x: number, y: number, width: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Rating Scale', x, y);

  const columnWidth = width / Math.max(data.ratingScale.length, 1);
  data.ratingScale.forEach((band, index) => {
    const cellX = x + index * columnWidth;
    const [r, g, b] = hexToRgb(band.hex);
    doc.setFillColor(r, g, b);
    doc.roundedRect(cellX, y + 10, 8, 8, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    doc.text(band.label, cellX + 13, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(100, 116, 139);
    doc.text(getRatingRangeLabel(data, index), cellX + 13, y + 28);
  });
}

function drawCategoryChart(
  doc: jsPDF,
  data: CompanyReportData,
  marginLeft: number,
  pageWidth: number,
  startY: number,
) {
  const plotX = marginLeft + 18;
  const plotY = startY + 26;
  const plotWidth = 330;
  const plotHeight = 224;
  const baselineY = plotY + plotHeight;
  const legendX = plotX + plotWidth + 34;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Category Performance', marginLeft, startY);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  for (let tick = 0; tick <= 100; tick += 20) {
    const tickY = baselineY - (tick / 100) * plotHeight;
    doc.line(plotX, tickY, plotX + plotWidth, tickY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(String(tick), plotX - 7, tickY + 2, { align: 'right' });
  }

  const slotWidth = plotWidth / Math.max(data.categoryRows.length, 1);
  const barWidth = Math.min(38, slotWidth * 0.56);
  data.categoryRows.forEach((category, index) => {
    const barHeight = (Math.min(100, Math.max(0, category.percentage)) / 100) * plotHeight;
    const barX = plotX + index * slotWidth + (slotWidth - barWidth) / 2;
    const barY = baselineY - barHeight;
    const [r, g, b] = hexToRgb(category.color);
    doc.setFillColor(r, g, b);
    if (barHeight > 0) doc.rect(barX, barY, barWidth, barHeight, 'F');

    const labelY = Math.max(plotY + 10, barY - 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(r, g, b);
    doc.text(
      `${formatReportNumber(category.achieved)} / ${formatReportNumber(category.maximum)}`,
      barX + barWidth / 2,
      labelY,
      { align: 'center' },
    );
    doc.text(formatReportPercentage(category.percentage), barX + barWidth / 2, labelY + 9, { align: 'center' });
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Categories', legendX, plotY + 2);
  data.categoryRows.forEach((category, index) => {
    const itemY = plotY + 20 + index * 39;
    const [r, g, b] = hexToRgb(category.color);
    doc.setFillColor(r, g, b);
    doc.rect(legendX, itemY - 7, 9, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(30, 41, 59);
    const nameLines = doc.splitTextToSize(category.category, pageWidth - marginLeft - legendX - 14).slice(0, 2) as string[];
    doc.text(nameLines, legendX + 14, itemY, { lineHeightFactor: 1.05 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(100, 116, 139);
    doc.text(formatCategoryMetricLabel(category), legendX + 14, itemY + nameLines.length * 8 + 2);
  });

  if (!data.composite) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(plotX + 69, plotY + 92, 192, 34, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No responses available', plotX + plotWidth / 2, plotY + 112, { align: 'center' });
  }
}

function drawExecutiveSummaryPage(
  doc: jsPDF,
  data: CompanyReportData,
  logoDataUrl: string | null,
  marginLeft: number,
  pageWidth: number,
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Executive Summary', marginLeft, 100);

  const contentWidth = pageWidth - marginLeft * 2;
  const stripY = 114;
  const cellWidth = contentWidth / 3;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.7);
  doc.roundedRect(marginLeft, stripY, contentWidth, 54, 5, 5, 'S');
  const metrics = [
    { label: 'LEADERBOARD SCORE', value: getReportAverageText(data), color: data.volumeWeightedBand?.hex ?? '#94A3B8' },
    { label: 'RATING', value: data.volumeWeightedBand?.label ?? 'No Score Yet', color: data.volumeWeightedBand?.hex ?? '#94A3B8' },
    { label: 'RESPONDENTS', value: String(data.composite?.evaluationCount ?? 0), color: '#1E293B' },
  ];
  metrics.forEach((metric, index) => {
    const x = marginLeft + index * cellWidth + 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text(metric.label, x, stripY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(index === 1 ? 12 : 14);
    doc.setTextColor(...hexToRgb(metric.color));
    const valueLines = doc.splitTextToSize(metric.value, cellWidth - 20).slice(0, 2) as string[];
    doc.text(valueLines, x, stripY + 38, { lineHeightFactor: 1.0 });
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(100, 116, 139);
  const periodLines = doc.splitTextToSize(`Reporting period: ${data.reportingPeriod}`, contentWidth) as string[];
  doc.text(periodLines, marginLeft, 184, { lineHeightFactor: 1.1 });

  drawRatingScale(doc, data, marginLeft, 211, contentWidth);
  drawCategoryChart(doc, data, marginLeft, pageWidth, 272);
}

async function addSupplementalChartPage(
  doc: jsPDF,
  data: CompanyReportData,
  logoDataUrl: string | null,
  marginLeft: number,
  pageWidth: number,
  pageHeight: number,
  title: string,
  dataUrl: string | null | undefined,
) {
  if (!dataUrl) return;
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(30, 41, 59);
  doc.text(title, marginLeft, 100);

  const dimensions = await dataUrlDimensions(dataUrl);
  const maxWidth = pageWidth - marginLeft * 2;
  const maxHeight = pageHeight - 175;
  const ratio = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
  const width = dimensions.width * ratio;
  const height = dimensions.height * ratio;
  doc.addImage(dataUrl, 'PNG', marginLeft + (maxWidth - width) / 2, 122, width, height);
}

function addQuestionTablePages(
  doc: jsPDF,
  data: CompanyReportData,
  logoDataUrl: string | null,
  marginLeft: number,
  pageWidth: number,
) {
  doc.addPage();
  const body = data.questionRows.length
    ? data.questionRows.map((row) => [row.question, formatReportPercentage(row.average), String(row.responses)])
    : [[{ content: 'No responses available', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'italic' as const } }]];

  autoTable(doc, {
    startY: 116,
    head: [['Question', 'Average Rating', 'Responses']],
    body,
    margin: { left: marginLeft, right: marginLeft, top: 116, bottom: 56 },
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      cellPadding: 6,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 88, halign: 'center' },
      2: { cellWidth: 70, halign: 'center' },
    },
    headStyles: { fillColor: BRAND as unknown as [number, number, number], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    showHead: 'everyPage',
    willDrawPage: (hookData) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14.5);
      doc.setTextColor(30, 41, 59);
      doc.text(
        hookData.pageNumber === 1 ? 'Per-Question Average Rating' : 'Per-Question Average Rating (continued)',
        marginLeft,
        100,
      );
    },
  });
}

function addCommentTablePages(
  doc: jsPDF,
  data: CompanyReportData,
  logoDataUrl: string | null,
  marginLeft: number,
  pageWidth: number,
) {
  doc.addPage();
  const body = data.selectedCommentsList.length
    ? data.selectedCommentsList.map((comment, index) => [String(index + 1), comment.questionCategory, comment.comment])
    : [[{ content: 'No comments submitted', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'italic' as const } }]];

  autoTable(doc, {
    startY: 116,
    head: [['#', 'Section', 'Feedback / Comments']],
    body,
    margin: { left: marginLeft, right: marginLeft, top: 116, bottom: 56 },
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      cellPadding: 7,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
    },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 90 },
      2: { cellWidth: 'auto', fontStyle: 'italic' },
    },
    headStyles: { fillColor: BRAND as unknown as [number, number, number], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    showHead: 'everyPage',
    willDrawPage: (hookData) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14.5);
      doc.setTextColor(30, 41, 59);
      doc.text(hookData.pageNumber === 1 ? 'Stakeholder Comments' : 'Stakeholder Comments (continued)', marginLeft, 100);
    },
  });
}

export async function exportCompanyReportAsPDF(
  data: CompanyReportData,
  _customFilename?: string,
  previewOnly?: boolean,
  asDataUri?: boolean,
  recipe?: ReportRecipe
): Promise<string | undefined> {
  const doc = new jsPDF({ unit: 'pt', format: paperSizePoints(recipe?.parameters.paperSize) });
  const marginLeft = 42.5;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const logoDataUrl = data.logoDataUrl || await fetchLogoDataUrl();
  const branding = await loadPdfBranding();

  drawCoverPage(doc, data, logoDataUrl, pageWidth, pageHeight);

  doc.addPage();
  drawExecutiveSummaryPage(doc, data, logoDataUrl, marginLeft, pageWidth);

  if (data.graphs?.radar) {
    await addSupplementalChartPage(
      doc,
      data,
      logoDataUrl,
      marginLeft,
      pageWidth,
      pageHeight,
      'Section Scores - Radar Graph',
      data.chartImages?.radar,
    );
  }
  if (data.graphs?.trend) {
    await addSupplementalChartPage(
      doc,
      data,
      logoDataUrl,
      marginLeft,
      pageWidth,
      pageHeight,
      'Score Trend',
      data.chartImages?.trend,
    );
  }

  if (data.graphs?.perQuestion !== false) {
    addQuestionTablePages(doc, data, logoDataUrl, marginLeft, pageWidth);
  }

  if (data.includeComments) {
    addCommentTablePages(doc, data, logoDataUrl, marginLeft, pageWidth);
  }

  applyPdfBranding(doc, branding, { title: data.template.reportTitle, subject: data.company, margin: marginLeft });
  if (asDataUri) {
    // Used for email attachments (see graphMailService.ts) - no object URL/
    // blob lifecycle to manage, just a base64 string ready to embed.
    return doc.output('datauristring') as unknown as string;
  }
  if (previewOnly) {
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  }
  await saveReportDownload(doc.output('blob'), `Company Report - ${data.company}`, 'pdf', recipe ?? { kind: 'company', parameters: { category: data.surveyType, selectedCompany: data.company, ...(data.graphs ? { graphs: data.graphs } : {}), includeComments: data.includeComments } });
}

/* ------------------------------------------------------------------ */
/* DOCX export                                                         */
/* ------------------------------------------------------------------ */

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function imageParagraph(dataUrl: string | null | undefined, title: string, maxWidth: number): Promise<Paragraph[]> {
  if (!dataUrl) return [];
  const { width, height } = await dataUrlDimensions(dataUrl);
  const drawWidth = Math.min(maxWidth, width);
  const drawHeight = (height / width) * drawWidth;

  return [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 19, color: INK_HEX })],
      spacing: { before: 240, after: 90 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: 'png',
          data: dataUrlToUint8Array(dataUrl),
          transformation: { width: drawWidth, height: drawHeight },
        }),
      ],
    }),
  ];
}

export async function exportCompanyReportAsDocx(data: CompanyReportData, recipe?: ReportRecipe) {
  const logoDataUrl = await fetchLogoDataUrl();
  const logoBytes = logoDataUrl ? dataUrlToUint8Array(logoDataUrl) : null;

  /* ---------------- Cover page (its own section, no header/footer) ---------------- */
  const coverChildren: Paragraph[] = [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    ...(logoBytes
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: 'png',
                data: logoBytes,
                transformation: { width: 230, height: 230 * LOGO_ASPECT },
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { color: BRAND_HEX, space: 8, style: BorderStyle.SINGLE, size: 10 } },
      spacing: { before: 500, after: 500 },
      children: [new TextRun({ text: ' ', size: 2 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: data.template.reportTitle, bold: true, size: 40, color: INK_HEX })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: data.company, bold: true, size: 30, color: BRAND_HEX })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
      children: [
        new TextRun({ text: `${data.reportingPeriod} | Report date ${data.generatedOn}`, size: 20, color: MUTED_HEX }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'Prepared for internal review by the', size: 16, color: MUTED_HEX })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'Microgenesis | Supplier Management', bold: true, size: 17, color: INK_HEX })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'This document is confidential and intended solely for the named recipient.',
          italics: true,
          size: 15,
          color: MUTED_HEX,
        }),
      ],
    }),
  ];

  /* ---------------- Body content ---------------- */
  const bodyBlocks: (Paragraph | Table)[] = [];

  const scoreSummaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: RULE_HEX },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE_HEX },
      left: { style: BorderStyle.SINGLE, size: 8, color: RULE_HEX },
      right: { style: BorderStyle.SINGLE, size: 8, color: RULE_HEX },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
      insideHorizontal: { style: BorderStyle.NIL },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'F8FAFC' },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 220, bottom: 220, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: 'LEADERBOARD SCORE', bold: true, size: 18, color: MUTED_HEX })],
              }),
              new Paragraph({
                children: [new TextRun({ text: getReportAverageText(data), bold: true, size: 56, color: BRAND_HEX })],
              }),
            ],
          }),
          new TableCell({
            shading: { fill: 'F8FAFC' },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 220, bottom: 220, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: 'RATING BAND', bold: true, size: 18, color: MUTED_HEX })],
              }),
              new Paragraph({
                children: [new TextRun({ text: data.volumeWeightedBand?.label ?? 'No Score Yet', bold: true, size: 36, color: INK_HEX })],
              }),
            ],
          }),
          new TableCell({
            shading: { fill: 'F8FAFC' },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 220, bottom: 220, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: 'RESPONSES', bold: true, size: 18, color: MUTED_HEX })],
              }),
              new Paragraph({
                children: [new TextRun({ text: String(data.composite?.evaluationCount ?? 0), bold: true, size: 36, color: INK_HEX })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  bodyBlocks.push(
    new Paragraph({
      children: [new TextRun({ text: 'Executive Summary', bold: true, size: 26, color: INK_HEX })],
      spacing: { after: 160 },
    }),
    scoreSummaryTable,
    new Paragraph({ spacing: { before: 180, after: 180 } })
  );

  // Bar/radar: compact (~45% of the ~624px content width) so both fit cleanly on one page.
  // Trend: wider (~80%) with a short, wide aspect so the x-axis has room, mirroring the dashboard view.
  if (data.graphs?.bar) bodyBlocks.push(...(await imageParagraph(data.chartImages?.bar, 'Section Scores \u2014 Bar Graph', 500)));
  if (data.graphs?.radar) bodyBlocks.push(...(await imageParagraph(data.chartImages?.radar, 'Section Scores \u2014 Radar Graph', 500)));
  if (data.graphs?.trend) bodyBlocks.push(...(await imageParagraph(data.chartImages?.trend, 'Score Trend', 500)));

  if (data.graphs?.perQuestion) {
    bodyBlocks.push(
      new Paragraph({
        children: [new TextRun({ text: 'Per-Question Average Rating', bold: true, size: 24, color: INK_HEX })],
        spacing: { before: 280, after: 110 },
      }),
    );
    const headerRow = new TableRow({
      tableHeader: true,
      children: ['Question', 'Average Rating', 'Responses'].map(
        (label) =>
          new TableCell({
            shading: { fill: BRAND_HEX },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: 'FFFFFF', size: 18 })] })],
          }),
      ),
    });
    const rows = data.questionRows.map(
      (row, idx) =>
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
              margins: { top: 50, bottom: 50, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: row.question, size: 18 })] })],
            }),
            new TableCell({
              shading: { fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
              margins: { top: 50, bottom: 50, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: formatReportNumber(row.average), size: 18 })] })],
            }),
            new TableCell({
              shading: { fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
              margins: { top: 50, bottom: 50, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: String(row.responses), size: 18 })] })],
            }),
          ],
        }),
    );
    bodyBlocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...rows],
      }),
    );
  }

  if (data.includeComments) {
    bodyBlocks.push(
      new Paragraph({
        children: [new TextRun({ text: 'Stakeholder Comments', bold: true, size: 24, color: INK_HEX })],
        spacing: { before: 280, after: 110 },
      })
    );

    const comments = data.selectedCommentsList;
    if (comments.length === 0) {
      bodyBlocks.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No stakeholder comments selected for display.',
              italics: true,
              size: 18,
              color: MUTED_HEX,
            }),
          ],
        })
      );
    } else {
      const commentsHeaderRow = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            shading: { fill: BRAND_HEX },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            width: { size: 8, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true, color: 'FFFFFF', size: 18 })] })],
          }),
          new TableCell({
            shading: { fill: BRAND_HEX },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Section', bold: true, color: 'FFFFFF', size: 18 })] })],
          }),
          new TableCell({
            shading: { fill: BRAND_HEX },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Feedback / Comments', bold: true, color: 'FFFFFF', size: 18 })] })],
          }),
        ]
      });

      const commentRows = comments.map(
        (c, idx) =>
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
                margins: { top: 50, bottom: 50, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 18 })] })],
              }),
              new TableCell({
                shading: { fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
                margins: { top: 50, bottom: 50, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: c.questionCategory, size: 18 })] })],
              }),
              new TableCell({
                shading: { fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
                margins: { top: 50, bottom: 50, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `"${c.comment}"`,
                        italics: true,
                        size: 18,
                        color: '1E293B'
                      })
                    ]
                  })
                ],
              })
            ]
          })
      );

      bodyBlocks.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [commentsHeaderRow, ...commentRows],
        })
      );
    }
  }

  /* ---------------- Running header / footer for content pages ---------------- */
  const header = new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9600 }],
        border: { bottom: { color: RULE_HEX, space: 6, style: BorderStyle.SINGLE, size: 6 } },
        children: [
          ...(logoBytes
            ? [new ImageRun({ type: 'png', data: logoBytes, transformation: { width: 96, height: 96 * LOGO_ASPECT } })]
            : []),
          new TextRun({ text: '\t' }),
          new TextRun({ text: `${data.company}\n`, bold: true, size: 15, color: INK_HEX }),
          new TextRun({ text: data.template.reportTitle, size: 13, color: MUTED_HEX }),
        ],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { color: RULE_HEX, space: 6, style: BorderStyle.SINGLE, size: 6 } },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Microgenesis | Supplier Management | Page ', size: 14, color: '94A3B8' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '94A3B8' }),
          new TextRun({ text: ' of ', size: 14, color: '94A3B8' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '94A3B8' }),
        ],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
          },
        },
      },
    },
    sections: [
      { properties: { page: { size: paperSizeTwips(recipe?.parameters.paperSize) } }, children: coverChildren },
      { properties: { page: { size: paperSizeTwips(recipe?.parameters.paperSize) } }, headers: { default: header }, footers: { default: footer }, children: bodyBlocks },
    ],
  });

  const blob = await Packer.toBlob(doc);
  await saveReportDownload(blob, `Company Report - ${data.company}`, 'docx', recipe ?? { kind: 'company', parameters: { category: data.surveyType, selectedCompany: data.company, ...(data.graphs ? { graphs: data.graphs } : {}), includeComments: data.includeComments } });
}
