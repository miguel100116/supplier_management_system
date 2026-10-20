import { SurveyType } from '../types/survey';

/**
 * Point weights pulled directly from the MBS Partner Evaluation Forms
 * (Form 20-002 Form 2/3/4). These are what makes a company's composite
 * score match the actual paper rubric instead of a generic 0-4 average.
 *
 * - Courier (Courier form, Form 4 Rev. A): 5 sections, 100 points total.
 * - Supplier (Form 2 Rev. B): 5 sections of 20 points each, 100 points total.
 * - Subcontractor (Form 3 Rev. A): every question is scored 0/1/2/N-A on the
 *   same discrete scale, so "maxPoints" is 2 for all of them. There's no
 *   official 100-point total for this form; we compute a 0-100 composite
 *   (average / 2 * 100) internally so every survey type can share one
 *   leaderboard axis and one set of chart components, but Subcontractor is
 *   converted back to its native 0-2.0 scale for display (see
 *   formatCompositeScore below). All partner types use the same 0-100 rating
 *   bands against that normalized composite score.
 */
export interface QuestionWeight {
  questionId: string;
  section: string;
  maxPoints: number;
}

export const questionWeights: Record<SurveyType, QuestionWeight[]> = {
  Courier: [
    { questionId: 'Q01', section: 'Reliability/Delivery', maxPoints: 15 },
    { questionId: 'Q02', section: 'Reliability/Delivery', maxPoints: 15 },
    { questionId: 'Q08', section: 'Cost', maxPoints: 7 },
    { questionId: 'Q09', section: 'Cost', maxPoints: 7 },
    { questionId: 'Q10', section: 'Cost', maxPoints: 6 },
    { questionId: 'Q17', section: 'Technology', maxPoints: 5 },
    { questionId: 'Q18', section: 'Technology', maxPoints: 5 },
    { questionId: 'Q19', section: 'Customer Service', maxPoints: 10 },
    { questionId: 'Q20', section: 'Customer Service', maxPoints: 10 },
    { questionId: 'Q21', section: 'Customer Service', maxPoints: 5 },
    { questionId: 'Q44', section: 'Security', maxPoints: 5 },
    { questionId: 'Q45', section: 'Security', maxPoints: 10 },
  ],
  Supplier: [
    { questionId: 'Q39', section: 'Documentation', maxPoints: 4 },
    { questionId: 'Q40', section: 'Documentation', maxPoints: 4 },
    { questionId: 'Q41', section: 'Documentation', maxPoints: 4 },
    { questionId: 'Q42', section: 'Documentation', maxPoints: 4 },
    { questionId: 'Q43', section: 'Documentation', maxPoints: 4 },
    { questionId: 'Q05', section: 'Delivery', maxPoints: 7 },
    { questionId: 'Q06', section: 'Delivery', maxPoints: 7 },
    { questionId: 'Q07', section: 'Delivery', maxPoints: 6 },
    { questionId: 'Q14', section: 'Price/Cost Effectiveness', maxPoints: 6 },
    { questionId: 'Q15', section: 'Price/Cost Effectiveness', maxPoints: 7 },
    { questionId: 'Q16', section: 'Price/Cost Effectiveness', maxPoints: 7 },
    { questionId: 'Q33', section: 'Quality', maxPoints: 7 },
    { questionId: 'Q34', section: 'Quality', maxPoints: 6 },
    { questionId: 'Q35', section: 'Quality', maxPoints: 7 },
    { questionId: 'Q25', section: 'Communication', maxPoints: 7 },
    { questionId: 'Q26', section: 'Communication', maxPoints: 6 },
    { questionId: 'Q27', section: 'Communication', maxPoints: 7 },
  ],
  Subcontractor: [
    { questionId: 'Q03', section: 'Delivery / Timeliness', maxPoints: 2 },
    { questionId: 'Q04', section: 'Delivery / Timeliness', maxPoints: 2 },
    { questionId: 'Q36', section: 'Documentation / Invoicing', maxPoints: 2 },
    { questionId: 'Q37', section: 'Documentation / Invoicing', maxPoints: 2 },
    { questionId: 'Q38', section: 'Documentation / Invoicing', maxPoints: 2 },
    { questionId: 'Q11', section: 'Cost Control / Pricing', maxPoints: 2 },
    { questionId: 'Q12', section: 'Cost Control / Pricing', maxPoints: 2 },
    { questionId: 'Q13', section: 'Cost Control / Pricing', maxPoints: 2 },
    { questionId: 'Q28', section: 'Quality & Technical Competence', maxPoints: 2 },
    { questionId: 'Q29', section: 'Quality & Technical Competence', maxPoints: 2 },
    { questionId: 'Q30', section: 'Quality & Technical Competence', maxPoints: 2 },
    { questionId: 'Q31', section: 'Quality & Technical Competence', maxPoints: 2 },
    { questionId: 'Q32', section: 'Quality & Technical Competence', maxPoints: 2 },
    { questionId: 'Q22', section: 'Communication', maxPoints: 2 },
    { questionId: 'Q23', section: 'Communication', maxPoints: 2 },
    { questionId: 'Q24', section: 'Communication', maxPoints: 2 },
  ],
};

