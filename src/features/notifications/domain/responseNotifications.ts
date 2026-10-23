import type { ResponseNotification, SurveyResponse } from '../../../types/survey';

export function toNotification(rows: SurveyResponse[]): ResponseNotification | null {
  const first = rows[0];
  if (!first) return null;
  return {
    id: first.responseId,
    company: first.company,
    surveyType: first.surveyType,
    respondentType: first.respondentType,
    submissionDate: first.submissionDate,
    questionCount: rows.length,
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
    .sort((a, b) => b.submissionDate.localeCompare(a.submissionDate));
}
