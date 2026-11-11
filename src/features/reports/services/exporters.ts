import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { saveReportDownload } from './exportHistory';
import type { ReportRecipe } from '../domain/reportHistory';
import { paperSizePoints, paperSizeTwips, type PaperSize } from '../domain/paperSize';
import { applyPdfBranding, loadPdfBranding, PDF_CONTENT_TOP, PDF_CONTENT_BOTTOM } from './pdfBranding';
import { addWorkbookVisuals, type ExportVisual } from './workbookVisuals';

/** Editable Word tables matching the compact legacy PDF typography and spacing. */
export async function exportTablesAsWord(reportTitle: string, tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe, paperSize: PaperSize = recipe?.parameters.paperSize ?? 'a4') {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } = await import('docx');
  const doc = new Document({ styles: { default: {
    document: { run: { font: 'Arial', size: 18 } },
    title: { run: { color: '0063A9', size: 44 } },
    heading1: { run: { color: '141414', bold: true, size: 28 } },
  } }, sections: [{ properties: { page: { size: paperSizeTwips(paperSize), margin: { top: 800, right: 800, bottom: 800, left: 800 } } }, children: [
    new Paragraph({ text: reportTitle, heading: HeadingLevel.TITLE, spacing: { after: 160 } }),
    new Paragraph({ children: [new TextRun({ text: `Generated on: ${new Date().toLocaleString()}`, color: '646464', size: 20 })] }),
    new Paragraph({ children: [new TextRun({ text: 'Confidential: For internal distribution only', color: '646464', size: 20 })], spacing: { after: 360 } }),
    ...tables.flatMap(table => [
      new Paragraph({ text: table.title, heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, keepNext: true }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [table.columns, ...table.rows].map((row, index) =>
        new TableRow({ tableHeader: index === 0, children: row.map(value => new TableCell({ margins: { top: 120, bottom: 120, left: 120, right: 120 }, shading: { fill: index === 0 ? '0063A9' : index % 2 === 0 ? 'F8FAFC' : 'FFFFFF' }, children: [
          new Paragraph({ children: [new TextRun({ text: String(value), bold: index === 0, color: index === 0 ? 'FFFFFF' : '1E293B' })] }),
        ] })) })) }),
    ]),
  ] }] });
  await saveReportDownload(await Packer.toBlob(doc), reportTitle || filenameBase, 'docx', recipe);
}

/**
 * Shared client-side export helpers. Everything here runs entirely in the
 * browser - there's no export API on the server, so these functions build
 * the file in memory and hand the browser a Blob/data URI to download.
 * Keeping the "shape" (title + column headers + row arrays) generic means
 * the same functions can back every export button in the app instead
 * of each page hand-rolling its own CSV/XLSX/PDF logic.
 */

export interface ExportTable {
  /** Section heading shown above this table (CSV: a comment line, Excel: sheet name, PDF: a heading). */
  title: string;
  columns: string[];
  rows: (string | number)[][];
}



/** One or more tables in a single CSV file, each preceded by a title line and a blank line separator. */
export function exportTablesAsCSV(tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe) {
  const chunks = tables.map((table) => {
    const csvBody = Papa.unparse({ fields: table.columns, data: table.rows }, { escapeFormulae: true });
    return `${table.title}\n${csvBody}`;
  });
  const blob = new Blob([chunks.join('\n\n')], { type: 'text/csv;charset=utf-8' });
  return saveReportDownload(blob, tables[0]?.title || filenameBase, 'csv', recipe);
}

/** One workbook, one sheet per table (sheet name = table title, truncated to Excel's 31-char limit). */
export function exportTablesAsExcel(tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe, visuals: ExportVisual[] = []) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const leadingVisuals = visuals.filter(visual => visual.placement === 'before-tables');
  const trailingVisuals = visuals.filter(visual => !visual.placement);
  const orderedVisuals = [...leadingVisuals, ...trailingVisuals];
  const visualSheets: number[] = [];
  const rankingSheets = new Map<string, number>();
  const appendVisual = (visual: ExportVisual, index: number) => {
    const existingSheet = visual.placement === 'before-tables' ? rankingSheets.get(visual.title) : undefined;
    if (existingSheet) { visualSheets.push(existingSheet); return; }
    const base = visual.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Analytics ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) name = `${base.slice(0, 27)} ${suffix++}`;
    usedNames.add(name);
    // A single heading row keeps image sheets out of archived-response re-imports.
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[visual.title]]), name);
    visualSheets.push(workbook.SheetNames.length);
    if (visual.placement === 'before-tables') rankingSheets.set(visual.title, workbook.SheetNames.length);
  };
  leadingVisuals.forEach(appendVisual);

  tables.forEach((table) => {
    const sheetData = [table.columns, ...table.rows];
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);

    let sheetName = table.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    let suffix = 2;
    while (usedNames.has(sheetName)) {
      sheetName = `${table.title.slice(0, 28)} ${suffix}`;
      suffix += 1;
    }
    usedNames.add(sheetName);

    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  trailingVisuals.forEach(appendVisual);
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const output = visuals.length ? addWorkbookVisuals(bytes, orderedVisuals, visualSheets) : bytes;
  return saveReportDownload(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), tables[0]?.title || filenameBase, 'excel', recipe);
}

