import type { jsPDF } from 'jspdf';

export const PDF_CONTENT_TOP = 100;
export const PDF_CONTENT_BOTTOM = 48;

export interface PdfBranding {
  companyLogo: string | null;
}

async function loadLogo(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:image/png;base64,${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`;
  } catch {
    return null;
  }
}

export async function loadPdfBranding(): Promise<PdfBranding> {
  return { companyLogo: await loadLogo('/microgenesis_logo.png') };
}

/** Standard letterhead, applied after pagination so every page has a total. */
export function applyPdfBranding(doc: jsPDF, branding: PdfBranding, options: {
  title: string;
  subject?: string;
  margin?: number;
  compact?: boolean;
  confidentiality?: 'Confidential' | 'Strictly Confidential';
  pageSubject?: (page: number) => string;
}) {
  const margin = options.margin ?? 40;
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: options.title, author: 'Microgenesis', creator: 'Microgenesis - Supplier Management System' });
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.saveGraphicsState();
    const compact = options.compact;
    const logoY = compact ? 5 : 21;
    const companyWidth = compact ? 76 : 112;
    const ruleY = compact ? 31 : 74;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, width, ruleY + 3, 'F');
    const companyX = margin;
    if (branding.companyLogo) doc.addImage(branding.companyLogo, 'PNG', companyX, logoY + (compact ? 0 : 3), companyWidth, companyWidth * 498 / 1921, undefined, 'FAST');
    else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
      doc.text('Microgenesis', companyX, logoY + 15);
    }
    if (!compact) {
      const textWidth = Math.max(100, width - margin * 2 - companyWidth - 32);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
      const subject = options.pageSubject?.(page) ?? options.subject ?? options.title;
      const lines = doc.splitTextToSize(subject, textWidth) as string[];
      // Ellipsis makes truncation explicit while keeping the letterhead bounded.
      if (lines.length > 2) lines[1] = lines[1].slice(0, -3) + '...';
      doc.text(lines.slice(0, 2), width - margin, 30, { align: 'right', lineHeightFactor: 1.1 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
      const subtitle = doc.splitTextToSize(options.subject || options.pageSubject ? options.title : 'Supplier Management System', textWidth) as string[];
      doc.text(subtitle.slice(0, 2), width - margin, 53, { align: 'right', lineHeightFactor: 1.1 });
    }
    doc.setDrawColor(0, 99, 169); doc.setLineWidth(0.7);
    doc.line(margin, ruleY, width - margin, ruleY);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, height - 38, width, 38, 'F');
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.5);
    doc.line(margin, height - 34, width - margin, height - 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text(`Microgenesis | Supplier Management System | ${options.confidentiality ?? 'Confidential'}`, margin, height - 20);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 20, { align: 'right' });
    doc.restoreGraphicsState();
  }
}
