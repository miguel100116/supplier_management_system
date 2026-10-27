import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SurveyType } from '../../../types/survey';
import type { ReportRecipe } from '../domain/reportHistory';
import type { ExportTable } from './exporters';
import { fetchLogoDataUrl } from './companyReportExport';
import { saveReportDownload } from './exportHistory';

const LOGO_ASPECT = 498 / 1921;

export async function exportArchivedReportAsPDF(
  title: string,
  itemLabel: string,
  category: SurveyType,
  tables: ExportTable[],
  recipe: ReportRecipe,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 48;
  const logo = await fetchLogoDataUrl();

  if (logo) doc.addImage(logo, 'PNG', (pageWidth - 190) / 2, 168, 190, 190 * LOGO_ASPECT);
  doc.setDrawColor(0, 99, 169);
  doc.setLineWidth(1.1);
  doc.line(pageWidth / 2 - 70, 258, pageWidth / 2 + 70, 258);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30);
  doc.text(title, pageWidth / 2, 290, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(110);
  doc.text('MBS Partner Evaluation System', pageWidth / 2, 312, { align: 'center' });

  const itemLines = doc.splitTextToSize(itemLabel, pageWidth - margin * 4);
  const boxY = 370;
  const boxHeight = Math.max(110, 76 + itemLines.length * 14);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin + 40, boxY, pageWidth - 2 * (margin + 40), boxHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(70);
  doc.text('REPORT SPECIFICATIONS:', margin + 60, boxY + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Category: ${category}`, margin + 60, boxY + 45);
  doc.text(itemLines, margin + 60, boxY + 62);
  doc.text(`Generated On: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
    margin + 60, boxY + 65 + itemLines.length * 14);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text('Microgenesis Supplier Management System - Confidential', pageWidth / 2, pageHeight - 30, { align: 'center' });

  doc.addPage();
  let cursorY = 96;
  for (const [index, table] of tables.entries()) {
    if (cursorY > pageHeight - 130) { doc.addPage(); cursorY = 96; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30);
    doc.text(index === 0 ? 'Report scope' : table.title, margin, cursorY);
    autoTable(doc, {
      startY: cursorY + 12,
      head: [table.columns],
      body: table.rows.map(row => row.map(String)),
      margin: { top: 96, bottom: 58, left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'striped',
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
  }

  const contentPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages() - 1;
  for (let page = 2; page <= contentPages + 1; page += 1) {
    doc.setPage(page);
    if (logo) doc.addImage(logo, 'PNG', margin, 20, 100, 100 * LOGO_ASPECT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text(title, pageWidth - margin, 32, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text('MBS Partner Evaluation System', pageWidth - margin, 44, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margin, 72, pageWidth - margin, 72);
    doc.line(margin, pageHeight - 38, pageWidth - margin, pageHeight - 38);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text('Microgenesis Supplier Management System - Confidential', margin, pageHeight - 20);
    doc.text(`Page ${page - 1} of ${contentPages}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
  }

  await saveReportDownload(doc.output('blob'), title, 'pdf', recipe);
}