export interface ScoreBand {
  label: string;
  min: number;
  hex: string;
  // True only for the Courier/Supplier Unsatisfactory tier - the paper form
  // flags any 79-and-below rating as requiring a Supplier/Courier Corrective
  // Action. Used by getRemarkText to fold that into the displayed remark.
  correctiveAction?: boolean;
}

// All partner types use the approved shared scale on the normalized 0–100
// composite score.
export const APPROVED_RATING_BANDS: ScoreBand[] = [
  { label: 'Excellent', min: 95, hex: '#22c55e' },       // Green
  { label: 'Good', min: 89, hex: '#fb923c' },             // Orange
  { label: 'Satisfactory', min: 80, hex: '#3b82f6' },     // Blue
  { label: 'Unsatisfactory', min: 0, hex: '#dc2626' },    // Red
];

// Courier and Supplier retain their form-specific corrective-action remark;
// Subcontractor uses the same rating bands without that remark.
const COURIER_SUPPLIER_BANDS: ScoreBand[] = APPROVED_RATING_BANDS.map((band) => (
  band.label === 'Unsatisfactory'
    ? { ...band, correctiveAction: true }
    : { ...band }
));
const SUBCONTRACTOR_BANDS: ScoreBand[] = APPROVED_RATING_BANDS.map((band) => ({ ...band }));

export const ratingBands: Record<SurveyType, ScoreBand[]> = {
  Courier: COURIER_SUPPLIER_BANDS,
  Supplier: COURIER_SUPPLIER_BANDS,
  Subcontractor: SUBCONTRACTOR_BANDS,
};

// percentScore is the shared normalized 0-100 composite value for every
// survey type (see computeCompanyComposite in scoring.ts).
export function getBand(surveyType: SurveyType, percentScore: number): ScoreBand {
  const bands = ratingBands[surveyType];
  return bands.find((band) => percentScore >= band.min) ?? bands[bands.length - 1];
}

// Full remark text for a band - same as the label, except the Courier/
// Supplier Unsatisfactory tier, where the paper form's "Corrective Action"
// requirement is folded directly into the remark so it reads as an action
// item, not just a rating. Use this (not band.label) anywhere a "remark" is
// shown to the user (leaderboards, Remarks columns) - use band.label for
// compact rating-classification widgets (rating band chips, standing badges).
export function getRemarkText(band: ScoreBand): string {
  return band.correctiveAction ? `${band.label} – Corrective Action Required` : band.label;
}

export interface FormattedScore {
  value: number; // native units: 0-100 for Courier/Supplier, 0-2 for Subcontractor
  max: number; // 100 or 2
  valueText: string; // value formatted to the type's display precision, no unit suffix - use for bare number display
  text: string; // e.g. "62.3 / 100" or "1.74 / 2.0"
}

