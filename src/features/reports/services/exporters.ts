import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveReportDownload } from './exportHistory';
import type { ReportRecipe } from '../domain/reportHistory';

/** An editable Word document using the same complete tables as the other formats. */
export async function exportTablesAsWord(reportTitle: string, tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } = await import('docx');
  const doc = new Document({ styles: { default: {
    document: { run: { font: 'Arial', size: 20 } },
    title: { run: { color: '0063A9', bold: true, size: 36 } },
    heading1: { run: { color: '0063A9', bold: true, size: 24 } },
  } }, sections: [{ children: [
    new Paragraph({ text: reportTitle, heading: HeadingLevel.TITLE }),
    ...tables.flatMap(table => [
      new Paragraph({ text: table.title, heading: HeadingLevel.HEADING_1 }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [table.columns, ...table.rows].map((row, index) =>
        new TableRow({ tableHeader: index === 0, children: row.map(value => new TableCell({ shading: index === 0 ? { fill: '0063A9' } : undefined, children: [
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
export function exportTablesAsExcel(tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

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

  return saveReportDownload(new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), tables[0]?.title || filenameBase, 'excel', recipe);
}

/** One PDF, one heading + table per section, stacked vertically (auto page-breaks via autoTable). */
export function exportTablesAsPDF(reportTitle: string, tables: ExportTable[], filenameBase: string, recipe?: ReportRecipe) {
  const doc = new jsPDF({ unit: 'pt' });
  const marginLeft = 40;
  let cursorY = 48;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(0, 99, 169);
  doc.text(reportTitle, marginLeft, cursorY);
  cursorY += 16;
  
  // Date and Metadata
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, marginLeft, cursorY);
  cursorY += 12;
  doc.text(`Confidential: For internal distribution only`, marginLeft, cursorY);
  cursorY += 30;

  // Introduction Paragraph
  doc.setFontSize(11);
  doc.setTextColor(40);
  const introText = doc.splitTextToSize(
    `This report provides a comprehensive summary of survey analytics and stakeholder feedback. ` +
    `The data compiled below highlights key performance indicators, comparative analysis across survey categories, ` +
    `and detailed question-level responses. Review the insights carefully to inform continuous improvement initiatives ` +
    `and strategic decision-making.`,
    500
  );
  doc.text(introText, marginLeft, cursorY);
  cursorY += (introText.length * 15) + 20;

  tables.forEach((table) => {
    if (cursorY > 700) {
      doc.addPage();
      cursorY = 48;
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
      const descLines = doc.splitTextToSize(description, 500);
      doc.text(descLines, marginLeft, cursorY);
      cursorY += (descLines.length * 12) + 5;
    }

    autoTable(doc, {
      startY: cursorY,
      head: [table.columns],
      body: table.rows.map((row) => row.map(String)),
      margin: { left: marginLeft, right: marginLeft },
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'striped',
    });

    // autoTable attaches the final Y position it landed on so the next
    // section starts below it instead of overlapping.
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
  });

  // Add footer to all pages
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} - Microgenesis Supplier Management System`,
      marginLeft,
      doc.internal.pageSize.height - 20
    );
  }

  return saveReportDownload(doc.output('blob'), reportTitle, 'pdf', recipe);
}
