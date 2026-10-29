import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Maximize2,
  Minimize2,
  Presentation,
  Sparkles,
  Star,
  Trophy,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Users,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Slide, SLIDE_EYEBROWS } from '../domain/presentation';
import { exportSlidesAsPDF } from '../services/presentationPdf';
import { exportSlidesAsPPTX } from '../services/presentationPptx';
import { SurveyResponse, SurveyType } from '../../../types/survey';
import { surveyTypeDisplayLabel } from '../../../data/questionWeights';
import { getScoreAxisDomain } from '../../analytics/domain/analytics';
import { computeCompanyComposite, getCompanyTrend, getSectionPeerAverages } from '../../evaluations/domain/scoring';
import { radarPointLabel } from '../../analytics/components/radarChartLabels';

interface SlideDeckProps {
  slides: Slide[];
  title: string;
  onExit: () => void;
  responses?: SurveyResponse[];
}

const surveyTypeColors: Record<string, string> = {
  Courier: '#2563eb',
  Supplier: '#10b981',
  Subcontractor: '#f97316',
};

/**
 * One shared visual spec every chart in the deck draws from, so bars, lines,
 * areas, and radars all read as one consistent system instead of each slide
 * inventing its own grid color / tick size / tooltip chrome. Values chosen to
 * be legible once the whole 1280x720 canvas is scaled down to fit a laptop
 * screen (see SLIDE_WIDTH/SLIDE_HEIGHT above).
 */
const CHART_GRID = { stroke: '#eef2f7', strokeDasharray: '3 3' };
const CHART_TICK = { fontSize: 11, fill: '#64748b' };
const CHART_TICK_STRONG = { fontSize: 11, fill: '#334155', fontWeight: 600 };
const CHART_LABEL_STYLE = { fill: '#334155', fontSize: 11, fontWeight: 700 };
const CHART_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px -6px rgba(15,23,42,0.15)',
  padding: '8px 12px',
};
const CHART_TOOLTIP_LABEL_STYLE = { color: '#334155', fontWeight: 700, marginBottom: 2 };

// Every slide is laid out once at this fixed "design" resolution, then the
// whole canvas is uniformly scaled (CSS transform) to whatever space is
// actually available. This is the same "fit to window" technique
// PowerPoint/Google Slides use, and it's what makes the deck look
// identical - just bigger or smaller - on a 1366x768 laptop, a 1920x1080
// monitor, or a tablet, instead of each slide's internal layout reflowing
// (and sometimes overflowing) differently at every viewport size.
const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;

function slideTitleFor(slide: Slide, index: number): string {
  switch (slide.kind) {
    case 'title':
      return 'Cover';
    case 'agenda':
      return 'Contents';
    case 'overview':
      return 'Overview';
    case 'comparison':
      return 'Survey Comparison';
    case 'sections':
      return 'Category Breakdown';
    case 'leaderboard':
      return 'Leaderboard';
    case 'trends':
      return 'Trends';
    case 'questions':
      return 'Top & Bottom Questions';
    case 'spotlight':
      return 'Spotlight';
    case 'distribution':
      return 'Needs Attention';
    case 'closing':
      return 'Key Takeaways';
    default:
      return `Slide ${index + 1}`;
  }
}

function ScoreBadge({ label, hex }: { label: string; hex: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: `${hex}1a`, color: hex }}
    >
      {label}
    </span>
  );
}

/** Faint brand-colored dot-grid + radial wash shared by every content slide, so
 * they read as one consistent deck instead of plain white documents. Kept
 * subtle (low opacity) so it never competes with charts or text on top. */
function SlideBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#0063a9]/[0.05] blur-3xl" />
      <div className="absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-[#0063a9]/[0.04] blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #0063a9 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
    </div>
  );
}

/** Standard eyebrow + title + accent underline used by every content slide,
 * so typography/spacing never drifts slide to slide. */
function SlideHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="relative shrink-0">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#0063a9]">{eyebrow}</p>
      <h2 className="mt-1.5 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-[#0063a9] to-[#0063a9]/30" />
    </div>
  );
}

/** Small pill toggle used for in-slide interactivity (sort/metric switches),
 * matching the segmented-control look already used on the Comparison slide. */
function SlideToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            value === opt.value ? 'bg-white text-[#0063a9] shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individual slide layouts                                            */
/* ------------------------------------------------------------------ */

function TitleSlide({ slide }: { slide: Extract<Slide, { kind: 'title' }> }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0063a9] via-[#005793] to-[#00335a] px-10 text-center text-white">
      {/* Decorative background flourishes */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="pointer-events-none absolute right-10 top-10 h-24 w-24 rounded-full border border-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Header row: brand mark + generated-on stamp */}
      <div className="absolute left-6 right-6 top-6 flex items-center justify-between sm:left-10 sm:right-10 sm:top-8">
        <div className="flex items-center gap-2.5">
          <img
            src="/microgenesis_logo.png"
            alt="Microgenesis"
            className="h-6 w-auto shrink-0 object-contain brightness-0 invert opacity-95 sm:h-7"
            referrerPolicy="no-referrer"
          />
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.3em] text-blue-100/80 sm:inline">
            Supplier Management System
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-wide text-blue-50 backdrop-blur-sm sm:text-xs">
          <Calendar size={12} className="text-sky-200" />
          <span>Generated {slide.generatedDate}</span>
        </div>
      </div>

      <Sparkles className="mb-5 text-sky-200" size={32} />
      <p className="text-xs font-bold uppercase tracking-[0.35em] text-sky-200">{slide.subtitle}</p>
      <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">{slide.title}</h1>
      <div className="mt-5 h-px w-16 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        {slide.meta.map((item) => (
          <span key={item} className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide backdrop-blur-sm">
            {item}
          </span>
        ))}
      </div>

      {/* Footer brand tag */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.3em] text-blue-100/60 sm:bottom-8">
        Microgenesis
      </div>
    </div>
  );
}

