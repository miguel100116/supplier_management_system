import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HardHat,
  Loader2,
  LockKeyhole,
  Package,
  Truck,
  UploadCloud,
  X,
} from 'lucide-react';
import type { SurveyType } from '../types/survey';
import type { CompanyDecision, RawEvalImportSummary, RawEvalPreview } from '../utils/rawEvaluationImport';
import { useEvaluationImportArchives } from '../features/evaluation-imports/hooks/useEvaluationImportArchives';
import { MAX_EVALUATION_IMPORT_FILE_BYTES } from '../features/evaluation-imports/domain/importArchive';
import type { EvaluationImportArchive } from '../features/evaluation-imports/domain/importArchive';
import { useModalEscape } from '../hooks/useModalEscape';
import { PageDescription } from '../components/PageDescription';

const SURVEY_TYPES: SurveyType[] = ['Supplier', 'Subcontractor', 'Courier'];
const FORM_CARDS: Array<{ surveyType: SurveyType; title: string; formLabel: string; icon: typeof Package }> = [
  { surveyType: 'Supplier', title: 'Supplier', formLabel: 'Form 20-002, Form 2', icon: Package },
  { surveyType: 'Subcontractor', title: 'Subcontractor', formLabel: 'Form 20-002, Form 3', icon: HardHat },
  { surveyType: 'Courier', title: 'Courier', formLabel: 'Form 20-002, Form 4', icon: Truck },
];

interface ImportEvaluationsPageProps {
  currentUserEmail: string;
  onPreview: (file: File, surveyType: SurveyType) => Promise<RawEvalPreview>;
  onCommitBatch: (entries: Array<{ preview: RawEvalPreview; decisions: Record<string, CompanyDecision> }>) => Promise<RawEvalImportSummary[]>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function emptyPreviews(): Record<SurveyType, RawEvalPreview | null> {
  return { Supplier: null, Subcontractor: null, Courier: null };
}

function emptyDecisions(): Record<SurveyType, Record<string, CompanyDecision>> {
  return { Supplier: {}, Subcontractor: {}, Courier: {} };
}

export function ImportEvaluationsPage({ currentUserEmail, onPreview, onCommitBatch }: ImportEvaluationsPageProps) {
  const { archives, isLoading: isLoadingArchives, loadError: archiveLoadError, archiveSourceFile, downloadSourceFile } = useEvaluationImportArchives(currentUserEmail);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<Record<SurveyType, RawEvalPreview | null>>(emptyPreviews);
  const [decisions, setDecisions] = useState<Record<SurveyType, Record<string, CompanyDecision>>>(emptyDecisions);
  const [summaries, setSummaries] = useState<RawEvalImportSummary[] | null>(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isReviewingCompanies, setIsReviewingCompanies] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [downloadingArchiveId, setDownloadingArchiveId] = useState<string | null>(null);
  const [archiveActionError, setArchiveActionError] = useState('');

  const readyPreviews = SURVEY_TYPES.map((surveyType) => previews[surveyType]).filter(
    (preview): preview is RawEvalPreview => preview !== null,
  );
  const workbookReady = readyPreviews.length === SURVEY_TYPES.length && !isScanning;
  const unmatchedCompanies = readyPreviews.flatMap((preview) => preview.companyMatches
    .filter((match) => match.status === 'unmatched')
    .map((match) => ({ surveyType: preview.surveyType, match })));

  const patchDecision = (surveyType: SurveyType, normalizedName: string, decision: CompanyDecision) => {
    setDecisions((current) => ({
      ...current,
      [surveyType]: { ...current[surveyType], [normalizedName]: decision },
    }));
  };

  const inspectWorkbook = async (candidate: File) => {
    const lowerName = candidate.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      setError('Choose one Excel workbook (.xlsx or .xls) containing the Supplier, Subcontractor, and Courier worksheets.');
      return;
    }
    if (candidate.size <= 0 || candidate.size > MAX_EVALUATION_IMPORT_FILE_BYTES) {
      setError('The workbook must be between 1 byte and 25 MB.');
      return;
    }

    setFile(candidate);
    setPreviews(emptyPreviews());
    setDecisions(emptyDecisions());
    setSummaries(null);
    setError('');
    setIsScanning(true);
    try {
      const parsed = await Promise.all(SURVEY_TYPES.map((surveyType) => onPreview(candidate, surveyType)));
      const sourceHash = parsed[0]?.importBatchId.slice(parsed[0].importBatchId.lastIndexOf(':') + 1);
      if (!sourceHash) throw new Error('Unable to identify this workbook for safe re-imports.');
      const sharedBatchId = `client-workbook:${sourceHash}`;
      const batchPreviews = parsed.map((preview) => ({ ...preview, importBatchId: sharedBatchId }));
      const byType = Object.fromEntries(batchPreviews.map((preview) => [preview.surveyType, preview])) as Record<SurveyType, RawEvalPreview>;
      if (SURVEY_TYPES.some((surveyType) => !byType[surveyType])) {
        throw new Error('The workbook must contain one worksheet for each category: Supplier, Subcontractor, and Courier.');
      }
      setPreviews(byType);
      setDecisions(Object.fromEntries(batchPreviews.map((preview) => [
        preview.surveyType,
        Object.fromEntries(preview.companyMatches
          .filter((match) => match.status === 'unmatched')
          .map((match) => [match.normalizedName, 'add-as-partner' as CompanyDecision])),
      ])) as Record<SurveyType, Record<string, CompanyDecision>>);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unable to read the workbook.');
    } finally {
      setIsScanning(false);
    }
  };

