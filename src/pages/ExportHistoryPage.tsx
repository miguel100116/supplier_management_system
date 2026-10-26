import { describeReportParameters, type ReportRecipe } from '../features/reports/domain/reportHistory';
import { useEffect, useMemo, useState } from 'react';
import { FileText, FileSpreadsheet, FileType, Trash2, Search } from 'lucide-react';
import { clearExportHistory, downloadExportAgain, ExportHistoryEntry, getExportHistory } from '../features/reports/services/exportHistory';
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

export function ExportHistoryPage({ canExport = false, onRegenerate }: { canExport?: boolean; onRegenerate?: (recipe: ReportRecipe) => void }) {
  const [history, setHistory] = useState<ExportHistoryEntry[]>(() => getExportHistory());
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const refresh = () => setHistory(getExportHistory());
    window.addEventListener('export-history-updated', refresh);
    return () => window.removeEventListener('export-history-updated', refresh);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return history;
    return history.filter((entry) => entry.title.toLowerCase().includes(query)
      || entry.filename.toLowerCase().includes(query)
      || describeReportParameters(entry.recipe).toLowerCase().includes(query));
  }, [history, search]);

  const handleClear = async () => {
    if (!window.confirm('Clear the entire export history log and its saved report copies? Files already downloaded will remain on your device.')) return;
    setClearing(true);
    setError('');
    try { await clearExportHistory(); }
    catch { setError('Unable to clear export history. Please try again.'); }
    finally { setClearing(false); }
  };

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-slate-600 dark:text-slate-300">Your saved report exports across browsers and devices.</p><p className="mt-1 text-xs text-slate-400">{history.length} logged</p></div>
        {history.length > 0 && <button onClick={handleClear} disabled={clearing} type="button" className="secondary-button inline-flex items-center gap-1.5 self-start disabled:opacity-50"><Trash2 size={14} />Clear log</button>}
      </section>

      {history.length > 0 && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm"><span className="sr-only">Search by report or filename</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input type="text" placeholder="Search by report or filename..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-700 focus:border-[#2187CD] focus:outline-none focus:ring-2 focus:ring-[#2187CD]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label>
        <span className="text-xs text-slate-400">Showing {filtered.length} of {history.length} exports</span>
      </div>}

      <p className="text-xs text-slate-500">Regenerate opens the saved options with current authorized data and filters.</p>
      {history.length === 0 ? <StateMessage title="No exports yet" message="Use the Generate tab to create a report. Its saved copy and options will appear here." /> : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center dark:border-slate-800 dark:bg-slate-950"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No exports match "{search}".</p><p className="mt-1 text-xs text-slate-400">Try a different report name or filename.</p></div>
      ) : (
        <section aria-label="Export history" className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="hidden grid-cols-[minmax(0,1fr)_auto_90px_190px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 sm:grid"><span>Report</span><span>Actions</span><span>Format</span><span className="text-right">Exported</span></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((entry) => {
              const Icon = formatIcons[entry.format] || FileText;
              const optionsDescription = entry.recipeUnavailable ? 'Saved options are incompatible or invalid. Create a new report to regenerate.' : describeReportParameters(entry.recipe);
              return <article key={entry.id} className="grid gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/40 sm:grid-cols-[minmax(0,1fr)_auto_90px_190px] sm:items-center sm:gap-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#eef7fc] text-[#2187CD] dark:bg-slate-900 dark:text-sky-300"><Icon size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={entry.title}>{entry.title}</p><p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400" title={entry.filename}>{entry.filename}</p><p className="mt-0.5 line-clamp-2 break-words text-[10px] text-slate-400" title={optionsDescription}>{entry.recipe?.kind ?? 'Report'} | {optionsDescription}</p></div></div>
                <div className="ml-11 flex flex-wrap gap-2 sm:ml-0"><button type="button" className="secondary-button text-xs" disabled={!canExport || !entry.fileDataUrl} title={!entry.fileDataUrl ? 'No file was retained for this legacy export' : undefined} onClick={() => { try { downloadExportAgain(entry); } catch { setError('Unable to download the saved file. Regenerate the report instead.'); } }}>Download again</button><button type="button" className="secondary-button text-xs" disabled={!canExport || !entry.recipe || !onRegenerate} title={!entry.recipe ? 'Saved options are unavailable. Create a new report instead.' : undefined} onClick={() => { if (entry.recipe) onRegenerate?.(entry.recipe); }}>Regenerate</button></div>
                <span className="ml-11 w-fit rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300 sm:ml-0">{formatLabels[entry.format]}</span>
                <div className="ml-11 text-left sm:ml-0 sm:text-right"><p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{formatLogDate(entry.exportedAt)} {formatLogTime(entry.exportedAt)}</p><p className="mt-0.5 text-[10px] text-slate-400">{formatRelativeTime(entry.exportedAt)}</p></div>
              </article>;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
