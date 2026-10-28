import type { SurveyType } from '../../../types/survey';
import { isPaperSize, PAPER_SIZES, type PaperSize } from './paperSize';

export type ReportKind = 'summary' | 'company' | 'question' | 'executive' | 'raw' | 'archived-survey' | 'archived-responses' | 'archived-company';
export type ReportFormat = 'pdf' | 'csv' | 'excel' | 'docx';
export interface ReportParameters {
  paperSize?: PaperSize;
  archivedItemId?: string;
  archivedItemLabel?: string;
  selectedTypes?: Record<SurveyType, boolean>;
  columnsVisibility?: { average: boolean; responses: boolean; highest: boolean; lowest: boolean };
  graphs?: { bar: boolean; radar: boolean; trend: boolean; perQuestion: boolean };
  selectedComments?: Record<string, boolean>;
  category?: SurveyType;
  selectedCompany?: string;
  reportAudience?: 'internal' | 'external';
  chartMetric?: 'responses' | 'rating';
  questionThreshold?: number;
  preparedBy?: string;
  customNotesText?: string;
  includeComments?: boolean;
  showKpis?: boolean;
  showChart?: boolean;
  showTable?: boolean;
  showTopCompanies?: boolean;
  showBottomCompanies?: boolean;
  showQuestions?: boolean;
  showCoverPage?: boolean;
  showSurveyTable?: boolean;
  showQuestionTable?: boolean;
  showCompanyRankings?: boolean;
  showRecommendations?: boolean;
  showCustomNotes?: boolean;
  showDetailedQuestionReport?: boolean;
}

export interface ReportRecipe { kind: ReportKind; parameters: ReportParameters }

export function createReportId(): string {
  // randomUUID is unavailable on HTTP LAN hosts; getRandomValues remains available.
  return crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function reportFilename(title: string, format: ReportFormat, date = new Date(), id: string = createReportId()): string {
  const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'report';
  return `sms_${name}_${date.toISOString().replace(/[:.]/g, '-')}_${id.slice(0, 8)}.${format === 'excel' ? 'xlsx' : format}`;
}

export function validateReportRecipe(value: unknown): asserts value is ReportRecipe {
  if (!value || typeof value !== 'object') throw new Error('Invalid report recipe.');
  const { kind, parameters } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || !['summary', 'company', 'question', 'executive', 'raw', 'archived-survey', 'archived-responses', 'archived-company'].includes(kind) || !parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('Invalid report recipe.');
  const booleans = ['includeComments', 'showKpis', 'showChart', 'showTable', 'showTopCompanies', 'showBottomCompanies', 'showQuestions', 'showCoverPage', 'showSurveyTable', 'showQuestionTable', 'showCompanyRankings', 'showRecommendations', 'showCustomNotes', 'showDetailedQuestionReport'];
  for (const [key, item] of Object.entries(parameters)) {
    if (booleans.includes(key)) { if (typeof item !== 'boolean') throw new Error('Invalid report option.'); }
    else if (['selectedTypes', 'columnsVisibility', 'graphs', 'selectedComments'].includes(key)) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || Object.values(item).some(flag => typeof flag !== 'boolean')) throw new Error('Invalid report selection.');
      const required = key === 'selectedTypes' ? ['Courier', 'Supplier', 'Subcontractor'] : key === 'graphs' ? ['bar', 'radar', 'trend', 'perQuestion'] : key === 'columnsVisibility' ? ['average', 'responses', 'highest', 'lowest'] : [];
      if (required.some(field => !(field in item))) throw new Error('Incomplete report selection.');
    } else if (key === 'questionThreshold') { if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > 100) throw new Error('Invalid report threshold.'); }
    else if (key === 'paperSize') { if (!isPaperSize(item)) throw new Error('Invalid paper size.'); }
    else if (key === 'category') { if (typeof item !== 'string' || !['Courier', 'Supplier', 'Subcontractor'].includes(item)) throw new Error('Invalid report category.'); }
    else if (key === 'reportAudience') { if (!['internal', 'external'].includes(String(item))) throw new Error('Invalid report audience.'); }
    else if (key === 'chartMetric') { if (!['responses', 'rating'].includes(String(item))) throw new Error('Invalid report metric.'); }
    else if (['archivedItemId', 'archivedItemLabel'].includes(key)) { if (typeof item !== 'string' || !item.trim() || item.length > 2_000) throw new Error('Invalid archived item.'); }
    else if (['selectedCompany', 'preparedBy', 'customNotesText'].includes(key)) { if (typeof item !== 'string' || item.length > 100_000) throw new Error('Invalid report text.'); }
    else throw new Error('Unknown report option.');
  }
  if (kind.startsWith('archived-')) {
    const options = parameters as Record<string, unknown>;
    if (typeof options.archivedItemId !== 'string' || !options.archivedItemId.trim() || !options.category) throw new Error('Select one archived item and category.');
  }
}

export function describeReportParameters(recipe?: ReportRecipe): string {
  if (!recipe) return 'Legacy export: saved options unavailable';
  if (recipe.kind.startsWith('archived-')) return `${recipe.parameters.category} | ${recipe.parameters.archivedItemLabel ?? 'Saved archived item'} | Comments: ${recipe.parameters.includeComments ? 'Included' : 'Excluded'}${recipe.parameters.paperSize ? ` | Paper: ${PAPER_SIZES[recipe.parameters.paperSize].label}` : ''}`;
  const labels: Record<string, string> = { selectedTypes: 'Categories', selectedCompany: 'Company', selectedComments: 'Selected comments', columnsVisibility: 'Columns', graphs: 'Charts' };
  return Object.entries(recipe.parameters).map(([key, value]) => {
    const label = labels[key] ?? key.replace(/^show/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/kpis/i, 'KPIs');
    const display = key === 'paperSize' && isPaperSize(value) ? PAPER_SIZES[value].label
      : key === 'selectedComments' ? Object.values(value).filter(Boolean).length
      : typeof value === 'object' ? Object.entries(value).filter(([, enabled]) => enabled).map(([name]) => name.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ') || 'none'
      : typeof value === 'boolean' ? value ? 'Included' : 'Excluded' : String(value);
    return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${display}`;
  }).join(' · ') || 'Default options';
}