  const runBatchImport = async (selectedDecisions = decisions) => {
    if (!file || !workbookReady) return;
    setIsImporting(true);
    setError('');
    setIsReviewingCompanies(false);
    try {
      await archiveSourceFile(file, 'Combined', readyPreviews[0].importBatchId);
      const imported = await onCommitBatch(readyPreviews.map((preview) => ({
        preview,
        decisions: selectedDecisions[preview.surveyType],
      })));
      setSummaries(imported);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to archive or import this workbook.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = () => {
    if (!workbookReady) return;
    if (unmatchedCompanies.length > 0) {
      setIsReviewingCompanies(true);
      return;
    }
    void runBatchImport();
  };

  const handleDownloadArchive = async (archive: EvaluationImportArchive) => {
    setDownloadingArchiveId(archive.id);
    setArchiveActionError('');
    try {
      const blob = await downloadSourceFile(archive);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = archive.sourceFileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setArchiveActionError(downloadError instanceof Error ? downloadError.message : 'Unable to download the archived workbook.');
    } finally {
      setDownloadingArchiveId(null);
    }
  };

  useModalEscape(isReviewingCompanies, () => setIsReviewingCompanies(false));

  return (
    <div className="space-y-6">
      <PageDescription>
        Upload one Excel workbook containing the Supplier, Subcontractor, and Courier evaluation worksheets. The system detects each form and imports all three categories together.
      </PageDescription>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Combined evaluation workbook upload">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = '';
            if (selected) void inspectWorkbook(selected);
          }}
        />

        {!file && (
          <div
            onDragEnter={(event) => { event.preventDefault(); setIsDragOver(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(event) => { event.preventDefault(); setIsDragOver(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) void inspectWorkbook(dropped);
            }}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInput.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${isDragOver ? 'border-[#0866B1] bg-blue-50/70 dark:bg-blue-950/30' : 'border-slate-200 hover:border-[#0866B1]/60 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900/60'}`}
          >
            <FileSpreadsheet size={38} className="text-emerald-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">Drop combined evaluation workbook here</p>
              <p className="mt-1 text-xs text-slate-500">or <span className="font-semibold text-[#0866B1] dark:text-blue-400">browse file</span></p>
            </div>
            <p className="text-[11px] text-slate-400">Supported format: Excel workbook (.xlsx/.xls), up to 25 MB</p>
          </div>
        )}

        {file && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"><FileSpreadsheet size={22} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800 dark:text-white" title={file.name}>{file.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(file.size)} · {isScanning ? 'Checking worksheets…' : 'Workbook selected'}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isScanning && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Detecting categories</span>}
              {!isScanning && <button type="button" onClick={() => void inspectWorkbook(file)} className="secondary-button min-h-9 px-3 text-xs">Check again</button>}
              <button
                type="button"
                onClick={() => { setFile(null); setPreviews(emptyPreviews()); setDecisions(emptyDecisions()); setSummaries(null); setError(''); }}
                disabled={isScanning || isImporting}
                title="Remove workbook"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/30"
              ><X size={17} /></button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p>}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {FORM_CARDS.map(({ surveyType, title, formLabel, icon: Icon }) => {
            const preview = previews[surveyType];
            const summary = summaries?.find((item) => item.surveyType === surveyType);
            return (
              <div key={surveyType} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-blue-50 p-2 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-400"><Icon size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title} Evaluations</h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">{formLabel}</p>
                  </div>
                  {preview && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 size={12} /> Worksheet found</span>}
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {preview ? (
                    <>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Worksheet name</p>
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={preview.sheetName}>{preview.sheetName}</p>
                      <p className="mt-2 text-[11px] text-slate-500">{preview.rows.length} response rows detected</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">{isScanning ? 'Looking for this evaluation form…' : 'Worksheet will be detected after upload'}</p>
                  )}
                  {summary && (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs dark:bg-emerald-950/20">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">Import complete · {summary.imported} submissions</p>
                      {summary.replaced > 0 && <p className="mt-1 text-amber-700 dark:text-amber-400">{summary.replaced} existing submissions updated</p>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {workbookReady && !summaries && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <CalendarDays size={16} className="text-[#0866B1]" />
              <span>All three evaluation categories are ready to import together.</span>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-[#0866B1] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#07528E] disabled:cursor-wait disabled:opacity-60 sm:self-auto"
            >
              {isImporting ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
              {isImporting ? 'Importing all evaluations…' : 'Import all evaluations'}
            </button>
          </div>
        )}

        {summaries && <p role="status" className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">The original workbook was archived once. Re-uploads update matching responses using each worksheet row's source ID.</p>}
        <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-[11px] text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
          Partner names are matched against the full Partner Registry, including partners with another classification or an archived status. Each response ID comes from its own worksheet's source ID.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="evaluation-import-archive-title">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2"><LockKeyhole size={16} className="text-[#0866B1] dark:text-blue-400" aria-hidden="true" /><h3 id="evaluation-import-archive-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">Stored Source Files</h3></div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Original evaluation workbooks are stored in private Supabase Storage. Only Admins can view or download them.</p>
        </div>
        {archiveLoadError && <p role="alert" className="px-5 py-3 text-xs text-rose-600 dark:text-rose-400">{archiveLoadError}</p>}
        {archiveActionError && <p role="alert" className="px-5 py-3 text-xs text-rose-600 dark:text-rose-400">{archiveActionError}</p>}
        {isLoadingArchives ? (
          <div className="flex items-center gap-2 px-5 py-5 text-xs text-slate-500" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Loading stored files…</div>
        ) : archives.length === 0 ? (
          <p className="px-5 py-5 text-xs text-slate-500 dark:text-slate-400">No source files have been archived yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {archives.slice(0, 20).map((archive) => (
              <li key={archive.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3"><FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={archive.sourceFileName}>{archive.sourceFileName}</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{archive.surveyType === 'Combined' ? 'All evaluation categories' : archive.surveyType} · {formatFileSize(archive.fileSize)} · {new Date(archive.uploadedAt).toLocaleString()} · {archive.uploadedBy}</p></div></div>
                <button type="button" onClick={() => void handleDownloadArchive(archive)} disabled={downloadingArchiveId !== null} className="secondary-button min-h-9 shrink-0 gap-1.5 px-3 text-xs disabled:opacity-60">
                  {downloadingArchiveId === archive.id ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}Download workbook
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isReviewingCompanies && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-labelledby="company-match-review-title" className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <button type="button" onClick={() => setIsReviewingCompanies(false)} className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-white" title="Close review"><X size={18} /></button>
            <div className="flex items-center gap-3 text-amber-600"><span className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/30"><AlertTriangle size={20} /></span><div><h3 id="company-match-review-title" className="text-lg font-bold text-slate-900 dark:text-white">Review unmatched partners</h3><p className="text-xs text-slate-500">These names appear in the workbook but were not found in the Partner Registry.</p></div></div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={() => setDecisions((current) => ({ ...current, ...Object.fromEntries(SURVEY_TYPES.map((surveyType) => [surveyType, Object.fromEntries(Object.keys(current[surveyType]).map((name) => [name, 'add-as-partner' as CompanyDecision]))])) }))} className="text-[11px] font-bold text-[#0866B1] hover:underline dark:text-blue-400">Add all as partners</button>
              <button type="button" onClick={() => setDecisions((current) => ({ ...current, ...Object.fromEntries(SURVEY_TYPES.map((surveyType) => [surveyType, Object.fromEntries(Object.keys(current[surveyType]).map((name) => [name, 'skip' as CompanyDecision]))])) }))} className="text-[11px] font-bold text-slate-500 hover:underline">Skip all</button>
            </div>
            <ul className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {unmatchedCompanies.map(({ surveyType, match }) => (
                <li key={`${surveyType}-${match.normalizedName}`} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{match.rawName}</p><p className="text-[10px] text-slate-500">{surveyType} worksheet</p></div>
                  <select aria-label={`How to handle ${match.rawName}`} value={decisions[surveyType][match.normalizedName] ?? 'add-as-partner'} onChange={(event) => patchDecision(surveyType, match.normalizedName, event.target.value as CompanyDecision)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <option value="add-as-partner">Add as a new partner</option><option value="skip">Skip this partner's responses</option>
                  </select>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setIsReviewingCompanies(false)} className="secondary-button min-h-10 px-4 text-xs">Cancel</button>
              <button type="button" onClick={() => void runBatchImport()} disabled={isImporting} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0866B1] px-4 text-xs font-bold text-white hover:bg-[#07528E] disabled:opacity-60">
                {isImporting && <Loader2 size={14} className="animate-spin" />}Confirm and import all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
