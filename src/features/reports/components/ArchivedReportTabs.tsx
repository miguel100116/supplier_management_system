import { useId } from 'react';
import type { ArchivedReportKind } from '../domain/archivedReports';

export const ARCHIVED_REPORT_TABS: { value: ArchivedReportKind; label: string }[] = [
  { value: 'archived-survey', label: 'Archived Surveys' },
  { value: 'archived-responses', label: 'Archived Responses' },
  { value: 'archived-company', label: 'Archived Companies' },
];

/** Shared keyboard behavior for the report-type and partner-category tabs. */
export function ArchiveTabs<T extends string>({ label, options, value, onChange, children }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return <div className="min-w-0 space-y-4">
    <div role="tablist" aria-label={label} className="admin-tab-strip flex-wrap">
      {options.map((option, index) => <button key={option.value} type="button" role="tab" id={`${id}-${option.value}`} aria-controls={`${id}-panel`} aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1} className={value === option.value ? 'primary-button' : 'secondary-button'} onClick={() => onChange(option.value)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
        onChange(options[next].value);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>{option.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} className="min-w-0">{children}</div>
  </div>;
}
