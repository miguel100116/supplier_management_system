import type { CustomForm } from '../../../types/survey';
import { getSurveyStatus } from '../domain/surveyStatus';

export function SurveyAccessStatus({ survey }: { survey: Pick<CustomForm, 'status' | 'deadlineDate' | 'manuallyEndedAt'> }) {
  const status = getSurveyStatus(survey);
  const label = status === 'Completed' ? 'Ended' : status === 'Running' ? 'Active' : status;
  const dot = status === 'Completed' ? 'bg-rose-500' : status === 'Paused' ? 'bg-amber-500' : 'bg-emerald-500';
  const text = status === 'Completed'
    ? 'text-rose-600 dark:text-rose-400'
    : status === 'Paused' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
