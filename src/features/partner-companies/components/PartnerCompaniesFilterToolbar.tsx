import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Building2, CalendarDays, Check, FileCheck2, Search, X } from 'lucide-react';
import type { SupplierOrigin } from '../../../types/survey';
import type { TableSortOption } from '../../../components/TableFilterBar';
import type { PartnerCategoryTab } from './PartnerRegistryOverview';

export type PartnerDocumentFilter = 'all' | 'current' | 'expiring' | 'expired' | 'missing';

interface PartnerCompaniesFilterToolbarProps {
  categoryTab: PartnerCategoryTab; onCategoryChange: (value: PartnerCategoryTab) => void;
  originFilter: 'All' | SupplierOrigin; onOriginChange: (value: 'All' | SupplierOrigin) => void;
  searchQuery: string; onSearchChange: (value: string) => void; onSearchClear: () => void;
  sortOptions: TableSortOption<string>[]; sortValue: string; onSortChange: (value: string) => void;
  registeredFrom: string; registeredTo: string; onRegisteredFromChange: (value: string) => void; onRegisteredToChange: (value: string) => void;
  documentFilter: PartnerDocumentFilter; onDocumentFilterChange: (value: PartnerDocumentFilter) => void; onReset: () => void;
}

type OpenPopover = 'documents' | 'origin' | 'dates' | 'sort' | null;
const DOCUMENT_LABELS: Record<PartnerDocumentFilter, string> = {
  all: 'All document states', current: 'Current', expiring: 'Expiring soon', expired: 'Expired / for update', missing: 'Missing required docs',
};

