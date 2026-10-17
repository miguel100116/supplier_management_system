import { useEffect, useMemo, useState } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { AlertTriangle, Building2, ChevronDown, Eraser, GripVertical, History, Search, Trophy, X } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../types/survey';
import { getRankingLog, logRankingChange, RankingLogEntry, RankingSnapshotSlot } from '../utils/supplierRankingLog';
import { TableFilterBar } from '../components/TableFilterBar';
import { PageDescription } from '../components/PageDescription';
import { compareDate, compareText, isWithinDateRange } from '../utils/tableFilters';

interface SupplierRankingPageProps {
  partnerCompanies: PartnerCompany[];
  onUpdateCompaniesBulk: (companies: PartnerCompany[]) => void;
  surveys: CustomForm[];
  responses: SurveyResponse[];
  currentUserEmail: string;
}

const SLOT_COUNT = 20;

function isRanked(c: PartnerCompany): boolean {
  return typeof c.evaluationRank === 'number' && c.evaluationRank >= 1 && c.evaluationRank <= SLOT_COUNT;
}

function arraysEqual(a: (string | undefined)[], b: (string | undefined)[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Admin-curated stand-in for the client's not-yet-implemented "GRPO" ranking
// system - see getSurveyEvaluationCompanies in analytics.ts, which treats
// exactly these 20 slots as the default Supplier evaluation pool.
//
// Edits (dropdown picks, drag reorder, Reset) only touch local draft state -
// nothing is written to the Partner Registry until Save Changes, so this is
// a deliberate action rather than live-editing survey eligibility on every
// click. Cancel discards the draft back to whatever's currently saved.
//
//  - A slot's dropdown only ever offers companies unranked *in the current
//    draft* (plus whichever company already occupies that slot) - picking
//    one moves it in, displacing the slot's prior occupant back to unranked.
//  - Dragging a row to a new position SHIFTS the draft list, like reordering
//    an ordinary list - everything between the old and new position slides
//    over by one.
export function SupplierRankingPage({ partnerCompanies, onUpdateCompaniesBulk, surveys, responses, currentUserEmail }: SupplierRankingPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [logEntries, setLogEntries] = useState<RankingLogEntry[]>(() => getRankingLog());
  const [viewingEntry, setViewingEntry] = useState<RankingLogEntry | null>(null);
  const [showOngoingWarning, setShowOngoingWarning] = useState(false);
  const [logSort, setLogSort] = useState<'date-desc' | 'date-asc' | 'actor-asc' | 'actor-desc'>('date-desc');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  useModalEscape(showOngoingWarning, () => setShowOngoingWarning(false), 60);
  useModalEscape(Boolean(viewingEntry), () => setViewingEntry(null), 55);

  useEffect(() => {
    const refresh = () => setLogEntries(getRankingLog());
    window.addEventListener('supplier-ranking-history-updated', refresh);
    return () => window.removeEventListener('supplier-ranking-history-updated', refresh);
  }, []);

  const suppliers = useMemo(
    () => partnerCompanies.filter((c) => c.type === 'Supplier' && !c.isArchived).sort((a, b) => a.name.localeCompare(b.name)),
    [partnerCompanies]
  );

  // What's actually saved on the Partner Registry right now.
  const savedSlotIds = useMemo<(string | undefined)[]>(() => {
    const arr: (string | undefined)[] = new Array(SLOT_COUNT).fill(undefined);
    suppliers.forEach((c) => {
      if (isRanked(c)) arr[c.evaluationRank! - 1] = c.id;
    });
    return arr;
  }, [suppliers]);

  // The in-progress draft the admin is editing. Seeded once from whatever's
  // saved; after a successful Save, savedSlotIds catches up to match this
  // (via the updated partnerCompanies prop), which naturally clears isDirty
  // without needing to touch draftSlotIds directly.
  const [draftSlotIds, setDraftSlotIds] = useState<(string | undefined)[]>(() => savedSlotIds);

  const isDirty = !arraysEqual(draftSlotIds, savedSlotIds);

  const draftSlots = useMemo(
    () => draftSlotIds.map((id) => (id ? suppliers.find((c) => c.id === id) : undefined)),
    [draftSlotIds, suppliers]
  );

  const draftRankedIds = useMemo(() => new Set(draftSlotIds.filter((id): id is string => !!id)), [draftSlotIds]);
  const unrankedInDraft = useMemo(() => suppliers.filter((c) => !draftRankedIds.has(c.id)), [suppliers, draftRankedIds]);

  const filteredUnranked = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return unrankedInDraft;
    return unrankedInDraft.filter((c) => c.name.toLowerCase().includes(q));
  }, [unrankedInDraft, searchQuery]);

  const filledCount = draftSlotIds.filter(Boolean).length;

  const filteredLogEntries = useMemo(() => logEntries
    .filter((entry) => isWithinDateRange(entry.timestamp, logDateFrom, logDateTo))
    .sort((a, b) => {
      if (logSort === 'date-asc') return compareDate(a.timestamp, b.timestamp);
      if (logSort === 'actor-asc') return compareText(a.actorEmail, b.actorEmail);
      if (logSort === 'actor-desc') return compareText(b.actorEmail, a.actorEmail);
      return compareDate(b.timestamp, a.timestamp);
    }), [logEntries, logSort, logDateFrom, logDateTo]);

  // "Ongoing" = a Supplier survey is currently published/open - status
  // 'Running', or unset (matches SurveyFormsPage's own "ACTIVE" badge rule:
  // a missing status defaults to Running, not Paused/Completed/Archived) -
  // AND at least one not-yet-archived Supplier response already exists,
  // i.e. respondents are actively answering under the current Top 20, so
  // changing it now would shift who's eligible mid-collection.
  const hasOngoingSupplierSurvey = useMemo(
    () =>
      surveys.some((s) => s.surveyType === 'Supplier' && (!s.status || s.status === 'Running')) &&
      responses.some((r) => r.surveyType === 'Supplier' && !r.archived),
    [surveys, responses]
  );

  function optionsForSlot(company: PartnerCompany | undefined): PartnerCompany[] {
    if (!company) return unrankedInDraft;
    return [...unrankedInDraft, company].sort((a, b) => a.name.localeCompare(b.name));
  }

  function handleSelectForSlot(slotIndex: number, companyId: string) {
    setDraftSlotIds((current) => {
      const next = [...current];
      next[slotIndex] = companyId || undefined;
      return next;
    });
  }

  function handleDrop(targetIndex: number) {
    const sourceIndex = draggingIndex;
    setDraggingIndex(null);
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    setDraftSlotIds((current) => {
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function handleResetRankings() {
    setDraftSlotIds(new Array(SLOT_COUNT).fill(undefined));
  }

  function handleCancel() {
    setDraftSlotIds(savedSlotIds);
  }

  function performSave() {
    const changed: PartnerCompany[] = [];
    const nextIds = new Set(draftSlotIds.filter((id): id is string => !!id));

    draftSlotIds.forEach((id, idx) => {
      if (!id) return;
      const company = suppliers.find((c) => c.id === id);
      if (company && company.evaluationRank !== idx + 1) {
        changed.push({ ...company, evaluationRank: idx + 1 });
      }
    });
    suppliers.forEach((company) => {
      if (isRanked(company) && !nextIds.has(company.id)) {
        changed.push({ ...company, evaluationRank: undefined });
      }
    });

    if (changed.length > 0) {
      onUpdateCompaniesBulk(changed);
    }

    const snapshot: RankingSnapshotSlot[] = draftSlotIds.map((id, idx) => {
      const company = id ? suppliers.find((c) => c.id === id) : undefined;
      return { rank: idx + 1, companyId: company?.id, companyName: company?.name };
    });
    const entry = logRankingChange(currentUserEmail, snapshot, changed.length);
    setLogEntries((current) => [entry, ...current].slice(0, 100));
  }

  function handleSaveChanges() {
    if (!isDirty) return;
    if (hasOngoingSupplierSurvey) {
      setShowOngoingWarning(true);
      return;
    }
    performSave();
  }

  return (
    <div className="space-y-5">
      <PageDescription>Set the top 20 evaluable suppliers and their ranks. Suppliers outside the top 20 are excluded from evaluation.</PageDescription>
      <div className="panel px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Trophy size={16} className="text-[#0866B1]" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Top 20 Evaluable Suppliers
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="badge">{filledCount} / {SLOT_COUNT} filled</span>
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={handleResetRankings}
            disabled={filledCount === 0}
            className="secondary-button text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Eraser size={14} /> Reset Rankings
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!isDirty}
            className="secondary-button text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={!isDirty}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0866B1] px-5 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-[#07528E] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300 dark:disabled:bg-slate-700"
          >
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
                  <th className="w-10 px-3 py-3" />
                  <th className="w-14 px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Partner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {draftSlots.map((company, i) => (
                  <tr
                    key={i}
                    draggable
                    onDragStart={() => setDraggingIndex(i)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIndex !== i) setDragOverIndex(i);
                    }}
                    onDragLeave={() => setDragOverIndex((current) => (current === i ? null : current))}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(i);
                    }}
                    onDragEnd={() => {
                      setDraggingIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`transition-colors ${draggingIndex === i ? 'opacity-40' : ''} ${
                      dragOverIndex === i && draggingIndex !== i
                        ? 'bg-blue-50 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                    }`}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <GripVertical
                        size={15}
                        className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-700 dark:hover:text-slate-400"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          company ? 'bg-[#0866B1] text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="relative inline-flex w-full max-w-sm items-center">
                        <Building2 size={14} className="pointer-events-none absolute left-2.5 text-slate-400" />
                        <select
                          value={company?.id ?? ''}
                          onChange={(e) => handleSelectForSlot(i, e.target.value)}
                          className="field appearance-none py-2 !pl-8 !pr-7 text-xs font-semibold cursor-pointer"
                        >
                          <option value="">— Blank —</option>
                          {optionsForSlot(company).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2.5 opacity-60" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Not in Top 20</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {unrankedInDraft.length} supplier{unrankedInDraft.length === 1 ? '' : 's'} currently excluded from evaluation
            </p>
          </div>
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search suppliers..."
              className="field text-xs py-2 !pl-9"
            />
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {filteredUnranked.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {unrankedInDraft.length === 0 ? 'Every supplier is currently ranked.' : 'No match.'}
              </p>
            ) : (
              filteredUnranked.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border border-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300"
                >
                  <Building2 size={13} className="shrink-0 text-slate-400" />
                  <span className="truncate">{c.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel space-y-3">
        <div className="flex items-center gap-2.5">
          <History size={16} className="text-[#0866B1]" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Modification Log</span>
        </div>
        <TableFilterBar
          sortOptions={[
            { value: 'date-desc', label: 'Date: newest first' },
            { value: 'date-asc', label: 'Date: oldest first' },
            { value: 'actor-asc', label: 'Changed by: A–Z' },
            { value: 'actor-desc', label: 'Changed by: Z–A' },
          ]}
          sortValue={logSort}
          onSortChange={setLogSort}
          resultCount={filteredLogEntries.length}
          dateFrom={logDateFrom}
          dateTo={logDateTo}
          onDateFromChange={setLogDateFrom}
          onDateToChange={setLogDateTo}
          dateLabel="Change date"
          onReset={() => {
            setLogSort('date-desc');
            setLogDateFrom('');
            setLogDateTo('');
          }}
        />
        {logEntries.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No changes have been saved yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
                  <th className="px-3 py-2.5">Date &amp; Time</th>
                  <th className="px-3 py-2.5">Changed By</th>
                  <th className="px-3 py-2.5">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setViewingEntry(entry)}
                        className="text-xs font-semibold text-[#0866B1] hover:underline dark:text-blue-400"
                      >
                        {new Date(entry.timestamp).toLocaleString()}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{entry.actorEmail}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {entry.changedCount} rank{entry.changedCount === 1 ? '' : 's'} changed
                    </td>
                  </tr>
                ))}
                {filteredLogEntries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-xs text-slate-400">No ranking changes match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingEntry && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={() => setViewingEntry(null)} />
          <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Ranking Snapshot</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(viewingEntry.timestamp).toLocaleString()} &middot; {viewingEntry.actorEmail}
                </p>
              </div>
              <button type="button" onClick={() => setViewingEntry(null)} className="icon-button">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto p-5">
              {viewingEntry.snapshot.map((slot) => (
                <div key={slot.rank} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      slot.companyName ? 'bg-[#0866B1] text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}
                  >
                    {slot.rank}
                  </span>
                  <span className={slot.companyName ? 'font-medium text-slate-700 dark:text-slate-200' : 'italic text-slate-300 dark:text-slate-600'}>
                    {slot.companyName || 'Blank'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showOngoingWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={() => setShowOngoingWarning(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Supplier Evaluation Still Ongoing</h3>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  The Top 20 ranking can't be changed while a Supplier evaluation is active and already has submissions
                  on file - it would shift who's eligible mid-collection. To save these changes, first stop the
                  ongoing Supplier evaluation and reset its form, then come back and try again.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setShowOngoingWarning(false)} className="secondary-button text-sm">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
