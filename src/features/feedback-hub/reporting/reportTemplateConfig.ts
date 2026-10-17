import { SurveyType } from '../../../types/survey';

export type ReportTemplateId = 'courier' | 'supplier' | 'subcontractor';

export interface ReportTemplateConfig {
  id: ReportTemplateId;
  surveyType: SurveyType;
  surveyCardTitle: string;
  referenceFilename: string;
  reportTitle: string;
  chartColors: readonly [string, string, string, string, string];
}

const TEMPLATE_CHART_COLORS = [
  '#4F81BD',
  '#C0504D',
  '#9BBB59',
  '#8064A2',
  '#4BACC6',
] as const;

export const REPORT_TEMPLATE_BY_SURVEY_TYPE: Readonly<Record<SurveyType, ReportTemplateConfig>> = {
  Courier: {
    id: 'courier',
    surveyType: 'Courier',
    surveyCardTitle: 'Courier Satisfaction Evaluation',
    referenceFilename: 'Sample Format - Courier Performance Rating.docx',
    reportTitle: 'Courier Performance Report',
    chartColors: TEMPLATE_CHART_COLORS,
  },
  Supplier: {
    id: 'supplier',
    surveyType: 'Supplier',
    surveyCardTitle: 'Supplier Quality Evaluation',
    referenceFilename: 'Sample Format - Supplier Performance Rating.docx',
    reportTitle: 'Supplier Performance Report',
    chartColors: TEMPLATE_CHART_COLORS,
  },
  Subcontractor: {
    id: 'subcontractor',
    surveyType: 'Subcontractor',
    surveyCardTitle: 'Subcontractor Performance Evaluation',
    referenceFilename: 'Sample Format - Subcon Performance Rating.docx',
    reportTitle: 'Subcontractor Performance Report',
    chartColors: TEMPLATE_CHART_COLORS,
  },
};

export function getReportTemplateConfig(surveyType: SurveyType): ReportTemplateConfig {
  return REPORT_TEMPLATE_BY_SURVEY_TYPE[surveyType];
}
