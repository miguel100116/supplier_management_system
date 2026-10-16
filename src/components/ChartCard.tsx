import { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  contentClassName?: string;
  action?: ReactNode;
}

export function ChartCard({ title, subtitle, children, contentClassName, action }: ChartCardProps) {
  return (
    <section className="panel min-w-0">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="card-title break-words">{title}</h3>
          {subtitle ? <p className="supporting-text mt-1 break-words">{subtitle}</p> : null}
        </div>
        {action ? <div className="max-w-full overflow-x-auto pb-1 sm:shrink-0 sm:pb-0">{action}</div> : null}
      </div>
      <div className={`min-w-0 max-w-full ${contentClassName ?? 'h-72'}`}>{children}</div>
    </section>
  );
}
