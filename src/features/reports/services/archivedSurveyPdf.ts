import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import type { SurveyType } from '../../../types/survey';
import { formatNumber } from '../../analytics/domain/analytics';
import { analyticsBands, formatAnalyticsRatingRange, getAnalyticsBand, getAnalyticsScore } from '../../analytics/domain/rankings';
import { ARCHIVED_LEADERBOARD_LIMIT, ARCHIVED_SURVEY_STYLE as S, archivedRatingColor, archivedScoreFill, buildArchivedReportLayout, buildArchivedSurveyDetails } from '../domain/archivedReportLayout';
import type { ArchiveAnalyticsData } from '../domain/archiveAnalyticsVisuals';
import { paperSizePoints, type PaperSize } from '../domain/paperSize';
import { applyPdfBranding, loadPdfBranding } from './pdfBranding';
import type { ExportTable } from './exporters';

/** Measured Letter reference: 20/15/13/8 pt type, 0.6 inch letterhead and ruled white tables. */
export async function createArchivedSurveyPdf(title: string, itemLabel: string, category: SurveyType, tables: ExportTable[], analytics: ArchiveAnalyticsData[], paperSize: PaperSize): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: paperSizePoints(paperSize) });
  const branding = await loadPdfBranding();
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = pageWidth - S.tableMargin * 2;
  const textWidth = pageWidth - S.margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - 52;
  const layout = buildArchivedReportLayout(category, tables, analytics);
  const details = buildArchivedSurveyDetails(itemLabel, tables);
  const companies = (analytics.find(item => item.category === category)?.summary.companies ?? []).slice(0, ARCHIVED_LEADERBOARD_LIMIT);
  const generated = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date()).replace('am', 'AM').replace('pm', 'PM');
  let y: number = S.top;
  const nextPage = () => { doc.addPage(); y = S.top; };
  const label = (value: string, x: number, baseline: number, size = 8, bold = false, color = S.ink, align: 'left' | 'center' | 'right' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
    doc.text(value, x, baseline, { align });
  };
  const paragraph = (value: string, size = 8, bold = false, color = S.ink, lineHeight = 10) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, textWidth) as string[];
    for (const line of lines) { if (y + lineHeight > bottom) nextPage(); label(line, S.margin, y, size, bold, color); y += lineHeight; }
  };
  const section = (value: string) => { if (y + 45 > bottom) nextPage(); label(value, S.margin, y, 13, true, '#111111'); y += 3; };
  const table = (value: ExportTable, options: Partial<UserOptions> = {}) => {
    if (y + 36 > bottom) nextPage();
    autoTable(doc, {
      startY: y, head: [value.columns], body: value.rows.map(row => row.map(String)),
      margin: { left: S.tableMargin, right: S.tableMargin, top: S.top - 8, bottom: 52 },
      tableWidth: width, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8, textColor: S.ink, cellPadding: { top: 5.2, bottom: 3.2, left: 6, right: 6 }, minCellHeight: 17.6, overflow: 'linebreak' },
      headStyles: { fillColor: S.blue, textColor: '#ffffff', fontStyle: 'bold' },
      rowPageBreak: 'avoid',
      didDrawCell: cell => {
        if (cell.section === 'body') { doc.setDrawColor(S.rule); doc.setLineWidth(.4); doc.line(cell.cell.x, cell.cell.y + cell.cell.height, cell.cell.x + cell.cell.width, cell.cell.y + cell.cell.height); }
      }, ...options,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };
  label(title, S.margin, y, 20, true, S.blue); y += 18;
  paragraph(`Generated ${generated} (PHT) | Confidential: for internal distribution only`, 8, false, S.muted);
  if (companies.length) {
    y += 15; label(`${category} Leaderboard`, S.margin, y, 15, true, S.blue); y += 17;
    paragraph(`Top ${ARCHIVED_LEADERBOARD_LIMIT}, ranked by score. Forms = number of submissions.`, 8, false, S.muted);
    y += 9;
    const bands = analyticsBands[category];
    bands.forEach((band, index) => label(`${band.label} ${formatAnalyticsRatingRange(category, index)}`, S.margin + [18, 126, 234, 370.8][index] * textWidth / 513.6, y, 8, false, archivedRatingColor(category, band.min * (category === 'Subcontractor' ? 50 : 1))));
    y += 25.6;
    const halfWidth = (pageWidth - 100.8) / 2;
    const split = Math.ceil(companies.length / 2);
    const positions = [44.4, 44.4 + halfWidth + 10.8];
    const rankWidth = 26.4, nameOffset = 31.8;
    const scoreRight = halfWidth - 40.8, formsCenter = halfWidth - 17.4;
    const headings = () => positions.forEach(x => {
      label('RANK', x + 3.48, y - 5, 7, false, S.muted);
      label('COMPANY', x + nameOffset, y - 5, 7, false, S.muted);
      label('SCORE', x + scoreRight - 18.06, y - 5, 7, false, S.muted, 'center');
      label('FORMS', x + formsCenter, y - 5, 7, false, S.muted, 'center');
      doc.setDrawColor(S.rule); doc.setLineWidth(.4); doc.line(x, y, x + halfWidth, y);
    });
    headings();
    for (let index = 0; index < split; index++) {
      const entries = [companies[index], companies[index + split]];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      const names = entries.map(company => company ? doc.splitTextToSize(company.name, halfWidth * 140.4 / 255.6) as string[] : []);
      const height = 38 + Math.max(0, ...names.map(lines => lines.length - 1)) * 10;
      if (y + height > bottom) { nextPage(); y += 10; headings(); }
      entries.forEach((company, column) => {
        const x = positions[column];
        doc.setDrawColor(S.rule); doc.setLineWidth(.4); doc.line(x + rankWidth, y + height, x + halfWidth, y + height);
        if (!company) return;
        doc.setFillColor(S.rank); doc.rect(x, y, rankWidth, height, 'F');
        const rank = index + column * split + 1;
        const band = getAnalyticsBand(category, company.rankScore);
        const ratingColor = archivedRatingColor(category, company.rankScore);
        const nameY = y + (height - (names[column].length + 1) * 10) / 2 + 7.4;
        label(String(rank), x + rankWidth / 2, y + height / 2 + 3, 9, true, '#111111', 'center');
        names[column].forEach((line, lineIndex) => label(line, x + nameOffset, nameY + lineIndex * 10, 8, true));
        label(`${category} · ${band.label}`, x + nameOffset, nameY + names[column].length * 10, 7, false, ratingColor);
        label(formatNumber(getAnalyticsScore(category, company.rankScore)), x + scoreRight, y + height / 2 + 4.4, 10, true, ratingColor, 'right');
        label(String(company.count), x + formsCenter, y + height / 2 + 2.6, 8, false, S.ink, 'center');
      });
      y += height;
    }
    nextPage();
  }
  label('Report summary', S.margin, y, 20, true, S.blue); y += 18;
  paragraph(`${itemLabel} | Category: ${category} | Generated ${generated} (PHT)`, 8, false, S.muted);
  y += 2;
  const metricWidth = (textWidth - 2.4) / 4;
  const metricX = S.margin + 1.2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const metricLabels = layout.metrics.map(metric => doc.splitTextToSize(metric.label, metricWidth - 6) as string[]);
  const metricHeight = 52.8 + Math.max(0, ...metricLabels.map(lines => lines.length - 1)) * 8;
  // Numbers above labels, with a ruled divider, as in the supplied reference.
  layout.metrics.forEach((metric, index) => {
    const x = metricX + index * metricWidth;
    doc.setDrawColor(S.rule); doc.setLineWidth(.5); doc.rect(x, y, metricWidth, metricHeight); doc.line(x, y + 33.6, x + metricWidth, y + 33.6);
    const valueSize = metric.value === 'No Score Yet' ? 11 : 18;
    label(metric.value, x + metricWidth / 2, y + 26, valueSize, true, S.blue, 'center');
    metricLabels[index].forEach((line, lineIndex) => label(line, x + metricWidth / 2, y + 43.6 + lineIndex * 8, 8, false, S.muted, 'center'));
  });
  y += metricHeight + 32.4; section('Report details');
  table(details, { columnStyles: { 0: { cellWidth: 136.8 } } });
  if (layout.findings.length) {
    y += 31; section('Key findings'); y += 9;
    for (const finding of layout.findings) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const lines = doc.splitTextToSize(finding, textWidth - 7) as string[];
      if (y + lines.length * 12 + 3 > bottom) nextPage();
      label('•', S.margin, y, 9);
      lines.forEach((line, index) => {
        const colon = index === 0 ? line.indexOf(':') : -1;
        if (colon >= 0) { const lead = line.slice(0, colon + 1); label(lead, S.margin + 6, y, 9, true); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); label(line.slice(colon + 1), S.margin + 6 + doc.getTextWidth(lead), y, 9); }
        else label(line, S.margin + 6, y, 9);
        y += 12;
      });
      y += 3;
    }
    y += 3; paragraph('Score colors: green 90+, yellow 80-89, orange 70-79, red below 70. Rating labels follow the current category rubric.', 8, false, S.muted);
  }
  if (layout.questionTable.rows.length || layout.categoryTable.rows.length) {
    nextPage();
    if (layout.questionTable.rows.length) {
      label('Question results', S.margin, y, 20, true, S.blue); y += 18;
      paragraph(`All ${layout.questionTable.rows.length} scored questions in one list, highest to lowest. Averages use numeric ratings.`, 8, false, S.muted);
      y -= 2;
      table({ title: 'Question results', columns: ['#', 'Question', 'Score (%)'], rows: layout.questionTable.rows.map(row => row.slice(0, 3)) }, {
        styles: { font: 'helvetica', fontSize: 8, textColor: S.ink, minCellHeight: 18, cellPadding: { top: 5.2, bottom: 3.6, left: 6, right: 6 } },
        headStyles: { fillColor: S.blue, textColor: '#ffffff', fontStyle: 'bold', minCellHeight: 17.6, cellPadding: { top: 5.2, bottom: 3.2, left: 6, right: 6 } },
        columnStyles: { 0: { cellWidth: 25.2 }, 1: { cellWidth: width - 93.6 }, 2: { cellWidth: 68.4, halign: 'center' } },
        didParseCell: cell => { if (cell.section === 'body' && cell.column.index === 2) cell.cell.styles.fillColor = archivedScoreFill(Number(cell.cell.raw)); },
      });
      y += 14; paragraph('Question scores use the current rubric. Blank and N/A answers do not contribute to score averages.', 8, false, S.muted);
      y += 25;
    }
    if (layout.categoryTable.rows.length) {
      section('Category averages');
      const categoryWidth = Math.min(266.4, width);
      table(layout.categoryTable, { tableWidth: categoryWidth, margin: { left: (pageWidth - categoryWidth) / 2, right: (pageWidth - categoryWidth) / 2, top: S.top - 8, bottom: 52 },
        columnStyles: { 0: { cellWidth: categoryWidth * 158.4 / 266.4 }, 1: { halign: 'center' } },
        didParseCell: cell => { if (cell.section === 'body' && cell.column.index === 1) cell.cell.styles.fillColor = archivedScoreFill(Number(cell.cell.raw)); },
      });
    }
  }
  const remaining = tables.filter(value => value !== tables[0] && !['Survey details', 'Company profile', 'Company leaderboard', 'Company performance', 'Category performance', 'Question results', 'Category averages'].includes(value.title) && value.rows.length);
  for (const value of remaining) { if (value.title === 'Respondent comments') nextPage(); else y += 25; section(value.title); table(value); }
  applyPdfBranding(doc, branding, { title, margin: S.headerMargin, layout: 'archive-reference' });
  return doc.output('blob');
}
