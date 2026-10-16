import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}

export function StatCard({ label, value, detail, icon: Icon }: StatCardProps) {
  return (
    <article className="panel min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-text-secondary dark:text-slate-400">{label}</p>
          <p className="kpi-value mt-2 break-words">{value}</p>
        </div>
        <div className="shrink-0 rounded-lg bg-brand-light p-2.5 text-brand dark:bg-blue-950/60 dark:text-blue-300">
          <Icon size={20} />
        </div>
      </div>
      <p className="supporting-text mt-4 line-clamp-2">{detail}</p>
    </article>
  );
}