export function PartnerCompaniesFilterToolbar(props: PartnerCompaniesFilterToolbarProps) {
  const { categoryTab, onCategoryChange, originFilter, onOriginChange, searchQuery, onSearchChange, onSearchClear,
    sortOptions, sortValue, onSortChange, registeredFrom, registeredTo, onRegisteredFromChange, onRegisteredToChange,
    documentFilter, onDocumentFilterChange, onReset } = props;
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<Exclude<OpenPopover, null>, HTMLButtonElement>>>({});
  const hasAnyFilters = Boolean(searchQuery.trim() || categoryTab !== 'All' || documentFilter !== 'all' || originFilter !== 'All' || registeredFrom || registeredTo || sortValue !== 'default');
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (searchQuery.trim()) chips.push({ key: 'search', label: `Search: ${searchQuery.trim()}`, remove: onSearchClear });
  if (categoryTab !== 'All') chips.push({ key: 'category', label: `Category: ${categoryTab}`, remove: () => onCategoryChange('All') });
  if (categoryTab === 'Supplier' && originFilter !== 'All') chips.push({ key: 'origin', label: `Origin: ${originFilter}`, remove: () => onOriginChange('All') });
  if (documentFilter !== 'all') chips.push({ key: 'documents', label: `Documents: ${DOCUMENT_LABELS[documentFilter]}`, remove: () => onDocumentFilterChange('all') });
  if (registeredFrom) chips.push({ key: 'from', label: `Registered from: ${registeredFrom}`, remove: () => onRegisteredFromChange('') });
  if (registeredTo) chips.push({ key: 'to', label: `Registered to: ${registeredTo}`, remove: () => onRegisteredToChange('') });
  if (sortValue !== 'default') chips.push({ key: 'sort', label: `Sort: ${sortOptions.find((option) => option.value === sortValue)?.label ?? sortValue}`, remove: () => onSortChange('default') });

  useEffect(() => {
    if (!openPopover) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpenPopover(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      triggerRefs.current[openPopover]?.focus();
      setOpenPopover(null);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [openPopover]);

  const selectOption = <T extends string,>(kind: Exclude<OpenPopover, null>, value: T, onSelect: (value: T) => void) => {
    onSelect(value);
    setOpenPopover(null);
    triggerRefs.current[kind]?.focus();
  };

  const optionList = <T extends string,>(
    kind: Exclude<OpenPopover, null>,
    label: string,
    options: Array<{ value: T; label: string }>,
    selectedValue: T,
    onSelect: (value: T) => void,
  ) => (
    <div role="group" aria-label={label} className="grid gap-1">
      {options.map((option) => {
        const selected = selectedValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2187cd] ${selected ? 'bg-[#edf7fd] text-[#145f91] dark:bg-[#172f43] dark:text-[#b8e0fa]' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
            onClick={() => selectOption(kind, option.value, onSelect)}
          >
            <span>{option.label}</span>
            {selected && <Check size={15} aria-hidden="true" className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );

  const trigger = (kind: Exclude<OpenPopover, null>, label: string, icon: React.ReactNode, active: boolean, content: React.ReactNode) => (
    <div className={`admin-directory-popover-anchor admin-directory-popover-${kind}`}>
      <button ref={(element) => { triggerRefs.current[kind] = element ?? undefined; }} type="button" className="admin-directory-icon-trigger" aria-label={label} title={label} aria-expanded={openPopover === kind} aria-haspopup="dialog" onClick={() => setOpenPopover((current) => current === kind ? null : kind)}>
        {icon}{active && <span className="admin-directory-active-dot" aria-hidden="true" />}
      </button>
      {openPopover === kind && <div className="admin-directory-compact-popover" role="dialog" aria-label={label}>{content}</div>}
    </div>
  );

  return <div ref={rootRef} className="admin-directory-toolbar">
    <div className="admin-directory-toolbar-main">
      <div className="admin-directory-search-wrap">
        <Search size={15} aria-hidden="true" className="admin-directory-search-icon" />
        <label htmlFor="partner-company-search" className="sr-only">Search partners by name or BP Code</label>
        <input id="partner-company-search" type="text" value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search company name or BP code..." className="field !mt-0 w-full py-2 pl-9 pr-9 text-xs" />
        {searchQuery && <button type="button" onClick={onSearchClear} aria-label="Clear partner search" className="admin-directory-search-clear"><X size={15} aria-hidden="true" /></button>}
      </div>
      <div className="admin-directory-toolbar-controls" aria-label="Directory controls">
        {trigger('documents', 'Filter by document status', <FileCheck2 size={16} aria-hidden="true" />, documentFilter !== 'all', <>
          {optionList('documents', 'Document status', (Object.keys(DOCUMENT_LABELS) as PartnerDocumentFilter[]).map((value) => ({ value, label: DOCUMENT_LABELS[value] })), documentFilter, onDocumentFilterChange)}
          <button type="button" className="admin-directory-popover-reset" onClick={() => onDocumentFilterChange('all')}>Reset</button>
        </>)}
        {categoryTab === 'Supplier' && trigger('origin', 'Filter by supplier origin', <Building2 size={16} aria-hidden="true" />, originFilter !== 'All', <>
          <label className="admin-directory-popover-field"><span>Supplier origin</span><select aria-label="Supplier origin" value={originFilter} onChange={(event) => onOriginChange(event.target.value as 'All' | SupplierOrigin)} className="field !mt-0 w-full"><option value="All">All origins</option><option value="Local">Local</option><option value="Foreign">Foreign</option></select></label>
          <button type="button" className="admin-directory-popover-reset" onClick={() => onOriginChange('All')}>Reset</button>
        </>)}
        {trigger('dates', 'Filter by registration date', <CalendarDays size={16} aria-hidden="true" />, Boolean(registeredFrom || registeredTo), <><fieldset className="admin-directory-date-popover"><legend>Registration date</legend><label className="admin-directory-popover-field"><span>From</span><input type="date" value={registeredFrom} max={registeredTo || undefined} onChange={(event) => onRegisteredFromChange(event.target.value)} className="field !mt-0 w-full" /></label><label className="admin-directory-popover-field"><span>To</span><input type="date" value={registeredTo} min={registeredFrom || undefined} onChange={(event) => onRegisteredToChange(event.target.value)} className="field !mt-0 w-full" /></label></fieldset><button type="button" className="admin-directory-popover-reset" onClick={() => { onRegisteredFromChange(''); onRegisteredToChange(''); }}>Reset</button></>)}
        {trigger('sort', 'Sort partners', <ArrowDownUp size={16} aria-hidden="true" />, sortValue !== 'default', <>
          {optionList('sort', 'Sort partners by', sortOptions, sortValue, onSortChange)}
          <button type="button" className="admin-directory-popover-reset" onClick={() => onSortChange('default')}>Reset</button>
        </>)}
      </div>
    </div>
    {hasAnyFilters && <div className="admin-directory-active-filters" aria-label="Active filters">
      {chips.map((chip) => <button key={chip.key} type="button" onClick={chip.remove} aria-label={`Remove ${chip.label} filter`} className="admin-directory-filter-chip">{chip.label}<X size={12} aria-hidden="true" /></button>)}
      <button type="button" onClick={onReset} className="admin-directory-reset-button ml-auto">Reset</button>
    </div>}
  </div>;
}