/** One PDF, one heading + table per section, stacked vertically (auto page-breaks via autoTable). */
export async function exportTablesAsPDF(reportTitle: string, tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe, introduction?: string, paperSize: PaperSize = recipe?.parameters.paperSize ?? 'a4', visuals: ExportVisual[] = []) {
  const doc = new jsPDF({ unit: 'pt', format: paperSizePoints(paperSize) });
  const branding = await loadPdfBranding();
  const marginLeft = 40;
  const contentWidth = doc.internal.pageSize.getWidth() - marginLeft * 2;
  let cursorY = PDF_CONTENT_TOP;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(0, 99, 169);
  const titleLines = doc.splitTextToSize(reportTitle, contentWidth) as string[];
  doc.text(titleLines, marginLeft, cursorY);
  cursorY += titleLines.length * 26;
  
  // Date and Metadata
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, marginLeft, cursorY);
  cursorY += 12;
  doc.text(`Confidential: For internal distribution only`, marginLeft, cursorY);
  cursorY += 30;

  const drawVisual = (visual: ExportVisual, startY: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 99, 169);
    const titleHeight = visual.continuation ? 0 : 18;
    if (!visual.continuation) doc.text(visual.title, marginLeft, startY);
    const availableHeight = doc.internal.pageSize.height - startY - PDF_CONTENT_BOTTOM - titleHeight - 8;
    const scale = Math.min(contentWidth / visual.width, availableHeight / visual.height);
    const width = visual.width * scale, height = visual.height * scale;
    doc.addImage(visual.dataUrl, 'PNG', marginLeft + (contentWidth - width) / 2, startY + titleHeight, width, height, undefined, 'FAST');
    return startY + titleHeight + height + (visual.placement === 'before-tables' ? 0 : 24);
  };
  const leadingVisuals = visuals.filter(visual => visual.placement === 'before-tables');
  for (const visual of leadingVisuals) {
    if (cursorY + visual.height * contentWidth / visual.width + 42 > doc.internal.pageSize.height - PDF_CONTENT_BOTTOM) {
      doc.addPage(); cursorY = PDF_CONTENT_TOP;
    }
    cursorY = drawVisual(visual, cursorY);
  }
  if (leadingVisuals.length) { doc.addPage(); cursorY = PDF_CONTENT_TOP; }

  // Introduction Paragraph
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(40);
  const introText = doc.splitTextToSize(
    introduction ?? (`This report provides a comprehensive summary of survey analytics and stakeholder feedback. ` +
    `The data compiled below highlights key performance indicators, comparative analysis across survey categories, ` +
    `and detailed question-level responses. Review the insights carefully to inform continuous improvement initiatives ` +
    `and strategic decision-making.`),
    contentWidth
  );
  doc.text(introText, marginLeft, cursorY);
  cursorY += (introText.length * 15) + 20;

  tables.forEach((table) => {
    if (cursorY > doc.internal.pageSize.height - 142) {
      doc.addPage();
      cursorY = PDF_CONTENT_TOP;
    }
    
    // Table Heading
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text(table.title, marginLeft, cursorY);
    cursorY += 12;
    
    // Table Description
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    let description = '';
    if (table.title.includes('Company Rankings')) {
      description = 'All scored partner companies, ordered from highest to lowest leaderboard score.';
    } else if (table.title.includes('Summary')) {
      description = 'High-level key performance metrics representing the aggregate evaluation data.';
    } else if (table.title.includes('Question')) {
      description = 'Performance breakdown across individual evaluation questions, highlighting operational strengths and weaknesses.';
    } else if (table.title.includes('Survey')) {
      description = 'Comparison of scores between different survey categories and modules.';
    }
    if (description) {
      const descLines = doc.splitTextToSize(description, contentWidth);
      doc.text(descLines, marginLeft, cursorY);
      cursorY += (descLines.length * 12) + 5;
    }

    autoTable(doc, {
      startY: cursorY,
      head: [table.columns],
      body: table.rows.map((row) => row.map(String)),
      margin: { left: marginLeft, right: marginLeft, top: PDF_CONTENT_TOP, bottom: PDF_CONTENT_BOTTOM },
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'striped',
    });

    // autoTable attaches the final Y position it landed on so the next
    // section starts below it instead of overlapping.
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
  });

  for (const visual of visuals.filter(item => !item.placement)) {
    doc.addPage();
    drawVisual(visual, PDF_CONTENT_TOP);
  }
  applyPdfBranding(doc, branding, { title: reportTitle, margin: marginLeft });
  return saveReportDownload(doc.output('blob'), reportTitle, 'pdf', recipe);
}
