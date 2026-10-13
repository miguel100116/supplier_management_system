import React from 'react';
import { ArrowUpDown, CalendarRange, RotateCcw, Search, X } from 'lucide-react';
import type { PartnerCompanyType, SupplierOrigin } from '../../../types/survey';
import type { TableSortOption } from '../../../components/TableFilterBar';

export type PartnerStatusTab = 'Active' | 'Expired' | 'Incomplete' | 'Archived';
export type PartnerCategoryTab = PartnerCompanyType | 'All';
export type PartnerDocumentFilter = 'all' | 'current' | 'expiring' | 'expired' | 'missing';

interface PartnerCompaniesFilterToolbarProps {
  statusTab: PartnerStatusTab;
  statusLabels: Record<PartnerStatusTab, string>;
  onStatusChange: (value: PartnerStatusTab) => void;
  categoryTab: PartnerCategoryTab;
  onCategoryChange: (value: PartnerCategoryTab) => void;
  originFilter: 'All' | SupplierOrigin;
  onOriginChange: (value: 'All' | SupplierOrigin) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  resultCount: number;
  sortOptions: TableSortOption<string>[];
  sortValue: string;
  onSortChange: (value: string) => void;
  registeredFrom: string;
  registeredTo: string;
  onRegisteredFromChange: (value: string) => void;
  onRegisteredToChange: (value: string) => void;
  documentFilter: PartnerDocumentFilter;
  onDocumentFilterChange: (value: PartnerDocumentFilter) => void;
  onReset: () => void;
}

const CATEGORY_OPTIONS: Array<{ value: PartnerCategoryTab; label: string }> = [
  { value: 'All', label: 'All categories' },
  { value: 'Courier', label: 'Couriers' },
  { value: 'Supplier', label: 'Suppliers' },
  { value: 'Subcontractor', label: 'Subcontractors' },
  { value: 'Uncategorized', label: 'Uncategorized' },
];

const DOCUMENT_LABELS: Record<PartnerDocumentFilter, string> = {
  all: 'All document states',
  current: 'Current',
  expiring: 'Expiring soon',
  expired: 'Expired / for update',
  missing: 'Missing required docs',
};

