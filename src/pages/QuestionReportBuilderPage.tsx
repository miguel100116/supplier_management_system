import { PaperSizeSelect } from '../features/reports/components/PaperSizeSelect';
import { paperSizePoints, type PaperSize } from '../features/reports/domain/paperSize';
import { exportTablesAsWord } from '../features/reports/services/exporters';
import { saveReportDownload } from '../features/reports/services/exportHistory';
import type { ReportParameters } from '../features/reports/domain/reportHistory';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileText,
  FileType,
  ListChecks,
  Table2,
  AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { getQuestionMaxPoints, surveyTypeDisplayLabel } from '../data/questionWeights';
import { isOverallCategory } from '../data/questionCategories';
import { formatNumber, numericRating, averageRating } from '../features/analytics/domain/analytics';
import { getEvaluatedCompanyNames } from '../features/reports/domain/reportContent';

interface QuestionReportBuilderPageProps {
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
  canExport?: boolean;
  initialSettings?: ReportParameters;
  onBack: () => void;
}

interface QuestionStats {
  questionId: string;
  questionText: string;
  category: string;
  surveyType: SurveyType;
  average: number;
  responsesCount: number;
  highestCompany?: { company: string; score: number };
  lowestCompany?: { company: string; score: number };
}

const ALL_SURVEY_TYPES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const BRAND = [0, 99, 169] as const;
const LOGO_URL = '/microgenesis_logo.png';
const LOGO_ASPECT = 498 / 1921; // height / width, from the source asset

