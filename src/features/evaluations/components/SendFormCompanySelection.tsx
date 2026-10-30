import type { PartnerCompany, SurveyType } from '../../../types/survey';
import { requiresDistributionCompanySelection } from '../domain/formDistribution';

export function SendFormCompanySelection({ surveyType, companies, selectedIds, busy, onSelect, usesUploadedList = false }: {
  surveyType: SurveyType;
  companies: PartnerCompany[];
  selectedIds: string[] | null;
  busy: boolean;
  onSelect: (ids: string[]) => void;
  usesUploadedList?: boolean;
}) {
  if (!requiresDistributionCompanySelection(surveyType)) return null;
  const categoryName = surveyType === 'Courier' ? 'courier' : 'supplier';
  const allSelected = companies.length > 0 && companies.every((company) => selectedIds?.includes(company.id));
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="w-full text-sm font-semibold">Choose {categoryName}s to evaluate</p>
      <button type="button" disabled={busy || companies.length === 0} aria-pressed={allSelected}
        onClick={() => onSelect(companies.map((company) => company.id))}
        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0063a9] transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
        {usesUploadedList ? `Select all active ${categoryName}s` : `Select top 20 ${categoryName}s`}
      </button>
      <p role="status" className="text-xs text-slate-500">
        {companies.length === 0 ? `No active ${categoryName}s are available.`
          : selectedIds?.length ? `${selectedIds.length} ${categoryName}s selected. Confirm to save this selection.`
          : `Select at least one ${categoryName} from the ${usesUploadedList ? 'uploaded Active Companies' : 'Top 20'} list.`}
      </p>
      <div role="group" aria-label={`${usesUploadedList ? 'Active' : 'Top 20'} ${categoryName}s to evaluate`} className="grid max-h-48 w-full grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
        {companies.map((company, index) => (
          <label key={company.id} className="flex items-start gap-2 rounded-md px-2 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
            <input type="checkbox" checked={selectedIds?.includes(company.id) ?? false} disabled={busy}
              onChange={(event) => onSelect(event.target.checked
                ? [...(selectedIds ?? []), company.id]
                : (selectedIds ?? []).filter((id) => id !== company.id))}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]" />
            <span>{index + 1}. {company.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
