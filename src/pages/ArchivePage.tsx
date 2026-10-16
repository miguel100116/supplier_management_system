import { useMemo, useRef, useState } from 'react';
import { Archive, ClipboardList, FileText, RefreshCw, Calendar, Building2, UserCheck, Trash2, ArrowLeft, Search, Download, Upload, Loader2, SlidersHorizontal, X, Sparkles, TrendingUp, Pencil, Check } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArchiveSeries, CustomForm, PartnerCompany, PartnerCompanyType, SurveyResponse, SurveyType } from '../types/survey';
import { exportArchivedResponsesAsExcel } from '../utils/archiveResponseTransfer';
import type { ArchiveImportResult } from '../utils/archiveResponseTransfer';
import { ChartCard } from '../components/ChartCard';
import { PageDescription } from '../components/PageDescription';
import { useIsMobile } from '../hooks/useIsMobile';
import { seriesTrend, companySeriesTrend } from '../utils/analytics';
import { compareDate, compareText, isWithinDateRange } from '../utils/tableFilters';
import { useModalEscape } from '../hooks/useModalEscape';

interface ArchivePageProps {
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  archivedResponses: SurveyResponse[];
  archiveSeries?: ArchiveSeries[];
  onRenameArchiveSeries?: (id: string, newLabel: string) => void;
  onUpdateSurvey?: (survey: CustomForm) => Promise<CustomForm>;
  onUpdatePartnerCompany: (company: PartnerCompany) => Promise<PartnerCompany>;
  onRestoreResponseGroup?: (responseId: string) => Promise<void>;
  onRestoreResponsesForSurvey?: (surveyId: string) => Promise<void>;
  onDeleteArchivedResponseGroups?: (groupIds: { archivedAt: string; surveyId: string }[]) => Promise<void>;
  onRestoreArchivedResponseGroups?: (groupIds: { archivedAt: string; surveyId: string }[]) => Promise<void>;
  onImportArchivedResponses?: (file: File) => Promise<ArchiveImportResult>;
  isAdmin: boolean;
}

export function countActiveArchiveFilters(
  sort: 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc',
  from: string,
  to: string,
  companyType: 'All' | PartnerCompanyType,
  tab: 'surveys' | 'responses' | 'companies'
): number {
  return Number(sort !== 'date-desc') + Number(Boolean(from || to)) + Number(tab === 'companies' && companyType !== 'All');
}