export function QuestionReportBuilderPage({ responses, partnerCompanies, canExport = false, onBack, initialSettings = {} }: QuestionReportBuilderPageProps) {
  // Option States
  const [selectedTypes, setSelectedTypes] = useState<Record<SurveyType, boolean>>(initialSettings.selectedTypes ?? ({
    Courier: true,
    Supplier: true,
    Subcontractor: true,
  }));
  const [columnsVisibility, setColumnsVisibility] = useState(initialSettings.columnsVisibility ?? ({
    average: true,
    responses: true,
    highest: true,
    lowest: true,
  }));
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>(initialSettings.paperSize ?? 'a4');
  const [isExporting, setIsExporting] = useState<'pdf' | 'csv' | 'excel' | 'docx' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close export menu on click outside
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const setOpenMenu = (v: boolean) => {
    setExportMenuOpen(v);
  };

  const toggleType = (type: SurveyType) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // 1. Resolve Evaluated Companies for each survey type
  const evaluatedCompaniesByType = useMemo(() => {
    const map: Record<SurveyType, string[]> = {
      Courier: [],
      Supplier: [],
      Subcontractor: [],
    };

    ALL_SURVEY_TYPES.forEach((type) => {
      map[type] = getEvaluatedCompanyNames(responses, partnerCompanies, type);
    });

    return map;
  }, [partnerCompanies, responses]);

  // 2. Compute dynamic stats per question for each selected survey type
  const statsByType = useMemo(() => {
    const map: Record<SurveyType, QuestionStats[]> = {
      Courier: [],
      Supplier: [],
      Subcontractor: [],
    };

    ALL_SURVEY_TYPES.forEach((surveyType) => {
      const typeResponses = responses.filter(r => r.surveyType === surveyType);
      
      // Group by questionId
      const questionGroups = new Map<string, { questionText: string; responses: SurveyResponse[] }>();
      
      typeResponses.forEach(r => {
        const key = r.questionId;
        // Ignore overall comments / general categories if any
        if (isOverallCategory(r.questionCategory) || key.includes('OVERALL-FEEDBACK')) return;
        
        if (!questionGroups.has(key)) {
          questionGroups.set(key, { questionText: r.question, responses: [] });
        }
        questionGroups.get(key)!.responses.push(r);
      });

      const list: QuestionStats[] = [];

      questionGroups.forEach((group, questionId) => {
        const validRatings = group.responses
          .map(r => numericRating(r.rating))
          .filter((rating): rating is number => rating !== null);

        if (validRatings.length === 0) return;

        const maxPoints = getQuestionMaxPoints(surveyType, questionId);
        const overallAvgRaw = validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length;
        const overallAvg = maxPoints > 0 ? (overallAvgRaw / maxPoints) * 100 : 0;

        // Compute company ratings
        const companyRatings = new Map<string, number[]>();
        group.responses.forEach(r => {
          const rVal = numericRating(r.rating);
          if (rVal !== null) {
            if (!companyRatings.has(r.company)) {
              companyRatings.set(r.company, []);
            }
            companyRatings.get(r.company)!.push(rVal);
          }
        });

        let highest: { company: string; score: number } | undefined;
        let lowest: { company: string; score: number } | undefined;

        companyRatings.forEach((ratings, compName) => {
          const avgRaw = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
          const avgNormalized = maxPoints > 0 ? (avgRaw / maxPoints) * 100 : 0;

          if (!highest || avgNormalized > highest.score) {
            highest = { company: compName, score: avgNormalized };
          }
          if (!lowest || avgNormalized < lowest.score) {
            lowest = { company: compName, score: avgNormalized };
          }
        });

        list.push({
          questionId,
          questionText: group.questionText,
          category: group.responses[0]?.questionCategory || '',
          surveyType,
          average: overallAvg,
          responsesCount: validRatings.length,
          highestCompany: highest,
          lowestCompany: lowest,
        });
      });

      // Sort questions descending by average rating
      map[surveyType] = list.sort((a, b) => b.average - a.average);
    });

    return map;
  }, [responses]);

  const activeTypes = ALL_SURVEY_TYPES.filter(type => selectedTypes[type]);

  // Logo fetch helper for pdf export
  const fetchLogoDataUrl = async (): Promise<string | null> => {
    try {
      const res = await fetch(LOGO_URL);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('logo fetch failed'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const handleExport = async (format: 'pdf' | 'csv' | 'excel' | 'docx') => {
    if (!canExport) return;
    setIsExporting(format);
    setOpenMenu(false);
    try {
      const recipe = { kind: 'question' as const, parameters: { paperSize, selectedTypes, columnsVisibility } };

      const reportTitle = 'Question Performance Report';


      // Build data structure for table exports
      const tables: { title: string; columns: string[]; rows: (string | number)[][] }[] = [];

      activeTypes.forEach((type) => {
        const typeLabel = surveyTypeDisplayLabel[type];
        const companiesList = evaluatedCompaniesByType[type];
        const questionsList = statsByType[type];

        const companyRows = companiesList.length > 0
          ? companiesList.map(comp => [comp])
          : [['No companies evaluated']];

        // 1. Metadata Table or Header containing list of evaluated companies
        tables.push({
          title: `${typeLabel} Evaluation - Selected Companies`,
          columns: ['Evaluated Companies'],
          rows: companyRows,
        });

        // 2. Question performance table
        const columns = ['Question'];
        if (columnsVisibility.average) columns.push('Average Rating (%)');
        if (columnsVisibility.responses) columns.push('Responses');
        if (columnsVisibility.highest) columns.push('Highest Scoring Company');
        if (columnsVisibility.lowest) columns.push('Lowest Scoring Company');

        const rows = questionsList.map((row) => {
          const r: (string | number)[] = [row.questionText];
          if (columnsVisibility.average) r.push(formatNumber(row.average));
          if (columnsVisibility.responses) r.push(row.responsesCount);
          if (columnsVisibility.highest) {
            r.push(
              row.highestCompany
                ? `${row.highestCompany.company} (${formatNumber(row.highestCompany.score)}%)`
                : 'N/A'
            );
          }
          if (columnsVisibility.lowest) {
            r.push(
              row.lowestCompany
                ? `${row.lowestCompany.company} (${formatNumber(row.lowestCompany.score)}%)`
                : 'N/A'
            );
          }
          return r;
        });

        tables.push({
          title: `${typeLabel} Question Performance`,
          columns,
          rows,
        });
      });

      if (format === 'docx') {
        await exportTablesAsWord(reportTitle, tables, reportTitle, recipe);
      } else if (format === 'csv') {
        const chunks = tables.map((table) => {
          const csvBody = Papa.unparse({ fields: table.columns, data: table.rows }, { escapeFormulae: true });
          return `${table.title}\n${csvBody}`;
        });
        const blob = new Blob([chunks.join('\n\n')], { type: 'text/csv;charset=utf-8' });
        await saveReportDownload(blob, reportTitle, 'csv', recipe);
      } else if (format === 'excel') {
        const workbook = XLSX.utils.book_new();
        tables.forEach((table) => {
          const sheetData = [table.columns, ...table.rows];
          const sheet = XLSX.utils.aoa_to_sheet(sheetData);
          const name = table.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
          XLSX.utils.book_append_sheet(workbook, sheet, name);
        });
        await saveReportDownload(new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportTitle, 'excel', recipe);
      } else if (format === 'pdf') {
        const doc = new jsPDF({ unit: 'pt', format: paperSizePoints(paperSize) });
        const marginLeft = 48;
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const contentWidth = pageWidth - marginLeft * 2;
        const logoDataUrl = await fetchLogoDataUrl();

        // COVER PAGE
        if (logoDataUrl) {
          const coverLogoWidth = 190;
          const coverLogoHeight = coverLogoWidth * LOGO_ASPECT;
          doc.addImage(logoDataUrl, 'PNG', (pageWidth - coverLogoWidth) / 2, 168, coverLogoWidth, coverLogoHeight);
        }

        doc.setDrawColor(...BRAND);
        doc.setLineWidth(1.1);
        doc.line(pageWidth / 2 - 70, 258, pageWidth / 2 + 70, 258);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(23);
        doc.setTextColor(30, 30, 30);
        doc.text('Question Performance Report', pageWidth / 2, 312, { align: 'center' });

        doc.setFontSize(14);
        doc.setTextColor(...BRAND);
        doc.text('MBS Partner Evaluation Analytics', pageWidth / 2, 338, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(100);
        doc.text(`Generated on ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, 358, { align: 'center' });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.75);
        doc.line(pageWidth / 2 - 90, 400, pageWidth / 2 + 90, 400);

        doc.setFontSize(9.5);
        doc.setTextColor(140);
        doc.text('Prepared for internal review by the', pageWidth / 2, pageHeight - 96, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.text('Microgenesis Supplier Management System', pageWidth / 2, pageHeight - 82, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text('This document is confidential and intended solely for the named recipient.', pageWidth / 2, pageHeight - 62, {
          align: 'center',
        });

        // SECTION CONTENT PAGES
        const drawHeaderAndFooter = (pdfDoc: typeof doc, pageIndex: number, totalPages: number) => {
          pdfDoc.setPage(pageIndex);
          
          // Header
          if (logoDataUrl) {
            pdfDoc.addImage(logoDataUrl, 'PNG', marginLeft, 20, 100, 100 * LOGO_ASPECT);
          }
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setFontSize(9);
          pdfDoc.setTextColor(70);
          pdfDoc.text('Question Performance Report', pageWidth - marginLeft, 32, { align: 'right' });
          pdfDoc.setFont('helvetica', 'normal');
          pdfDoc.setTextColor(130);
          pdfDoc.text('MBS Partner Evaluation System', pageWidth - marginLeft, 44, { align: 'right' });
          
          pdfDoc.setDrawColor(226, 232, 240);
          pdfDoc.setLineWidth(0.75);
          pdfDoc.line(marginLeft, 72, pageWidth - marginLeft, 72);

          // Footer
          pdfDoc.setFontSize(8);
          pdfDoc.setTextColor(150);
          pdfDoc.text('Microgenesis Supplier Management System — Confidential', marginLeft, pageHeight - 20);
          pdfDoc.text(`Page ${pageIndex - 1} of ${totalPages - 1}`, pageWidth - marginLeft, pageHeight - 20, { align: 'right' });
        };

        // Render each category to PDF dynamically
        activeTypes.forEach((type) => {
          doc.addPage();
          let cursorY = 74 + 22;

          const typeLabel = surveyTypeDisplayLabel[type];
          const companiesList = evaluatedCompaniesByType[type];
          const questionsList = statsByType[type];

          // 1. Heading
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(30, 30, 30);
          doc.text(`${typeLabel} Performance Evaluation`, marginLeft, cursorY);
          cursorY += 18;

          // 2. Evaluated Companies Callout box (as bulleted list in two columns)
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(1);
          
          const companiesLabel = `Evaluated Companies (${companiesList.length}):`;
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(70);
          const labelLines: string[] = doc.splitTextToSize(companiesLabel, contentWidth - 24);
          
          // Divide companies into 2 columns for the PDF export
          const half = Math.ceil(companiesList.length / 2);
          const leftCompanies = companiesList.slice(0, half);
          const rightCompanies = companiesList.slice(half);

          const colWidth = (contentWidth - 32) / 2;

          const leftLines: string[] = [];
          leftCompanies.forEach(comp => {
            const split = doc.splitTextToSize(`• ${comp}`, colWidth);
            leftLines.push(...split);
          });

          const rightLines: string[] = [];
          rightCompanies.forEach(comp => {
            const split = doc.splitTextToSize(`• ${comp}`, colWidth);
            rightLines.push(...split);
          });
          
          const maxTextLines = Math.max(leftLines.length, rightLines.length);
          const boxHeight = labelLines.length * 14 + maxTextLines * 13 + 18;
          doc.rect(marginLeft, cursorY, contentWidth, boxHeight, 'FD');
          
          let boxY = cursorY + 14;
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(50);
          labelLines.forEach(l => {
            doc.text(l, marginLeft + 12, boxY);
            boxY += 14;
          });
          
          // Draw left column
          let leftY = boxY;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100);
          leftLines.forEach(l => {
            doc.text(l, marginLeft + 16, leftY);
            leftY += 13;
          });

          // Draw right column
          let rightY = boxY;
          rightLines.forEach(l => {
            doc.text(l, marginLeft + 16 + colWidth + 12, rightY);
            rightY += 13;
          });

          cursorY += boxHeight + 20;

          // 3. Question Performance Table
          const tableHeaders = ['Question'];
          if (columnsVisibility.average) tableHeaders.push('Average (%)');
          if (columnsVisibility.responses) tableHeaders.push('Responses');
          if (columnsVisibility.highest) tableHeaders.push('Highest Scoring Company');
          if (columnsVisibility.lowest) tableHeaders.push('Lowest Scoring Company');

          const tableRows = questionsList.map((row) => {
            const r = [row.questionText];
            if (columnsVisibility.average) r.push(`${formatNumber(row.average)}%`);
            if (columnsVisibility.responses) r.push(String(row.responsesCount));
            if (columnsVisibility.highest) {
              r.push(
                row.highestCompany
                  ? `${row.highestCompany.company} (${formatNumber(row.highestCompany.score)}%)`
                  : 'N/A'
              );
            }
            if (columnsVisibility.lowest) {
              r.push(
                row.lowestCompany
                  ? `${row.lowestCompany.company} (${formatNumber(row.lowestCompany.score)}%)`
                  : 'N/A'
              );
            }
            return r;
          });

          autoTable(doc, {
            startY: cursorY,
            head: [tableHeaders],
            body: tableRows,
            margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
            styles: { fontSize: 8.5, cellPadding: 5 },
            headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            theme: 'striped',
          });
        });

        // Draw headers and footers for all pages
        const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
        for (let i = 2; i <= pageCount; i++) {
          drawHeaderAndFooter(doc, i, pageCount);
        }

        await saveReportDownload(doc.output('blob'), reportTitle, 'pdf', recipe);
      }
    } finally {
      setIsExporting(null);
    }
  };


  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="secondary-button">
          <ArrowLeft size={16} />
          <span>Back to Reports</span>
        </button>
        <div className="text-right">
          <h2 className="text-base font-semibold">Question Report Builder</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Build custom question comparative reports</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Left Option Controls Sidebar */}
        <aside className="panel h-fit space-y-6 lg:sticky lg:top-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">1. Select Categories</h3>
            <p className="text-xs text-slate-400 mt-1 mb-3">Choose which evaluation forms to include in the report</p>
            <div className="space-y-2.5">
              {ALL_SURVEY_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTypes[type]}
                    onChange={() => toggleType(type)}
                    className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {surveyTypeDisplayLabel[type]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">2. Grid Columns</h3>
            <p className="text-xs text-slate-400 mt-1 mb-3">Choose which column metrics to display in the report tables</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={columnsVisibility.average}
                  onChange={(e) => setColumnsVisibility(prev => ({ ...prev, average: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Average Rating (%)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={columnsVisibility.responses}
                  onChange={(e) => setColumnsVisibility(prev => ({ ...prev, responses: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Total Responses Count
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={columnsVisibility.highest}
                  onChange={(e) => setColumnsVisibility(prev => ({ ...prev, highest: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Highest Scoring Company
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={columnsVisibility.lowest}
                  onChange={(e) => setColumnsVisibility(prev => ({ ...prev, lowest: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Lowest Scoring Company
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-slate-200 p-3.5 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-azure dark:text-blue-400">
              <ListChecks size={14} />
              <span>Report Outline</span>
            </div>
            <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5 leading-relaxed">
              <li>• Page 1: Professional Cover Page</li>
              {activeTypes.map((type) => (
                <li key={type}>
                  • Page {activeTypes.indexOf(type) + 2}: {surveyTypeDisplayLabel[type]} Summary & Question Ratings
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Right Print Preview Section */}
        <section className="panel flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Preview</h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">Scroll to review report pages formatted for export</span>
          </div>

          <div className="max-h-[75vh] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-200/70 p-6 dark:border-slate-800 dark:bg-slate-950/60 sm:p-10">
            {activeTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <AlertCircle className="text-slate-400 h-10 w-10" />
                <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                  Please select at least one category on the left sidebar to generate preview pages.
                </p>
              </div>
            ) : (
              <div className="mx-auto flex flex-col items-center gap-10">
                {/* Page 1 — Cover Sheet. Header sits near the top and the
                    confidential footer sits near the bottom (matching the PDF's
                    fixed y-coordinates) rather than centering the whole block,
                    which would spread the blank space evenly instead of
                    concentrating it in the middle like the PDF does. */}
                <PagedSheet paperSize={paperSize} pageLabel="Page 1 · Cover">
                  <div className="flex h-full flex-col items-center px-6 text-center">
                    <div className="pt-[16%]">
                      <img src="/microgenesis_logo.png" alt="Microgenesis" className="mx-auto h-14 w-auto" />
                      <div className="mx-auto mt-7 h-px w-20 bg-[#0063a9]" />
                      <h1 className="mt-7 text-2xl font-bold text-slate-800 dark:text-slate-100">Question Performance Report</h1>
                      <p className="mt-2 text-lg font-bold text-[#0063a9]">MBS Partner Evaluation Analytics</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Generated on {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="mt-auto pb-[7%] text-center">
                      <p className="text-sm text-slate-400 dark:text-slate-500">Prepared for internal review by the</p>
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-300">Microgenesis Supplier Management System</p>
                      <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
                        This document is confidential and intended solely for the named recipient.
                      </p>
                    </div>
                  </div>
                </PagedSheet>

                {/* Section Specific Content Pages */}
                {activeTypes.map((type, index) => {
                  const label = surveyTypeDisplayLabel[type];
                  const companiesList = evaluatedCompaniesByType[type];
                  const questionsList = statsByType[type];
                  // PDF splits the list into a left/right column block (first
                  // half left, second half right) rather than a row-major CSS
                  // grid, so which company lands in which column matches exactly.
                  const half = Math.ceil(companiesList.length / 2);
                  const leftCompanies = companiesList.slice(0, half);
                  const rightCompanies = companiesList.slice(half);

                  return (
                    <PagedSheet paperSize={paperSize} key={type} pageLabel={`Page ${index + 2}`} footerRight={`Page ${index + 1} of ${activeTypes.length}`}>
                      <ReportPageHeader />

                      <div className="mt-5 space-y-4">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{label} Performance Evaluation</h2>

                        {/* Companies callout list */}
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/20 text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-300 block mb-2">
                            Evaluated Companies ({companiesList.length}):
                          </span>
                          {companiesList.length > 0 && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                              <ul className="list-disc pl-4">
                                {leftCompanies.map((comp) => (
                                  <li key={comp} className="break-all">{comp}</li>
                                ))}
                              </ul>
                              <ul className="list-disc pl-4">
                                {rightCompanies.map((comp) => (
                                  <li key={comp} className="break-all">{comp}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Questions Performance Table */}
                        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 mt-2">
                          <table className="w-full text-left text-[10px]">
                            <thead className="bg-[#0063a9] text-white">
                              <tr>
                                <th className="px-2.5 py-1.5 font-semibold">Question</th>
                                {columnsVisibility.average && (
                                  <th className="px-2.5 py-1.5 font-semibold text-center w-16">Average (%)</th>
                                )}
                                {columnsVisibility.responses && (
                                  <th className="px-2.5 py-1.5 font-semibold text-center w-16">Responses</th>
                                )}
                                {columnsVisibility.highest && (
                                  <th className="px-2.5 py-1.5 font-semibold w-28">Highest Scoring Company</th>
                                )}
                                {columnsVisibility.lowest && (
                                  <th className="px-2.5 py-1.5 font-semibold w-28">Lowest Scoring Company</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {questionsList.map((row, idx) => (
                                <tr key={row.questionId} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-white dark:bg-slate-900'}>
                                  <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 font-medium">{row.questionText}</td>
                                  {columnsVisibility.average && (
                                    <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 text-center font-bold">{formatNumber(row.average)}%</td>
                                  )}
                                  {columnsVisibility.responses && (
                                    <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400 text-center">{row.responsesCount}</td>
                                  )}
                                  {columnsVisibility.highest && (
                                    <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">
                                      {row.highestCompany ? (
                                        <div className="flex flex-col">
                                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[110px]">{row.highestCompany.company}</span>
                                          <span className="text-[10px] text-slate-400">{formatNumber(row.highestCompany.score)}%</span>
                                        </div>
                                      ) : 'N/A'}
                                    </td>
                                  )}
                                  {columnsVisibility.lowest && (
                                    <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">
                                      {row.lowestCompany ? (
                                        <div className="flex flex-col">
                                          <span className="font-semibold text-rose-600 dark:text-rose-400 truncate max-w-[110px]">{row.lowestCompany.company}</span>
                                          <span className="text-[10px] text-slate-400">{formatNumber(row.lowestCompany.score)}%</span>
                                        </div>
                                      ) : 'N/A'}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </PagedSheet>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Sticky footer build report control buttons */}
      <div className="panel sticky bottom-4 max-[560px]:bottom-20 flex flex-wrap items-center justify-between gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-slate-200/80 dark:border-slate-800 ring-1 ring-slate-900/5 dark:ring-white/10 z-10">
        <button type="button" onClick={onBack} className="secondary-button">
          Cancel
        </button>

        {canExport ? (
          <div className="relative flex flex-wrap items-end gap-2" ref={menuRef}><PaperSizeSelect value={paperSize} onChange={setPaperSize} disabled={isExporting !== null} />
            <button
              type="button"
              disabled={activeTypes.length === 0 || !!isExporting}
              onClick={() => setOpenMenu(!exportMenuOpen)}
              className="primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              {isExporting ? `Exporting ${isExporting.toUpperCase()}…` : 'Export'}
              <ChevronDown size={14} />
            </button>
            {exportMenuOpen && (
              <div className="absolute bottom-full right-0 z-20 mb-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileText size={14} /> PDF Document
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('excel')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Table2 size={14} /> Excel Workbook
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('docx')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileType size={14} /> Word (.docx)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileType size={14} /> CSV Document
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
            ⚠️ Exporting restricted to Supervisor and above
          </span>
        )}
      </div>
    </div>
  );
}

/** A single A4-proportioned sheet in the print preview, styled like a Word/PDF print-layout page. */
function PagedSheet({
  children,
  pageLabel,
  footerRight,
  paperSize = 'a4',
}: {
  children: ReactNode;
  pageLabel: string;
  footerRight?: string; paperSize?: PaperSize;
}) {
  const PAGE_WIDTH = 640;
  const PAGE_HEIGHT = Math.round(PAGE_WIDTH * paperSizePoints(paperSize)[1] / paperSizePoints(paperSize)[0]); // Selected paper aspect ratio
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full rounded-sm bg-white shadow-xl ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10"
        style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, maxWidth: '100%' }}
      >
        <div className="flex h-full flex-col px-4 py-6 sm:px-12 sm:py-9">
          <div className="flex-1">{children}</div>
          {footerRight && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <span>Microgenesis Supplier Management System — Confidential</span>
              <span>{footerRight}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">{pageLabel}</p>
    </div>
  );
}

/** The small running header (logo + report name) repeated at the top of each content page, mirroring the export - always static text, matching drawHeaderAndFooter in the PDF (it never shows the per-section label). */
function ReportPageHeader() {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
      <img src="/microgenesis_logo.png" alt="Microgenesis" className="h-6 w-auto" />
      <div className="text-right">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Question Performance Report</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">MBS Partner Evaluation System</p>
      </div>
    </div>
  );
}
