import type { ResponseNotification, SurveyResponse } from '../../../types/survey';
import { hasAnsweredItem } from '../../analytics/domain/analytics';
import { compareNotificationDates } from './notificationPresentation';

export function toNotification(rows: SurveyResponse[]): ResponseNotification | null {
  const first = rows[0];
  const answered = new Set(rows.filter(hasAnsweredItem).map((row) => row.questionId));
  if (!first || answered.size === 0) return null;
  return {
    id: first.responseId,
    company: first.company,
    surveyType: first.surveyType,
    respondentType: first.respondentType,
    submissionDate: first.submissionDate,
    questionCount: answered.size,
    respondentEmail: first.respondentEmail,
    department: first.department,
    designation: first.respondentType,
  };
}

export function groupResponsesToNotifications(responses: SurveyResponse[]): ResponseNotification[] {
  const groups = new Map<string, SurveyResponse[]>();
  for (const row of responses) {
    const group = groups.get(row.responseId) ?? [];
    group.push(row);
    groups.set(row.responseId, group);
  }
  return [...groups.values()].map(toNotification)
    .filter((item): item is ResponseNotification => item !== null)
    .sort((a, b) => compareNotificationDates(a.submissionDate, b.submissionDate));
}
