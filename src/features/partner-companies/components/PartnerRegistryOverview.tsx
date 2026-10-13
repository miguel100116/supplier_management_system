import React from 'react';
import { Building, Check, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { CategoryRankSummary } from '../../../utils/categorySummary';

type StatusTab = 'Active' | 'Expired' | 'Incomplete' | 'Archived';

interface PartnerRegistryOverviewProps {
  categorySummary: CategoryRankSummary;
  branchCount: number;
  activeCount: number;
  incompleteCount: number;
  expiredCount: number;
  archivedCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onStatusChange: (status: StatusTab) => void;
  status: StatusTab;
  isAdmin?: boolean;
  onOpenActiveCompanies: () => void;
  onOpenRegister: () => void;
}

const FAMILIES = ['Supplier-Local', 'Supplier-Foreign', 'Courier', 'Subcontractor'] as const;
const STATUS_LABELS: Record<StatusTab, string> = {
  Active: 'Active',
  Incomplete: 'Incomplete Profile',
  Expired: 'Expired',
  Archived: 'Archived',
};
const STATUS_ORDER: StatusTab[] = ['Active', 'Incomplete', 'Expired', 'Archived'];

export function PartnerRegistryOverview({
  categorySummary,
  branchCount,
  activeCount,
  incompleteCount,
  expiredCount,
  archivedCount,
  expanded,
  onToggleExpanded,
  onStatusChange,
  status,
  isAdmin,
  onOpenActiveCompanies,
  onOpenRegister,
}: PartnerRegistryOverviewProps) {
  const standardCount = FAMILIES.reduce((total, key) => total + (categorySummary.buckets[key] ?? 0), 0);
  const ntCount = FAMILIES.reduce((total, key) => total + (categorySummary.buckets[`${key}-NT`] ?? 0), 0);
  const rankCount = categorySummary.major + categorySummary.regular;
  const activeFamilies = FAMILIES.filter((key) => (categorySummary.buckets[key] ?? 0) + (categorySummary.buckets[`${key}-NT`] ?? 0) > 0).length;
  const statusCounts: Record<StatusTab, number> = {
    Active: activeCount,
    Incomplete: incompleteCount,
    Expired: expiredCount,
    Archived: archivedCount,
  };

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-[30px]">Administrative Partner Registry</h1>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">Manage accredited partner companies, compliance documentation, and branch accreditation company-wide.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2 xl:shrink-0">
            <button type="button" onClick={onOpenActiveCompanies} className="secondary-button min-h-10 justify-center gap-2 px-4 text-xs font-bold">
              <Building size={14} aria-hidden="true" /> Active Companies by Type <ChevronRight size={14} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenRegister} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#0063a9] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition duration-150 hover:bg-[#00528c]">
              <Plus size={15} aria-hidden="true" /> Register New Partner
            </button>
          </div>
        )}
      </div>

      <div className="@container rounded-xl border border-[color:var(--registry-border)] bg-[var(--registry-surface)] p-4 @min-[600px]:p-5 [--registry-blue:#0A5FA8] [--registry-blue-mid:#3C84BD] [--registry-blue-light:#8BB6D8] [--registry-neutral:#CBD5E1] [--registry-track:#F1F5F9] [--registry-border:#CBD5E1] [--registry-surface:#FFFFFF] [--registry-muted:#475569] [--registry-text:#0F172A] dark:[--registry-blue:#0A5FA8] dark:[--registry-blue-mid:#2D6F9F] dark:[--registry-blue-light:#1D4F73] dark:[--registry-neutral:#475569] dark:[--registry-track:#1E293B] dark:[--registry-border:#334155] dark:[--registry-surface:#0F172A] dark:[--registry-muted:#CBD5E1] dark:[--registry-text:#F8FAFC]">
        <div className="flex min-w-0 flex-col gap-4 @min-[900px]:flex-row @min-[900px]:items-end">
          <section className="min-w-0 @min-[900px]:flex-1" aria-labelledby="partner-status-heading">
            <h2 id="partner-status-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--registry-muted)]">Partner status</h2>
            <div
              role="tablist"
              aria-labelledby="partner-status-heading"
              aria-orientation="horizontal"
              className="grid min-w-0 grid-cols-2 gap-0.5 rounded-lg bg-[var(--registry-track)] p-[3px] @min-[540px]:grid-cols-4"
              onKeyDown={(event) => {
                const currentIndex = STATUS_ORDER.indexOf(status);
                let nextIndex = currentIndex;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % STATUS_ORDER.length;
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + STATUS_ORDER.length) % STATUS_ORDER.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = STATUS_ORDER.length - 1;
                else return;

                event.preventDefault();
                const nextStatus = STATUS_ORDER[nextIndex];
                onStatusChange(nextStatus);
                event.currentTarget.querySelector<HTMLButtonElement>('#partner-status-tab-' + nextStatus.toLowerCase())?.focus();
              }}
            >
              {STATUS_ORDER.map((value) => (
                <button
                  key={value}
                  id={'partner-status-tab-' + value.toLowerCase()}
                  type="button"
                  role="tab"
                  aria-selected={status === value}
                  tabIndex={status === value ? 0 : -1}
                  aria-label={STATUS_LABELS[value] + ', ' + statusCounts[value].toLocaleString() + ' partners'}
                  onClick={() => onStatusChange(value)}
                  className={'inline-flex h-9 min-w-0 w-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--registry-blue)] focus-visible:ring-offset-1 @max-[280px]:h-auto @max-[280px]:min-h-9 @max-[280px]:flex-col @max-[280px]:gap-0 ' + (status === value ? 'bg-[var(--registry-blue)] text-white' : 'text-[color:var(--registry-text)] hover:bg-white/80 dark:hover:bg-slate-800')}
                >
                  <span>{value === 'Incomplete' ? 'Incomplete' : value}</span>
                  <span className={'tabular-nums text-[13px] ' + (status === value ? 'text-white/80' : statusCounts[value] === 0 ? 'text-[color:var(--registry-muted)] opacity-60' : 'text-[color:var(--registry-muted)]')}>{statusCounts[value].toLocaleString()}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="flex min-w-0 w-full shrink-0 flex-col gap-2 @min-[900px]:w-[240px]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--registry-muted)]">Breakdown</p>
            <button id="partner-category-breakdown-toggle" type="button" onClick={onToggleExpanded} aria-expanded={expanded} aria-controls="partner-category-breakdown" className="inline-flex min-h-[42px] w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[color:var(--registry-border)] px-3 py-2 text-center text-sm font-medium leading-5 text-[color:var(--registry-text)] transition-colors motion-reduce:transition-none hover:bg-[var(--registry-track)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--registry-blue)] focus-visible:ring-offset-2">
              <span className="min-w-0 break-words">Branch &amp; Rank Breakdown</span>
              <ChevronDown size={16} aria-hidden="true" className={'shrink-0 transition-transform duration-200 motion-reduce:transition-none ' + (expanded ? 'rotate-180' : '')} />
            </button>
          </div>
        </div>
        <section id="partner-category-breakdown" role="region" aria-labelledby="partner-category-breakdown-toggle" hidden={!expanded} className="mt-4 border-t border-[color:var(--registry-border)] pt-4">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Category &amp; Supplier Rank Breakdown</h3>
                <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0063a9] dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">Master List Audit</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Every accredited branch (BP Code) is mapped by category and supplier rank across the company.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:self-auto">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0063a9]" /> Portfolio: {categorySummary.total.toLocaleString()} Accredited Branches Mapped
            </span>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div><h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Category Distribution</h4><p className="mt-0.5 text-[10px] text-slate-400">4 core families · Paired Standard &amp; Non-Trade (NT)</p></div>
                <span className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950">{categorySummary.total.toLocaleString()} branches total</span>
              </div>
              <div className="mt-3 space-y-2">
                {FAMILIES.map((family) => {
                  const standard = categorySummary.buckets[family] ?? 0;
                  const nt = categorySummary.buckets[`${family}-NT`] ?? 0;
                  return <div key={family} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(135px,1fr)_minmax(92px,0.65fr)_minmax(100px,0.7fr)_auto] sm:items-center dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200"><span className="h-2 w-2 shrink-0 rounded-full bg-[#0063a9]" />{family.replace('-', ' – ')}</div>
                    <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">Standard <strong className="ml-1 text-slate-700 dark:text-slate-200">{standard.toLocaleString()}</strong></div>
                    <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">Non-Trade (NT) <strong className="ml-1 text-slate-700 dark:text-slate-200">{nt.toLocaleString()}</strong></div>
                    <span className="justify-self-end rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Total: {(standard + nt).toLocaleString()}</span>
                  </div>;
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>Active Categories: <strong className="text-slate-700 dark:text-slate-200">{activeFamilies} of 4 Families</strong></span>
                <span className="font-bold text-[#0063a9] dark:text-blue-300">Total: {categorySummary.total.toLocaleString()} Mapped</span>
              </div>
            </div>

            <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/40 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div><h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Supplier Rank Distribution</h4><p className="mt-0.5 text-[10px] text-slate-400">Accredited tier classification across branches</p></div>
                <span className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950">{rankCount.toLocaleString()} ranked branches</span>
              </div>
              <div className="mt-3 flex-1 space-y-2">
                {[
                  { label: 'Regular Rank', description: 'Operational tier partner branches', count: categorySummary.regular, color: 'bg-[#0063a9]' },
                  { label: 'Major Rank', description: 'High-volume or strategic supplier branch', count: categorySummary.major, color: 'bg-amber-500' },
                ].map((rank) => {
                  const share = rankCount ? rank.count / rankCount * 100 : 0;
                  return <div key={rank.label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{rank.label}</p><p className="mt-0.5 text-[10px] text-slate-400">{rank.description}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{rank.count.toLocaleString()} <span className="text-[10px] font-medium text-slate-400">branches</span></p><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{share.toFixed(1)}% share</p></div></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${rank.color}`} style={{ width: `${share}%` }} /></div>
                    <div className="mt-1.5 flex justify-between gap-2 text-[9px] text-slate-400"><span>{rank.count.toLocaleString()} of {rankCount.toLocaleString()} ranked branches</span><span>Share of mapped ranks</span></div>
                  </div>;
                })}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[10px] text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <Check size={14} className="mt-0.5 shrink-0 text-[#0063a9]" aria-hidden="true" />
                <span><strong>{branchCount ? Math.round(rankCount / branchCount * 100) : 0}% Rank Mapping Coverage:</strong> {rankCount.toLocaleString()} of {branchCount.toLocaleString()} partner branches have a mapped supplier rank.</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
