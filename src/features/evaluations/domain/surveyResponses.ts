import type { CustomForm, SurveyResponse } from '../../../types/survey';
import { isScoredQuestion } from '../../../data/questionWeights';
import { submissionScores } from '../../../utils/analytics';

export interface SurveySubmission {
  id: string;
  answers: SurveyResponse[];
  first: SurveyResponse;
  score: number | null;
}

function questionIds(survey: CustomForm): Set<string> {
  return new Set(survey.questions.flatMap((question) => [
    question.questionId,
    ...(question.subQuestions?.map((sub) => question.questionId + '-' + sub.id) ?? []),
  ]));
}

export function selectSurveyResponses(
  survey: CustomForm,
  surveys: CustomForm[],
  responses: SurveyResponse[],
): SurveyResponse[] {
  const ids = questionIds(survey);
  const owners = new Map<string, Set<string>>();
  for (const form of surveys.filter((item) => item.surveyType === survey.surveyType)) {
    for (const id of questionIds(form)) {
      const formIds = owners.get(id) ?? new Set<string>();
      formIds.add(form.id);
      owners.set(id, formIds);
    }
  }
  const legacyGroups = new Map<string, SurveyResponse[]>();
  for (const response of responses) {
    if (response.surveyId || response.surveyType !== survey.surveyType) continue;
    const group = legacyGroups.get(response.responseId) ?? [];
    group.push(response);
    legacyGroups.set(response.responseId, group);
  }
  const matchedLegacyIds = new Set<string>();
  for (const [responseId, group] of legacyGroups) {
    const uniqueOwners = new Set(group.flatMap((answer) => {
      const formIds = owners.get(answer.questionId);
      return formIds?.size === 1 ? [...formIds] : [];
    }));
    if (uniqueOwners.size === 1 && uniqueOwners.has(survey.id)) matchedLegacyIds.add(responseId);
  }
  return responses.filter((response) =>
    response.surveyType === survey.surveyType &&
    (response.surveyId
      ? response.surveyId === survey.id
      : matchedLegacyIds.has(response.responseId) && ids.has(response.questionId)),
  );
}

export function groupSurveySubmissions(responses: SurveyResponse[]): SurveySubmission[] {
  const groups = new Map<string, SurveyResponse[]>();
  for (const response of responses) {
    const group = groups.get(response.responseId) ?? [];
    group.push(response);
    groups.set(response.responseId, group);
  }
  return [...groups].map(([id, answers]) => {
    const scored = answers.filter((answer) => isScoredQuestion(answer.surveyType, answer.questionId));
    return {
      id,
      answers,
      first: answers[0],
      score: scored.length ? (submissionScores(scored)[0]?.score ?? null) : null,
    };
  }).sort((a, b) => b.first.submissionDate.localeCompare(a.first.submissionDate));
}

export function filterSurveySubmissions(submissions: SurveySubmission[], emailSearch: string): SurveySubmission[] {
  const query = emailSearch.trim().toLowerCase();
  return query
    ? submissions.filter((submission) => submission.first.respondentEmail?.toLowerCase().includes(query))
    : submissions;
}

export function answerValue(answer: SurveyResponse): string | number {
  if (isScoredQuestion(answer.surveyType, answer.questionId)) return answer.rating;
  if (answer.comment) return answer.comment;
  return answer.rating === 'N/A' ? 'N/A' : answer.rating;
}

export function buildSurveyResponseExport(
  survey: CustomForm,
  submissions: SurveySubmission[],
): { columns: string[]; rows: (string | number)[][] } {
  const definitions = survey.questions.flatMap((question) => question.subQuestions?.length
    ? question.subQuestions.map((sub) => ({
      id: question.questionId + '-' + sub.id,
      label: 'Q' + question.questionNumber + ': ' + sub.label,
    }))
    : [{ id: question.questionId, label: 'Q' + question.questionNumber + ': ' + question.question }]);
  const seen = new Set(definitions.map((definition) => definition.id));
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      if (!seen.has(answer.questionId)) {
        definitions.push({ id: answer.questionId, label: 'Q' + answer.questionNumber + ': ' + answer.question });
        seen.add(answer.questionId);
      }
    }
  }
  return {
    columns: ['Respondent Email', 'Department', 'Partner Evaluated', 'Submission Date', 'Overall Score (%)', ...definitions.map((definition) => definition.label)],
    rows: submissions.map((submission) => {
      const answers = new Map(submission.answers.map((answer) => [answer.questionId, answerValue(answer)]));
      const first = submission.first;
      return [
        first.respondentEmail ?? '',
        first.department ?? '',
        first.company,
        first.submissionDate + (first.submissionDateInferredFrom ? ' (inferred)' : ''),
        submission.score === null ? '' : Math.round(submission.score * 10) / 10,
        ...definitions.map((definition) => answers.get(definition.id) ?? ''),
      ];
    }),
  };
}

export function surveyResponseFilename(title: string, date: Date): string {
  const safeTitle = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().replace(/\s+/g, '_').slice(0, 80) || 'Evaluation';
  return safeTitle + '_responses_' + date.toISOString().slice(0, 10) + '.xlsx';
}