// Converts a shared 0-100 composite value into the survey type's native
// display scale. Only for company/submission-level composite scores - not
// for per-question values, which stay on their own 0-100 normalization.
//
// Subcontractor uses 2 decimals (not 1) because its native scale only spans
// 0-2.0 - one decimal there collapses a 5-percentage-point band into a
// single displayed number (e.g. 85%-89% all read "1.7"), which makes
// distinct companies look tied - and same-score companies look mis-ranked -
// when they aren't. Courier/Supplier's 0-100 scale doesn't have this
// problem at 1 decimal.
export function formatCompositeScore(surveyType: SurveyType, compositeScore: number): FormattedScore {
  if (surveyType === 'Subcontractor') {
    const value = Number((compositeScore / 50).toFixed(2));
    const valueText = value.toFixed(2);
    return { value, max: 2, valueText, text: `${valueText} / 2.0` };
  }
  const value = Number(compositeScore.toFixed(1));
  const valueText = value.toFixed(1);
  return { value, max: 100, valueText, text: `${valueText} / 100` };
}

export const surveyTypeDisplayLabel: Record<SurveyType, string> = {
  Courier: 'Courier',
  Supplier: 'Supplier',
  Subcontractor: 'Subcontractor',
};

export const ID_MAPPING: Record<string, string> = {
  // Courier (Courier)
  'Q-CON-04': 'Q01',
  'Q-CON-05': 'Q02',
  'Q-CON-07': 'Q08',
  'Q-CON-08': 'Q09',
  'Q-CON-09': 'Q10',
  'Q-CON-11': 'Q17',
  'Q-CON-12': 'Q18',
  'Q-CON-14': 'Q19',
  'Q-CON-15': 'Q20',
  'Q-CON-16': 'Q21',
  'Q-CON-18': 'Q44',
  'Q-CON-19': 'Q45',

  // Supplier
  'Q-SUP-05': 'Q39',
  'Q-SUP-06': 'Q40',
  'Q-SUP-07': 'Q41',
  'Q-SUP-08': 'Q42',
  'Q-SUP-09': 'Q43',
  'Q-SUP-11': 'Q05',
  'Q-SUP-12': 'Q06',
  'Q-SUP-13': 'Q07',
  'Q-SUP-15': 'Q14',
  'Q-SUP-16': 'Q15',
  'Q-SUP-17': 'Q16',
  'Q-SUP-19': 'Q33',
  'Q-SUP-20': 'Q34',
  'Q-SUP-21': 'Q35',
  'Q-SUP-23': 'Q25',
  'Q-SUP-24': 'Q26',
  'Q-SUP-25': 'Q27',

  // Subcontractor (matrix sub-questions)
  'Q-SUB-04-a': 'Q03',
  'Q-SUB-04-b': 'Q04',
  'Q-SUB-06-a': 'Q36',
  'Q-SUB-06-b': 'Q37',
  'Q-SUB-06-c': 'Q38',
  'Q-SUB-08-a': 'Q11',
  'Q-SUB-08-b': 'Q12',
  'Q-SUB-08-c': 'Q13',
  'Q-SUB-10-a': 'Q28',
  'Q-SUB-10-b': 'Q29',
  'Q-SUB-10-c': 'Q30',
  'Q-SUB-10-d': 'Q31',
  'Q-SUB-10-e': 'Q32',
  'Q-SUB-12-a': 'Q22',
  'Q-SUB-12-b': 'Q23',
  'Q-SUB-12-c': 'Q24',
};

export function getCanonicalQuestionId(questionId: string): string {
  return ID_MAPPING[questionId] || questionId;
}

export function getQuestionMaxPoints(surveyType: SurveyType, questionId: string): number {
  const canonicalId = getCanonicalQuestionId(questionId);
  const weight = questionWeights[surveyType]?.find((w) => w.questionId === canonicalId);
  if (weight) return weight.maxPoints;
  return 100; // default fallback if not found
}

export function isScoredQuestion(surveyType: SurveyType, questionId: string): boolean {
  const canonicalId = getCanonicalQuestionId(questionId);
  return questionWeights[surveyType]?.some((w) => w.questionId === canonicalId) ?? false;
}
