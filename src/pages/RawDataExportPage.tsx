import { exportTablesAsWord } from '../features/reports/services/exporters';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, FileText, FileType, Layers, PackageSearch, Table2, Truck } from 'lucide-react';
import { SurveyResponse, SurveyType } from '../types/survey';
import { buildRawResponseExportTables, exportRawResponsesAsCSV, exportRawResponsesAsExcel, exportRawResponsesAsPDF } from '../features/reports/services/rawResponseExport';

interface RawDataExportPageProps {
  responses: SurveyResponse[];
  canExport?: boolean;
  initialCategory?: SurveyType;
  onBack: () => void;
}

type RawExportFormat = 'csv' | 'excel' | 'pdf' | 'docx';

const CATEGORY_CONFIG: { type: SurveyType; icon: typeof Truck; description: string }[] = [
  { type: 'Courier', icon: Truck, description: 'Raw response submissions for courier partners, one merged sheet sorted by submission date.' },
  { type: 'Supplier', icon: PackageSearch, description: 'Raw response submissions for suppliers, one merged sheet sorted by submission date.' },
  { type: 'Subcontractor', icon: Layers, description: 'Raw response submissions for subcontractors, one merged sheet sorted by submission date.' },
];

export function RawDataExportPage({ responses, canExport = false, onBack, initialCategory }: RawDataExportPageProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="secondary-button">
          <ArrowLeft size={16} />
          <span>Back to Reports</span>
        </button>
        <div className="text-right">
          <h2 className="text-base font-semibold">Raw Data Export</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Export raw response submissions in the original form layout - one sortable sheet per category, ordered by date and time answered</p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {CATEGORY_CONFIG.filter(item => !initialCategory || item.type === initialCategory).map(({ type, icon, description }) => {
          const typeResponses = responses.filter((r) => r.surveyType === type);
          const companyCount = new Set(typeResponses.map((r) => r.company)).size;
          return (
            <RawExportCard
              key={type}
              title={type}
              description={description}
              icon={icon}
              companyCount={companyCount}
              canExport={canExport}
              disabled={typeResponses.length === 0}
              onExport={async (format) => {
                const filenameBase = `${type.toLowerCase()}_raw_evaluations`;
                if (format === 'docx') await exportTablesAsWord(`Raw Data Export (${type})`, buildRawResponseExportTables(responses, type), filenameBase, { kind: 'raw', parameters: { category: type } });
                else if (format === 'csv') await exportRawResponsesAsCSV(responses, type, filenameBase);
                else if (format === 'excel') await exportRawResponsesAsExcel(responses, type, filenameBase);
                else await exportRawResponsesAsPDF(responses, type, filenameBase);
              }}
            />
          );
        })}
      </section>
    </div>
  );
}

function RawExportCard({
  title,
  description,
  icon: Icon,
  companyCount,
  canExport,
  disabled,
  onExport,
}: {
  title: string;
  description: string;
  icon: typeof Truck;
  companyCount: number;
  canExport?: boolean;
  disabled: boolean;
  onExport: (format: RawExportFormat) => void | Promise<void>;
}) {
  return (
    <article className="panel flex flex-col items-center text-center">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-2xl bg-blue-50/80 dark:bg-blue-950/40">
        <Icon size={64} strokeWidth={1.5} className="text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-[220px]">{description}</p>
      <span className="mt-2 text-[11px] font-bold text-slate-400">
        {companyCount} {companyCount === 1 ? 'company' : 'companies'} evaluated
      </span>
      {!canExport ? (
        <p className="mt-4 text-[11px] font-bold text-slate-400 select-none">⚠️ Export restricted</p>
      ) : disabled ? (
        <p className="mt-4 text-[11px] font-bold text-slate-300 select-none">No data yet</p>
      ) : (
        <RawExportMenu onExport={onExport} />
      )}
    </article>
  );
}

/** "Export As ▾" trigger restricted to Excel / CSV / PDF, used on each category card. */
function RawExportMenu({ onExport }: { onExport: (format: RawExportFormat) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const choose = async (format: RawExportFormat) => {
    setOpen(false); setExporting(true); setError('');
    try { await onExport(format); }
    catch { setError('Unable to export this report. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="relative mt-4 inline-block" ref={containerRef}>
      <button className="ghost-button" type="button" disabled={exporting} onClick={() => setOpen((v) => !v)}>
        <Download size={15} />
        Export As
        <ChevronDown size={14} />
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => choose('excel')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button
            type="button"
            onClick={() => choose('csv')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Table2 size={14} /> CSV
          </button>
          <button
            type="button"
            onClick={() => choose('pdf')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            type="button"
            onClick={() => choose('docx')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileType size={14} /> Word (.docx)
          </button>
        </div>
      ) : null}
    </div>
  );
}
