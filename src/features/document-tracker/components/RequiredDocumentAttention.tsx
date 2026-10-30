import { AlertTriangle, RefreshCw, X, XCircle } from 'lucide-react';
import type { DocumentStatus } from '../../../types/survey';

export type RequiredDocumentAttentionStatus = Extract<DocumentStatus, 'Missing' | 'Expired' | 'For Update'>;

interface RequiredDocumentAttentionProps {
  counts: { missing: number; expired: number; forUpdate: number };
  value?: RequiredDocumentAttentionStatus | null;
  onChange?: (status: RequiredDocumentAttentionStatus | null) => void;
}

export function RequiredDocumentAttention({ counts, value = null, onChange }: RequiredDocumentAttentionProps) {
  const items = [
    { status: 'Missing', label: 'missing', count: counts.missing, Icon: XCircle, color: 'text-rose-700 dark:text-rose-300',
      surface: 'border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/20 dark:hover:bg-rose-950/40',
      selectedSurface: 'border-rose-500 bg-rose-100 dark:border-rose-500 dark:bg-rose-900/50' },
    { status: 'Expired', label: 'expired', count: counts.expired, Icon: AlertTriangle, color: 'text-rose-800 dark:text-rose-200',
      surface: 'border-rose-300 bg-rose-100 hover:bg-rose-200 dark:border-rose-800 dark:bg-rose-900/30 dark:hover:bg-rose-900/50',
      selectedSurface: 'border-rose-600 bg-rose-200 dark:border-rose-400 dark:bg-rose-900/70' },
    { status: 'For Update', label: 'for update', count: counts.forUpdate, Icon: RefreshCw, color: 'text-amber-700 dark:text-amber-300',
      surface: 'border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40',
      selectedSurface: 'border-amber-500 bg-amber-100 dark:border-amber-500 dark:bg-amber-900/50' },
  ] as const;
  const visibleItems = items.filter(item => item.count > 0 || (onChange && item.status === value));
  if (visibleItems.length === 0) return null;

  return (
    <div aria-label="Required document attention summary" className={`mb-3 flex flex-wrap items-center text-[11px] ${onChange ? 'gap-x-2 gap-y-1.5' : 'gap-x-3 gap-y-1'}`}>
      {visibleItems.map(({ status, label, count, Icon, color, surface, selectedSurface }) => {
        const content = <><Icon size={12} aria-hidden="true" /><strong className="tabular-nums">{count}</strong> {label}</>;
        const selected = value === status;
        return onChange ? (
          <button key={status} type="button" aria-pressed={selected}
            onClick={() => onChange(value === status ? null : status)}
            className={`inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 ${color} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2187CD] ${selected ? selectedSurface : surface}`}>
            {content}{selected && <X size={12} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        ) : <span key={status} className={`inline-flex items-center gap-1 ${color}`}>{content}</span>;
      })}
    </div>
  );
}
