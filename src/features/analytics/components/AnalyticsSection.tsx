import { type ReactNode } from 'react';

interface AnalyticsSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AnalyticsSection({ id, eyebrow, title, description, children }: AnalyticsSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-4 sm:space-y-5">
      <div className="flex max-w-3xl flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-blue-400">
          {eyebrow}
        </p>
        <h2 id={headingId} className="section-title">
          {title}
        </h2>
        <p className="supporting-text">{description}</p>
      </div>
      {children}
    </section>
  );
}
