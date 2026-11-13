import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { SurveyType } from '../../../types/survey';
import { StateMessage } from '../../../components/StateMessage';
import { ARCHIVED_REPORT_TITLES, buildArchivedReport, getArchivedReportItems, type ArchivedReportData, type ArchivedReportKind } from '../domain/archivedReports';
import type { ReportParameters } from '../domain/reportHistory';
import { exportTablesAsCSV, exportTablesAsExcel, exportTablesAsWord } from '../services/exporters';
import { exportArchivedReportAsPDF } from '../services/archivedReportExport';
import { createArchiveAnalyticsImages } from '../services/archiveAnalyticsImages';
import { ArchivedRecordPreview } from './ArchivedRecordPreview';
import { PaperSizeSelect } from './PaperSizeSelect';
import type { PaperSize } from '../domain/paperSize';
import { ArchiveTabs } from './ArchivedReportTabs';
import { ARCHIVED_SURVEY_PAPER } from '../domain/archivedReportLayout';
import { ArchivedSurveyPreview } from './ArchivedSurveyPreview';
import { ArchivedPaperPreview } from './ArchivedPaperPreview';

interface Props {
  kind: ArchivedReportKind;
  data: ArchivedReportData;
  canExport: boolean;
  initialSettings?: ReportParameters;
  onBack: () => void;
}

export function ArchivedReportBuilder({ kind, data, canExport, initialSettings = {}, onBack }: Props) {
  const [preferredCategory, setCategory] = useState<SurveyType | undefined>(initialSettings.category);
  const [selectedItemId, setItemId] = useState<string | undefined>(initialSettings.archivedItemId);
  const [includeComments, setIncludeComments] = useState(initialSettings.includeComments ?? false);
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv' | 'docx'>('pdf');
  const [paperSize, setPaperSize] = useState<PaperSize>(initialSettings.paperSize ?? (kind === 'archived-survey' ? ARCHIVED_SURVEY_PAPER : 'a4'));
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const title = ARCHIVED_REPORT_TITLES[kind];
  const itemLabel = kind === 'archived-survey' ? 'Archived survey' : kind === 'archived-company' ? 'Archived company' : 'Response archive';
  const categories = (['Courier', 'Supplier', 'Subcontractor'] as const).map(type => ({ type, items: getArchivedReportItems(data, kind, type) }));
  const category = preferredCategory ?? categories.find(option => option.items.length)?.type ?? 'Courier';
  const items = categories.find(option => option.type === category)!.items;
  const itemId = selectedItemId ?? items[0]?.id ?? '';
  useEffect(() => {
    if (items.length && selectedItemId === undefined) {
      setCategory(category);
      setItemId(itemId);
    }
  }, [category, itemId, items.length, selectedItemId]);
  const { report, selectionError } = useMemo(() => {
    if (!itemId) return { report: undefined, selectionError: '' };
    try { return { report: buildArchivedReport(data, { kind, category, itemId, includeComments }), selectionError: '' }; }
    catch (failure) { return { report: undefined, selectionError: failure instanceof Error ? failure.message : 'Unable to prepare this archived report.' }; }
  }, [data.responses, data.surveys, data.knownSurveys, data.companies, data.series, kind, category, itemId, includeComments]);
  const download = async () => {
    if (!canExport || !report?.canExport || isDownloading) return;
    setIsDownloading(true);
    try {
      const recipe = { kind, parameters: { paperSize, category, archivedItemId: itemId, archivedItemLabel: report.itemLabel, includeComments } };
      if (format === 'docx') await exportTablesAsWord(title, report.tables, 'archived_report', recipe);
      else if (format === 'pdf') await exportArchivedReportAsPDF(title, report.itemLabel, category, report.tables, recipe, report.analytics);
      else if (format === 'excel') await exportTablesAsExcel(report.tables.filter(table => table.title !== 'Company leaderboard'), 'archived_report', recipe, await createArchiveAnalyticsImages(report.analytics));
      else await exportTablesAsCSV(report.tables, 'archived_report', recipe);
      setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to export this report. Please try again.'); }
    finally { setIsDownloading(false); }
  };

  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className="ghost-button inline-flex items-center gap-2" onClick={onBack}><ArrowLeft size={16} />Back to Reports</button>
      <h2 className="text-base font-semibold">{title} Builder</h2>
    </div>
    <ArchiveTabs label="Archive categories" options={categories.map(({ type, items: options }) => ({ value: type, label: `${type} (${options.length})` }))} value={category} onChange={type => { setCategory(type); setItemId(undefined); setError(''); }}>
    <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside aria-label="Archived report options" className="panel h-fit min-w-0 space-y-6 lg:sticky lg:top-4">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">1. {itemLabel}
          <select aria-label={itemLabel} className="field mt-2" value={itemId} onChange={event => { setCategory(category); setItemId(event.target.value); setError(''); }}>
            <option value="">{items.length ? `Select ${itemLabel.toLowerCase()}` : 'No archived items in this category'}</option>
            {items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">2. Comments</h3>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={includeComments} onChange={event => { setIncludeComments(event.target.checked); setError(''); }} />Include respondent comments</label>
        </div>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Only the selected item is included. A survey report contains its related companies and responses. Records remain archived.</p>
        {!canExport ? <p className="text-xs text-slate-500">Export access restricted.</p> : null}
      </aside>
      <section aria-label="Archived report document" className="panel flex min-w-0 flex-col">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Preview</h3>
          <div className="flex flex-wrap items-end gap-2">
            {(format === 'pdf' || format === 'docx') && <PaperSizeSelect value={paperSize} onChange={setPaperSize} disabled={isDownloading} />}
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">File format<select aria-label="File format" className="field mt-1" value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="pdf">PDF</option><option value="docx">Word (.docx)</option><option value="excel">Excel</option><option value="csv">CSV</option></select></label>
            <button type="button" className="primary-button" disabled={!canExport || !report?.canExport || isDownloading} onClick={download}>{isDownloading ? 'Downloading…' : 'Download report'}</button>
          </div>
        </div>
        {error || selectionError ? <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error || selectionError}</p> : null}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-200/70 p-3 dark:border-slate-800 dark:bg-slate-950/60 sm:p-6">
          {!report ? <StateMessage compact title="Select an archived item" message="Choose a category and one archived item on the left to generate its preview." /> : <>
            {!report.count ? <div className="mb-3"><StateMessage compact title={report.rowCount ? 'No countable responses' : 'No response data'} message={report.rowCount ? 'Stored answers are included, but none contain a countable response.' : kind === 'archived-company' ? 'Only this company profile is available for export.' : 'Only this archived survey’s details are available for export.'} /></div> : null}
            <ArchivedPaperPreview key={`${kind}:${category}:${itemId}:${includeComments}:${paperSize}`} report={report} kind={kind} category={category} paperSize={paperSize} includeComments={includeComments}>
              {kind === 'archived-survey' ? <ArchivedSurveyPreview report={report} category={category} paperSize={paperSize} /> : <ArchivedRecordPreview report={report} />}
            </ArchivedPaperPreview>
          </>}
        </div>
      </section>
    </div>
    </ArchiveTabs>
  </div>;
}
