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
  AlertCircle,
  TrendingUp,
  Award,
  AlertTriangle,
  HelpCircle,
  Eye,
  Settings
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import {
  formatNumber,
  getKpiSummary,
  averageBySurveyType,
  questionPerformance
} from '../features/analytics/domain/analytics';
import { formatCompositeScore, getBand, getRemarkText } from '../data/questionWeights';
import { getAnalyticsCompanyRankings } from '../features/analytics/domain/rankings';

interface SummaryReportBuilderPageProps {
  responses: SurveyResponse[];
  rankingResponses?: SurveyResponse[];
  partnerCompanies?: PartnerCompany[];
  canExport?: boolean;
  initialSettings?: ReportParameters;
  onBack: () => void;
}

const ALL_SURVEY_TYPES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const BRAND = [0, 99, 169] as const;
const LOGO_URL = '/microgenesis_logo.png';
const LOGO_ASPECT = 498 / 1921; // height / width

const COLORS = {
  Courier: '#0063a9',
  Supplier: '#0ea5e9',
  Subcontractor: '#14b8a6',
};

export function SummaryReportBuilderPage({ responses, rankingResponses = responses, partnerCompanies = [], canExport = false, onBack, initialSettings = {} }: SummaryReportBuilderPageProps) {
  // Option States
  const [selectedTypes, setSelectedTypes] = useState<Record<SurveyType, boolean>>(initialSettings.selectedTypes ?? ({
    Courier: true,
    Supplier: true,
    Subcontractor: true,
  }));

  const [showKpis, setShowKpis] = useState(initialSettings.showKpis ?? true);
  const [showChart, setShowChart] = useState(initialSettings.showChart ?? true);
  const [showTable, setShowTable] = useState(initialSettings.showTable ?? true);
  const [showTopCompanies, setShowTopCompanies] = useState(initialSettings.showTopCompanies ?? true);
  const [showBottomCompanies, setShowBottomCompanies] = useState(initialSettings.showBottomCompanies ?? true);
  const [showQuestions, setShowQuestions] = useState(initialSettings.showQuestions ?? true);

  const [chartMetric, setChartMetric] = useState<'responses' | 'rating'>(initialSettings.chartMetric ?? 'responses');

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'csv' | 'excel' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  // Close export menu on click outside
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const toggleType = (type: SurveyType) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const activeTypes = ALL_SURVEY_TYPES.filter(type => selectedTypes[type]);

  // Filtered responses based on selection
  const filteredResponses = useMemo(() => {
    return responses.filter(r => selectedTypes[r.surveyType]);
  }, [responses, selectedTypes]);

  const filteredRankingResponses = useMemo(
    () => rankingResponses.filter((response) => selectedTypes[response.surveyType]),
    [rankingResponses, selectedTypes],
  );

  // Compute dynamic KPI summary
  const summary = useMemo(() => {
    return getKpiSummary(filteredResponses);
  }, [filteredResponses]);

  // Survey Performance data
  const surveyPerformance = useMemo(() => {
    return averageBySurveyType(filteredResponses, activeTypes);
  }, [filteredResponses, activeTypes]);

  // Companies data
  const companyPerformance = useMemo(() => {
    return getAnalyticsCompanyRankings(filteredRankingResponses, activeTypes).map((ranking) => ({
      company: ranking.name,
      surveyType: ranking.type,
      average: ranking.rankScore,
      evaluations: ranking.count,
    }));
  }, [filteredRankingResponses, activeTypes]);

  const topCompanies = useMemo(() => {
    return companyPerformance.slice(0, 5);
  }, [companyPerformance]);

  const leastRatedCompanies = useMemo(() => {
    return companyPerformance.slice().reverse().slice(0, 5);
  }, [companyPerformance]);

  // Questions highlights
  const questionRows = useMemo(() => {
    return questionPerformance(filteredResponses).slice(0, 5);
  }, [filteredResponses]);

  // Whether the export produces a 3rd page (Partner Performance & Question
  // Highlights) - shared between the preview's page count and the PDF export
  // so the two never drift on how many pages the document actually has.
  const hasExtraSections = showTopCompanies || showBottomCompanies || showQuestions;

  // Recharts Chart Data
  const chartData = useMemo(() => {
    return surveyPerformance.map(row => ({
      name: row.surveyType,
      value: chartMetric === 'responses' ? row.responses : row.average,
      formattedValue: chartMetric === 'responses' ? `${row.responses} responses` : `${formatNumber(row.average)}%`,
    })).filter(row => row.value > 0);
  }, [surveyPerformance, chartMetric]);

  // Donut hole readout - the static PDF capture can't rely on hover
  // tooltips, so the headline number needs to live directly on the chart.
  const chartCenterValue = chartMetric === 'responses' ? summary.totalResponses : `${formatNumber(summary.averageRating)}%`;
  const chartCenterLabel = chartMetric === 'responses' ? 'Total Respondents' : 'Avg Rating (All Types)';

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

  // Reads the real pixel dimensions of a captured PNG so it can be embedded at
  // its true aspect ratio - a hardcoded guessed ratio stretches/squashes the
  // chart whenever the live wrapper's actual proportions differ from the guess.
  const dataUrlDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 220 });
      img.onerror = () => resolve({ width: 400, height: 220 });
      img.src = dataUrl;
    });
  };

  // Helper to capture SVG chart as PNG base64
  const captureChartImage = async (): Promise<string | null> => {
    if (!chartWrapperRef.current) return null;
    try {
      const canvas = await html2canvas(chartWrapperRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const handleExport = async (format: 'pdf' | 'csv' | 'excel') => {
    if (!canExport) return;
    setIsExporting(format);
    setExportMenuOpen(false);
    try {
      const recipe = { kind: 'summary' as const, parameters: { selectedTypes, showKpis, showChart, showTable, showTopCompanies, showBottomCompanies, showQuestions, chartMetric } };

      const reportTitle = 'Summary Report';


      // 1. Prepare Tables Data for spreadsheets
      const tables: { title: string; columns: string[]; rows: (string | number)[][] }[] = [];

      // Add KPI summary table if active
      if (showKpis) {
        tables.push({
          title: 'Key Performance Indicators',
          columns: ['Metric', 'Value'],
          rows: [
            ['Total Responses', summary.totalResponses],
            ['Average Rating', `${formatNumber(summary.averageRating)}%`],
            ['Overall Satisfaction', `${formatNumber(summary.overallSatisfactionScore)}%`],
            ['N/A Answer Frequency', `${formatNumber(summary.naPercentage)}%`],
          ],
        });
      }

      // Add Survey performance table
      if (showTable) {
        tables.push({
          title: 'Survey Category Summary',
          columns: ['Survey Category', 'Average Rating', 'Response Count'],
          rows: surveyPerformance.map(r => [r.surveyType, formatCompositeScore(r.surveyType, r.average).text, r.responses]),
        });
      }

      // Add Highest Rated
      if (showTopCompanies && topCompanies.length > 0) {
        tables.push({
          title: 'Highest Rated Evaluated Companies',
          columns: ['Company', 'Survey Type', 'Volume-Weighted Score', 'Evaluations Count', 'Remarks'],
          rows: topCompanies.map(r => [r.company, r.surveyType, formatCompositeScore(r.surveyType, r.average).text, r.evaluations, getRemarkText(getBand(r.surveyType, r.average))]),
        });
      }

      // Add Lowest Rated
      if (showBottomCompanies && leastRatedCompanies.length > 0) {
        tables.push({
          title: 'Lowest Rated Evaluated Companies',
          columns: ['Company', 'Survey Type', 'Volume-Weighted Score', 'Evaluations Count', 'Remarks'],
          rows: leastRatedCompanies.map(r => [r.company, r.surveyType, formatCompositeScore(r.surveyType, r.average).text, r.evaluations, getRemarkText(getBand(r.surveyType, r.average))]),
        });
      }

      // Add Question highlights
      if (showQuestions && questionRows.length > 0) {
        tables.push({
          title: 'Question Performance Highlights',
          columns: ['Question', 'Average Rating (%)', 'Total Responses'],
          rows: questionRows.map(r => [r.question, formatNumber(r.average), r.responses]),
        });
      }

      if (format === 'csv') {
        const chunks = tables.map((table) => {
          const csvBody = Papa.unparse({ fields: table.columns, data: table.rows });
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
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
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
        doc.setFontSize(22);
        doc.setTextColor(30);
        doc.text('Summary Report', pageWidth / 2, 290, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(110);
        doc.text('MBS Partner Evaluation System', pageWidth / 2, 312, { align: 'center' });

        // Metadata block on cover page
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(marginLeft + 40, 390, contentWidth - 80, 110, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(70);
        doc.text('REPORT SPECIFICATIONS:', marginLeft + 60, 415);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Active Survey Types:  ${activeTypes.join(', ') || 'None selected'}`, marginLeft + 60, 435);
        doc.text(`Total Submitted Surveys Count:  ${summary.totalResponses} submissions`, marginLeft + 60, 452);
        doc.text(`Average System-wide Score:  ${formatNumber(summary.averageRating)}%`, marginLeft + 60, 469);
        doc.text(`Generated On:  ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, marginLeft + 60, 486);

        // Footer on Cover
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text('Microgenesis Supplier Management System — Confidential', pageWidth / 2, pageHeight - 30, { align: 'center' });

        // REPORT PAGES SETUP
        let pageIndex = 2;
        const addHeaderAndFooter = (pdfDoc: jsPDF) => {
          pdfDoc.addPage();
          
          // Header
          if (logoDataUrl) {
            pdfDoc.addImage(logoDataUrl, 'PNG', marginLeft, 20, 100, 100 * LOGO_ASPECT);
          }
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setFontSize(9);
          pdfDoc.setTextColor(30);
          pdfDoc.text('Summary Report', pageWidth - marginLeft, 32, { align: 'right' });
          pdfDoc.setFont('helvetica', 'normal');
          pdfDoc.setTextColor(130);
          pdfDoc.text('MBS Partner Evaluation System', pageWidth - marginLeft, 44, { align: 'right' });
          
          pdfDoc.setDrawColor(226, 232, 240);
          pdfDoc.setLineWidth(0.75);
          pdfDoc.line(marginLeft, 72, pageWidth - marginLeft, 72);

          // Footer
          pdfDoc.setFontSize(8);
          pdfDoc.setTextColor(140);
          pdfDoc.text('Microgenesis Supplier Management System — Confidential', marginLeft, pageHeight - 20);
          pdfDoc.text(`Page ${pageIndex - 1}`, pageWidth - marginLeft, pageHeight - 20, { align: 'right' });
          pageIndex++;
        };

        // PAGE 2: KEY INSIGHTS & CIRCLE GRAPH
        addHeaderAndFooter(doc);
        let cursorY = 95;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(20);
        doc.text('System-wide Evaluation Overview', marginLeft, cursorY);
        cursorY += 18;

        // KPI block (2x2 Grid)
        if (showKpis) {
          const gridColWidth = contentWidth / 2 - 10;
          
          // Cell 1: Total Responses
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft, cursorY, gridColWidth, 50, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...BRAND);
          doc.text(String(summary.totalResponses), marginLeft + 15, cursorY + 23);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100);
          doc.text('TOTAL SUBMITTED EVALUATIONS', marginLeft + 15, cursorY + 38);

          // Cell 2: Average Rating
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft + gridColWidth + 20, cursorY, gridColWidth, 50, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...BRAND);
          doc.text(`${formatNumber(summary.averageRating)}%`, marginLeft + gridColWidth + 35, cursorY + 23);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100);
          doc.text('AVERAGE SYSTEM SCORE', marginLeft + gridColWidth + 35, cursorY + 38);

          cursorY += 60;

          // Cell 3: Overall Satisfaction
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft, cursorY, gridColWidth, 50, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...BRAND);
          doc.text(`${formatNumber(summary.overallSatisfactionScore)}%`, marginLeft + 15, cursorY + 23);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100);
          doc.text('OVERALL SATISFACTION INDEX', marginLeft + 15, cursorY + 38);

          // Cell 4: N/A rate
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft + gridColWidth + 20, cursorY, gridColWidth, 50, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...BRAND);
          doc.text(`${formatNumber(summary.naPercentage)}%`, marginLeft + gridColWidth + 35, cursorY + 23);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100);
          doc.text('N/A ANSWER FREQUENCY RATE', marginLeft + gridColWidth + 35, cursorY + 38);

          cursorY += 75;
        }

        // Include Circle Graph (from captured chart)
        if (showChart) {
          const chartDataUrl = await captureChartImage();
          if (chartDataUrl) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30);
            doc.text(`Survey Performance Metrics Map (${chartMetric === 'responses' ? 'Submissions Volume' : 'Average Score %'})`, marginLeft, cursorY);
            cursorY += 12;

            const { width: natW, height: natH } = await dataUrlDimensions(chartDataUrl);
            const targetWidth = contentWidth * 0.55;
            const targetHeight = (natH / natW) * targetWidth;
            doc.addImage(chartDataUrl, 'PNG', marginLeft + (contentWidth - targetWidth) / 2, cursorY, targetWidth, targetHeight);
            cursorY += targetHeight + 25;
          }
        }

        // Performance Table
        if (showTable) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(30);
          doc.text('Survey Category Performance Table', marginLeft, cursorY);
          cursorY += 10;

          const tableHeaders = ['Survey Category', 'Average Score', 'Total Submissions'];
          const tableRows = surveyPerformance.map(row => [
            row.surveyType,
            formatCompositeScore(row.surveyType, row.average).text,
            String(row.responses)
          ]);

          autoTable(doc, {
            startY: cursorY,
            head: [tableHeaders],
            body: tableRows,
            margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
            styles: { fontSize: 8.5, cellPadding: 5 },
            headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
          });
        }

        // PAGE 3: PARTNER COMPANY RATINGS & HIGHLIGHTS
        if (hasExtraSections) {
          addHeaderAndFooter(doc);
          cursorY = 95;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(20);
          doc.text('Partner Performance & Question Highlights', marginLeft, cursorY);
          cursorY += 22;

          // Highest Rated Companies
          if (showTopCompanies && topCompanies.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30);
            doc.text('Highest Rated Evaluated Companies', marginLeft, cursorY);
            cursorY += 10;

            const tableHeaders = ['Rank', 'Company Name', 'Survey Type', 'Volume-Weighted Score', 'Evaluations Count', 'Remarks'];
            const tableRows = topCompanies.map((row, idx) => [
              `#${idx + 1}`,
              row.company,
              row.surveyType,
              formatCompositeScore(row.surveyType, row.average).text,
              String(row.evaluations),
              getRemarkText(getBand(row.surveyType, row.average))
            ]);

            autoTable(doc, {
              startY: cursorY,
              head: [tableHeaders],
              body: tableRows,
              margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
              styles: { fontSize: 8.5, cellPadding: 4.5 },
              headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' }, // Emerald theme
              alternateRowStyles: { fillColor: [248, 250, 252] },
            });

            cursorY = (doc as any).lastAutoTable.finalY + 25;
          }

          // Lowest Performing Companies
          if (showBottomCompanies && leastRatedCompanies.length > 0) {
            if (cursorY > pageHeight - 140) {
              addHeaderAndFooter(doc);
              cursorY = 95;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30);
            doc.text('Lowest Rated Evaluated Companies', marginLeft, cursorY);
            cursorY += 10;

            const tableHeaders = ['Rank', 'Company Name', 'Survey Type', 'Volume-Weighted Score', 'Evaluations Count', 'Remarks'];
            const tableRows = leastRatedCompanies.map((row, idx) => [
              `#${leastRatedCompanies.length - idx}`,
              row.company,
              row.surveyType,
              formatCompositeScore(row.surveyType, row.average).text,
              String(row.evaluations),
              getRemarkText(getBand(row.surveyType, row.average))
            ]);

            autoTable(doc, {
              startY: cursorY,
              head: [tableHeaders],
              body: tableRows,
              margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
              styles: { fontSize: 8.5, cellPadding: 4.5 },
              headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' }, // Rose theme
              alternateRowStyles: { fillColor: [248, 250, 252] },
            });

            cursorY = (doc as any).lastAutoTable.finalY + 25;
          }

          // Question Highlights
          if (showQuestions && questionRows.length > 0) {
            if (cursorY > pageHeight - 160) {
              addHeaderAndFooter(doc);
              cursorY = 95;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30);
            doc.text('Question Performance Highlights', marginLeft, cursorY);
            cursorY += 10;

            const tableHeaders = ['Question Rating Highlight', 'Average Rating (%)', 'Response Submissions'];
            const tableRows = questionRows.map(row => [
              row.question,
              `${formatNumber(row.average)}%`,
              String(row.responses)
            ]);

            autoTable(doc, {
              startY: cursorY,
              head: [tableHeaders],
              body: tableRows,
              margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
              styles: { fontSize: 8, cellPadding: 4.5 },
              headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
              alternateRowStyles: { fillColor: [248, 250, 252] },
            });
          }
        }

        await saveReportDownload(doc.output('blob'), reportTitle, 'pdf', recipe);
      }
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setIsExporting(null);
    }
  };


  return (
    <div className="flex flex-col gap-5 xl:flex-row h-full min-h-[calc(100vh-140px)] animate-fade-in">
      {/* 1. Control Panel Sidebar */}
      <aside className="w-full xl:w-80 shrink-0 space-y-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-white">Summary Builder</h2>
            <p className="text-xs text-slate-400">Configure Summary Report</p>
          </div>
        </div>

        {/* Survey Types checkboxes */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Settings size={14} />
            <span>1. Categories Included</span>
          </div>
          <div className="space-y-2.5">
            {ALL_SURVEY_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedTypes[type]}
                  onChange={() => toggleType(type)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {type} Evaluation Survey
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Chart metric option */}
        {showChart && (
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <TrendingUp size={14} />
              <span>2. Graph Metric</span>
            </span>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setChartMetric('responses')}
                className={`py-1.5 px-2.5 text-xs font-semibold rounded-md transition ${chartMetric === 'responses' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Submissions
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('rating')}
                className={`py-1.5 px-2.5 text-xs font-semibold rounded-md transition ${chartMetric === 'rating' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Average Rating
              </button>
            </div>
          </div>
        )}

        {/* Toggle Report Sections */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <ListChecks size={14} />
            <span>3. Show Sections</span>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showKpis}
                onChange={(e) => setShowKpis(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Core KPI Summary Cards</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showChart}
                onChange={(e) => setShowChart(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Circular Graphe Chart</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTable}
                onChange={(e) => setShowTable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Performance Summary Table</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTopCompanies}
                onChange={(e) => setShowTopCompanies(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Top Performing Companies</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBottomCompanies}
                onChange={(e) => setShowBottomCompanies(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Lowest Rated Companies</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showQuestions}
                onChange={(e) => setShowQuestions(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Question Highlights (Top 5)</span>
            </label>
          </div>
        </div>

        {/* Warning if no categories selected */}
        {activeTypes.length === 0 && (
          <div className="flex gap-2.5 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>Select at least one survey category to populate summary statistics.</span>
          </div>
        )}
      </aside>

      {/* 2. Live Document Sheet Preview */}
      <main className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Export action bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Eye size={16} />
            <span>Document Preview Mode (Interactive Sheet Layout)</span>
          </div>

          <div className="flex gap-2 self-end relative" ref={menuRef}>
            {canExport ? (
              <>
                <button
                  type="button"
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  disabled={activeTypes.length === 0 || isExporting !== null}
                  className="primary-button inline-flex items-center gap-2"
                >
                  <Download size={15} />
                  <span>Export Report</span>
                  <ChevronDown size={14} />
                </button>

                {exportMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => handleExport('pdf')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <FileText size={15} className="text-red-500" /> Export PDF Document
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('csv')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Table2 size={15} className="text-blue-500" /> Export CSV Spreadsheet
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('excel')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <FileType size={15} className="text-emerald-500" /> Export Excel Worksheet
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 px-3 py-2 rounded-lg">
                ⚠️ Exporting restricted to Supervisor and above
              </span>
            )}
          </div>
        </div>

        {/* The Paper Sheets - one block per actual PDF page, so what's shown here always matches what Export PDF produces */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl p-4 md:p-8 overflow-y-auto max-h-[800px] border border-slate-200/50 dark:border-slate-800/40">
          <div className="mx-auto flex flex-col items-center gap-10">
            {/* Page 1 - Cover. Header sits near the top and the confidential
                footer sits near the bottom (matching the PDF's fixed y-coordinates)
                rather than centering the whole block, which would spread the
                blank space evenly instead of concentrating it in the middle. */}
            <SummaryPagedSheet pageLabel="Page 1 · Cover">
              <div className="flex h-full flex-col items-center px-4 text-center">
                <div className="pt-[16%]">
                  <img src={LOGO_URL} alt="Microgenesis" className="mx-auto h-14 w-auto" referrerPolicy="no-referrer" />
                  <div className="mx-auto mt-7 h-px w-20 bg-[#0063a9]" />
                  <h1 className="mt-7 text-2xl font-bold text-slate-800 dark:text-slate-100">Summary Report</h1>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">MBS Partner Evaluation System</p>

                  <div className="mt-14 w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 p-5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Report Specifications:</p>
                    <div className="mt-2.5 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <p><span className="font-semibold text-slate-700 dark:text-slate-200">Active Survey Types:</span> {activeTypes.join(', ') || 'None selected'}</p>
                      <p><span className="font-semibold text-slate-700 dark:text-slate-200">Total Submitted Surveys Count:</span> {summary.totalResponses} submissions</p>
                      <p><span className="font-semibold text-slate-700 dark:text-slate-200">Average System-wide Score:</span> {formatNumber(summary.averageRating)}%</p>
                      <p><span className="font-semibold text-slate-700 dark:text-slate-200">Generated On:</span> {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-auto pb-[3%] text-[10px] text-slate-400 dark:text-slate-500">
                  Microgenesis Supplier Management System — Confidential
                </p>
              </div>
            </SummaryPagedSheet>

            {/* Page 2 - KPIs, chart, performance table */}
            <SummaryPagedSheet pageLabel="Page 2" footerPage="Page 1">
              <SummaryPageHeader />
              <h2 className="mt-6 text-lg font-bold text-slate-900 dark:text-white">System-wide Evaluation Overview</h2>

              {showKpis && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <span className="block text-lg font-bold text-[#0063a9]">{summary.totalResponses}</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Submitted Evaluations</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <span className="block text-lg font-bold text-[#0063a9]">{formatNumber(summary.averageRating)}%</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Average System Score</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <span className="block text-lg font-bold text-[#0063a9]">{formatNumber(summary.overallSatisfactionScore)}%</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Overall Satisfaction Index</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <span className="block text-lg font-bold text-[#0063a9]">{formatNumber(summary.naPercentage)}%</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">N/A Answer Frequency Rate</span>
                  </div>
                </div>
              )}

              {/* Dynamic Circular Graph section */}
              {showChart && activeTypes.length > 0 && (
                <div className="mt-5">
                  <h4 className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                    Survey Performance Metrics Map ({chartMetric === 'responses' ? 'Submissions Volume' : 'Average Score %'})
                  </h4>

                  {/* Captured chart wrapper */}
                  <div ref={chartWrapperRef} className="mx-auto w-full max-w-[340px] flex flex-col items-center bg-white dark:bg-slate-950">
                    <div className="relative w-full h-[170px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={72}
                            paddingAngle={5}
                            dataKey="value"
                            // Renders immediately instead of animating in - guarantees the
                            // chart is fully drawn the instant captureChartImage/html2canvas
                            // grabs it for the PDF export, rather than racing an in-progress entrance animation.
                            isAnimationActive={false}
                          >
                            {chartData.map((entry) => (
                              <Cell
                                key={`cell-${entry.name}`}
                                fill={COLORS[entry.name as SurveyType] || '#CBD5E1'}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any, name: any, props: any) => [
                              props.payload.formattedValue,
                              name,
                            ]}
                            contentStyle={{
                              background: '#1e293b',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#f8fafc',
                              fontSize: '11px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Donut-hole readout: the headline number, visible without hovering
                          over a slice - essential since the static PDF capture can't show tooltips. */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-black text-[#0063a9] dark:text-blue-400 leading-none">
                          {chartCenterValue}
                        </span>
                        <span className="mt-1 max-w-[76px] whitespace-normal px-1 text-center text-[7px] font-bold uppercase leading-tight tracking-wide text-slate-400">
                          {chartCenterLabel}
                        </span>
                      </div>
                    </div>
                    {/* Per-type breakdown - pairs each slice's color with its name and
                        exact number, since recharts' Pie label render function silently
                        drops every sector in this app's recharts version. */}
                    <div className="w-full grid grid-cols-3 gap-2 mt-1">
                      {chartData.map((entry) => {
                        const color = COLORS[entry.name as SurveyType] || '#CBD5E1';
                        return (
                          <div
                            key={entry.name}
                            className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-2 py-2"
                          >
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                              {entry.name}
                            </span>
                            <span className="text-sm font-black" style={{ color }}>
                              {chartMetric === 'responses' ? entry.value : `${formatNumber(entry.value)}%`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Summary Table */}
              {showTable && activeTypes.length > 0 && (
                <div className="mt-5 space-y-2">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Survey Category Performance Table</h3>
                  <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-[#0063a9] text-white">
                          <th className="px-3 py-1.5 font-bold">Survey Category</th>
                          <th className="px-3 py-1.5 font-bold text-center">Average Score</th>
                          <th className="px-3 py-1.5 font-bold text-center">Total Submissions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {surveyPerformance.map((row, index) => (
                          <tr
                            key={row.surveyType}
                            className={index % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/20' : 'bg-white dark:bg-slate-900'}
                          >
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 font-semibold">{row.surveyType}</td>
                            <td className="px-3 py-1.5 text-center text-slate-800 dark:text-slate-100 font-extrabold">{formatCompositeScore(row.surveyType, row.average).text}</td>
                            <td className="px-3 py-1.5 text-center text-slate-600 dark:text-slate-400">{row.responses}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SummaryPagedSheet>

            {/* Page 3 - Partner Performance & Question Highlights (only exists in the PDF if at least one of these sections is on) */}
            {hasExtraSections && (
              <SummaryPagedSheet pageLabel="Page 3" footerPage="Page 2">
                <SummaryPageHeader />
                <h2 className="mt-6 text-lg font-bold text-slate-900 dark:text-white">Partner Performance &amp; Question Highlights</h2>

                {showTopCompanies && topCompanies.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">
                      <Award size={14} className="text-emerald-500" />
                      <span>Highest Rated Evaluated Companies</span>
                    </h3>
                    <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-lg text-[10px]">
                      <table className="w-full text-left">
                        <thead className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 font-bold">
                          <tr>
                            <th className="px-3 py-1.5">Rank</th>
                            <th className="px-3 py-1.5">Company Name</th>
                            <th className="px-3 py-1.5">Survey Type</th>
                            <th className="px-3 py-1.5 text-center">Volume-Weighted Score</th>
                            <th className="px-3 py-1.5 text-center">Evaluations Count</th>
                            <th className="px-3 py-1.5 text-center">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topCompanies.map((row, idx) => {
                            const band = getBand(row.surveyType, row.average);
                            return (
                              <tr key={`${row.surveyType}:${row.company}`} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-900/20' : 'bg-white dark:bg-slate-950'}>
                                <td className="px-3 py-1 font-bold text-emerald-600 dark:text-emerald-400">#{idx + 1}</td>
                                <td className="px-3 py-1 font-semibold text-slate-800 dark:text-slate-200">{row.company}</td>
                                <td className="px-3 py-1 text-slate-500">{row.surveyType}</td>
                                <td className="px-3 py-1 text-center font-bold text-slate-700 dark:text-slate-300">{formatCompositeScore(row.surveyType, row.average).text}</td>
                                <td className="px-3 py-1 text-center text-slate-500">{row.evaluations}</td>
                                <td className="px-3 py-1 text-center">
                                  <span className="badge" style={{ backgroundColor: `${band.hex}1a`, color: band.hex }}>{getRemarkText(band)}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {showBottomCompanies && leastRatedCompanies.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">
                      <AlertTriangle size={14} className="text-rose-500" />
                      <span>Lowest Rated Evaluated Companies</span>
                    </h3>
                    <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-lg text-[10px]">
                      <table className="w-full text-left">
                        <thead className="bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 font-bold">
                          <tr>
                            <th className="px-3 py-1.5">Rank</th>
                            <th className="px-3 py-1.5">Company Name</th>
                            <th className="px-3 py-1.5">Survey Type</th>
                            <th className="px-3 py-1.5 text-center">Volume-Weighted Score</th>
                            <th className="px-3 py-1.5 text-center">Evaluations Count</th>
                            <th className="px-3 py-1.5 text-center">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leastRatedCompanies.map((row, idx) => {
                            const band = getBand(row.surveyType, row.average);
                            return (
                              <tr key={`${row.surveyType}:${row.company}`} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-900/20' : 'bg-white dark:bg-slate-950'}>
                                <td className="px-3 py-1 font-bold text-rose-600 dark:text-rose-400">#{companyPerformance.length - idx}</td>
                                <td className="px-3 py-1 font-semibold text-slate-800 dark:text-slate-200">{row.company}</td>
                                <td className="px-3 py-1 text-slate-500">{row.surveyType}</td>
                                <td className="px-3 py-1 text-center font-bold text-slate-700 dark:text-slate-300">{formatCompositeScore(row.surveyType, row.average).text}</td>
                                <td className="px-3 py-1 text-center text-slate-500">{row.evaluations}</td>
                                <td className="px-3 py-1 text-center">
                                  <span className="badge" style={{ backgroundColor: `${band.hex}1a`, color: band.hex }}>{getRemarkText(band)}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {showQuestions && questionRows.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">
                      <HelpCircle size={14} className="text-slate-500" />
                      <span>Question Performance Highlights</span>
                    </h3>
                    <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-lg text-[10px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                          <tr>
                            <th className="px-3 py-1.5">Question Rating Highlight</th>
                            <th className="px-3 py-1.5 text-center">Average Rating (%)</th>
                            <th className="px-3 py-1.5 text-center">Response Submissions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questionRows.map((row, idx) => (
                            <tr key={row.question} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-900/20' : 'bg-white dark:bg-slate-950'}>
                              <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300 font-medium leading-relaxed">{row.question}</td>
                              <td className="px-3 py-1.5 text-center font-extrabold text-[#0063a9]">{formatNumber(row.average)}%</td>
                              <td className="px-3 py-1.5 text-center text-slate-500">{row.responses}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </SummaryPagedSheet>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** One A4-proportioned sheet in the print preview, styled like the actual PDF page. */
function SummaryPagedSheet({ children, pageLabel, footerPage }: { children: ReactNode; pageLabel: string; footerPage?: string }) {
  const PAGE_WIDTH = 640;
  const PAGE_HEIGHT = Math.round(PAGE_WIDTH * (297 / 210)); // A4 aspect ratio
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full rounded-sm bg-white shadow-xl ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10"
        style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, maxWidth: '100%' }}
      >
        <div className="flex h-full flex-col px-4 py-6 sm:px-12 sm:py-9">
          <div className="flex-1">{children}</div>
          {footerPage && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <span>Microgenesis Supplier Management System — Confidential</span>
              <span>{footerPage}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">{pageLabel}</p>
    </div>
  );
}

/** Repeating page header (logo + report name) shown at the top of every content page, mirroring `addHeaderAndFooter` in the PDF export. */
function SummaryPageHeader() {
  return (
    <div className="flex items-start justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
      <img src={LOGO_URL} alt="Microgenesis Logo" className="h-9 w-auto object-contain" referrerPolicy="no-referrer" />
      <div className="text-right">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Summary Report</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">MBS Partner Evaluation System</p>
      </div>
    </div>
  );
}
