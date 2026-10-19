import type { SurveyType } from '../../../types/survey';

export type ReportKind = 'summary' | 'company' | 'question' | 'executive' | 'raw';
export type ReportFormat = 'pdf' | 'csv' | 'excel' | 'docx';
export interface ReportParameters {
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

export function reportFilename(title: string, format: ReportFormat, date = new Date(), id: string = crypto.randomUUID()): string {
  const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'report';
  return `sms_${name}_${date.toISOString().replace(/[:.]/g, '-')}_${id.slice(0, 8)}.${format === 'excel' ? 'xlsx' : format}`;
}

export function validateReportRecipe(value: unknown): asserts value is ReportRecipe {
  if (!value || typeof value !== 'object') throw new Error('Invalid report recipe.');
  const { kind, parameters } = value as Record<string, unknown>;
  if (!['summary', 'company', 'question', 'executive', 'raw'].includes(String(kind)) || !parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('Invalid report recipe.');
  const booleans = ['includeComments', 'showKpis', 'showChart', 'showTable', 'showTopCompanies', 'showBottomCompanies', 'showQuestions', 'showCoverPage', 'showSurveyTable', 'showQuestionTable', 'showCompanyRankings', 'showRecommendations', 'showCustomNotes', 'showDetailedQuestionReport'];
  for (const [key, item] of Object.entries(parameters)) {
    if (booleans.includes(key)) { if (typeof item !== 'boolean') throw new Error('Invalid report option.'); }
    else if (['selectedTypes', 'columnsVisibility', 'graphs', 'selectedComments'].includes(key)) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || Object.values(item).some(flag => typeof flag !== 'boolean')) throw new Error('Invalid report selection.');
      const required = key === 'selectedTypes' ? ['Courier', 'Supplier', 'Subcontractor'] : key === 'graphs' ? ['bar', 'radar', 'trend', 'perQuestion'] : key === 'columnsVisibility' ? ['average', 'responses', 'highest', 'lowest'] : [];
      if (required.some(field => !(field in item))) throw new Error('Incomplete report selection.');
    } else if (key === 'questionThreshold') { if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > 100) throw new Error('Invalid report threshold.'); }
    else if (key === 'category') { if (!['Courier', 'Supplier', 'Subcontractor'].includes(String(item))) throw new Error('Invalid report category.'); }
    else if (key === 'reportAudience') { if (!['internal', 'external'].includes(String(item))) throw new Error('Invalid report audience.'); }
    else if (key === 'chartMetric') { if (!['responses', 'rating'].includes(String(item))) throw new Error('Invalid report metric.'); }
    else if (['selectedCompany', 'preparedBy', 'customNotesText'].includes(key)) { if (typeof item !== 'string' || item.length > 100_000) throw new Error('Invalid report text.'); }
    else throw new Error('Unknown report option.');
  }
}

export function describeReportParameters(recipe?: ReportRecipe): string {
  if (!recipe) return 'Legacy export: saved options unavailable';
  const labels: Record<string, string> = { selectedTypes: 'Categories', selectedCompany: 'Company', selectedComments: 'Selected comments', columnsVisibility: 'Columns', graphs: 'Charts' };
  return Object.entries(recipe.parameters).map(([key, value]) => {
    const label = labels[key] ?? key.replace(/^show/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/kpis/i, 'KPIs');
    const display = key === 'selectedComments' ? Object.values(value).filter(Boolean).length
      : typeof value === 'object' ? Object.entries(value).filter(([, enabled]) => enabled).map(([name]) => name.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ') || 'none'
      : typeof value === 'boolean' ? value ? 'Included' : 'Excluded' : String(value);
    return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${display}`;
  }).join(' · ') || 'Default options';
}