export function ArchivePage({
  surveys,
  partnerCompanies,
  archivedResponses,
  archiveSeries = [],
  onRenameArchiveSeries,
  onUpdateSurvey,
  onUpdatePartnerCompany,
  onRestoreResponseGroup,
  onRestoreResponsesForSurvey,
  onDeleteArchivedResponseGroups,
  onRestoreArchivedResponseGroups,
  onImportArchivedResponses,
  isAdmin
}: ArchivePageProps) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'surveys' | 'responses' | 'companies'>('surveys');
  const [searchQuery, setSearchQuery] = useState('');
  const [companyTypeFilter, setCompanyTypeFilter] = useState<'All' | PartnerCompanyType>('All');
  const [tableSort, setTableSort] = useState<'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'>('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmSurvey, setConfirmSurvey] = useState<CustomForm | null>(null);
  const [confirmPartnerCompany, setConfirmPartnerCompany] = useState<PartnerCompany | null>(null);
  const [confirmResponseGroup, setConfirmResponseGroup] = useState<{ responseId: string; company: string; type: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Filter archived surveys
  const archivedSurveys = useMemo(() => {
    return surveys.filter((s) => s.status === 'Archived');
  }, [surveys]);

  const archivedCompanies = useMemo(
    () => partnerCompanies.filter((company) => company.isArchived),
    [partnerCompanies]
  );

  // Group responses primarily by named archive series (a period like "1st Half
  // 2026" can span multiple archive actions/surveys done under the same
  // label). Rows with no seriesId (pre-existing data from before series
  // existed) fall back to the old per-event grouping so nothing breaks.
  const groupedArchivedResponses = useMemo(() => {
    const seriesById = new Map(archiveSeries.map((s) => [s.id, s]));
    const groups: Record<string, {
      id: string;
      label: string;
      seriesId?: string;
      surveyTypes: SurveyType[];
      sortKey: string;
      // Distinct (archivedAt, surveyId) event pairs contributing to this
      // group - needed because a series can merge multiple archive events.
      eventKeys: { archivedAt: string; surveyId: string }[];
      responsesCount: number;
      responses: SurveyResponse[];
    }> = {};

    archivedResponses.forEach((r) => {
      const seriesId = r.seriesId && seriesById.has(r.seriesId) ? r.seriesId : undefined;
      // Use fallback for older data that doesn't have these properties
      const legacySurveyId = r.archivedBySurveyId || r.surveyType;
      const legacyArchivedAt = r.archivedAt || r.submissionDate;
      const groupId = seriesId ?? `legacy_${legacySurveyId}_${legacyArchivedAt}`;
      const label = seriesId ? seriesById.get(seriesId)!.label : (r.archivedBySurveyTitle || r.surveyType + ' Form');
      const sortKey = seriesId ? seriesById.get(seriesId)!.createdAt : legacyArchivedAt;

      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          label,
          seriesId,
          surveyTypes: [],
          sortKey,
          eventKeys: [],
          responsesCount: 0,
          responses: [],
        };
      }

      if (!groups[groupId].surveyTypes.includes(r.surveyType)) {
        groups[groupId].surveyTypes.push(r.surveyType);
      }
      if (!groups[groupId].eventKeys.some((e) => e.archivedAt === legacyArchivedAt && e.surveyId === legacySurveyId)) {
        groups[groupId].eventKeys.push({ archivedAt: legacyArchivedAt, surveyId: legacySurveyId });
      }

      // Calculate responsesCount properly (number of unique responseIds)
      const isUniqueResponse = !groups[groupId].responses.some(resp => resp.responseId === r.responseId);
      if (isUniqueResponse) {
        groups[groupId].responsesCount += 1;
      }

      groups[groupId].responses.push(r);
    });

    return Object.values(groups).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [archivedResponses, archiveSeries]);

  // Handle restoring an archived survey back to active/running status
  const handleRestoreSurvey = (survey: CustomForm) => {
    setConfirmSurvey(survey);
  };

  const executeRestoreSurvey = async () => {
    if (!confirmSurvey || !onUpdateSurvey) return;
    setMutationError(null);
    try {
      await onUpdateSurvey({ ...confirmSurvey, status: 'Running', archivedAt: undefined });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to restore the survey.');
      return;
    }
    setSuccessMessage(`Form "${confirmSurvey.title}" has been restored to Active status!`);
    setConfirmSurvey(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const executeRestorePartnerCompany = async () => {
    if (!confirmPartnerCompany) return;
    setMutationError(null);
    try {
      await onUpdatePartnerCompany({ ...confirmPartnerCompany, isArchived: false, archivedAt: undefined });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to restore the partner company.');
      return;
    }
    setSuccessMessage(`Company "${confirmPartnerCompany.name}" has been restored to Partners.`);
    setConfirmPartnerCompany(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleRestoreResponseGroup = (group: { responseId: string; company: string; type: string }) => {
    setConfirmResponseGroup(group);
  };

  const executeRestoreResponseGroup = async () => {
    if (!confirmResponseGroup || !onRestoreResponseGroup) return;
    setMutationError(null);
    try {
      await onRestoreResponseGroup(confirmResponseGroup.responseId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to restore the response group.');
      return;
    }
    setSuccessMessage(`Evaluations for "${confirmResponseGroup.company}" restored to live dataset!`);
    setConfirmResponseGroup(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Filter lists based on search
  const filteredArchivedSurveys = useMemo(() => {
    const needle = searchQuery.toLowerCase();
    return archivedSurveys
      .filter((s) =>
        (!needle.trim() || s.title.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)) &&
        isWithinDateRange(s.archivedAt, dateFrom, dateTo)
      )
      .sort((a, b) => {
        if (tableSort === 'name-asc') return compareText(a.title, b.title);
        if (tableSort === 'name-desc') return compareText(b.title, a.title);
        if (!a.archivedAt && !b.archivedAt) return 0;
        if (!a.archivedAt) return 1;
        if (!b.archivedAt) return -1;
        if (tableSort === 'date-asc') return compareDate(a.archivedAt, b.archivedAt);
        return compareDate(b.archivedAt, a.archivedAt);
      });
  }, [archivedSurveys, searchQuery, tableSort, dateFrom, dateTo]);

  const filteredGroupedResponses = useMemo(() => {
    const needle = searchQuery.toLowerCase();
    return groupedArchivedResponses
      .filter((g) =>
        (!needle.trim() || g.label.toLowerCase().includes(needle) || g.surveyTypes.some((t) => t.toLowerCase().includes(needle))) &&
        isWithinDateRange(g.sortKey, dateFrom, dateTo)
      )
      .sort((a, b) => {
        if (tableSort === 'name-asc') return compareText(a.label, b.label);
        if (tableSort === 'name-desc') return compareText(b.label, a.label);
        if (tableSort === 'date-asc') return compareDate(a.sortKey, b.sortKey);
        return compareDate(b.sortKey, a.sortKey);
      });
  }, [groupedArchivedResponses, searchQuery, tableSort, dateFrom, dateTo]);

  const filteredArchivedCompanies = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return archivedCompanies
      .filter((company) =>
        (companyTypeFilter === 'All' || company.type === companyTypeFilter) &&
        (!needle || company.name.toLowerCase().includes(needle) ||
          (company.branches ?? []).some((branch) => branch.bpCode?.toLowerCase().includes(needle))) &&
        isWithinDateRange(company.archivedAt, dateFrom, dateTo)
      )
      .sort((a, b) => {
        if (tableSort === 'name-asc') return compareText(a.name, b.name);
        if (tableSort === 'name-desc') return compareText(b.name, a.name);
        if (!a.archivedAt && !b.archivedAt) return 0;
        if (!a.archivedAt) return 1;
        if (!b.archivedAt) return -1;
        if (tableSort === 'date-asc') return compareDate(a.archivedAt, b.archivedAt);
        return compareDate(b.archivedAt, a.archivedAt);
      });
  }, [archivedCompanies, companyTypeFilter, searchQuery, tableSort, dateFrom, dateTo]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  // "Series Trend" panel state: overall trend across periods, or one
  // company's trend across periods (the "project a company's rating trend
  // across years" view).
  const [trendCompany, setTrendCompany] = useState<string>('__overall__');
  const trendCompanies = useMemo(
    () => [...new Set(archivedResponses.filter((r) => r.seriesId).map((r) => r.company))].sort(),
    [archivedResponses]
  );
  const seriesTrendData = useMemo(() => {
    const data = trendCompany === '__overall__'
      ? seriesTrend(archivedResponses, archiveSeries)
      : companySeriesTrend(archivedResponses, trendCompany, archiveSeries);
    return data.map((d) => ({ key: d.label, average: d.average, responses: d.responses }));
  }, [archivedResponses, archiveSeries, trendCompany]);

  const startRenameSeries = (seriesId: string, currentLabel: string) => {
    setEditingSeriesId(seriesId);
    setEditingLabel(currentLabel);
  };

  const commitRenameSeries = () => {
    if (editingSeriesId && onRenameArchiveSeries && editingLabel.trim()) {
      onRenameArchiveSeries(editingSeriesId, editingLabel.trim());
    }
    setEditingSeriesId(null);
    setEditingLabel('');
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedGroups(next);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedGroups(next);
  };

  const selectAll = () => {
    if (selectedGroups.size === filteredGroupedResponses.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredGroupedResponses.map(g => g.id)));
    }
  };

  const [confirmDeleteState, setConfirmDeleteState] = useState<{isOpen: boolean}>({ isOpen: false });

  // Export/import of raw archived response data (see archiveResponseTransfer.ts)
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ArchiveImportResult | null>(null);
  const [importError, setImportError] = useState('');
  useModalEscape(confirmDeleteState.isOpen, () => setConfirmDeleteState({ isOpen: false }), 52);
  useModalEscape(Boolean(confirmResponseGroup), () => setConfirmResponseGroup(null), 51);
  useModalEscape(Boolean(confirmSurvey), () => setConfirmSurvey(null), 50);
  useModalEscape(Boolean(confirmPartnerCompany), () => setConfirmPartnerCompany(null), 49);
  useModalEscape(Boolean(importResult), () => setImportResult(null), 50);

  const handleExportSelected = () => {
    const rows = groupedArchivedResponses
      .filter((g) => selectedGroups.has(g.id))
      .flatMap((g) => g.responses);
    if (rows.length === 0) return;
    exportArchivedResponsesAsExcel(rows, 'archived_responses_selected', archiveSeries);
  };

  const handleExportAll = () => {
    if (archivedResponses.length === 0) return;
    exportArchivedResponsesAsExcel(archivedResponses, 'archived_responses_all', archiveSeries);
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportArchivedResponses) return;

    setIsImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const result = await onImportArchivedResponses(file);
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import the archived responses file.');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadImportLog = () => {
    if (!importResult) return;
    const blob = new Blob([JSON.stringify(importResult.log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archive-import-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkRestore = async () => {
    if (selectedGroups.size === 0 || !onRestoreArchivedResponseGroups) return;
    const groups = filteredGroupedResponses
      .filter(g => selectedGroups.has(g.id))
      .flatMap(g => g.eventKeys);

    setMutationError(null);
    try {
      await onRestoreArchivedResponseGroups(groups);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to restore the archived responses.');
      return;
    }
    setSelectedGroups(new Set());
    setSuccessMessage('Selected archived forms have been restored to live dataset!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleBulkDelete = () => {
    if (selectedGroups.size === 0 || !onDeleteArchivedResponseGroups) return;
    setConfirmDeleteState({ isOpen: true });
  };

  const confirmBulkDelete = async () => {
    const groups = filteredGroupedResponses
      .filter(g => selectedGroups.has(g.id))
      .flatMap(g => g.eventKeys);

    setMutationError(null);
    try {
      await onDeleteArchivedResponseGroups!(groups);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to delete the archived responses.');
      return;
    }
    setSelectedGroups(new Set());
    setConfirmDeleteState({ isOpen: false });
    setSuccessMessage('Selected archived logs have been permanently deleted.');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const filteredResultCount = activeTab === 'surveys'
    ? filteredArchivedSurveys.length
    : activeTab === 'companies'
      ? filteredArchivedCompanies.length
      : filteredGroupedResponses.length;
  const activeFilterCount = countActiveArchiveFilters(tableSort, dateFrom, dateTo, companyTypeFilter, activeTab);
  const archiveItemLabel = activeTab === 'companies' ? 'partner' : activeTab === 'surveys' ? 'form' : 'response';
  const archiveCollectionLabel = activeTab === 'companies' ? 'partners' : activeTab === 'surveys' ? 'forms' : 'responses';

  if (!isAdmin) {
    return (
      <div className="panel mx-auto mt-10 max-w-md p-5 text-center text-slate-500 sm:p-8">
        <Trash2 className="mx-auto mb-4 text-rose-500 h-12 w-12" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Access Restricted</h3>
        <p className="text-sm mt-2">Only administrators can access Archive.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageDescription>Manage archived partners, restore archived forms, and review preserved responses.</PageDescription>
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 rounded-xl p-4 flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-sm animate-fade-in">
          <RefreshCw size={18} className="animate-spin-slow text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}
      {mutationError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
          {mutationError}
        </div>
      )}

      {/* Two Clickable Blocks (Bento Cards) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Block 1: Archived Survey */}
        <button
          onClick={() => {
            setActiveTab('surveys');
            setSearchQuery('');
          }}
          className={`panel p-6 flex items-start gap-4 text-left transition relative overflow-hidden cursor-pointer ${
            activeTab === 'surveys'
              ? 'ring-2 ring-[#0866B1] bg-blue-50/20 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900'
              : 'hover:border-slate-300 hover:bg-slate-50/30'
          }`}
          id="btn-archive-surveys"
        >
          <div className={`p-3 rounded-xl shrink-0 ${
            activeTab === 'surveys' ? 'bg-[#0866B1] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            <ClipboardList size={24} />
          </div>
          <div className="space-y-1 flex-1 pr-12">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">Archived Forms</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Form templates removed from active rotation. Can be restored back to the active registry.
            </p>
          </div>
          <span className="absolute top-6 right-6 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-300">
            {archivedSurveys.length}
          </span>
        </button>

        {/* Block 2: Archived Responses */}
        <button
          onClick={() => {
            setActiveTab('responses');
            setSearchQuery('');
          }}
          className={`panel p-6 flex items-start gap-4 text-left transition relative overflow-hidden cursor-pointer ${
            activeTab === 'responses'
              ? 'ring-2 ring-[#0866B1] bg-blue-50/20 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900'
              : 'hover:border-slate-300 hover:bg-slate-50/30'
          }`}
          id="btn-archive-responses"
        >
          <div className={`p-3 rounded-xl shrink-0 ${
            activeTab === 'responses' ? 'bg-[#0866B1] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            <FileText size={24} />
          </div>
          <div className="space-y-1 flex-1 pr-12">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">Archived Responses</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Submissions preserved from completed or reset evaluations. Keeps your live dashboards neat.
            </p>
          </div>
          <span className="absolute top-6 right-6 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-300">
            {groupedArchivedResponses.length}
          </span>
        </button>

        {/* Block 3: Archived Partners */}
        <button
          onClick={() => {
            setActiveTab('companies');
            setSearchQuery('');
            setCompanyTypeFilter('All');
          }}
          className={`panel p-6 flex items-start gap-4 text-left transition relative overflow-hidden cursor-pointer ${
            activeTab === 'companies'
              ? 'ring-2 ring-[#0866B1] bg-blue-50/20 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900'
              : 'hover:border-slate-300 hover:bg-slate-50/30'
          }`}
          id="btn-archive-companies"
        >
          <div className={`p-3 rounded-xl shrink-0 ${
            activeTab === 'companies' ? 'bg-[#0866B1] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            <Building2 size={24} />
          </div>
          <div className="space-y-1 flex-1 pr-12">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">Archived Partners</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              View archived partner records and restore companies to the active registry.
            </p>
          </div>
          <span className="absolute top-6 right-6 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-300">
            {archivedCompanies.length}
          </span>
        </button>
      </div>

      {/* List Container with Search */}
      <div className="panel p-5 space-y-4">
        <div role="toolbar" aria-label="Archive filters" className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-24 sm:min-w-[160px]">
            <span className="sr-only">Search archived {archiveCollectionLabel}</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder={'Search archived ' + archiveCollectionLabel + '...'}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#0866B1] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-950"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          {activeTab === 'responses' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImportFileSelected}
                />
                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={isImporting}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-wait cursor-pointer"
                  title="Re-import a previously exported archived-responses file"
                >
                  {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{isImporting ? 'Importing…' : 'Import'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAll}
                  disabled={archivedResponses.length === 0}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60 cursor-pointer"
                  title="Export every archived response to Excel"
                >
                  <Download size={14} />
                  <span>Export All Archived</span>
                </button>
            </div>
          )}

          <details className="relative shrink-0">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:gap-1.5 sm:px-3 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal size={15} aria-hidden="true" className="hidden sm:block" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-[#0866B1] px-1.5 py-0.5 text-[10px] leading-none text-white" aria-label={activeFilterCount + ' active filters'}>
                  {activeFilterCount}
                </span>
              )}
            </summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-950">
              <label className="block">
                <span className="sr-only">Sort archived items</span>
                <select
                  value={tableSort}
                  onChange={(event) => setTableSort(event.target.value as typeof tableSort)}
                  className="field !mt-0 w-full py-2 text-sm"
                  aria-label="Sort archived items"
                >
                  <option value="date-desc">Date: newest first</option>
                  <option value="date-asc">Date: oldest first</option>
                  <option value="name-asc">Name: A-Z</option>
                  <option value="name-desc">Name: Z-A</option>
                </select>
              </label>
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">Archived date range</legend>
                <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                  From
                  <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} aria-label="Archived date from" className="field !mt-1 w-full py-2 text-xs" />
                </label>
                <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                  To
                  <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Archived date to" className="field !mt-1 w-full py-2 text-xs" />
                </label>
              </fieldset>
              {activeTab === 'companies' && (
                <label className="block">
                  <span className="sr-only">Filter archived partners by type</span>
                  <select
                    value={companyTypeFilter}
                    onChange={(event) => setCompanyTypeFilter(event.target.value as 'All' | PartnerCompanyType)}
                    className="field !mt-0 w-full py-2 text-sm"
                    aria-label="Filter archived partners by type"
                  >
                    <option value="All">All company types</option>
                    {(['Courier', 'Supplier', 'Subcontractor', 'Uncategorized'] as PartnerCompanyType[]).map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => {
                  setTableSort('date-desc');
                  setDateFrom('');
                  setDateTo('');
                  setCompanyTypeFilter('All');
                }}
                className="text-xs font-semibold text-[#0866B1] hover:underline dark:text-blue-400"
              >
                Reset filters
              </button>
            </div>
          </details>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {filteredResultCount} archived {archiveItemLabel}{filteredResultCount === 1 ? '' : 's'}
        </p>

        {importError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-xs font-semibold flex items-center gap-2 dark:bg-rose-950/20 dark:border-rose-900">
            <span>{importError}</span>
          </div>
        )}

        {/* Tab 1 Content: Surveys List */}
        {activeTab === 'surveys' && (
          <div>
            {filteredArchivedSurveys.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Archive size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No archived forms found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[760px] border-collapse text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="px-4 py-3">Survey Title</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Date Created</th>
                      <th className="px-4 py-3">Date Archived</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredArchivedSurveys.map((survey) => (
                      <tr key={survey.id} className="align-middle hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="px-4 py-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {survey.title}
                            </span>
                            <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">
                              {survey.description || 'No description.'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {survey.surveyType}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(survey.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                          {survey.archivedAt
                            ? new Date(survey.archivedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                            : 'Not recorded'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => handleRestoreSurvey(survey)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0866B1] text-[#0866B1] hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/20 px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                            type="button"
                          >
                            <RefreshCw size={12} />
                            <span>Restore Form</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'companies' && (
          <div>
            {filteredArchivedCompanies.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Building2 size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No archived partners match these filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[680px] border-collapse text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Date Archived</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredArchivedCompanies.map((company) => (
                      <tr key={company.id} className="align-middle hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="px-4 py-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100">{company.name}</span>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {company.branches?.length ?? 0} {company.branches?.length === 1 ? 'branch' : 'branches'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {company.type}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                          {company.archivedAt
                            ? new Date(company.archivedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                            : 'Not recorded'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => setConfirmPartnerCompany(company)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0866B1] text-[#0866B1] hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/20 px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                            type="button"
                          >
                            <RefreshCw size={12} />
                            <span>Restore Company</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Responses List */}
        {activeTab === 'responses' && (
          <div className="space-y-5">
            {archiveSeries.length > 0 && (
              <ChartCard
                title="Series Trend"
                subtitle="Average score across named archive periods - track a company (or the overall portfolio) year over year"
                action={
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingUp size={14} className="text-slate-400" />
                    <select
                      value={trendCompany}
                      onChange={(e) => setTrendCompany(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0866B1] cursor-pointer"
                    >
                      <option value="__overall__">Overall (all companies)</option>
                      {trendCompanies.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                }
              >
                {seriesTrendData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                    No data for this selection.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={seriesTrendData} margin={{ top: 8, right: isMobile ? 0 : 8, left: isMobile ? -8 : 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="key" minTickGap={isMobile ? 20 : 8} tick={{ fontSize: isMobile ? 9 : 12 }} />
                      <YAxis yAxisId="left" domain={[0, 100]} width={isMobile ? 34 : 48} tickFormatter={(value: number) => `${value}%`} tick={{ fontSize: isMobile ? 9 : 12 }} />
                      <YAxis yAxisId="right" orientation="right" width={isMobile ? 28 : 48} allowDecimals={false} tick={{ fontSize: isMobile ? 9 : 12 }} />
                      <Tooltip formatter={(value, name) => [name === 'Average Score' ? `${value}%` : value, name]} />
                      <Line yAxisId="left" type="monotone" dataKey="average" name="Average Score" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                      <Line yAxisId="right" type="monotone" dataKey="responses" name="Responses" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )}

            {filteredGroupedResponses.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No archived responses found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Bulk Actions Bar */}
                {selectedGroups.size > 0 && (
                  <div className="bg-[#0866B1]/10 border border-[#0866B1]/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
                    <span className="text-sm font-bold text-[#0866B1] dark:text-blue-400">
                      {selectedGroups.size} group(s) selected
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={handleExportSelected} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[#0866B1]/30 bg-white dark:bg-slate-900 text-[#0866B1] hover:bg-blue-50 dark:hover:bg-slate-800 transition cursor-pointer">
                        Export Selected
                      </button>
                      <button onClick={handleBulkRestore} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#0866B1] text-white hover:bg-[#07528E] transition cursor-pointer">
                        Restore Selected
                      </button>
                      <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer">
                        Delete Selected
                      </button>
                      <button onClick={() => setSelectedGroups(new Set())} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Select All Checkbox */}
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={selectedGroups.size === filteredGroupedResponses.length && filteredGroupedResponses.length > 0}
                    onChange={selectAll}
                    className="w-4 h-4 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                  />
                  <span>Select All ({filteredGroupedResponses.length})</span>
                </div>

                {filteredGroupedResponses.map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  const isSelected = selectedGroups.has(group.id);
                  
                  return (
                    <div key={group.id} className={`rounded-xl border transition ${isSelected ? 'border-[#0866B1] bg-blue-50/10' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                      <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(group.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                          />
                          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500">
                            <ClipboardList size={20} />
                          </div>
                          <div>
                            {editingSeriesId === group.seriesId && group.seriesId ? (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingLabel}
                                  autoFocus
                                  onChange={(e) => setEditingLabel(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRenameSeries();
                                    if (e.key === 'Escape') { setEditingSeriesId(null); setEditingLabel(''); }
                                  }}
                                  className="rounded-lg border border-[#0866B1] bg-white dark:bg-slate-950 px-2 py-1 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={commitRenameSeries}
                                  className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                                  aria-label="Save period name"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            ) : (
                              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                {group.label}
                                {group.seriesId && onRenameArchiveSeries && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); startRenameSeries(group.seriesId!, group.label); }}
                                    className="text-slate-300 hover:text-[#0866B1] dark:text-slate-600 dark:hover:text-blue-400 cursor-pointer"
                                    aria-label="Rename period"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}
                              </h4>
                            )}
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                              {group.surveyTypes.map((t) => (
                                <span key={t} className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  {t}
                                </span>
                              ))}
                              <span>•</span>
                              <Calendar size={12} />
                              <span>{group.seriesId ? 'Period created' : 'Archived'}: {new Date(group.sortKey).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-lg font-black text-slate-900 dark:text-white">{group.responsesCount}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Responses</div>
                          </div>
                          <button
                            onClick={() => toggleExpand(group.id)}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            {isExpanded ? 'Hide Logs' : 'View Logs'}
                          </button>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950/50 space-y-4">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">Actual Logs & Scores</h5>
                          <div className="space-y-3">
                            {/* Group logs by responseId internally for display */}
                            {Array.from(new Set(group.responses.map(r => r.responseId))).map(respId => {
                              const answers = group.responses.filter(r => r.responseId === respId);
                              const first = answers[0];
                              return (
                                <div key={respId} className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 shadow-sm text-xs space-y-2">
                                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                      <Building2 size={14} className="text-[#0866B1]" />
                                      {first.company}
                                    </div>
                                    <div className="text-slate-500 flex items-center gap-1">
                                      <UserCheck size={12} /> {first.respondentType}
                                    </div>
                                  </div>
                                  <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {answers.map(ans => (
                                      <div key={ans.questionId} className="py-1.5 flex justify-between gap-4">
                                        <span className="text-slate-600 dark:text-slate-400 truncate max-w-sm">Q{ans.questionNumber}. {ans.question}</span>
                                        <div className="text-right shrink-0">
                                          <span className="font-bold text-[#0866B1]">{ans.rating}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Overlays */}
      {confirmSurvey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="confirm-restore-survey-modal">
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-md w-full border border-slate-100 dark:border-slate-800/80 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-[#0866B1] dark:text-blue-400 rounded-xl shrink-0">
                <RefreshCw size={24} className="animate-spin-slow" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Restore Survey Form?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Are you sure you want to restore the survey form <strong>"{confirmSurvey.title}"</strong> back to Active/Running status? Respondents will immediately be able to see and submit evaluations for this form.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmSurvey(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition"
                id="btn-cancel-restore-survey"
              >
                Cancel
              </button>
              <button
                onClick={executeRestoreSurvey}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[#0866B1] hover:bg-[#07528E] text-white cursor-pointer transition"
                id="btn-confirm-restore-survey"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPartnerCompany && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="confirm-restore-partner-company-modal">
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-md w-full border border-slate-100 dark:border-slate-800/80 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-[#0866B1] dark:text-blue-400 rounded-xl shrink-0">
                <Building2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Restore Company?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Are you sure you want to restore <strong>"{confirmPartnerCompany.name}"</strong> to the active Partners registry?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmPartnerCompany(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition"
                id="btn-cancel-restore-partner-company"
              >
                Cancel
              </button>
              <button
                onClick={executeRestorePartnerCompany}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[#0866B1] hover:bg-[#07528E] text-white cursor-pointer transition"
                id="btn-confirm-restore-partner-company"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmResponseGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="confirm-restore-response-modal">
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-md w-full border border-slate-100 dark:border-slate-800/80 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                <RefreshCw size={24} className="animate-spin-slow" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Restore Submissions?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Are you sure you want to restore this evaluation submission for <strong>"{confirmResponseGroup.company}"</strong> back into the active database? This will immediately merge these scores back into your live charts and dashboards.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmResponseGroup(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition"
                id="btn-cancel-restore-responses"
              >
                Cancel
              </button>
              <button
                onClick={executeRestoreResponseGroup}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition"
                id="btn-confirm-restore-responses"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteState.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="confirm-bulk-delete-modal">
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-md w-full border border-rose-100 dark:border-rose-900/30 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                <Trash2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Permanently Delete?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Are you sure you want to permanently delete {selectedGroups.size} archived logs? This action cannot be undone.
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 pt-1">
                  Tip: use "Export Selected" first if you want an Excel backup you can re-import later.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteState({ isOpen: false })}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative">
            <button
              onClick={() => setImportResult(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              type="button"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-emerald-600">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Archive Import Complete</h3>
                <p className="text-xs text-slate-500">{importResult.stats.totalRows} rows processed</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium block">Imported</span>
                <strong className="text-emerald-800 dark:text-emerald-300 text-lg">{importResult.stats.imported}</strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">Duplicates skipped</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importResult.stats.skippedDuplicate}</strong>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900">
                <span className="text-rose-600 font-medium block">Invalid rows</span>
                <strong className="text-rose-700 dark:text-rose-300 text-lg">{importResult.stats.skippedInvalid}</strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Imported rows are always restored as archived data. Download the full log to see exactly which rows were imported, skipped as duplicates, or rejected as invalid.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button
                onClick={downloadImportLog}
                className="secondary-button text-xs py-2 px-4 flex items-center gap-1.5"
                type="button"
              >
                <FileText size={14} />
                <span>Download Import Log</span>
              </button>
              <button
                onClick={() => setImportResult(null)}
                className="bg-[#0866B1] hover:bg-[#07528E] text-white text-xs font-bold py-2 px-4 rounded-lg transition cursor-pointer"
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
