import { useRef, useState } from 'react';
import { AlertTriangle, Loader2, Upload } from 'lucide-react';

interface MasterListUploadPanelProps {
  busy: boolean;
  error: string;
  replace: boolean;
  onReplaceChange: (replace: boolean) => void;
  onSelectFiles: (files: File[]) => void;
}

export function MasterListUploadPanel({ busy, error, replace, onReplaceChange, onSelectFiles }: MasterListUploadPanelProps) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <section className="mt-5 space-y-4" aria-label="Master List file upload" aria-busy={busy}>
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        Import Courier, Supplier, and Subcontractor companies together. Categories come from the files; the registry and all three Active Company Lists update after your review.
      </p>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        disabled={busy}
        aria-label="Master List files"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length && !busy) onSelectFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        aria-label="Choose Master List files"
        onClick={() => input.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); if (!busy) setIsDragOver(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; }}
        onDragLeave={(event) => { event.preventDefault(); setIsDragOver(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          if (!busy) onSelectFiles(Array.from(event.dataTransfer.files));
        }}
        className={`flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0063a9] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${isDragOver ? 'border-[#0063a9] bg-blue-50/70 dark:bg-blue-950/20' : 'border-slate-200 bg-slate-50/70 hover:border-[#0063a9]/60 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:bg-slate-900'}`}
      >
        {busy ? <Loader2 size={24} className="animate-spin text-[#0063a9]" aria-hidden="true" /> : <Upload size={24} className="text-[#0063a9]" aria-hidden="true" />}
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {busy ? <span role="status">Reading Master List files...</span> : 'Drop files here or click to browse'}
        </span>
        <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">Standard or V4 Master List · CSV or Excel · Up to 25 MB per file</span>
      </button>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <input type="checkbox" checked={replace} disabled={busy} onChange={(event) => onReplaceChange(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300" />
        <span className="min-w-0 flex-1 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Replace the entire registry with these files</span>
          <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">Leave unchecked to merge with existing partners. Replacement removes partners missing from the selected files and requires confirmation.</span>
        </span>
      </label>
      {replace && (
        <p className="flex items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Replacing the registry cannot be undone from the app. Review the resulting companies before confirming.
        </p>
      )}
    </section>
  );
}
