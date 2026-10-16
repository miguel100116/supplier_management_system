import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { getSurveyEvaluationCompanies, hasAnsweredItem } from '../utils/analytics';
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
  Courier: '#2563eb',
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
      <section className="grid gap-4 sm:grid-cols-3">
        {groups.map((group) => (
          <article key={group.type} className="panel">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group.type}</span>
              <span className="text-xs font-bold" style={{ color: typeColors[group.type] }}>
                {group.hasAssignedForm ? `${group.pct}%` : '—'}
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">
              {group.hasAssignedForm ? `${group.answered}/${group.total}` : 'No active form'}
            </p>
            <p className="text-xs text-slate-400">
              {group.hasAssignedForm ? 'companies evaluated this period' : `No published ${group.type.toLowerCase()} survey right now`}
            </p>
            {group.hasAssignedForm && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${group.pct}%`, backgroundColor: typeColors[group.type] }}
                />
              </div>
            )}
          </article>
        ))}
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
              <div className={"flex items-center gap-2 " + (group.outstanding.length === 0 ? "mb-1" : "mb-4")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: typeColors[group.type] }} />
                <h3 className="text-base font-semibold">{group.type} — Still Awaiting Evaluation</h3>
              </div>
              {group.outstanding.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Companies no one has submitted a {group.type.toLowerCase()} evaluation for this period.
                </p>
              )}

              {group.outstanding.length === 0 ? (
                <StateMessage compact title="Fully covered" message={`Every ${group.type.toLowerCase()} partner has at least one evaluation this period.`} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleCompanies.map((company) => (
                    <div
                      key={company.id}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5"
                    >
                      <ClipboardList size={15} className="text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">{company.name}</span>
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
          message="Publish a survey form under Evaluations to start tracking outstanding company coverage."
        />
      )}
      {groups.some((g) => g.hasAssignedForm) && groups.every((g) => !g.hasAssignedForm || g.outstanding.length === 0) && (
        <section className="panel flex items-center gap-3 border-emerald-100 dark:border-emerald-900/40">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Every company with an active survey has at least one evaluation on record this period.
          </p>
        </section>
      )}
    </div>
  );
}
