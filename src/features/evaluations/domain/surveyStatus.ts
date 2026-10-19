import type { CustomForm } from '../../../types/survey';
import { parseDDMMYYYY } from '../../../utils/time';

export function getSurveyStatus(
  survey: Pick<CustomForm, 'status' | 'deadlineDate' | 'manuallyEndedAt'>,
  now = new Date()
): NonNullable<CustomForm['status']> {
  if (survey.status === 'Archived') return 'Archived';
  if (survey.status === 'Completed' && survey.manuallyEndedAt) return 'Completed';
  const deadline = parseDDMMYYYY(survey.deadlineDate);
  if (!deadline) return survey.status ?? 'Running';
  const endOfDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate() + 1);
  if (now >= endOfDeadline) return 'Completed';
  return survey.status === 'Paused' ? 'Paused' : 'Running';
}
