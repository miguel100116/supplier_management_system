import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { getSurveyEvaluationCompanies, hasAnsweredItem } from '../features/analytics/domain/analytics';
import { StateMessage } from '../components/StateMessage';
import { Pagination } from '../components/Pagination';

interface OutstandingEvaluationsPageProps {
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
}

const SURVEY_TYPES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const SUPPLIER_PAGE_SIZE = 10;

const typeColors: Record<SurveyType, string> = {
  Courier: '#2187CD',
  Supplier: '#0f9f6e',
  Subcontractor: '#7c3aed',
};

export function OutstandingEvaluationsPage({ surveys, partnerCompanies, responses }: OutstandingEvaluationsPageProps) {
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierPageSize, setSupplierPageSize] = useState(SUPPLIER_PAGE_SIZE);
  const groups = useMemo(() => {
    return SURVEY_TYPES.map((type) => {
      const activeSurveys = surveys.filter((s) => s.status !== 'Archived' && s.surveyType === type);
      const hasAssignedForm = activeSurveys.length > 0;

      const companyMap = new Map<string, PartnerCompany>();
      activeSurveys.forEach((survey) => {
        getSurveyEvaluationCompanies(survey, partnerCompanies).forEach((c) => companyMap.set(c.id, c));
      });
      const allCompanies = Array.from(companyMap.values());

      const evaluatedNames = new Set(responses.filter((r) => r.surveyType === type && hasAnsweredItem(r)).map((r) => r.company));
      const outstanding = allCompanies.filter((c) => !evaluatedNames.has(c.name));
      if (type === 'Supplier') {
        outstanding.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true }));
      }

      const total = allCompanies.length;
      const answered = total - outstanding.length;
      const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

      return { type, total, answered, pct, outstanding, hasAssignedForm };
    });
  }, [surveys, partnerCompanies, responses]);
  const supplierOutstandingCount = groups.find((group) => group.type === 'Supplier')?.outstanding.length ?? 0;
  const supplierTotalPages = Math.max(1, Math.ceil(supplierOutstandingCount / supplierPageSize));

  useEffect(() => {
    setSupplierPage((page) => Math.min(page, supplierTotalPages));
  }, [supplierTotalPages]);

  return (
    <div className="space-y-5">
      <section aria-label="Evaluation coverage by partner type" className="panel overflow-hidden p-0">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div><h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Coverage overview</h2><p className="mt-1 text-xs text-slate-400">Partner companies with a counted evaluation in the available records.</p></div>
          <span className="text-xs text-slate-400">3 partner types</span>
        </header>
        <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-800">
          {groups.map((group) => (
            <article key={group.type} className="space-y-2 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{group.type}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: typeColors[group.type] }}>
                  {group.hasAssignedForm ? `${group.pct}%` : '—'}
                </span>
              </div>
              <p className="text-[20px] font-semibold tracking-[-.4px] text-slate-900 dark:text-white">
                {group.hasAssignedForm ? `${group.answered}/${group.total}` : 'No active form'}
              </p>
              <p className="text-xs leading-5 text-slate-400">
                {group.hasAssignedForm ? 'companies covered' : `No published ${group.type.toLowerCase()} survey right now`}
              </p>
              {group.hasAssignedForm && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label={`${group.type} evaluation coverage`} aria-valuenow={group.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${group.pct}%`, backgroundColor: typeColors[group.type] }} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {groups.map((group) => {
        if (!group.hasAssignedForm) return null;

        const isSupplier = group.type === 'Supplier';
        const totalPages = isSupplier ? supplierTotalPages : 1;
        const currentPage = isSupplier ? Math.min(supplierPage, totalPages) : 1;
        const firstVisibleIndex = (currentPage - 1) * supplierPageSize;
        const visibleCompanies = isSupplier
          ? group.outstanding.slice(firstVisibleIndex, firstVisibleIndex + supplierPageSize)
          : group.outstanding;

        return (
            <section key={group.type} className="panel">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: typeColors[group.type] }} />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{group.type} awaiting evaluation</h3>
                </div>
                <span className="text-xs text-slate-400">{group.outstanding.length} remaining · {group.answered}/{group.total} covered</span>
              </div>
              {group.outstanding.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Companies with no counted {group.type.toLowerCase()} evaluation in the available records.
                </p>
              )}

              {group.outstanding.length === 0 ? (
                <StateMessage compact title="Fully covered" message={`Every ${group.type.toLowerCase()} partner has at least one counted evaluation in the available records.`} />
              ) : (
                <div className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleCompanies.map((company) => (
                    <div
                      key={company.id}
                      className="flex min-w-0 items-center gap-2.5 border-b border-slate-100 px-1 py-2.5 dark:border-slate-800"
                    >
                      <ClipboardList size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate text-[13px] text-slate-600 dark:text-slate-300">{company.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {isSupplier && group.outstanding.length > 0 && <Pagination page={currentPage} pageSize={supplierPageSize} totalItems={group.outstanding.length}
                onPageChange={setSupplierPage} onPageSizeChange={(size) => { setSupplierPageSize(size); setSupplierPage(1); }}
                ariaLabel="Supplier awaiting evaluation pages" className="mt-4" showPageControls={totalPages > 1 || supplierPageSize !== SUPPLIER_PAGE_SIZE} />}
            </section>
        );
      })}

      {groups.every((g) => !g.hasAssignedForm) && (
        <StateMessage
          compact
          title="No active survey forms"
            message="Publish an evaluation form to start tracking outstanding company coverage."
        />
      )}
      {groups.some((g) => g.hasAssignedForm) && groups.every((g) => !g.hasAssignedForm || g.outstanding.length === 0) && (
        <section className="panel flex items-center gap-3 border-emerald-100 dark:border-emerald-900/40">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Every company with an active survey has at least one counted evaluation on record.
          </p>
        </section>
      )}
    </div>
  );
}
