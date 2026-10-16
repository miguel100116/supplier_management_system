import React, { type ChangeEvent, type RefObject } from 'react';
import { ArrowUpDown, Building, CalendarRange, ChevronDown, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
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
  isAdmin?: boolean;
  importFileInputRef: RefObject<HTMLInputElement>;
  onImportFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenActiveCompanies: () => void;
  onOpenRegister: () => void;
  isAdvancedFiltersOpen: boolean;
  onToggleAdvancedFilters: () => void;
  advancedFilterCount: number;
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
  isAdmin,
  importFileInputRef,
  onImportFileSelected,
  onOpenActiveCompanies,
  onOpenRegister,
  isAdvancedFiltersOpen,
  onToggleAdvancedFilters,
  advancedFilterCount,
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="relative w-full min-w-0 sm:min-w-[250px] sm:flex-[2]">
          <label htmlFor="partner-company-search" className="sr-only">Search partners by name or BP Code</label>
          <input
            id="partner-company-search"
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name or BP Code..."
            className="field !mt-0 w-full py-2 pl-3 pr-9 text-xs"
          />
          {searchQuery && (
            <button type="button" onClick={onSearchClear} aria-label="Clear partner search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        <select value={statusTab} onChange={(event) => onStatusChange(event.target.value as PartnerStatusTab)} className="field !mt-0 !w-auto min-w-[135px] flex-1 py-2 text-xs sm:flex-none" aria-label="Filter partners by status">
          {(Object.keys(statusLabels) as PartnerStatusTab[]).map((value) => (
            <option key={value} value={value}>Status: {statusLabels[value]}</option>
          ))}
        </select>

        <select value={categoryTab} onChange={(event) => onCategoryChange(event.target.value as PartnerCategoryTab)} className="field !mt-0 !w-auto min-w-[145px] flex-1 py-2 text-xs sm:flex-none" aria-label="Filter partners by category">
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {categoryTab === 'Supplier' && (
          <select value={originFilter} onChange={(event) => onOriginChange(event.target.value as 'All' | SupplierOrigin)} className="field !mt-0 !w-auto min-w-[125px] flex-1 py-2 text-xs sm:flex-none" aria-label="Filter suppliers by origin">
            <option value="All">All origins</option>
            <option value="Local">Local</option>
            <option value="Foreign">Foreign</option>
          </select>
        )}

        <button type="button" onClick={onToggleAdvancedFilters} className={'secondary-button min-h-10 justify-center gap-1.5 px-3 text-xs font-bold ' + (isAdvancedFiltersOpen ? 'ring-2 ring-[#0866B1]/20' : '')} aria-expanded={isAdvancedFiltersOpen} aria-controls="partner-company-advanced-filters">
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters
          {advancedFilterCount > 0 && <span className="rounded-full bg-[#0866B1] px-1.5 py-0.5 text-[10px] leading-none text-white" aria-label={advancedFilterCount + ' active filters'}>{advancedFilterCount}</span>}
          <ChevronDown size={14} className={'transition-transform ' + (isAdvancedFiltersOpen ? 'rotate-180' : '')} aria-hidden="true" />
        </button>

        {isAdmin && (
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <input ref={importFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImportFileSelected} />
            <button type="button" onClick={onOpenActiveCompanies} className="secondary-button min-h-10 flex-1 gap-1.5 px-3 text-xs font-bold sm:flex-none" title="View active companies by type">
              <Building size={14} aria-hidden="true" /> Active by Type
            </button>
            <button type="button" onClick={onOpenRegister} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0866B1] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition duration-150 hover:bg-[#07528E] sm:flex-none">
              <Plus size={15} aria-hidden="true" /> <span>Register New Partner</span>
            </button>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1" aria-label="Active partner filters">
          {chips.map((chip) => (
            <button key={chip.key} type="button" onClick={chip.onRemove} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={'Remove ' + chip.label + ' filter'}>
              <span className="truncate">{chip.label}</span><X size={12} className="shrink-0" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={onReset} className="text-xs font-semibold text-[#0866B1] underline dark:text-blue-400">Clear all</button>
        </div>
      )}

      {isAdvancedFiltersOpen && (
        <div id="partner-company-advanced-filters" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="min-w-0 flex-1 sm:min-w-[190px] sm:flex-none">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><ArrowUpDown size={12} aria-hidden="true" /> Sort</span>
            <select value={sortValue} onChange={(event) => onSortChange(event.target.value)} className="field !mt-0 w-full py-2 text-xs sm:min-w-[190px]" aria-label="Sort partner registry">
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <fieldset className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:flex-none">
            <legend className="mb-1 flex w-full items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><CalendarRange size={12} aria-hidden="true" /> Registration date</legend>
            <label className="min-w-[135px] flex-1 sm:flex-none"><span className="sr-only">Registration date from</span><input type="date" value={registeredFrom} max={registeredTo || undefined} onChange={(event) => onRegisteredFromChange(event.target.value)} className="field !mt-0 w-full py-2 text-xs" aria-label="Registration date from" /></label>
            <span className="self-center pb-2 text-xs text-slate-400">to</span>
            <label className="min-w-[135px] flex-1 sm:flex-none"><span className="sr-only">Registration date to</span><input type="date" value={registeredTo} min={registeredFrom || undefined} onChange={(event) => onRegisteredToChange(event.target.value)} className="field !mt-0 w-full py-2 text-xs" aria-label="Registration date to" /></label>
          </fieldset>
          <label className="min-w-0 flex-1 sm:min-w-[190px] sm:flex-none">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Document expiration</span>
            <select value={documentFilter} onChange={(event) => onDocumentFilterChange(event.target.value as PartnerDocumentFilter)} className="field !mt-0 w-full py-2 text-xs sm:min-w-[190px]" aria-label="Filter by document expiration">
              {(Object.keys(DOCUMENT_LABELS) as PartnerDocumentFilter[]).map((value) => <option key={value} value={value}>{DOCUMENT_LABELS[value]}</option>)}
            </select>
          </label>
          {chips.length > 0 && (
            <button type="button" onClick={onReset} className="secondary-button gap-1.5 px-2.5 py-2 text-xs sm:ml-auto" title="Reset all partner filters"><RotateCcw size={13} aria-hidden="true" /> Reset</button>
          )}
        </div>
      )}
    </div>
  );
}