export function PartnerCompaniesFilterToolbar({
  statusTab,
  statusLabels,
  onStatusChange,
  categoryTab,
  onCategoryChange,
  originFilter,
  onOriginChange,
  searchQuery,
  onSearchChange,
  onSearchClear,
  resultCount,
  sortOptions,
  sortValue,
  onSortChange,
  registeredFrom,
  registeredTo,
  onRegisteredFromChange,
  onRegisteredToChange,
  documentFilter,
  onDocumentFilterChange,
  onReset,
}: PartnerCompaniesFilterToolbarProps) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (searchQuery.trim()) chips.push({ key: 'search', label: 'Search: ' + searchQuery.trim(), onRemove: onSearchClear });
  if (statusTab !== 'Active') chips.push({ key: 'status', label: 'Status: ' + statusLabels[statusTab], onRemove: () => onStatusChange('Active') });
  if (categoryTab !== 'All') chips.push({ key: 'category', label: 'Category: ' + CATEGORY_OPTIONS.find((option) => option.value === categoryTab)?.label, onRemove: () => onCategoryChange('All') });
  if (categoryTab === 'Supplier' && originFilter !== 'All') chips.push({ key: 'origin', label: 'Origin: ' + originFilter, onRemove: () => onOriginChange('All') });
  if (sortValue !== 'default') chips.push({ key: 'sort', label: 'Sort: ' + (sortOptions.find((option) => option.value === sortValue)?.label ?? sortValue), onRemove: () => onSortChange('default') });
  if (registeredFrom) chips.push({ key: 'from', label: 'Registered from: ' + registeredFrom, onRemove: () => onRegisteredFromChange('') });
  if (registeredTo) chips.push({ key: 'to', label: 'Registered to: ' + registeredTo, onRemove: () => onRegisteredToChange('') });
  if (documentFilter !== 'all') chips.push({ key: 'document', label: 'Documents: ' + DOCUMENT_LABELS[documentFilter], onRemove: () => onDocumentFilterChange('all') });

  return (
    <div className="@container space-y-2">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 @min-[600px]:p-4 @min-[900px]:space-y-4">
        <div className="flex min-w-0 flex-col gap-3 @min-[1100px]:flex-row @min-[1100px]:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="partner-company-search" className="sr-only">Search partners by name or BP Code</label>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="partner-company-search"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="       Search company name or BP code..."
              className="field !mt-0 w-full py-2 pl-9 pr-9 text-xs"
            />
            {searchQuery && <button type="button" onClick={onSearchClear} aria-label="Clear partner search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><X size={15} aria-hidden="true" /></button>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-1.5 dark:bg-slate-900" role="group" aria-label="Filter by partner category">
            {CATEGORY_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onCategoryChange(option.value)} aria-pressed={categoryTab === option.value} className={`min-h-8 shrink-0 whitespace-nowrap rounded-md px-2.5 text-[10px] font-semibold transition sm:px-3 ${categoryTab === option.value ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>{option.label}</button>)}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 border-t border-slate-100 pt-4 dark:border-slate-800 @min-[640px]:grid-cols-2 @min-[900px]:grid-cols-[minmax(170px,0.85fr)_minmax(260px,1.2fr)_minmax(200px,0.95fr)] @min-[900px]:items-end">
          <label className="min-w-0">
            <span className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400"><ArrowUpDown size={11} aria-hidden="true" /> Sort</span>
            <select value={sortValue} onChange={(event) => onSortChange(event.target.value)} className="field !mt-0 w-full py-2 text-xs" aria-label="Sort partner registry">
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <fieldset className="min-w-0">
            <legend className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400"><CalendarRange size={11} aria-hidden="true" /> Date range</legend>
            <div className="flex min-w-0 items-center gap-2">
              <input type="date" value={registeredFrom} max={registeredTo || undefined} onChange={(event) => onRegisteredFromChange(event.target.value)} className="field !mt-0 min-w-0 flex-1 py-2 text-[11px]" aria-label="Registration date from" />
              <span className="text-[10px] text-slate-400">to</span>
              <input type="date" value={registeredTo} min={registeredFrom || undefined} onChange={(event) => onRegisteredToChange(event.target.value)} className="field !mt-0 min-w-0 flex-1 py-2 text-[11px]" aria-label="Registration date to" />
            </div>
          </fieldset>

          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">Expiration</span>
            <select value={documentFilter} onChange={(event) => onDocumentFilterChange(event.target.value as PartnerDocumentFilter)} className="field !mt-0 w-full py-2 text-xs" aria-label="Filter by document expiration">
              {(Object.keys(DOCUMENT_LABELS) as PartnerDocumentFilter[]).map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}
            </select>
          </label>

          {categoryTab === 'Supplier' && <label className="min-w-0"><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">Supplier origin</span><select value={originFilter} onChange={(event) => onOriginChange(event.target.value as 'All' | SupplierOrigin)} className="field !mt-0 w-full py-2 text-xs" aria-label="Filter suppliers by origin"><option value="All">All origins</option><option value="Local">Local</option><option value="Foreign">Foreign</option></select></label>}

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 @min-[640px]:col-span-2 @min-[900px]:col-span-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{resultCount.toLocaleString()} partners found</span>
            <button type="button" onClick={onReset} className="secondary-button min-h-10 shrink-0 justify-center gap-1.5 px-3 text-xs font-semibold"><RotateCcw size={13} aria-hidden="true" /> Reset</button>
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1" aria-label="Active partner filters">
          {chips.map((chip) => <button key={chip.key} type="button" onClick={chip.onRemove} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={'Remove ' + chip.label + ' filter'}><span className="truncate">{chip.label}</span><X size={12} className="shrink-0" aria-hidden="true" /></button>)}
        </div>
      )}
    </div>
  );
}
