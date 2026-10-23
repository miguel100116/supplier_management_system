import React from 'react';
import { Check } from 'lucide-react';
import type { CategoryRankSummary } from '../domain/categorySummary';

interface PartnerCategoryRankBreakdownProps {
  categorySummary: CategoryRankSummary;
  branchCount: number;
}

const FAMILIES = [
  { key: 'Supplier-Local', label: 'Supplier – Local', tone: 'supplier-local' },
  { key: 'Supplier-Foreign', label: 'Supplier – Foreign', tone: 'supplier-foreign' },
  { key: 'Courier', label: 'Courier', tone: 'courier' },
  { key: 'Subcontractor', label: 'Subcontractor', tone: 'subcontractor' },
] as const;

export function PartnerCategoryRankBreakdown({ categorySummary, branchCount }: PartnerCategoryRankBreakdownProps) {
  const rankCount = categorySummary.major + categorySummary.regular;
  const activeFamilies = FAMILIES.filter(({ key }) => (categorySummary.buckets[key] ?? 0) + (categorySummary.buckets[`${key}-NT`] ?? 0) > 0).length;

  return (
    <section className="admin-directory-breakdown panel !p-0 overflow-hidden" aria-labelledby="partner-category-breakdown-heading">
      <div className="px-4 py-3">
        <div className="min-w-0">
          <h2 id="partner-category-breakdown-heading" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Category &amp; Supplier Rank Breakdown</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Branch-level category and supplier rank analysis.</p>
        </div>
      </div>

      <div id="partner-category-breakdown-content" role="region" aria-labelledby="partner-category-breakdown-heading" className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Every accredited branch (BP Code) is mapped by category and supplier rank across the company.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:self-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0063a9]" /> Portfolio: {categorySummary.total.toLocaleString()} Accredited Branches Mapped
          </span>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div><h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Category Distribution</h3><p className="mt-0.5 text-[10px] text-slate-400">4 core families · Paired Standard &amp; Non-Trade (NT)</p></div>
              <span className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950">{categorySummary.total.toLocaleString()} branches total</span>
            </div>
            <div className="mt-3 space-y-2">
              {FAMILIES.map(({ key: family, label, tone }) => {
                const standard = categorySummary.buckets[family] ?? 0;
                const nt = categorySummary.buckets[`${family}-NT`] ?? 0;
                return <div key={family} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(135px,1fr)_minmax(92px,0.65fr)_minmax(100px,0.7fr)_auto] sm:items-center dark:border-slate-800 dark:bg-slate-950">
                  <div className={`admin-directory-family-label admin-directory-family-${tone}`}><span className="admin-directory-family-dot" aria-hidden="true" />{label}</div>
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
              <div><h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Supplier Rank Distribution</h3><p className="mt-0.5 text-[10px] text-slate-400">Accredited tier classification across branches</p></div>
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
      </div>
    </section>
  );
}
