import type { ArchiveAnalyticsData } from '../domain/archiveAnalyticsVisuals';
import { analyticsBands, formatAnalyticsScore, getAnalyticsBand, getAnalyticsScore } from '../../analytics/domain/rankings';
import { formatNumber } from '../../analytics/domain/analytics';

export function ArchivedLeaderboard({ analytics }: { analytics: ArchiveAnalyticsData[] }) {
  return <>{analytics.map(({ category, summary }) => {
    const companies = summary.companies;
    if (!companies.length) return null;
    const split = Math.ceil(companies.length / 2);
    return <section key={category} aria-label={`${category} Company Leaderboard`} className="mb-5 min-w-0">
      <h4 className="text-balance text-xs font-semibold text-slate-700 dark:text-slate-200">{category} Company Leaderboard</h4>
      <div className="my-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        {analyticsBands[category].map(band => <span key={band.label} className="inline-flex items-center gap-1"><span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: band.hex }} />{band.label}</span>)}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-x-3">
        {[companies.slice(0, split), companies.slice(split)].map((column, columnIndex) => <div key={columnIndex} className="min-w-0">
          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_2.75rem_1.5rem] gap-x-1 border-b border-slate-200 pb-1 text-[9px] leading-3 text-slate-500"><span>Rank</span><span>Company</span><span className="text-right">Rank score</span><span className="text-right">Forms</span></div>
          <ol start={columnIndex * split + 1} className="min-w-0">
            {column.map((company, index) => {
              const rank = columnIndex * split + index + 1;
              const band = getAnalyticsBand(category, company.rankScore);
              return <li key={`${company.companyId || company.name}:${rank}`} aria-label={`Rank ${rank}: ${company.name}, ${formatAnalyticsScore(category, company.rankScore)}, ${company.count} forms`} className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_2.75rem_1.5rem] items-start gap-x-1 border-b border-slate-100 px-0.5 py-1.5 text-[11px] leading-4 text-slate-800" style={{ backgroundColor: rank % 2 ? '#f8fafc' : '#fff' }}>
                <span className="mt-0.5 rounded bg-slate-200 text-center text-[9px] font-bold tabular-nums">{rank}</span>
                <span className="min-w-0 text-pretty break-words [overflow-wrap:anywhere]"><span className="font-semibold">{company.name}</span><span className="block text-[9px] leading-3 text-slate-500">{category} · <span style={{ color: band.hex }}>{band.label}</span></span></span>
                <span className="text-right font-bold tabular-nums" style={{ color: band.hex }}>{formatNumber(getAnalyticsScore(category, company.rankScore))}</span>
                <span className="text-right text-[10px] tabular-nums text-slate-500">{company.count}</span>
              </li>;
            })}
          </ol>
        </div>)}
      </div>
    </section>;
  })}</>;
}
