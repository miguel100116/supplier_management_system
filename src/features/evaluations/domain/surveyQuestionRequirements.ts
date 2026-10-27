import { isOverallCategory } from '../../../data/questionCategories';
import type { CustomForm } from '../../../types/survey';

type SurveyQuestion = CustomForm['questions'][number];

const remarkQuestionPattern = /\bremarks?\b|\bcomments?\b/i;
const overallFeedbackPattern = /\boverall\b.*\b(?:comments?|feedback)\b/i;

export const OVERALL_FEEDBACK_VALIDATION_MESSAGE = 'Please enter overall feedback. Blank, N/A, NA, and None are not accepted.';

export function isOverallFeedbackQuestion(question: SurveyQuestion): boolean {
  return question.inputType === 'text'
    && isOverallCategory(question.questionCategory.trim())
    && overallFeedbackPattern.test(question.question);
}

export function isValidOverallFeedbackAnswer(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const answer = value.trim().toUpperCase();
  return Boolean(answer) && !['N/A', 'NA', 'NONE'].includes(answer);
}

/** Employee-side remark prompts are optional; the closing overall feedback stays required. */
export function isOptionalEmployeeRemark(question: SurveyQuestion, employeeExperience: boolean): boolean {
  return employeeExperience
    && question.inputType === 'text'
    && !isOverallFeedbackQuestion(question)
    && remarkQuestionPattern.test(question.question);
}
