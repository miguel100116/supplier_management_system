import { useRef, useState } from 'react';
import { CheckCircle2, Cog, FileSpreadsheet, Loader2, Package, Truck } from 'lucide-react';
import type { SurveyType } from '../../../types/survey';
import {
  createActiveCompanySnapshot,
  parseActiveCompanyWorkbook,
} from '../domain/activeCompanySnapshots';
import { saveActiveCompanySnapshot } from '../services/activeCompanySnapshotService';

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
    icon: Package,
    iconStyle: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  {
    type: 'Subcontractor',
    label: 'Subcontractor',
    expectedFileName: 'subcontractor.csv',
    icon: Cog,
    iconStyle: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
  },
];

export function ActiveCompanyUploadCards({ userEmail }: ActiveCompanyUploadCardsProps) {
  const [busyType, setBusyType] = useState<SurveyType | null>(null);
  const [dragType, setDragType] = useState<SurveyType | null>(null);
  const [messages, setMessages] = useState<Partial<Record<SurveyType, { kind: 'success' | 'error'; text: string }>>>({});
  const fileInputs = useRef<Partial<Record<SurveyType, HTMLInputElement | null>>>({});

  const uploadFile = async (surveyType: SurveyType, file: File) => {
    setBusyType(surveyType);
    setMessages((current) => ({ ...current, [surveyType]: undefined }));
    try {
      const companies = parseActiveCompanyWorkbook(await file.arrayBuffer(), file.name, surveyType);
      const snapshot = createActiveCompanySnapshot(surveyType, file.name, companies, userEmail);
      await saveActiveCompanySnapshot(snapshot);
      setMessages((current) => ({
        ...current,
        [surveyType]: { kind: 'success', text: `${companies.length} active partners saved.` },
      }));
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [surveyType]: { kind: 'error', text: error instanceof Error ? error.message : 'Unable to upload this file.' },
      }));
    } finally {
      setBusyType(null);
    }
  };

  const handleFileInput = (surveyType: SurveyType, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void uploadFile(surveyType, file);
  };

  const handleDrop = (surveyType: SurveyType, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragType(null);
    const file = event.dataTransfer.files?.[0];
    if (file && !busyType) void uploadFile(surveyType, file);
  };

  return (
    <section className="border-t border-slate-200 pt-4 dark:border-slate-800" aria-labelledby="active-company-upload-title">
      <div>
        <h4 id="active-company-upload-title" className="text-xs font-bold text-slate-800 dark:text-slate-100">
          Upload Active Partner Lists
        </h4>
        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Save a dated Courier, Supplier, or Subcontractor snapshot for the Active Partners history.
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
                  <h5 className="truncate text-xs font-bold text-slate-900 dark:text-white">{label}</h5>
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
                    ? 'border-[#0866B1] bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!isBusy) setDragType(type);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragType((current) => (current === type ? null : current))}
                onDrop={(event) => handleDrop(type, event)}
              >
                <button
                  type="button"
                  onClick={() => fileInputs.current[type]?.click()}
                  disabled={Boolean(busyType)}
                  className="inline-flex min-h-8 items-center gap-1.5 text-[11px] font-bold text-[#0866B1] hover:text-[#004f87] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0866B1] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400"
                >
                  {isBusy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={14} aria-hidden="true" />}
                  {isBusy ? 'Uploading...' : 'Choose File'}
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
    </section>
  );
}
