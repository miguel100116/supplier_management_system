import React from 'react';
import { Building, ChevronRight, Plus } from 'lucide-react';
import type { PartnerCompanyType } from '../../../types/survey';

export type PartnerCategoryTab = PartnerCompanyType | 'All';

interface PartnerRegistryOverviewProps {
  children?: React.ReactNode;
  directoryControls?: React.ReactNode;
  category: PartnerCategoryTab;
  onCategoryChange: (category: PartnerCategoryTab) => void;
  isAdmin?: boolean;
  onOpenActiveCompanies: () => void;
  onOpenRegister: () => void;
}

const CATEGORY_OPTIONS: Array<{ value: PartnerCategoryTab; label: string }> = [
  { value: 'All', label: 'All Categories' },
  { value: 'Courier', label: 'Courier' },
  { value: 'Supplier', label: 'Supplier' },
  { value: 'Subcontractor', label: 'Subcontractor' },
  { value: 'Uncategorized', label: 'Uncategorized' },
];

export function PartnerRegistryOverview({
  children,
  directoryControls,
  category,
  onCategoryChange,
  isAdmin,
  onOpenActiveCompanies,
  onOpenRegister,
}: PartnerRegistryOverviewProps) {
  const handleCategoryKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const currentIndex = CATEGORY_OPTIONS.findIndex((option) => option.value === category);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % CATEGORY_OPTIONS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + CATEGORY_OPTIONS.length) % CATEGORY_OPTIONS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = CATEGORY_OPTIONS.length - 1;
    else return;

    event.preventDefault();
    const nextCategory = CATEGORY_OPTIONS[nextIndex].value;
    onCategoryChange(nextCategory);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-category="${nextCategory}"]`)?.focus();
  };

  return (
    <>
      <div className="admin-directory-header flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[23px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Partner directory</h1>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">Find a partner, review its record, and follow up on compliance.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2 md:shrink-0">
            <button type="button" onClick={onOpenActiveCompanies} className="secondary-button min-h-9 justify-center gap-2 px-3 text-xs font-semibold">
              <Building size={14} aria-hidden="true" /> Active Companies by Type <ChevronRight size={14} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenRegister} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#2187CD] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition duration-150 hover:bg-[#176FAE]">
              <Plus size={15} aria-hidden="true" /> Register New Partner
            </button>
          </div>
        )}
      </div>

      {children}

      <div className="admin-directory-filter-group">
        <nav className="admin-directory-category-strip" aria-label="Partner categories" role="tablist" onKeyDown={handleCategoryKeyDown}>
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              data-category={option.value}
              aria-selected={category === option.value}
              tabIndex={category === option.value ? 0 : -1}
              onClick={() => onCategoryChange(option.value)}
              className="admin-directory-category-strip-tab"
            >
              {option.label}
            </button>
          ))}
        </nav>
        {directoryControls}
      </div>
    </>
  );
}
