import { AlertTriangle, CircleAlert, RefreshCw, X } from 'lucide-react';
import type { DocumentStatus } from '../../../types/survey';

export type RequiredDocumentAttentionStatus = Extract<DocumentStatus, 'Missing' | 'Expired' | 'For Update'>;

interface RequiredDocumentAttentionProps {
  counts: { missing: number; expired: number; forUpdate: number };
  value?: RequiredDocumentAttentionStatus | null;
  onChange?: (status: RequiredDocumentAttentionStatus | null) => void;
  showStaticContainers?: boolean;
  className?: string;
}

export function RequiredDocumentAttention({ counts, value = null, onChange, showStaticContainers = false, className }: RequiredDocumentAttentionProps) {
  const items = [
    { status: 'Expired', label: 'expired', count: counts.expired, Icon: AlertTriangle, color: 'text-rose-800 dark:text-rose-200',
      surface: 'border-rose-300 bg-rose-100 hover:bg-rose-200 dark:border-rose-800 dark:bg-rose-900/30 dark:hover:bg-rose-900/50',
      selectedSurface: 'border-rose-600 bg-rose-200 dark:border-rose-400 dark:bg-rose-900/70',
      staticSurface: 'border-rose-300 bg-rose-100 dark:border-rose-800 dark:bg-rose-900/30' },
    { status: 'Missing', label: 'pending', count: counts.missing, Icon: CircleAlert, color: 'text-orange-800 dark:text-orange-200',
      surface: 'border-orange-300 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-950/50',
      selectedSurface: 'border-orange-500 bg-orange-100 dark:border-orange-500 dark:bg-orange-900/60',
      staticSurface: 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30' },
    { status: 'For Update', label: 'for update', count: counts.forUpdate, Icon: RefreshCw, color: 'text-yellow-900 dark:text-yellow-200',
      surface: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/50',
      selectedSurface: 'border-yellow-500 bg-yellow-100 dark:border-yellow-500 dark:bg-yellow-900/60',
      staticSurface: 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30' },
  ] as const;
  const visibleItems = items.filter(item => item.count > 0 || (onChange && item.status === value));
  if (visibleItems.length === 0) return null;

  return (
    <div aria-label="Required document attention summary" className={`mb-3 flex flex-wrap items-center text-[11px] ${onChange ? 'gap-x-2 gap-y-1.5' : 'gap-x-3 gap-y-1'} ${className ?? ''}`}>
      {visibleItems.map(({ status, label, count, Icon, color, surface, selectedSurface, staticSurface }) => {
        const content = <><Icon size={12} aria-hidden="true" /><strong className="tabular-nums">{count}</strong> {label}</>;
        const selected = value === status;
        return onChange ? (
          <button key={status} type="button" aria-pressed={selected}
            onClick={() => onChange(value === status ? null : status)}
            className={`inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 ${color} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2187CD] ${selected ? selectedSurface : surface}`}>
            {content}{selected && <X size={12} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        ) : <span key={status} className={`inline-flex items-center gap-1 ${color} ${showStaticContainers ? `min-h-7 whitespace-nowrap rounded-md border px-2 py-1 ${staticSurface}` : ''}`}>{content}</span>;
      })}
    </div>
  );
}