function AgendaSlide({ slide }: { slide: Extract<Slide, { kind: 'agenda' }> }) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <SlideHeader eyebrow="What's inside" title="Contents" />
        <div className="mt-6 flex flex-1 min-h-0 flex-col justify-center gap-2.5">
          {slide.items.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="flex max-h-24 flex-1 items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0063a9] text-sm font-bold text-white">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800 sm:text-base">{item.label}</p>
                <p className="truncate text-xs text-slate-500 sm:text-sm">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewSlide({
  slide,
  responses = [],
}: {
  slide: Extract<Slide, { kind: 'overview' }>;
  responses?: SurveyResponse[];
}) {
  const isSingleSurveyType = slide.surveyTypes?.length === 1;

  const parsedScoreMatch = slide.standout.score.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  const scorePercent = parsedScoreMatch 
    ? (parseFloat(parsedScoreMatch[1]) / parseFloat(parsedScoreMatch[2])) * 100 
    : 0;

  const { radarData, trendData, bandColor } = useMemo(() => {
    if (!isSingleSurveyType || !slide.standout || !slide.standout.name || slide.standout.name === 'No data yet') {
      return { radarData: [], trendData: [], bandColor: '#0063a9' };
    }
    const company = slide.standout.name;
    const surveyType = slide.standout.type as SurveyType;

    const composite = computeCompanyComposite(company, surveyType, responses);
    const peerAverages = getSectionPeerAverages(responses, surveyType);

    const radar = composite
      ? composite.sections.map((section) => {
          const peer = peerAverages.find((p) => p.section === section.section);
          return {
            section: section.section,
            value: section.percent,
            peer: peer?.average ?? 0,
          };
        })
      : [];

    const trend = getCompanyTrend(responses, company, surveyType);

    return {
      radarData: radar,
      trendData: trend,
      bandColor: composite?.band.hex ?? '#0063a9',
    };
  }, [isSingleSurveyType, slide.standout, responses]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-white to-blue-50/60 px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      <SlideHeader eyebrow={SLIDE_EYEBROWS.overview} title="Where things stand" />

      <div className="mt-6 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
        {slide.kpis.map((kpi, i) => {
          const Icon = [Sparkles, Star, Users, AlertTriangle][i] ?? Sparkles;
          const isNaRate = i === 3;
          const isElevatedNa = isNaRate && parseFloat(kpi.value) > 15;

          // The lead KPI (Overall Satisfaction) gets the hero treatment so the
          // eye has one obvious place to land first; the rest stay as
          // supporting tiles with a colored top accent instead of all four
          // competing at equal visual weight.
          if (i === 0) {
            return (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="rounded-2xl bg-gradient-to-br from-[#0063a9] to-[#00457a] p-4 shadow-md shadow-blue-900/10"
              >
                <div className="flex items-center gap-1.5 text-blue-100">
                  <Icon size={13} className="shrink-0" />
                  <p className="truncate text-[10px] font-bold uppercase tracking-wider">{kpi.label}</p>
                </div>
                <p className="mt-1.5 text-xl font-bold text-white sm:text-2xl">{kpi.value}</p>
              </motion.div>
            );
          }

          const accentColor = isElevatedNa ? '#f59e0b' : '#0063a9';
          const accentBadgeClass = isElevatedNa ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-[#0063a9]';

          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 pt-3.5 shadow-sm"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} />
              <div className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${accentBadgeClass}`}>
                <Icon size={12} />
              </div>
              <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
              <p className="mt-0.5 text-xl font-bold text-slate-900 sm:text-2xl">{kpi.value}</p>
            </motion.div>
          );
        })}
      </div>

      {isSingleSurveyType ? (
        <div className="mt-4 flex flex-col gap-4 min-h-0 flex-1">
          {/* Top Performer Banner */}
          <div className="rounded-xl border-2 border-[#0063a9]/15 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center gap-2 text-[#0063a9] justify-center sm:justify-start">
                  <Trophy size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Top Performer Overall</span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl truncate">{slide.standout.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-[#0063a9]">
                    {slide.standout.type}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span className="font-semibold text-slate-700">{slide.standout.score}</span>
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  Highest scoring criterion: <span className="font-medium text-slate-600 italic">"{slide.highlight}"</span>
                </p>
              </div>

              {/* Circular Gauge */}
              {scorePercent > 0 && (
                <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      className="stroke-slate-100 fill-none"
                      strokeWidth="5"
                    />
                    <motion.circle
                      cx="40"
                      cy="40"
                      r="32"
                      className="stroke-[#0063a9] fill-none"
                      strokeWidth="5"
                      strokeDasharray="201.06"
                      initial={{ strokeDashoffset: 201.06 }}
                      animate={{ strokeDashoffset: 201.06 - (201.06 * scorePercent) / 100 }}
                      key={slide.standout.name}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-base font-bold text-[#0063a9]">{Math.round(scorePercent)}%</span>
                    <span className="text-[6px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Rating</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Two side-by-side graphs */}
          <div className="grid grid-cols-2 gap-4 h-52">
            {/* Left Graph: Radar Chart */}
            <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-3 shadow-xs">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                Section Breakdown vs Peer Average
              </p>
              <div className="flex-1 min-h-0 relative">
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="55%">
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="section" tick={{ fontSize: 7, fill: '#475569' }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 6, fill: '#94a3b8' }} />
                      <Radar
                        name={slide.standout.name}
                        dataKey="value"
                        stroke={bandColor}
                        fill={bandColor}
                        fillOpacity={0.2}
                        label={radarPointLabel({ categoryCount: radarData.length, fill: bandColor, fontSize: 10, radialInset: 9, formatter: (v) => String(Math.round(v)) })}
                      />
                      <Radar name="Peer Average" dataKey="peer" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.05} />
                      <Tooltip wrapperStyle={{ fontSize: 8 }} contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: 10, padding: '4px 8px' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                    No breakdown data available.
                  </div>
                )}
              </div>
            </div>

            {/* Right Graph: Trend Line Chart */}
            <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-3 shadow-xs">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                Score Trend Over Time
              </p>
              <div className="flex-1 min-h-0">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 10, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 7, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 7, fill: '#64748b' }} />
                      <Tooltip wrapperStyle={{ fontSize: 8 }} contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: 10, padding: '4px 8px' }} />
                      <Line
                        type="monotone"
                        name="Score"
                        dataKey="score"
                        stroke={bandColor}
                        strokeWidth={1.5}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                    Insufficient data for monthly trend.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr,1fr]">
          <div className="rounded-xl border-2 border-[#0063a9]/15 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center gap-2 text-[#0063a9] justify-center sm:justify-start">
                  <Trophy size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Top Performer Overall</span>
                </div>
                <h3 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl truncate">{slide.standout.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-[#0063a9]">
                    {slide.standout.type}
                  </span>
                  <span className="mx-2">·</span>
                  <span className="font-semibold text-slate-700">{slide.standout.score}</span>
                </p>
                <p className="mt-4 text-xs text-slate-400">
                  Highest scoring criterion: <span className="font-medium text-slate-600 italic">"{slide.highlight}"</span>
                </p>
              </div>

              {/* Circular Gauge */}
              {scorePercent > 0 && (
                <div className="relative flex items-center justify-center w-32 h-32 shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="50"
                      className="stroke-slate-100 fill-none"
                      strokeWidth="8"
                    />
                    <motion.circle
                      cx="64"
                      cy="64"
                      r="50"
                      className="stroke-[#0063a9] fill-none"
                      strokeWidth="8"
                      strokeDasharray="314.16"
                      initial={{ strokeDashoffset: 314.16 }}
                      animate={{ strokeDashoffset: 314.16 - (314.16 * scorePercent) / 100 }}
                      key={slide.standout.name}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold text-[#0063a9]">{Math.round(scorePercent)}%</span>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Rating</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            {slide.topPerformers.map((performer) => (
              <div
                key={performer.type}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top {performer.type}</p>
                  <p className="truncate text-sm font-bold text-slate-800">{performer.name}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-[#0063a9]">{performer.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function ComparisonSlide({ slide, responses = [] }: { slide: Extract<Slide, { kind: 'comparison' }>; responses?: SurveyResponse[] }) {
  const [limit, setLimit] = useState<5 | 10>(5);
  const [performanceMode, setPerformanceMode] = useState<'highest' | 'lowest'>('highest');

  // Let's get the active survey types from the unique types present in the responses
  const activeSurveyTypes = useMemo(() => {
    return [...new Set(responses.map((r) => r.surveyType))] as SurveyType[];
  }, [responses]);

  const truncateCompanyName = (name: string, maxLen = 14) => {
    return name.length > maxLen ? `${name.substring(0, maxLen)}…` : name;
  };

  const topCompaniesData = useMemo(() => {
    const activeTypes = activeSurveyTypes.length ? activeSurveyTypes : (['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]);
    const companiesInActiveTypes = [...new Set(responses
      .filter((r) => activeTypes.includes(r.surveyType))
      .map((r) => r.company)
    )];

    const stats = companiesInActiveTypes
      .map((company) => {
        const activeTypesForCompany = activeTypes.filter((type) =>
          responses.some((r) => r.company === company && r.surveyType === type)
        );
        if (activeTypesForCompany.length === 0) return null;

        const composites = activeTypesForCompany
          .map((type) => computeCompanyComposite(company, type, responses))
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (composites.length === 0) return null;

        const avgScore = composites.reduce((sum, c) => sum + c.compositeScore, 0) / composites.length;
        const mainType = composites[0].surveyType;

        return {
          company,
          score: Number(avgScore.toFixed(1)),
          surveyType: mainType,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (performanceMode === 'highest') {
      stats.sort((a, b) => b.score - a.score);
    } else {
      stats.sort((a, b) => a.score - b.score);
    }

    return stats.slice(0, limit);
  }, [responses, activeSurveyTypes, performanceMode, limit]);

  const topCompaniesAxisDomain = useMemo(
    () => getScoreAxisDomain(topCompaniesData.map((item) => item.score)),
    [topCompaniesData],
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-6 sm:px-14 sm:py-8 text-slate-900">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      {/* Slide Header with Interactive Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#0063a9]">{SLIDE_EYEBROWS.comparison}</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl leading-tight">
            {performanceMode === 'highest' ? 'Top Rated Companies' : 'Least Rated Companies'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Compare stakeholder satisfaction rating of your partner companies.
          </p>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-2 text-xs shrink-0 self-start sm:self-center">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setPerformanceMode('highest')}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                performanceMode === 'highest'
                  ? 'bg-white text-[#0063a9] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Best
            </button>
            <button
              type="button"
              onClick={() => setPerformanceMode('lowest')}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                performanceMode === 'lowest'
                  ? 'bg-white text-rose-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lowest
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setLimit(5)}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                limit === 5
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              5
            </button>
            <button
              type="button"
              onClick={() => setLimit(10)}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                limit === 10
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              10
            </button>
          </div>
        </div>
      </div>

      {/* Main Slide Content */}
      <div className="mt-5 grid flex-1 min-h-0 gap-6 lg:grid-cols-[1.3fr,0.7fr]">
        <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4 flex flex-col min-h-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            {performanceMode === 'highest' ? 'Highest Rating Scores' : 'Lowest Rating Scores'} (0–100)
          </p>
          <div className="flex-1 min-h-0">
            {topCompaniesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCompaniesData} margin={{ top: 20, right: 10, left: -25, bottom: 5 }}>
                  <CartesianGrid {...CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="company"
                    tickFormatter={(v) => truncateCompanyName(v, limit === 10 ? 10 : 14)}
                    tick={{ ...CHART_TICK_STRONG, fontSize: 9 }}
                  />
                  <YAxis domain={topCompaniesAxisDomain} tick={{ ...CHART_TICK, fontSize: 9 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]} barSize={limit === 10 ? 24 : 36}>
                    <LabelList dataKey="score" position="top" style={{ ...CHART_LABEL_STYLE, fontSize: 9 }} />
                    {topCompaniesData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={surveyTypeColors[entry.surveyType] ?? '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                No company data fits the current filters.
              </div>
            )}
          </div>
        </div>

        {/* Side Panel: Ranked List View */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4 flex flex-col min-h-0 justify-between">
          <div className="flex flex-1 min-h-0 flex-col">
            <p className="mb-2 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400">Ranked List View</p>
            <div className="flex flex-1 min-h-0 flex-col justify-center gap-1.5">
              {topCompaniesData.map((item, idx) => (
                <div key={item.company} className="flex max-h-9 flex-1 items-center justify-between gap-2 rounded-lg p-1.5 hover:bg-slate-100/50">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500"
                    style={idx + 1 <= 3 ? { backgroundColor: MEDAL_COLORS[idx + 1].bg, color: MEDAL_COLORS[idx + 1].text } : undefined}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 truncate flex-1">{item.company}</span>
                  <span className="text-xs font-bold shrink-0 px-2 py-0.5 rounded-md" style={{ backgroundColor: `${surveyTypeColors[item.surveyType] || '#2563eb'}1a`, color: surveyTypeColors[item.surveyType] || '#2563eb' }}>
                    {item.score.toFixed(1)}
                  </span>
                </div>
              ))}
              {topCompaniesData.length === 0 && (
                <p className="text-xs text-slate-400 italic">No partners found.</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 mt-3">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              * Normalized composite index scores (0 to 100). Colors indicate stakeholder types:
              <span className="inline-flex items-center gap-1.5 ml-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-600" /> Courier
              </span>
              <span className="inline-flex items-center gap-1.5 ml-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Supplier
              </span>
              <span className="inline-flex items-center gap-1.5 ml-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500" /> Subcontractor
              </span>
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// Gold/silver/bronze treatment for the top 3 leaderboard spots so rank 1
// reads instantly instead of blending into a column of identical gray
// circles - everyone past 3rd keeps the plain numbered style.
const MEDAL_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#fbbf24', text: '#78350f' },
  2: { bg: '#cbd5e1', text: '#334155' },
  3: { bg: '#fb923c', text: '#7c2d12' },
};

function bandColorForScore(score: number): string {
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#2563eb';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function SectionsSlide({ slide }: { slide: Extract<Slide, { kind: 'sections' }> }) {
  const [sortBy, setSortBy] = useState<'score' | 'volume'>('score');

  const sorted = useMemo(() => {
    const copy = [...slide.data];
    copy.sort((a, b) => (sortBy === 'volume' ? b.responses - a.responses : b.average - a.average));
    return copy;
  }, [slide.data, sortBy]);

  const barSize = sorted.length > 6 ? 16 : sorted.length > 4 ? 22 : 30;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-4">
          <SlideHeader
            eyebrow={SLIDE_EYEBROWS.sections}
            title="Category Breakdown"
            subtitle="Average rating by evaluation category, strongest to weakest."
          />
          <SlideToggle
            options={[
              { value: 'score' as const, label: 'By Score' },
              { value: 'volume' as const, label: 'By Volume' },
            ]}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>
        <div className="mt-5 flex-1 min-h-0 rounded-2xl border border-slate-200/90 bg-slate-50/30 p-4">
          {sorted.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 44, left: 10, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={CHART_TICK} />
                <YAxis type="category" dataKey="category" width={150} tick={CHART_TICK_STRONG} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  formatter={(value: any) => [`${Number(value).toFixed(2)} / 100`, 'Average']}
                />
                <Bar dataKey="average" radius={[0, 8, 8, 0]} barSize={barSize}>
                  <LabelList
                    dataKey="average"
                    position="right"
                    formatter={(v: any) => Number(v).toFixed(1)}
                    style={CHART_LABEL_STYLE}
                  />
                  {sorted.map((entry) => (
                    <Cell key={entry.category} fill={bandColorForScore(entry.average)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              No category data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardSlide({ slide, responses = [] }: { slide: Extract<Slide, { kind: 'leaderboard' }>; responses?: SurveyResponse[] }) {
  const [selectedCompany, setSelectedCompany] = useState<{ company: string; surveyType: SurveyType } | null>(null);

  const composite = useMemo(() => {
    if (!selectedCompany) return null;
    return computeCompanyComposite(selectedCompany.company, selectedCompany.surveyType, responses);
  }, [selectedCompany, responses]);

  const peerAverages = useMemo(() => {
    if (!selectedCompany) return [];
    return getSectionPeerAverages(responses, selectedCompany.surveyType);
  }, [selectedCompany, responses]);

  const radarData = useMemo(() => {
    if (!composite) return [];
    return composite.sections.map((section) => {
      const peer = peerAverages.find((p) => p.section === section.section);
      return {
        section: section.section,
        value: section.percent,
        peer: peer?.average ?? 0,
      };
    });
  }, [composite, peerAverages]);

  const trendData = useMemo(() => {
    if (!selectedCompany) return [];
    return getCompanyTrend(responses, selectedCompany.company, selectedCompany.surveyType);
  }, [selectedCompany, responses]);

  // numGroups/layoutConfig must be computed before any early return below -
  // this component previously called this useMemo AFTER the `if
  // (selectedCompany)` branch's return, which meant the number of hooks
  // called differed between "showing the list" and "showing a company's
  // detail view" renders. React detects that hook-count mismatch and throws,
  // which crashed this slide (and unmounted it) the instant a company was
  // clicked. Hooks must run unconditionally, in the same order, every render.
  const numGroups = slide.groups.length;

  const layoutConfig = useMemo(() => {
    if (numGroups === 1) {
      return {
        containerClass: "mt-4 max-w-2xl mx-auto w-full flex-1 flex flex-col justify-center",
        gridClass: "grid grid-cols-1",
        groupBlockClass: "rounded-2xl border-2 border-slate-100 p-8 bg-slate-50/40 shadow-md",
        titleClass: "mb-6 text-lg sm:text-2xl font-black uppercase tracking-[0.2em] text-center block",
        listSpacingClass: "space-y-3.5",
        buttonPaddingClass: "py-3 px-4",
        rankClass: "flex h-9 w-9 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs sm:text-lg font-bold text-slate-500 group-hover:bg-[#0063a9]/10 group-hover:text-[#0063a9] transition-colors",
        companyClass: "min-w-0 flex-1 truncate text-sm sm:text-lg font-bold text-slate-800 group-hover:text-[#0063a9] group-hover:underline transition-all",
        scoreClass: "shrink-0 text-sm sm:text-lg font-extrabold transition-all group-hover:scale-105",
        noDataClass: "text-base sm:text-lg text-slate-400 text-center py-6",
      };
    } else if (numGroups === 2) {
      return {
        containerClass: "mt-4 max-w-5xl mx-auto w-full flex-1 flex flex-col justify-center",
        gridClass: "grid grid-cols-1 sm:grid-cols-2 gap-8",
        groupBlockClass: "rounded-xl border-2 border-slate-100 p-6 bg-slate-50/30 shadow-sm",
        titleClass: "mb-5 text-sm sm:text-lg font-extrabold uppercase tracking-wider text-center block",
        listSpacingClass: "space-y-2.5",
        buttonPaddingClass: "py-2 px-3",
        rankClass: "flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs sm:text-base font-bold text-slate-500 group-hover:bg-[#0063a9]/10 group-hover:text-[#0063a9] transition-colors",
        companyClass: "min-w-0 flex-1 truncate text-xs sm:text-base font-semibold text-slate-700 group-hover:text-[#0063a9] group-hover:underline transition-all",
        scoreClass: "shrink-0 text-xs sm:text-base font-bold transition-all group-hover:scale-105",
        noDataClass: "text-xs sm:text-sm text-slate-400 text-center py-4",
      };
    } else {
      return {
        containerClass: "mt-4 w-full flex-1",
        gridClass: "grid grid-cols-1 sm:grid-cols-3 gap-4",
        groupBlockClass: "rounded-xl border border-slate-100 p-4 bg-slate-50/30",
        titleClass: "mb-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-center block",
        listSpacingClass: "space-y-1.5",
        buttonPaddingClass: "py-1.5 px-2.5",
        rankClass: "flex h-5 w-5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] sm:text-xs font-bold text-slate-500 group-hover:bg-[#0063a9]/10 group-hover:text-[#0063a9] transition-colors",
        companyClass: "min-w-0 flex-1 truncate text-xs sm:text-sm font-bold text-slate-700 group-hover:text-[#0063a9] group-hover:underline transition-all",
        scoreClass: "shrink-0 text-xs sm:text-sm font-bold transition-all group-hover:scale-105",
        noDataClass: "text-xs text-slate-400 text-center py-2",
      };
    }
  }, [numGroups]);

  if (selectedCompany) {
    return (
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-5 sm:px-14 sm:py-6 text-slate-900">
        <SlideBackdrop />
        <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-white z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCompany(null)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
            >
              <ArrowLeft size={13} />
              <span>Back to Leaderboard</span>
            </button>
            <div className="h-4 w-[1px] bg-slate-200" />
            <div className="min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                {surveyTypeDisplayLabel[selectedCompany.surveyType]} Partner
              </span>
              <h3 className="text-base font-bold text-slate-900 leading-tight truncate max-w-[220px] sm:max-w-xs md:max-w-md">
                {selectedCompany.company}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {composite && (
              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: `${composite.band.hex}1a`, color: composite.band.hex }}
                  >
                    {composite.band.label}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {composite.evaluationCount} evaluation{composite.evaluationCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-1 text-center min-w-[65px] shadow-2xs">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Score</p>
                  <p className="text-base font-bold leading-tight" style={{ color: composite.band.hex }}>
                    {composite.compositeScore.toFixed(1)}
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSelectedCompany(null)}
              title="Close and return"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Main Content Area: Radar, Trend, and Section Scores side by side */}
        <div className="mt-3.5 grid flex-1 min-h-0 gap-4 grid-cols-3">
          {/* Column 1: Radar Chart */}
          <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/40 p-2.5 min-h-0">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center">
              Section Breakdown vs Peer Average
            </p>
            <div className="flex-1 min-h-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="62%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="section" tick={{ fontSize: 8, fill: '#475569' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 7, fill: '#94a3b8' }} />
                  <Radar
                    name={selectedCompany.company}
                    dataKey="value"
                    stroke={composite?.band.hex ?? '#2563eb'}
                    fill={composite?.band.hex ?? '#2563eb'}
                    fillOpacity={0.25}
                    label={radarPointLabel({ categoryCount: radarData.length, fill: composite?.band.hex ?? '#2563eb', fontSize: 10, radialInset: 10, formatter: (v) => String(Math.round(v)) })}
                  />
                  <Radar name="Peer Average" dataKey="peer" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.08} />
                  <Tooltip wrapperStyle={{ fontSize: 9 }} contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: 10, padding: '4px 8px' }} />
                  <Legend wrapperStyle={{ fontSize: 9, paddingTop: 4 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Column 2: Trend Chart */}
          <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/40 p-2.5 min-h-0">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center">
              Score Trend Over Time
            </p>
            <div className="flex-1 min-h-0">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 10, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 8, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#64748b' }} />
                    <Tooltip wrapperStyle={{ fontSize: 9 }} contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: 10, padding: '4px 8px' }} />
                    <Line
                      type="monotone"
                      name="Composite Score"
                      dataKey="score"
                      stroke={composite?.band.hex ?? '#2563eb'}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                  Insufficient data to calculate monthly trend.
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Section score bars + quick metrics */}
          <div className="flex flex-col gap-2.5 min-h-0">
            <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-slate-100 bg-slate-50/40 p-2.5">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center">
                Section Scores
              </p>
              <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-0.5">
                {composite?.sections.map((s) => (
                  <div key={s.section}>
                    <div className="flex items-center justify-between gap-2 text-[9px] font-semibold text-slate-500">
                      <span className="truncate">{s.section}</span>
                      <span className="shrink-0 text-slate-700">{s.percent.toFixed(0)}%</span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, s.percent)}%`, backgroundColor: composite.band.hex }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {composite && (
              <div className="grid shrink-0 grid-cols-3 gap-1.5 text-center">
                <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-1">
                  <p className="text-[7px] font-bold uppercase tracking-wider text-slate-400">Rated Criteria</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{composite.ratedQuestionCount}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-1">
                  <p className="text-[7px] font-bold uppercase tracking-wider text-slate-400">N/A Rate</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{composite.naRate}%</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/30 p-1" title="Consistency signal (lower is more consistent)">
                  <p className="text-[7px] font-bold uppercase tracking-wider text-slate-400">Deviation</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">±{composite.stdDev} pt</p>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-6 sm:px-14 sm:py-8 text-slate-900">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#0063a9]">{SLIDE_EYEBROWS.leaderboard}</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Company Leaderboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Top-ranked partners within each survey type. Click a company to view interactive breakdown & trends.
        </p>
      </div>
      <div className={layoutConfig.containerClass}>
        <div className={layoutConfig.gridClass}>
          {slide.groups.map((group) => (
            <div key={group.surveyType} className={layoutConfig.groupBlockClass}>
              <p
                className={layoutConfig.titleClass}
                style={{ color: surveyTypeColors[group.surveyType] }}
              >
                {group.surveyType}
              </p>
              {group.rows.length ? (
                <ol className={layoutConfig.listSpacingClass}>
                  {group.rows.map((row) => (
                    <li key={row.company}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCompany({
                            company: row.company,
                            surveyType: group.surveyType,
                          })
                        }
                        title={`Click to view detailed metrics for ${row.company}`}
                        className={`flex w-full items-center gap-2.5 rounded-lg text-left transition hover:bg-slate-100 group cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${layoutConfig.buttonPaddingClass}`}
                      >
                        <span
                          className={layoutConfig.rankClass}
                          style={row.rank <= 3 ? { backgroundColor: MEDAL_COLORS[row.rank].bg, color: MEDAL_COLORS[row.rank].text } : undefined}
                        >
                          {row.rank}
                        </span>
                        <span className={layoutConfig.companyClass}>
                          {row.company}
                        </span>
                        <span className={layoutConfig.scoreClass} style={{ color: row.hex }}>
                          {row.score.toFixed(0)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={layoutConfig.noDataClass}>No data for this window.</p>
              )}
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

function TrendsSlide({ slide }: { slide: Extract<Slide, { kind: 'trends' }> }) {
  const [metric, setMetric] = useState<'average' | 'responses'>('average');
  const color = metric === 'average' ? '#0063a9' : '#10b981';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-4">
          <SlideHeader
            eyebrow={SLIDE_EYEBROWS.trends}
            title="Trends Over Time"
            subtitle="Monthly average rating and response volume across the selected window."
          />
          <SlideToggle
            options={[
              { value: 'average' as const, label: 'Avg Rating' },
              { value: 'responses' as const, label: 'Volume' },
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>
        <div className="mt-5 flex-1 min-h-0 rounded-2xl border border-slate-200/90 bg-slate-50/30 p-4">
          {slide.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={slide.data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART_GRID} vertical={false} />
                <XAxis dataKey="month" tick={CHART_TICK} />
                <YAxis
                  domain={metric === 'average' ? [0, 100] : [0, 'auto']}
                  allowDecimals={metric !== 'average'}
                  tick={CHART_TICK}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  formatter={(value: any) => [
                    metric === 'average' ? `${Number(value).toFixed(2)} / 100` : value,
                    metric === 'average' ? 'Average rating' : 'Responses',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey={metric}
                  name={metric === 'average' ? 'Average rating' : 'Responses'}
                  stroke={color}
                  strokeWidth={3}
                  fill="url(#trendFill)"
                  dot={{ r: 3, strokeWidth: 0, fill: color }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              Not enough monthly data to chart a trend.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionsSlide({ slide }: { slide: Extract<Slide, { kind: 'questions' }> }) {
  const maxValStr = (slide.maxRating ?? 100).toFixed(2);
  const columns: { label: string; icon: typeof TrendingUp; items: typeof slide.top; tone: 'emerald' | 'rose' }[] = [
    { label: 'Highest scoring', icon: TrendingUp, items: slide.top, tone: 'emerald' },
    { label: 'Lowest scoring', icon: TrendingDown, items: slide.bottom, tone: 'rose' },
  ];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <SlideHeader eyebrow={SLIDE_EYEBROWS.questions} title="Top & Bottom Questions" />
        <div className="mt-5 grid flex-1 min-h-0 gap-5 sm:grid-cols-2">
          {columns.map((col) => {
            const Icon = col.icon;
            const textClass = col.tone === 'emerald' ? 'text-emerald-600' : 'text-rose-600';
            const bgClass = col.tone === 'emerald' ? 'bg-emerald-50/60' : 'bg-rose-50/60';
            const numClass = col.tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700';
            return (
              <div key={col.label} className="flex min-h-0 flex-col">
                <div className={`mb-2 flex shrink-0 items-center gap-1.5 ${textClass}`}>
                  <Icon size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">{col.label}</span>
                </div>
                <div className="flex flex-1 min-h-0 flex-col justify-center gap-2">
                  {col.items.map((q, i) => (
                    <div key={q.question} className={`max-h-20 flex-1 rounded-lg px-3 py-2 ${bgClass}`}>
                      <p className="line-clamp-2 text-xs text-slate-700">
                        <span className={`font-bold ${numClass}`}>{i + 1}. </span>
                        {q.question}
                      </p>
                      <p className={`mt-0.5 text-xs font-bold ${textClass}`}>
                        {q.average.toFixed(2)} / {maxValStr}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpotlightSlide({ slide }: { slide: Extract<Slide, { kind: 'spotlight' }> }) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      <SlideHeader eyebrow={SLIDE_EYEBROWS.spotlight} title="Company Spotlight" />
      <div className="mt-5 grid flex-1 min-h-0 gap-5 lg:grid-cols-[1fr,1.1fr]">
        <div className="flex flex-col justify-center rounded-2xl border-2 border-slate-100 p-5">
          <ScoreBadge label={slide.band} hex={slide.hex} />
          <h3 className="mt-3 text-xl font-bold text-slate-900">{slide.company}</h3>
          <p className="text-sm text-slate-500">{slide.surveyType}</p>
          <p className="mt-4 text-4xl font-bold" style={{ color: slide.hex }}>
            {slide.score.toFixed(1)}
            <span className="text-base font-medium text-slate-400"> / 100</span>
          </p>
          {slide.atRisk && (
            <div className="mt-6 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="text-xs">
                <span className="font-bold">{slide.atRisk.company}</span> is trailing its peer group at{' '}
                {slide.atRisk.score.toFixed(1)} / 100 and may need attention.
              </p>
            </div>
          )}
        </div>
        <div className="min-h-[220px] rounded-2xl border border-slate-200/90 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={slide.radar} outerRadius="72%">
              <PolarGrid />
              <PolarAngleAxis dataKey="section" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar name={slide.company} dataKey="value" stroke={slide.hex} fill={slide.hex} fillOpacity={0.35} label={radarPointLabel({ categoryCount: slide.radar.length, fill: slide.hex, fontSize: 10, radialInset: 11, formatter: (v) => String(Math.round(v)) })} />
              <Radar name="Peer average" dataKey="peer" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
      </div>
    </div>
  );
}

/** Replaces the old rating-distribution histogram (a confusing mashup of
 * every survey type's differently-scaled ratings in one chart) with a
 * single, actionable question: which partners are trailing their own peer
 * group, and in which specific category. */
function NeedsAttentionSlide({ slide }: { slide: Extract<Slide, { kind: 'distribution' }> }) {
  const gridColsClass = slide.atRisk.length <= 1 ? 'lg:grid-cols-1' : slide.atRisk.length <= 4 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white px-8 py-8 sm:px-14 sm:py-10">
      <SlideBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-4">
          <SlideHeader
            eyebrow={SLIDE_EYEBROWS.distribution}
            title="Partners Needing Attention"
            subtitle="Companies trailing their own peer group (same survey type only), and the specific category dragging each one down."
          />
          {slide.naPercentage > 0 && (
            <span className="mt-1 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
              {slide.naPercentage.toFixed(1)}% of ratings marked N/A
            </span>
          )}
        </div>

        {slide.atRisk.length > 0 ? (
          <div className={`mt-5 grid flex-1 min-h-0 auto-rows-fr grid-cols-1 gap-4 ${gridColsClass}`}>
            {slide.atRisk.map((c, i) => (
              <motion.div
                key={`${c.company}-${c.surveyType}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex flex-col justify-between rounded-2xl border border-amber-100 bg-amber-50/30 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{c.company}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <span style={{ color: surveyTypeColors[c.surveyType] }}>{c.surveyType}</span>
                      <span className="text-slate-300">·</span>
                      <span style={{ color: c.hex }}>{c.band}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-2xl font-bold leading-none" style={{ color: c.hex }}>
                    {c.score.toFixed(0)}
                  </span>
                </div>

                {c.weakestSection ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-amber-700">
                      <span className="flex items-center gap-1 truncate">
                        <AlertTriangle size={10} className="shrink-0" />
                        <span className="truncate">Weakest: {c.weakestSection}</span>
                      </span>
                      <span className="shrink-0">{(c.weakestPercent ?? 0).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.max(2, Math.min(100, c.weakestPercent ?? 0))}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[10px] text-slate-400">Below peer average overall.</p>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 text-center">
            <Trophy size={22} className="text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700">No partner is meaningfully trailing its peer group.</p>
            <p className="text-xs text-slate-400">Every company is performing in line with (or above) its peers this period.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ClosingSlide({ slide }: { slide: Extract<Slide, { kind: 'closing' }> }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#172033] via-[#0f1a2e] to-[#0063a9] px-10 py-10 text-center text-white">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
      <Trophy className="mb-4 text-sky-200" size={30} />
      <h2 className="text-2xl font-bold sm:text-3xl">Key Takeaways</h2>
      <ul className="mx-auto mt-6 max-w-2xl space-y-3 text-left">
        {slide.takeaways.map((point) => (
          <li key={point} className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
            <span className="text-sm text-blue-50">{point}</span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">Thank you</p>
    </div>
  );
}

function SlideContent({ slide, responses = [] }: { slide: Slide; responses?: SurveyResponse[] }) {
  switch (slide.kind) {
    case 'title':
      return <TitleSlide slide={slide} />;
    case 'agenda':
      return <AgendaSlide slide={slide} />;
    case 'overview':
      return <OverviewSlide slide={slide} responses={responses} />;
    case 'comparison':
      return <ComparisonSlide slide={slide} responses={responses} />;
    case 'sections':
      return <SectionsSlide slide={slide} />;
    case 'leaderboard':
      return <LeaderboardSlide slide={slide} responses={responses} />;
    case 'trends':
      return <TrendsSlide slide={slide} />;
    case 'questions':
      return <QuestionsSlide slide={slide} />;
    case 'spotlight':
      return <SpotlightSlide slide={slide} />;
    case 'distribution':
      return <NeedsAttentionSlide slide={slide} />;

    case 'closing':
      return <ClosingSlide slide={slide} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Deck shell: thumbnails, controls, fullscreen, PDF/PPTX export        */
/* ------------------------------------------------------------------ */

export function SlideDeck({ slides, title, onExit, responses = [] }: SlideDeckProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'pptx' | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [frameHeight, setFrameHeight] = useState<number | null>(null);

  const goTo = (next: number) => {
    if (next < 0 || next >= slides.length) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') goTo(index + 1);
      if (event.key === 'ArrowLeft') goTo(index - 1);
      if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, slides.length]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  // Bounds the whole deck card to the visible viewport (minus whatever sits
  // above it) so the toolbar, stage, and thumbnail rail all stay reachable
  // without scrolling on a shorter screen like a 1366x768 laptop. A 420px
  // floor stops it from getting crushed if the available space is ever
  // unusually small.
  useLayoutEffect(() => {
    const recompute = () => {
      if (!shellRef.current) return;
      const top = shellRef.current.getBoundingClientRect().top;
      setFrameHeight(Math.max(420, window.innerHeight - top - 24));
    };
    recompute();
    window.addEventListener('resize', recompute);
    document.addEventListener('fullscreenchange', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      document.removeEventListener('fullscreenchange', recompute);
    };
  }, [isFullscreen]);

  // Measures the space actually available for the slide canvas so it can be
  // scaled down/up (via CSS transform) to the largest size that fits it
  // without cropping or distorting the fixed design resolution above.
  // Re-subscribing whenever frameHeight changes matters: frameHeight is set
  // by the effect above, then applied to the shell's inline height on the
  // *next* render - observing (and taking an immediate reading) only once on
  // mount could capture the viewport's size before that height ever lands,
  // then never correct itself since a ResizeObserver only fires again on a
  // genuine subsequent size change.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [frameHeight]);

  // Falls back to 1 before the first real measurement lands, purely so the
  // canvas always has a valid transform to render with - the slide content
  // itself (AnimatePresence/motion.div) must never be conditionally mounted
  // on this value, or a transient 0 mid-animation would tear down and
  // recreate AnimatePresence, desyncing it from `index`.
  const scale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(viewportSize.width / SLIDE_WIDTH, viewportSize.height / SLIDE_HEIGHT)
      : 1;

  const toggleFullscreen = async () => {
    if (!shellRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await shellRef.current.requestFullscreen();
    }
  };

  const handleExport = async (format: 'pdf' | 'pptx') => {
    setExportMenuOpen(false);
    setIsExporting(format);
    try {
      if (format === 'pdf') await exportSlidesAsPDF(slides, title);
      else exportSlidesAsPPTX(slides, title);
    } finally {
      setIsExporting(null);
    }
  };

  const progress = useMemo(() => ((index + 1) / slides.length) * 100, [index, slides.length]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onExit} type="button" className="secondary-button">
          <ArrowLeft size={16} />
          <span>Back to setup</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              type="button"
              className="secondary-button"
              disabled={isExporting !== null}
            >
              <Download size={16} />
              <span>{isExporting ? 'Exporting…' : 'Export As'}</span>
              <ChevronDown size={14} />
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileText size={14} /> PDF Document
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pptx')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Presentation size={14} /> PowerPoint (PPTX)
                </button>
              </div>
            ) : null}
          </div>
          <button onClick={toggleFullscreen} type="button" className="secondary-button">
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isFullscreen ? 'Exit fullscreen' : 'Present fullscreen'}</span>
          </button>
        </div>
      </div>

      <div
        ref={shellRef}
        className="flex min-h-[420px] flex-col rounded-2xl border border-slate-200 bg-slate-950 p-3 dark:border-slate-800 sm:p-5"
        style={frameHeight ? { height: frameHeight } : undefined}
      >
        {/* Progress bar */}
        <div className="mb-3 h-1 w-full shrink-0 overflow-hidden rounded-full bg-white/10">
          <div className="h-1 rounded-full bg-[#2563eb] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          {/* Stage */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={viewportRef}
              className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-900"
            >
              <div
                className="relative shrink-0 overflow-hidden rounded-xl shadow-2xl"
                style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})` }}
              >
                <AnimatePresence custom={direction} mode="wait">
                  <motion.div
                    key={index}
                    custom={direction}
                    initial={{ opacity: 0, x: direction * 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -40 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="absolute inset-0"
                  >
                    <SlideContent slide={slides[index]} responses={responses} />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Prev / Next */}
              <button
                onClick={() => goTo(index - 1)}
                type="button"
                disabled={index === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-0"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => goTo(index + 1)}
                type="button"
                disabled={index === slides.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-0"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="mt-2 flex shrink-0 items-center justify-center gap-2 text-xs font-semibold text-slate-300">
              <span>
                Slide {index + 1} of {slides.length}
              </span>
              <span className="text-slate-500">·</span>
              <span>{slideTitleFor(slides[index], index)}</span>
            </div>
          </div>

          {/* Thumbnail rail */}
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:w-40 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
            {slides.map((slide, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                type="button"
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition lg:w-full ${
                  i === index
                    ? 'border-[#2563eb] bg-[#2563eb]/10 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:bg-white/10'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px]">{i + 1}</span>
                <span className="truncate">{slideTitleFor(slide, i)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
