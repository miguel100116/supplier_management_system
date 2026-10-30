import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Layers, Loader2, PackageSearch, Truck, X } from 'lucide-react';
import { useModalEscape } from '../../../hooks/useModalEscape';
import type { SurveyType } from '../../../types/survey';
import {
  createActiveCompanySnapshot,
  findActiveCompanySnapshotDuplicates,
  MAX_ACTIVE_COMPANY_FILE_BYTES,
  parseActiveCompanyWorkbook,
  type ActiveCompanySnapshotDuplicate,
} from '../domain/activeCompanySnapshots';
import { loadActiveCompanySnapshots, saveActiveCompanySnapshot } from '../services/activeCompanySnapshotService';

interface ActiveCompanyUploadCardsProps {
  userEmail: string;
}

interface UploadTypeConfig {
  type: SurveyType;
  label: string;
  expectedFileName: string;
  icon: typeof Truck;
  iconStyle: string;
}

interface PendingReview {
  surveyType: SurveyType;
  fileName: string;
  companies: string[];
  excludedCompanies: string[];
  duplicates: ActiveCompanySnapshotDuplicate[];
}

const UPLOAD_TYPE_CONFIGS: UploadTypeConfig[] = [
  {
    type: 'Courier',
    label: 'Courier',
    expectedFileName: 'courier.csv',
    icon: Truck,
    iconStyle: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  },
  {
    type: 'Supplier',
    label: 'Supplier',
    expectedFileName: 'supplier.csv',
    icon: PackageSearch,
    iconStyle: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  {
    type: 'Subcontractor',
    label: 'Subcontractor',
    expectedFileName: 'subcontractor.csv',
    icon: Layers,
    iconStyle: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
  },
];

export function ActiveCompanyUploadCards({ userEmail }: ActiveCompanyUploadCardsProps) {
  const [busyType, setBusyType] = useState<SurveyType | null>(null);
  const [dragType, setDragType] = useState<SurveyType | null>(null);
  const [messages, setMessages] = useState<Partial<Record<SurveyType, { kind: 'success' | 'error'; text: string }>>>({});
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [isDuplicateConfirmationOpen, setIsDuplicateConfirmationOpen] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const fileInputs = useRef<Partial<Record<SurveyType, HTMLInputElement | null>>>({});

  const closeReview = () => {
    if (busyType) return;
    setIsDuplicateConfirmationOpen(false);
    setPendingReview(null);
    setReviewError('');
  };
  useModalEscape(Boolean(pendingReview), closeReview, 70);
  useModalEscape(isDuplicateConfirmationOpen, () => setIsDuplicateConfirmationOpen(false), 80);

  const reviewFile = async (surveyType: SurveyType, file: File) => {
    if (busyType || pendingReview) return;
    setBusyType(surveyType);
    setMessages((current) => ({ ...current, [surveyType]: undefined }));
    try {
      if (file.size <= 0 || file.size > MAX_ACTIVE_COMPANY_FILE_BYTES) {
        throw new Error('The file must be between 1 byte and 25 MB.');
      }
      const companies = parseActiveCompanyWorkbook(await file.arrayBuffer(), file.name, surveyType);
      const snapshots = await loadActiveCompanySnapshots();
      const duplicates = findActiveCompanySnapshotDuplicates(snapshots, surveyType, file.name, companies);
      setPendingReview({ surveyType, fileName: file.name, companies, excludedCompanies: [], duplicates });
      setIsDuplicateConfirmationOpen(false);
      setReviewError('');
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [surveyType]: { kind: 'error', text: error instanceof Error ? error.message : 'Unable to read this file.' },
      }));
    } finally {
      setBusyType(null);
    }
  };

  const saveReviewedSnapshot = async (confirmedDuplicate = false) => {
    if (!pendingReview || busyType) return;
    if (pendingReview.duplicates.length && !confirmedDuplicate) {
      setIsDuplicateConfirmationOpen(true);
      return;
    }
    const companies = pendingReview.companies.filter((company) => !pendingReview.excludedCompanies.includes(company));
    if (companies.length === 0) {
      setReviewError('Keep at least one company selected to save this snapshot.');
      return;
    }

    const { surveyType, fileName } = pendingReview;
    setBusyType(surveyType);
    setReviewError('');
    try {
      const snapshot = createActiveCompanySnapshot(surveyType, fileName, companies, userEmail);
      await saveActiveCompanySnapshot(snapshot);
      setMessages((current) => ({
        ...current,
        [surveyType]: { kind: 'success', text: `${companies.length} active companies saved.` },
      }));
      setIsDuplicateConfirmationOpen(false);
      setPendingReview(null);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to save this company list.');
    } finally {
      setBusyType(null);
    }
  };

  const handleFileInput = (surveyType: SurveyType, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void reviewFile(surveyType, file);
  };

  const handleDrop = (surveyType: SurveyType, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragType(null);
    const file = event.dataTransfer.files?.[0];
    if (file && !busyType && !pendingReview) void reviewFile(surveyType, file);
  };

  const includedCompanyCount = pendingReview
    ? pendingReview.companies.length - pendingReview.excludedCompanies.length
    : 0;

  return (
    <section className="border-t border-slate-200 pt-4 dark:border-slate-800" aria-labelledby="active-company-upload-title">
      <div>
        <h4 id="active-company-upload-title" className="text-xs font-bold text-slate-800 dark:text-slate-100">
          Upload Active Company Lists
        </h4>
        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Review each company list before saving a dated Courier, Supplier, or Subcontractor snapshot.
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {UPLOAD_TYPE_CONFIGS.map(({ type, label, expectedFileName, icon: Icon, iconStyle }) => {
          const message = messages[type];
          const isBusy = busyType === type;
          const isDragging = dragType === type;

          return (
            <div key={type} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h5 className="whitespace-nowrap text-[11px] font-bold text-slate-900 dark:text-white">{label}</h5>
                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{expectedFileName}</p>
                </div>
              </div>

              <input
                ref={(element) => { fileInputs.current[type] = element; }}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(event) => handleFileInput(type, event)}
              />

              <div
                className={`mt-2 rounded-lg border border-dashed px-2 py-3 text-center transition-colors ${
                  isDragging
                    ? 'border-[#0063a9] bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!isBusy && !pendingReview) setDragType(type);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragType((current) => (current === type ? null : current))}
                onDrop={(event) => handleDrop(type, event)}
              >
                <button
                  type="button"
                  onClick={() => fileInputs.current[type]?.click()}
                  disabled={Boolean(busyType || pendingReview)}
                  className="inline-flex min-h-8 items-center gap-1.5 text-[11px] font-semibold text-slate-800 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0063a9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:text-white"
                >
                  {isBusy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={14} aria-hidden="true" />}
                  {isBusy ? 'Reading file...' : 'Choose File'}
                </button>
                <p className="mt-1 text-[10px] text-slate-400">CSV or Excel</p>
              </div>

              {message && (
                <p className={`mt-2 flex items-start gap-1 text-[10px] leading-4 ${message.kind === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {message.kind === 'success' && <CheckCircle2 size={12} className="mt-0.5 shrink-0" aria-hidden="true" />}
                  <span>{message.text}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {pendingReview && createPortal(
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-company-review-title"
            className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h3 id="active-company-review-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Review {pendingReview.surveyType} Companies
                </h3>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={pendingReview.fileName}>
                  {pendingReview.fileName} - {pendingReview.companies.length} companies
                </p>
              </div>
              <button type="button" onClick={closeReview} disabled={Boolean(busyType)} className="icon-button" aria-label="Close company review">
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Check any company you want to skip. {includedCompanyCount} will be saved and {pendingReview.excludedCompanies.length} will be skipped.
              </p>
              {pendingReview.duplicates.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p>This file name or company list matches {pendingReview.duplicates.length} saved {pendingReview.surveyType} snapshot{pendingReview.duplicates.length === 1 ? '' : 's'}. Review the match before adding another dated snapshot.</p>
                </div>
              )}
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {pendingReview.companies.map((company) => {
                  const excluded = pendingReview.excludedCompanies.includes(company);
                  return (
                    <label key={company} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 ${excluded ? 'opacity-60' : ''}`}>
                      <input
                        type="checkbox"
                        checked={excluded}
                        onChange={(event) => setPendingReview((current) => current ? {
                          ...current,
                          excludedCompanies: event.target.checked
                            ? [...current.excludedCompanies, company]
                            : current.excludedCompanies.filter((value) => value !== company),
                        } : current)}
                        className="rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                        aria-label={`Skip ${company}`}
                      />
                      <span className={`min-w-0 flex-1 text-sm font-medium ${excluded ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                        {company}
                      </span>
                      {excluded && <span className="text-[10px] text-slate-500">Skipped</span>}
                    </label>
                  );
                })}
              </div>
              {includedCompanyCount === 0 && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Leave at least one company unchecked to save this snapshot.</p>
              )}
              {reviewError && (
                <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  {reviewError}
                </p>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <button type="button" onClick={closeReview} disabled={Boolean(busyType)} className="secondary-button text-xs">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveReviewedSnapshot()}
                disabled={Boolean(busyType) || pendingReview.excludedCompanies.length === pendingReview.companies.length}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0063a9] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#00528c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyType === pendingReview.surveyType && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {pendingReview.duplicates.length ? 'Review Duplicate' : 'Save Snapshot'}
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
      {pendingReview && isDuplicateConfirmationOpen && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="active-company-duplicate-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"><AlertTriangle size={18} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h3 id="active-company-duplicate-title" className="text-sm font-bold text-slate-900 dark:text-white">A similar snapshot already exists</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {pendingReview.duplicates.map(({ snapshot, reason }) => (
                    <span key={snapshot.id} className="mb-2 block break-words">
                      {reason === 'both' ? 'Same file name and company list' : reason === 'matching-filename' ? 'Same file name; the company list differs' : 'Same company list under a different file name'}: <strong>{snapshot.sourceFileName}</strong> ({new Date(snapshot.uploadedAt).toLocaleDateString()})
                    </span>
                  ))}
                  Saving adds another dated snapshot for comparison; it will not replace the existing snapshot.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDuplicateConfirmationOpen(false)} className="secondary-button text-xs">Go back</button>
              <button type="button" onClick={() => void saveReviewedSnapshot(true)} className="primary-button text-xs">Save Dated Snapshot</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
