import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { Loader2, X } from 'lucide-react';
import type { SurveyType } from '../../../types/survey';
import {
  snapshotsBySurveyType,
  type ActiveCompanySnapshot,
} from '../domain/activeCompanySnapshots';
import { loadActiveCompanySnapshots } from '../services/activeCompanySnapshotService';
import { getActiveCompanyCellColors } from './companyCellStyles';
import { APPLICATION_RECORD_CHANGED_EVENT, type ApplicationRecordType } from '../../../services/applicationRepository';

interface ActiveCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TypeConfig {
  type: SurveyType;
  label: string;
  accent: string;
  badge: string;
}

const TYPE_CONFIGS: TypeConfig[] = [
  {
    type: 'Courier',
    label: 'Courier',
    accent: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  {
    type: 'Supplier',
    label: 'Supplier',
    accent: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  {
    type: 'Subcontractor',
    label: 'Subcontractor',
    accent: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
];

function formatSnapshotDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActiveCompaniesModal({ isOpen, onClose }: ActiveCompaniesModalProps) {
  useModalEscape(isOpen, onClose, 220);
  const [snapshots, setSnapshots] = useState<ActiveCompanySnapshot[]>([]);
  const [selectedIds, setSelectedIds] = useState<Partial<Record<SurveyType, string>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const histories = useMemo(() => ({
    Courier: snapshotsBySurveyType(snapshots, 'Courier'),
    Supplier: snapshotsBySurveyType(snapshots, 'Supplier'),
    Subcontractor: snapshotsBySurveyType(snapshots, 'Subcontractor'),
  }), [snapshots]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadSnapshots = () => {
      setIsLoading(true);
      setLoadError('');
      void loadActiveCompanySnapshots()
        .then((loaded) => {
          if (cancelled) return;
          setSnapshots(loaded);
          setSelectedIds({
            Courier: snapshotsBySurveyType(loaded, 'Courier')[0]?.id,
            Supplier: snapshotsBySurveyType(loaded, 'Supplier')[0]?.id,
            Subcontractor: snapshotsBySurveyType(loaded, 'Subcontractor')[0]?.id,
          });
        })
        .catch((error) => {
          if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Unable to load active companies.');
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    };
    const handleRecordChange = (event: Event) => {
      const recordType = (event as CustomEvent<{ recordType?: ApplicationRecordType }>).detail?.recordType;
      if (recordType === 'active_company_snapshot') loadSnapshots();
    };

    loadSnapshots();
    window.addEventListener(APPLICATION_RECORD_CHANGED_EVENT, handleRecordChange);

    return () => {
      cancelled = true;
      window.removeEventListener(APPLICATION_RECORD_CHANGED_EVENT, handleRecordChange);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-companies-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div>
            <h2 id="active-companies-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Active Companies by Type
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              View the latest list or select an earlier upload.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close active companies">
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 size={18} className="animate-spin" /> Loading active companies...
            </div>
          ) : loadError ? (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {loadError}
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {TYPE_CONFIGS.map(({ type, label, accent, badge }) => {
                const history = histories[type];
                const selected = history.find((snapshot) => snapshot.id === selectedIds[type]) ?? history[0];
                const columnBreak = selected ? Math.ceil(selected.companies.length / 2) : 0;
                const companyColumns = selected
                  ? [selected.companies.slice(0, columnBreak), selected.companies.slice(columnBreak)]
                  : [];
                return (
                  <section key={type} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm font-extrabold tracking-wide ${accent}`}>{label.toLocaleUpperCase()}</h3>
                        <span className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${badge}`}>
                          {selected?.companies.length ?? 0}
                        </span>
                      </div>
                      {history.length > 0 && (
                        <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="shrink-0">Upload date</span>
                          <select
                            value={selected?.id}
                            onChange={(event) => setSelectedIds((current) => ({ ...current, [type]: event.target.value }))}
                            className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[#0866B1] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {history.map((snapshot, index) => (
                              <option key={snapshot.id} value={snapshot.id}>
                                {index === 0 ? 'Latest — ' : ''}{formatSnapshotDate(snapshot.uploadedAt)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    {selected ? (
                      <>
                        <p className="mt-1 text-[11px] text-slate-400">Source: {selected.sourceFileName}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {companyColumns.map((companies, columnIndex) => (
                            <ul key={`${type}-column-${columnIndex}`} className="space-y-2">
                              {companies.map((company, rowIndex) => (
                                <li
                                  key={company}
                                  className="rounded-lg border px-3 py-2.5 text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5"
                                  style={getActiveCompanyCellColors(rowIndex)}
                                >
                                  {company}
                                </li>
                              ))}
                            </ul>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No active-company upload is available yet.</p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60 sm:px-6">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
