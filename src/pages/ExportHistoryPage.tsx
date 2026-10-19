import { useEffect, useMemo, useState } from 'react';
import { FileText, FileSpreadsheet, FileType, Trash2, Search } from 'lucide-react';
import { clearExportHistory, ExportHistoryEntry, getExportHistory } from '../features/reports/services/exportHistory';
import { StateMessage } from '../components/StateMessage';
import { formatLogDate, formatLogTime, formatRelativeTime } from '../utils/time';

const formatIcons = {
  pdf: FileText,
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  docx: FileType,
};

const formatLabels: Record<ExportHistoryEntry['format'], string> = {
  pdf: 'PDF',
  csv: 'CSV',
  excel: 'Excel',
  docx: 'Word',
};

export function ExportHistoryPage() {
  const [history, setHistory] = useState<ExportHistoryEntry[]>(() => getExportHistory());
  const [search, setSearch] = useState('');

  useEffect(() => {
    const refresh = () => setHistory(getExportHistory());
    window.addEventListener('export-history-updated', refresh);
    return () => window.removeEventListener('export-history-updated', refresh);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return history;
    return history.filter((entry) => entry.title.toLowerCase().includes(query) || entry.filename.toLowerCase().includes(query));
  }, [history, search]);

  const handleClear = () => {
    if (window.confirm('Clear the entire export history log? This does not delete any already-downloaded files.')) {
      clearExportHistory();
    }
  };

  return (
    <div className="space-y-5">
      <section className="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every report generated from this browser. {history.length} logged.
          </p>
        </div>
        {history.length > 0 && (
          <button onClick={handleClear} type="button" className="secondary-button inline-flex items-center gap-1.5 shrink-0">
            <Trash2 size={14} />
            Clear log
          </button>
        )}
      </section>

      {history.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by report or filename..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0063a9] dark:focus:ring-blue-600"
          />
        </div>
      )}

      {history.length === 0 ? (
        <StateMessage
          title="No exports yet"
          message="Generate a report from Reports & Exports and it'll be logged here for reference."
        />
      ) : filtered.length === 0 ? (
        <div className="panel text-center py-10 text-slate-500">No exports match "{search}".</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const Icon = formatIcons[entry.format] || FileText;
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900 text-[#0063a9] dark:text-blue-400">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{entry.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{entry.filename}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {formatLabels[entry.format]}
                  </span>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatLogDate(entry.exportedAt)} {formatLogTime(entry.exportedAt)}</p>
                    <p className="text-[10px] text-slate-400">{formatRelativeTime(entry.exportedAt)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
