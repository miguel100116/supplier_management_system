import { exportTablesAsWord } from '../features/reports/services/exporters';
import { saveReportDownload } from '../features/reports/services/exportHistory';
import type { ReportParameters } from '../features/reports/domain/reportHistory';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  Settings,
  CheckCircle2,
  Plus,
  Trash2,
  Edit3,
  FileBarChart,
  FileSpreadsheet,
  Zap,
  Sparkles,
  Info
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
  Legend
} from 'recharts';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { getQuestionMaxPoints, surveyTypeDisplayLabel, getRemarkText } from '../data/questionWeights';
import { isOverallCategory } from '../data/questionCategories';
import {
  formatNumber,
  getKpiSummary,
  averageBySurveyType,
  numericRating,
  submissionScores,
} from '../features/analytics/domain/analytics';
import { formatAnalyticsScore, getAnalyticsBand, getAnalyticsCompanyRankings } from '../features/analytics/domain/rankings';
import { getEvaluatedCompanyNames } from '../features/reports/domain/reportContent';

interface ExecutiveSummaryReportBuilderPageProps {
  responses: SurveyResponse[];
  rankingResponses?: SurveyResponse[];
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
const LOGO_ASPECT = 498 / 1921; // height / width

const COLORS = {
  Courier: '#0063a9',
  Supplier: '#0ea5e9',
  Subcontractor: '#14b8a6',
};

export function ExecutiveSummaryReportBuilderPage({
  responses,
  rankingResponses = responses,
  partnerCompanies,
  canExport = false,
  onBack,
  initialSettings = {},
}: ExecutiveSummaryReportBuilderPageProps) {
  // Option States
  const [selectedTypes, setSelectedTypes] = useState<Record<SurveyType, boolean>>(initialSettings.selectedTypes ?? ({
    Courier: true,
    Supplier: true,
    Subcontractor: true,
  }));

  const [questionThreshold, setQuestionThreshold] = useState<number>(initialSettings.questionThreshold ?? 85); // filter questions below this score
  const [showCoverPage, setShowCoverPage] = useState(initialSettings.showCoverPage ?? true);
  const [showKpis, setShowKpis] = useState(initialSettings.showKpis ?? true);
  const [showChart, setShowChart] = useState(initialSettings.showChart ?? true);
  const [showSurveyTable, setShowSurveyTable] = useState(initialSettings.showSurveyTable ?? true);
  const [showQuestionTable, setShowQuestionTable] = useState(initialSettings.showQuestionTable ?? true);
  const [showCompanyRankings, setShowCompanyRankings] = useState(initialSettings.showCompanyRankings ?? true);
  const [showRecommendations, setShowRecommendations] = useState(initialSettings.showRecommendations ?? true);
  const [showCustomNotes, setShowCustomNotes] = useState(initialSettings.showCustomNotes ?? true);
  const [showDetailedQuestionReport, setShowDetailedQuestionReport] = useState(initialSettings.showDetailedQuestionReport ?? true);

  const [preparedBy, setPreparedBy] = useState(initialSettings.preparedBy ?? 'Executive Operations Team');
  const [customNotesText, setCustomNotesText] = useState(initialSettings.customNotesText ?? '');

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'csv' | 'excel' | 'docx' | null>(null);
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
    setSelectedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const activeTypes = ALL_SURVEY_TYPES.filter((type) => selectedTypes[type]);

  // Filtered responses based on selection
  const filteredResponses = useMemo(() => {
    return responses.filter((r) => selectedTypes[r.surveyType]);
  }, [responses, selectedTypes]);

  const filteredRankingResponses = useMemo(
    () => rankingResponses.filter((response) => selectedTypes[response.surveyType]),
    [rankingResponses, selectedTypes],
  );

  // Analytics based on filtered responses
  const summary = useMemo(() => getKpiSummary(filteredResponses), [filteredResponses]);
  const surveyPerformance = useMemo(() => averageBySurveyType(filteredResponses), [filteredResponses]);

  // Company ranking lists
  const companyPerformance = useMemo(
    () => getAnalyticsCompanyRankings(filteredRankingResponses, activeTypes).map((ranking) => ({
      company: ranking.name,
      surveyType: ranking.type,
      average: ranking.rankScore,
      evaluations: ranking.count,
    })),
    [filteredRankingResponses, activeTypes],
  );
  const topCompanies = companyPerformance;

  // Question Performance Stats
  const questionStats = useMemo(() => {
    const list: QuestionStats[] = [];

    // Group responses by surveyType & questionId
    const groups = new Map<string, { questionText: string; surveyType: SurveyType; category: string; responses: SurveyResponse[] }>();

    filteredResponses.forEach((r) => {
      if (isOverallCategory(r.questionCategory) || r.questionId.includes('OVERALL-FEEDBACK')) return;
      const key = `${r.surveyType}::${r.questionId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          questionText: r.question,
          surveyType: r.surveyType,
          category: r.questionCategory || '',
          responses: [],
        });
      }
      groups.get(key)!.responses.push(r);
    });

    groups.forEach((group, key) => {
      const [surveyType, questionId] = key.split('::');
      const validRatings = group.responses
        .map((r) => numericRating(r.rating))
        .filter((rating): rating is number => rating !== null);

      if (validRatings.length === 0) return;

      const maxPoints = getQuestionMaxPoints(surveyType as SurveyType, questionId);
      const overallAvgRaw = validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length;
      const overallAvg = maxPoints > 0 ? (overallAvgRaw / maxPoints) * 100 : 0;

      // Group by company
      const companyRatings = new Map<string, number[]>();
      group.responses.forEach((r) => {
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
        category: group.category,
        surveyType: surveyType as SurveyType,
        average: overallAvg,
        responsesCount: validRatings.length,
        highestCompany: highest,
        lowestCompany: lowest,
      });
    });

    return list.sort((a, b) => b.average - a.average);
  }, [filteredResponses]);

  // Questions filtered by threshold (e.g., show those that are less than threshold to flag them as key areas of improvement, or ranked)
  const criticalQuestions = useMemo(() => {
    return questionStats.filter((q) => q.average < questionThreshold).slice(0, 8);
  }, [questionStats, questionThreshold]);

  // Resolve Evaluated Companies for each survey type
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

  // Compute dynamic stats per question for each survey type
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
          category: surveyType,
          surveyType,
          average: overallAvg,
          responsesCount: validRatings.length,
          highestCompany: highest,
          lowestCompany: lowest,
        });
      });

      map[surveyType] = list.sort((a, b) => b.average - a.average);
    });

    return map;
  }, [responses]);

  // Automated Strategic Action Items based on actual data
  const generatedRecommendations = useMemo(() => {
    const items: { type: 'alert' | 'success' | 'action'; title: string; text: string }[] = [];
    const scoredTypes = new Set(submissionScores(filteredResponses).map((submission) => submission.surveyType));
    if (!scoredTypes.size) return items;

    // General average score check
    if (summary.averageRating >= 85) {
      items.push({
        type: 'success',
        title: 'Strong Operational Base',
        text: `The aggregate system rating of ${formatNumber(summary.averageRating)}% represents healthy operational delivery. Retain current supplier SLA guidelines and focus on periodic wellness audits.`,
      });
    } else {
      items.push({
        type: 'alert',
        title: 'Core Performance Advisory',
        text: `The general system-wide score is ${formatNumber(summary.averageRating)}%. Operations management should initiate structured monthly reviews for least performing divisions.`,
      });
    }

    // Survey Type Outliers
    if (surveyPerformance.length > 0) {
      const sortedPerformance = surveyPerformance.filter((row) => scoredTypes.has(row.surveyType)).sort((a, b) => a.average - b.average);
      const lowestCat = sortedPerformance[0];
      const highestCat = sortedPerformance[sortedPerformance.length - 1];

      if (lowestCat && lowestCat.average < 80) {
        items.push({
          type: 'alert',
          title: `Focus Required on ${lowestCat.surveyType} Category`,
          text: `Average rating for "${lowestCat.surveyType}" is lagging at ${formatAnalyticsScore(lowestCat.surveyType, lowestCat.average)}. Priority should be given to identifying root workflow bottlenecks in this division.`,
        });
      }

      if (highestCat && highestCat.average >= 88) {
        items.push({
          type: 'success',
          title: `Benchmark Set by ${highestCat.surveyType} Division`,
          text: `The ${highestCat.surveyType} group is outstanding with an average rating of ${formatAnalyticsScore(highestCat.surveyType, highestCat.average)}. We recommend documenting their workflow practices to establish a standard company-wide template.`,
        });
      }
    }

    // Question highlights
    const worstQuestion = questionStats[questionStats.length - 1];
    if (worstQuestion && worstQuestion.average < 75) {
      items.push({
        type: 'action',
        title: 'Targeted Core Competency Action',
        text: `The query "${worstQuestion.questionText}" scored critically low (${formatNumber(worstQuestion.average)}%). Initiating targeted corrective action programs is advised for partners evaluated in this section.`,
      });
    }

    // Least performing company action
    const worstCompany = companyPerformance.at(-1);
    if (worstCompany && worstCompany.average < 70) {
      items.push({
        type: 'action',
        title: `Supplier SLA Review Required`,
        text: `"${worstCompany.company}" stands as the lowest ranked evaluated partner with a score of ${formatAnalyticsScore(worstCompany.surveyType, worstCompany.average)}. Initiate formal communication regarding performance improvement targets.`,
      });
    }

    return items;
  }, [summary, surveyPerformance, questionStats, companyPerformance, filteredResponses]);

  // Recharts Chart Data
  const chartData = useMemo(() => {
    return surveyPerformance
      .map((row) => ({
        name: row.surveyType,
        value: row.responses,
        formattedValue: `${row.responses} submissions`,
      }))
      .filter((row) => row.value > 0);
  }, [surveyPerformance]);

  // Captures the live donut chart (chartWrapperRef) as a PNG for embedding in the PDF export.
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

  // Reads the real pixel dimensions of a captured PNG so it can be embedded at
  // its true aspect ratio - a hardcoded guessed ratio stretches/squashes the
  // chart whenever the live wrapper's actual proportions differ from the guess.
  const dataUrlDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 180 });
      img.onerror = () => resolve({ width: 300, height: 180 });
      img.src = dataUrl;
    });
  };

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
    setExportMenuOpen(false);
    try {
      const recipe = { kind: 'executive' as const, parameters: { selectedTypes, questionThreshold, showCoverPage, showKpis, showChart, showSurveyTable, showQuestionTable, showCompanyRankings, showRecommendations, showCustomNotes, showDetailedQuestionReport, preparedBy, customNotesText } };

      const reportTitle = 'Executive Briefing & Performance Report';


      const tables: { title: string; columns: string[]; rows: (string | number)[][] }[] = [];

      // 1. Core KPIs Table
      if (showKpis) {
        tables.push({
          title: 'Executive KPI Metrics',
          columns: ['KPI Metric', 'Measurement'],
          rows: [
            ['Total Responses', summary.totalResponses],
            ['Average Rating Score', `${formatNumber(summary.averageRating)}%`],
            ['Satisfaction Index Score', `${formatNumber(summary.overallSatisfactionScore)}%`],
            ['N/A Frequency Rate', `${formatNumber(summary.naPercentage)}%`],
            ['Highest Rated Core Question', summary.highestRatedQuestion],
            ['Lowest Rated Core Question', summary.lowestRatedQuestion],
          ],
        });
      }

      // 2. Division Breakdown Table
      if (showSurveyTable) {
        tables.push({
          title: 'Survey Division Breakdown',
          columns: ['Survey Category', 'Average Score', 'Total Submissions'],
          rows: surveyPerformance.map((r) => [r.surveyType, formatAnalyticsScore(r.surveyType, r.average), r.responses]),
        });
      }

      // 3. Question highlights table
      if (showQuestionTable && criticalQuestions.length > 0) {
        tables.push({
          title: `Question Benchmarks (Threshold < ${questionThreshold}%)`,
          columns: ['Question Heading', 'Division', 'Score Average (%)', 'Highest Rated Partner', 'Lowest Rated Partner'],
          rows: criticalQuestions.map((r) => [
            r.questionText,
            r.surveyType,
            formatNumber(r.average),
            r.highestCompany ? `${r.highestCompany.company} (${formatNumber(r.highestCompany.score)}%)` : 'N/A',
            r.lowestCompany ? `${r.lowestCompany.company} (${formatNumber(r.lowestCompany.score)}%)` : 'N/A',
          ]),
        });
      }

      // 4. Partner Rankings
      if (showCompanyRankings) {
        tables.push({
          title: 'Company Rankings (Highest to Lowest)',
          columns: ['Partner Company', 'Survey Type', 'Leaderboard Score', 'Responses', 'Remarks'],
          rows: topCompanies.map((r) => [r.company, r.surveyType, formatAnalyticsScore(r.surveyType, r.average), r.evaluations, getRemarkText(getAnalyticsBand(r.surveyType, r.average))]),
        });

      }

      // 5. Strategic recommendations
      if (showRecommendations) {
        tables.push({
          title: 'Automated Action Guidelines',
          columns: ['Action Focus', 'Guideline Detail'],
          rows: generatedRecommendations.map((r) => [r.title, r.text]),
        });
      }

      // 6. Detailed Question Reports
      if (showDetailedQuestionReport) {
        const sortedActiveTypes = (['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]).filter(t => activeTypes.includes(t));
        sortedActiveTypes.forEach((type) => {
          const label = surveyTypeDisplayLabel[type];
          const questionsList = statsByType[type];
          tables.push({
            title: `${label} Questions`,
            columns: ['Question', 'Average Score (%)', 'Responses', 'Highest Scoring Company', 'Lowest Scoring Company'],
            rows: questionsList.map((row) => [
              row.questionText,
              `${formatNumber(row.average)}%`,
              row.responsesCount,
              row.highestCompany ? `${row.highestCompany.company} (${formatNumber(row.highestCompany.score)}%)` : 'N/A',
              row.lowestCompany ? `${row.lowestCompany.company} (${formatNumber(row.lowestCompany.score)}%)` : 'N/A',
            ]),
          });
        });
      }

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
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const marginLeft = 48;
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const contentWidth = pageWidth - marginLeft * 2;
        const logoDataUrl = await fetchLogoDataUrl();

        // COVER PAGE
        if (showCoverPage) {
          if (logoDataUrl) {
            const coverLogoWidth = 190;
            const coverLogoHeight = coverLogoWidth * LOGO_ASPECT;
            doc.addImage(logoDataUrl, 'PNG', (pageWidth - coverLogoWidth) / 2, 160, coverLogoWidth, coverLogoHeight);
          }

          doc.setDrawColor(...BRAND);
          doc.setLineWidth(1.5);
          doc.line(pageWidth / 2 - 80, 245, pageWidth / 2 + 80, 245);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(22);
          doc.setTextColor(30);
          doc.text('Executive Briefing Report', pageWidth / 2, 280, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(100);
          doc.text('MBS Partner Comprehensive Evaluation & Diagnostics', pageWidth / 2, 302, { align: 'center' });

          // Metadata block on cover page
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft + 30, 360, contentWidth - 60, 150, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(70);
          doc.text('EXECUTIVE DOSSIER DETAILS:', marginLeft + 50, 390);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100);
          doc.text(`Prepared For:  MBS Stakeholder Operations Steering Committee`, marginLeft + 50, 412);
          doc.text(`Prepared By:   ${preparedBy || 'Operations Team'}`, marginLeft + 50, 429);
          doc.text(`Divisions:     ${activeTypes.join(', ') || 'None selected'}`, marginLeft + 50, 446);
          doc.text(`Sample Size:   ${summary.totalResponses} submitted surveys`, marginLeft + 50, 463);
          doc.text(`System Rating: ${formatNumber(summary.averageRating)}% benchmark`, marginLeft + 50, 480);
          doc.text(`Date Issued:   ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, marginLeft + 50, 497);

          // Footer on Cover
          doc.setFontSize(8);
          doc.setTextColor(140);
          doc.text('Microgenesis Supplier Management System — Strictly Confidential', pageWidth / 2, pageHeight - 35, { align: 'center' });
        }

        // REPORT PAGES SETUP
        let pageIndex = showCoverPage ? 2 : 1;
        const addHeaderAndFooter = (pdfDoc: jsPDF) => {
          if (showCoverPage || pageIndex > 1) {
            pdfDoc.addPage();
          }

          // Header
          if (logoDataUrl) {
            pdfDoc.addImage(logoDataUrl, 'PNG', marginLeft, 20, 100, 100 * LOGO_ASPECT);
          }
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setFontSize(9);
          pdfDoc.setTextColor(30);
          pdfDoc.text('Executive Briefing Report', pageWidth - marginLeft, 32, { align: 'right' });
          pdfDoc.setFont('helvetica', 'normal');
          pdfDoc.setTextColor(130);
          pdfDoc.text('MBS Partner Evaluation System', pageWidth - marginLeft, 44, { align: 'right' });

          pdfDoc.setDrawColor(226, 232, 240);
          pdfDoc.setLineWidth(0.75);
          pdfDoc.line(marginLeft, 72, pageWidth - marginLeft, 72);

          // Footer
          pdfDoc.setFontSize(8);
          pdfDoc.setTextColor(140);
          pdfDoc.text('Microgenesis Supplier Management System — Strictly Confidential', marginLeft, pageHeight - 20);
          pdfDoc.text(`Page ${pageIndex}`, pageWidth - marginLeft, pageHeight - 20, { align: 'right' });
          pageIndex++;
        };

        // START CONTENT
        addHeaderAndFooter(doc);
        let cursorY = 95;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(20);
        doc.text('1. Operational Overview & KPIs', marginLeft, cursorY);
        cursorY += 18;

        // KPI summary 2x2 layout
        if (showKpis) {
          const gridColWidth = contentWidth / 2 - 10;

          // Row 1
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft, cursorY, gridColWidth, 45, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor(...BRAND);
          doc.text(String(summary.totalResponses), marginLeft + 15, cursorY + 22);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text('TOTAL SUBMITTED SURVEY EVALUATIONS', marginLeft + 15, cursorY + 35);

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft + gridColWidth + 20, cursorY, gridColWidth, 45, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor(...BRAND);
          doc.text(`${formatNumber(summary.averageRating)}%`, marginLeft + gridColWidth + 35, cursorY + 22);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text('AVERAGE SYSTEM COMPLIANCE SCORE', marginLeft + gridColWidth + 35, cursorY + 35);

          cursorY += 55;

          // Row 2
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft, cursorY, gridColWidth, 45, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor(...BRAND);
          doc.text(`${formatNumber(summary.overallSatisfactionScore)}%`, marginLeft + 15, cursorY + 22);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text('OVERALL PARTNER SATISFACTION INDEX', marginLeft + 15, cursorY + 35);

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.rect(marginLeft + gridColWidth + 20, cursorY, gridColWidth, 45, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor(...BRAND);
          doc.text(`${formatNumber(summary.naPercentage)}%`, marginLeft + gridColWidth + 35, cursorY + 22);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text('N/A RELEVANCY FREQUENCY RATE', marginLeft + gridColWidth + 35, cursorY + 35);

          cursorY += 60;
        }

        // Submissions volume chart (captured from the live donut chart)
        if (showChart && chartData.length > 0) {
          const chartDataUrl = await captureChartImage();
          if (chartDataUrl) {
            if (cursorY > pageHeight - 200) {
              addHeaderAndFooter(doc);
              cursorY = 95;
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(30);
            doc.text('Submissions Volume Share', marginLeft, cursorY);
            cursorY += 12;
            const { width: natW, height: natH } = await dataUrlDimensions(chartDataUrl);
            const targetWidth = contentWidth * 0.5;
            const targetHeight = (natH / natW) * targetWidth;
            doc.addImage(chartDataUrl, 'PNG', marginLeft + (contentWidth - targetWidth) / 2, cursorY, targetWidth, targetHeight);
            cursorY += targetHeight + 20;
          }
        }

        // Division break table
        if (showSurveyTable && surveyPerformance.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(30);
          doc.text('Survey Division Breakdown Summary', marginLeft, cursorY);
          cursorY += 10;

          const tableHeaders = ['Survey Division Category', 'Average Score', 'Total Submitted Responses'];
          const tableRows = surveyPerformance.map((row) => [
            row.surveyType,
            formatAnalyticsScore(row.surveyType, row.average),
            String(row.responses),
          ]);

          autoTable(doc, {
            startY: cursorY,
            head: [tableHeaders],
            body: tableRows,
            margin: { left: marginLeft, right: marginLeft },
            styles: { fontSize: 8.5, cellPadding: 4.5 },
            headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 25;
        }

        // Custom Executive Notes
        if (showCustomNotes && customNotesText) {
          if (cursorY > pageHeight - 140) {
            addHeaderAndFooter(doc);
            cursorY = 95;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(30);
          doc.text('Executive Analyst Commentary', marginLeft, cursorY);
          cursorY += 10;

          doc.setFillColor(254, 254, 255);
          doc.setDrawColor(14, 165, 233);
          doc.setLineWidth(1);
          doc.rect(marginLeft, cursorY, contentWidth, 55, 'FD');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(60);

          const splitLines = doc.splitTextToSize(customNotesText, contentWidth - 24);
          doc.text(splitLines, marginLeft + 12, cursorY + 16);

          cursorY += 70;
        }

        // Critical Question analysis
        if (showQuestionTable && criticalQuestions.length > 0) {
          if (cursorY > pageHeight - 160) {
            addHeaderAndFooter(doc);
            cursorY = 95;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(20);
          doc.text('2. Critical Area Diagnostics (Questions Ranked)', marginLeft, cursorY);
          cursorY += 14;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(110);
          doc.text(`Showing evaluating questions with composite score benchmarks under ${questionThreshold}% threshold.`, marginLeft, cursorY);
          cursorY += 12;

          const qHeaders = ['Evaluating Query Focus', 'Division', 'Rating', 'Highest Scoring Partner', 'Lowest Scoring Partner'];
          const qRows = criticalQuestions.map((q) => [
            q.questionText,
            q.surveyType,
            `${formatNumber(q.average)}%`,
            q.highestCompany ? `${q.highestCompany.company} (${formatNumber(q.highestCompany.score)}%)` : 'N/A',
            q.lowestCompany ? `${q.lowestCompany.company} (${formatNumber(q.lowestCompany.score)}%)` : 'N/A',
          ]);

          autoTable(doc, {
            startY: cursorY,
            head: [qHeaders],
            body: qRows,
            margin: { left: marginLeft, right: marginLeft },
            styles: { fontSize: 7.5, cellPadding: 4 },
            headStyles: { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' }, // amber/orange focus
            alternateRowStyles: { fillColor: [254, 243, 199] }, // light amber rows
            // Mirrors the preview's per-row severity badge on the Rating column:
            // red for critically low scores, amber otherwise.
            didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 2) {
                const q = criticalQuestions[data.row.index];
                if (q) {
                  if (q.average < 75) {
                    data.cell.styles.textColor = [220, 38, 38];
                    data.cell.styles.fontStyle = 'bold';
                  } else {
                    data.cell.styles.textColor = [180, 83, 9];
                    data.cell.styles.fontStyle = 'bold';
                  }
                }
              }
            },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 25;
        }

        // All companies in the canonical descending leaderboard order.
        if (showCompanyRankings && topCompanies.length > 0) {
          if (cursorY > pageHeight - 220) { addHeaderAndFooter(doc); cursorY = 95; }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(20);
          doc.text('3. Company Rankings (Highest to Lowest)', marginLeft, cursorY);
          autoTable(doc, {
            startY: cursorY + 20,
            head: [['Rank', 'Partner Company', 'Survey Type', 'Leaderboard Score', 'Responses', 'Remarks']],
            body: topCompanies.map((row, index) => [index + 1, row.company, row.surveyType,
              formatAnalyticsScore(row.surveyType, row.average), row.evaluations, getRemarkText(getAnalyticsBand(row.surveyType, row.average))]),
            margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
            styles: { fontSize: 8, cellPadding: 4 },
            headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
          });
          cursorY = (doc as any).lastAutoTable.finalY + 30;
        }

        // Recommendations
        if (showRecommendations && generatedRecommendations.length > 0) {
          if (cursorY > pageHeight - 180) {
            addHeaderAndFooter(doc);
            cursorY = 95;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(20);
          doc.text('4. Strategic Action Guidelines', marginLeft, cursorY);
          cursorY += 20;

          const recHeaders = ['Priority Area / Alert Title', 'Specific Strategic Instruction Detail'];
          const recRows = generatedRecommendations.map((r) => [r.title, r.text]);

          autoTable(doc, {
            startY: cursorY,
            head: [recHeaders],
            body: recRows,
            margin: { left: marginLeft, right: marginLeft },
            styles: { fontSize: 8, cellPadding: 4.5 },
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' }, // indigo theme
            // Mirrors the preview's RETAIN/REVIEW/ACTION badge coloring per recommendation type.
            didParseCell: (data) => {
              if (data.section !== 'body') return;
              const rec = generatedRecommendations[data.row.index];
              if (!rec) return;
              if (rec.type === 'success') {
                data.cell.styles.fillColor = [209, 250, 229];
                data.cell.styles.textColor = [4, 120, 87];
              } else if (rec.type === 'alert') {
                data.cell.styles.fillColor = [254, 243, 199];
                data.cell.styles.textColor = [180, 83, 9];
              } else {
                data.cell.styles.fillColor = [224, 231, 255];
                data.cell.styles.textColor = [67, 56, 202];
              }
            },
          });
        }

        // 5. Detailed Question Performance Report per-category
        if (showDetailedQuestionReport) {
          const sortedActiveTypes = (['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]).filter(t => activeTypes.includes(t));
          sortedActiveTypes.forEach((type) => {
            addHeaderAndFooter(doc);
            let cursorY = 95;

            const typeLabel = surveyTypeDisplayLabel[type];
            const companiesList = evaluatedCompaniesByType[type];
            const questionsList = statsByType[type];

            // 1. Heading
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(20);
            doc.text(`${typeLabel} Performance Evaluation`, marginLeft, cursorY);
            cursorY += 20;

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
            const tableHeaders = ['Question', 'Average Rating', 'Responses', 'Highest Scoring Partner', 'Lowest Scoring Partner'];
            const tableRows = questionsList.map((row) => [
              row.questionText,
              `${formatNumber(row.average)}%`,
              String(row.responsesCount),
              row.highestCompany ? `${row.highestCompany.company} (${formatNumber(row.highestCompany.score)}%)` : 'N/A',
              row.lowestCompany ? `${row.lowestCompany.company} (${formatNumber(row.lowestCompany.score)}%)` : 'N/A',
            ]);

            autoTable(doc, {
              startY: cursorY,
              head: [tableHeaders],
              body: tableRows,
              margin: { left: marginLeft, right: marginLeft, top: 100, bottom: 60 },
              styles: { fontSize: 8, cellPadding: 4.5 },
              headStyles: { fillColor: [0, 99, 169], textColor: 255, fontStyle: 'bold' },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              theme: 'striped',
            });
          });
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
    <div className="flex flex-col gap-5 xl:flex-row h-full min-h-[calc(100vh-140px)] animate-fade-in" id="executive-briefing-root">
      {/* 1. Sidebar Panel */}
      <aside className="w-full xl:w-80 shrink-0 space-y-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition"
            title="Go back"
            id="back-btn"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-white" id="exec-builder-title">Executive Briefing</h2>
            <p className="text-xs text-slate-400">Integrated Executive Summary & Diagnostics</p>
          </div>
        </div>

        {/* Categories checklist */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Settings size={13} />
            <span>1. Categories Included</span>
          </div>
          <div className="space-y-1.5">
            {ALL_SURVEY_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedTypes[type]}
                  onChange={() => toggleType(type)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {type} Division
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Threshold setting slider */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={13} />
              <span>2. Critical Threshold</span>
            </span>
            <span className="text-[#0063a9] font-mono font-bold text-xs">{questionThreshold}%</span>
          </div>
          <p className="text-[10px] text-slate-400">Flag questions with scores under this benchmark limit.</p>
          <input
            type="range"
            min="60"
            max="95"
            value={questionThreshold}
            onChange={(e) => setQuestionThreshold(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0063a9] dark:bg-slate-800"
            id="threshold-range"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>60%</span>
            <span>80%</span>
            <span>95%</span>
          </div>
        </div>

        {/* Custom Analyst notes */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider" htmlFor="custom-notes-input">
            <Edit3 size={13} />
            <span>3. Executive Analyst Commentary</span>
          </label>
          <input
            type="text"
            placeholder="Prepared By (e.g. Operations Committee)"
            value={preparedBy}
            onChange={(e) => setPreparedBy(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-xs bg-slate-50 dark:bg-slate-900"
            id="prepared-by-input"
          />
          <textarea
            id="custom-notes-input"
            rows={4}
            value={customNotesText}
            onChange={(e) => setCustomNotesText(e.target.value)}
            placeholder="Type observations here to merge into the printed briefing document..."
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-xs bg-slate-50 dark:bg-slate-900 leading-relaxed resize-none"
          />
        </div>

        {/* Section toggles */}
        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <ListChecks size={13} />
            <span>4. Dossier Layout Toggles</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showCoverPage}
                onChange={(e) => setShowCoverPage(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Confidential Cover Page</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showKpis}
                onChange={(e) => setShowKpis(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Core KPI Metrics Cards</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showChart}
                onChange={(e) => setShowChart(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Circular Graphe Chart</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showSurveyTable}
                onChange={(e) => setShowSurveyTable(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Survey Division Metrics</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showQuestionTable}
                onChange={(e) => setShowQuestionTable(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Ranked Question Diagnostics</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showCompanyRankings}
                onChange={(e) => setShowCompanyRankings(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Company Rankings (Highest to Lowest)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showRecommendations}
                onChange={(e) => setShowRecommendations(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Automated Action Guidelines</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showCustomNotes}
                onChange={(e) => setShowCustomNotes(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Executive Commentary Box</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={showDetailedQuestionReport}
                onChange={(e) => setShowDetailedQuestionReport(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
              />
              <span className="text-slate-600 dark:text-slate-300">Detailed Question Reports</span>
            </label>
          </div>
        </div>
      </aside>

      {/* 2. Document Preview Canvas */}
      <main className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Actions bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Eye size={16} />
            <span>Document Preview Mode (Integrated Sheet View)</span>
          </div>

          <div className="flex gap-2 self-end relative" ref={menuRef} id="exec-export-container">
            {canExport ? (
              <>
                <button
                  type="button"
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  disabled={activeTypes.length === 0 || isExporting !== null}
                  className="primary-button inline-flex items-center gap-2"
                  id="exec-export-btn"
                >
                  <Download size={15} />
                  <span>Export Executive Dossier</span>
                  <ChevronDown size={14} />
                </button>

                {exportMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
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
                    <button
                      type="button"
                      onClick={() => handleExport('docx')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <FileType size={15} className="text-[#2187CD]" /> Word (.docx)
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

        {/* Paper Container */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl p-4 md:p-8 overflow-y-auto max-h-[820px] border border-slate-200/50 dark:border-slate-800/40">
          <div className="relative mx-auto max-w-[800px] space-y-7 border border-slate-200 bg-white p-4 text-slate-800 shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:p-8 md:p-12">

            {/* Confidential Cover Page Preview if checked */}
            {showCoverPage && (
              <div className="border-b-4 border-[#0063a9] pb-8 mb-8 animate-fade-in text-center">
                <img src={LOGO_URL} alt="Microgenesis" className="mx-auto h-10 w-auto" referrerPolicy="no-referrer" />
                <div className="pt-8 pb-4">
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Executive Briefing Report</h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">MBS Partner Comprehensive Evaluation &amp; Diagnostics</p>
                </div>

                {/* Briefing stats summary table */}
                <div className="mt-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg p-5 text-left">
                  <h4 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase mb-3">Executive Dossier Details:</h4>
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <p><span className="font-semibold text-slate-400">Prepared For:</span> MBS Stakeholder Operations Steering Committee</p>
                    <p><span className="font-semibold text-slate-400">Prepared By:</span> {preparedBy || 'Operations Team'}</p>
                    <p><span className="font-semibold text-slate-400">Divisions:</span> {activeTypes.join(', ') || 'None selected'}</p>
                    <p><span className="font-semibold text-slate-400">Sample Size:</span> {summary.totalResponses} submitted surveys</p>
                    <p><span className="font-semibold text-slate-400">System Rating:</span> {formatNumber(summary.averageRating)}% benchmark</p>
                    <p><span className="font-semibold text-slate-400">Date Issued:</span> {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Main Letterhead Header */}
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <img src={LOGO_URL} alt="Microgenesis Logo" className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
              </div>
              <div className="text-right">
                <h1 className="text-xs font-extrabold tracking-wider text-[#0063a9] uppercase">Executive Briefing Report</h1>
                <p className="text-[9px] text-slate-400 mt-0.5 font-mono">MBS Partner Evaluation System</p>
              </div>
            </div>

            {/* 1. Core KPIs Section */}
            {showKpis && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-[#0063a9] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <Zap size={14} />
                  <span>1. Operational Overview &amp; KPIs</span>
                </h3>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/60 rounded-lg p-3">
                    <span className="text-lg font-black text-[#0063a9] block">{summary.totalResponses}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">Total Submitted Survey Responses</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/60 rounded-lg p-3">
                    <span className="text-lg font-black text-[#0063a9] block">{formatNumber(summary.averageRating)}%</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">Average System Compliance Score</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/60 rounded-lg p-3">
                    <span className="text-lg font-black text-[#0063a9] block">{formatNumber(summary.overallSatisfactionScore)}%</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">Overall Partner Satisfaction Index</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/60 rounded-lg p-3">
                    <span className="text-lg font-black text-[#0063a9] block">{formatNumber(summary.naPercentage)}%</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">N/A Relevancy Frequency Rate</span>
                  </div>
                </div>
              </div>
            )}

            {/* Circular graph and table combination */}
            {(showChart || showSurveyTable) && activeTypes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                {showChart && (
                  <div className="rounded-xl border border-slate-150 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/20 flex flex-col items-center justify-center">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-2">
                      Submissions Volume Share
                    </h4>
                    <div ref={chartWrapperRef} className="w-full h-[180px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={4}
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
                          />
                          <Legend verticalAlign="bottom" iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {showSurveyTable && (
                  <div className="flex flex-col justify-center">
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                      Survey Division Breakdown Summary
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-[10px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Survey Division Category</th>
                            <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px] text-right">Average Score</th>
                            <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px] text-right">Total Submitted Responses</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                          {surveyPerformance.map((row) => (
                            <tr key={row.surveyType} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                              <td className="p-2 font-medium">{row.surveyType}</td>
                              <td className="p-2 text-right font-semibold text-[#0063a9]">{formatAnalyticsScore(row.surveyType, row.average)}</td>
                              <td className="p-2 text-right text-slate-500">{row.responses}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Custom Commentary Box inside preview */}
            {showCustomNotes && customNotesText && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Executive Analyst Commentary
                </h4>
                <div className="bg-blue-50/40 border-l-4 border-azure rounded-r-lg p-4 dark:bg-blue-950/20">
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {customNotesText}
                  </p>
                </div>
              </div>
            )}

            {/* 2. Critical Area Diagnostics Section (Question Report Integration) */}
            {showQuestionTable && criticalQuestions.length > 0 && (
              <div className="space-y-3 pt-1">
                <h3 className="text-xs font-extrabold text-[#0063a9] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <FileSpreadsheet size={14} />
                  <span>2. Critical Area Diagnostics (Questions Ranked)</span>
                </h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Showing evaluating questions with composite score benchmarks under {questionThreshold}% threshold.
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-[9px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                        <th className="p-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Evaluating Query Focus</th>
                        <th className="p-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Division</th>
                        <th className="p-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px] text-right">Rating</th>
                        <th className="p-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Highest Scoring Partner</th>
                        <th className="p-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Lowest Scoring Partner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                      {criticalQuestions.map((q) => {
                        // Alert indicator color based on score severity
                        const scoreColor = q.average < 75 ? 'text-red-500' : 'text-amber-500';
                        const scoreBg = q.average < 75 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-amber-50 dark:bg-amber-950/20';

                        return (
                          <tr key={`${q.surveyType}-${q.questionId}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="p-2.5 font-medium max-w-[200px] leading-relaxed">
                              {q.questionText}
                            </td>
                            <td className="p-2.5 text-slate-500 text-[10px] font-mono">
                              {q.surveyType}
                            </td>
                            <td className="p-2.5 text-right font-black">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${scoreColor} ${scoreBg}`}>
                                {formatNumber(q.average)}%
                              </span>
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                              {q.highestCompany ? (
                                <span className="font-medium text-emerald-600 block">
                                  {q.highestCompany.company} <span className="text-[10px] font-mono font-bold text-slate-400">({formatNumber(q.highestCompany.score)}%)</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">N/A</span>
                              )}
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                              {q.lowestCompany ? (
                                <span className="font-medium text-red-500 block">
                                  {q.lowestCompany.company} <span className="text-[10px] font-mono font-bold text-slate-400">({formatNumber(q.lowestCompany.score)}%)</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">N/A</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. Partner Performance Rankings Section */}
            {showCompanyRankings && topCompanies.length > 0 && (
              <div className="space-y-4 pt-1">
                <h3 className="text-xs font-extrabold text-[#0063a9] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <Award size={14} />
                  <span>3. Partner Performance Rankings</span>
                </h3>

                <div className="grid grid-cols-1 gap-5">
                  {/* Top rated */}
                  {topCompanies.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        <span>Company Rankings (Highest to Lowest)</span>
                      </h4>
                      <div className="rounded-lg border border-emerald-100 dark:border-emerald-950/30 overflow-hidden">
                        <table className="w-full text-left text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-emerald-50/50 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30">
                              <th className="p-2 font-bold text-emerald-700 text-[9px] uppercase">Rank</th>
                              <th className="p-2 font-bold text-emerald-700 text-[9px] uppercase">Partner Company Name</th>
                              <th className="p-2 font-bold text-emerald-700 text-[9px] uppercase">Survey Type</th>
                              <th className="p-2 font-bold text-emerald-700 text-[9px] uppercase text-right">Leaderboard Score</th>
                              <th className="p-2 font-bold text-emerald-700 text-[9px] uppercase text-right">Responses</th>
                              <th className="p-2 font-bold text-emerald-700 text-[9px] uppercase text-right">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-100/50 dark:divide-emerald-900/20 text-slate-700 dark:text-slate-300">
                            {topCompanies.map((c, idx) => {
                              const band = getAnalyticsBand(c.surveyType, c.average);
                              return (
                                <tr key={`${c.surveyType}:${c.company}`} className="hover:bg-emerald-50/10">
                                  <td className="p-2 font-bold text-emerald-600">#{idx + 1}</td>
                                  <td className="p-2 font-medium">{c.company}</td>
                                  <td className="p-2 text-slate-500">{c.surveyType}</td>
                                  <td className="p-2 text-right font-black text-emerald-600">{formatAnalyticsScore(c.surveyType, c.average)}</td>
                                  <td className="p-2 text-right">{c.evaluations}</td>
                                  <td className="p-2 text-right">
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



                </div>
              </div>
            )}

            {/* 4. Strategic Guidelines Section */}
            {showRecommendations && generatedRecommendations.length > 0 && (
              <div className="space-y-3 pt-1">
                <h3 className="text-xs font-extrabold text-[#0063a9] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <Sparkles size={14} />
                  <span>4. Strategic Action Guidelines</span>
                </h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {generatedRecommendations.map((rec, idx) => {
                    const isSuccess = rec.type === 'success';
                    const isAlert = rec.type === 'alert';

                    let accentColor = 'border-slate-200 dark:border-slate-800 bg-slate-50/40';
                    let badgeClass = 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-900';
                    if (isSuccess) {
                      accentColor = 'border-emerald-100 dark:border-emerald-950/20 bg-emerald-50/10';
                      badgeClass = 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40';
                    } else if (isAlert) {
                      accentColor = 'border-amber-100 dark:border-amber-950/20 bg-amber-50/10';
                      badgeClass = 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40';
                    } else {
                      // Action focus
                      accentColor = 'border-indigo-100 dark:border-indigo-950/20 bg-indigo-50/10';
                      badgeClass = 'text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40';
                    }

                    return (
                      <div key={idx} className={`p-3.5 border rounded-lg ${accentColor} flex items-start gap-3`}>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${badgeClass} shrink-0 mt-0.5`}>
                          {isSuccess ? 'RETAIN' : isAlert ? 'REVIEW' : 'ACTION'}
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">{rec.title}</h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {rec.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detailed Question Performance Report (one page per category in the PDF, with no top-level "5." intro heading) */}
            {showDetailedQuestionReport && activeTypes.length > 0 && (
              <div className="space-y-6 pt-1">
                {(['Courier', 'Supplier', 'Subcontractor'] as SurveyType[])
                  .filter((t) => activeTypes.includes(t))
                  .map((type) => {
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
                      <div key={type} className="space-y-4 animate-fade-in">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[type] }} />
                          <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wide">{label} Performance Evaluation</h4>
                        </div>

                        {/* Boxed companies list */}
                        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Evaluated Companies ({companiesList.length}):
                          </span>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                            <div className="space-y-1">
                              {leftCompanies.map((comp) => (
                                <div key={comp} className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                  <span className="truncate">{comp}</span>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-1">
                              {rightCompanies.map((comp) => (
                                <div key={comp} className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                  <span className="truncate">{comp}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Question Stats Table */}
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-[10px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                                <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Question</th>
                                <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px] text-right">Average Rating</th>
                                <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px] text-right">Responses</th>
                                <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Highest Scoring Partner</th>
                                <th className="p-2 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Lowest Scoring Partner</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                              {questionsList.map((row) => (
                                <tr key={row.questionId} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                  <td className="p-2 font-medium max-w-[220px] leading-relaxed text-[11px]">{row.questionText}</td>
                                  <td className="p-2 text-right font-bold text-[#0063a9] text-[11px]">{formatNumber(row.average)}%</td>
                                  <td className="p-2 text-right text-slate-500 text-[11px]">{row.responsesCount}</td>
                                  <td className="p-2 text-[11px] text-slate-600 dark:text-slate-300">
                                    {row.highestCompany ? (
                                      <span className="font-medium text-emerald-600 block">
                                        {row.highestCompany.company} <span className="text-[10px] font-mono font-bold text-slate-400">({formatNumber(row.highestCompany.score)}%)</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">N/A</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-[11px] text-slate-600 dark:text-slate-300">
                                    {row.lowestCompany ? (
                                      <span className="font-medium text-red-500 block">
                                        {row.lowestCompany.company} <span className="text-[10px] font-mono font-bold text-slate-400">({formatNumber(row.lowestCompany.score)}%)</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">N/A</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Letterhead Confidential Footer - matches the running PDF footer text repeated on every content page */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>Microgenesis Supplier Management System — Strictly Confidential</span>
              <span>Page {(showCoverPage ? 1 : 0) + 1}</span>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
