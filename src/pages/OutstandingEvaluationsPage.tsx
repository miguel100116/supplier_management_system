import { useMemo } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { getSurveyEvaluationCompanies } from '../utils/analytics';
import { StateMessage } from '../components/StateMessage';

interface OutstandingEvaluationsPageProps {
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
}

const SURVEY_TYPES: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

const typeColors: Record<SurveyType, string> = {
  Courier: '#2563eb',
  Supplier: '#0f9f6e',
  Subcontractor: '#7c3aed',
};

export function OutstandingEvaluationsPage({ surveys, partnerCompanies, responses }: OutstandingEvaluationsPageProps) {
  const groups = useMemo(() => {
    return SURVEY_TYPES.map((type) => {
      const activeSurveys = surveys.filter((s) => s.status !== 'Archived' && s.surveyType === type);
      const hasAssignedForm = activeSurveys.length > 0;

      const companyMap = new Map<string, PartnerCompany>();
      activeSurveys.forEach((survey) => {
        getSurveyEvaluationCompanies(survey, partnerCompanies).forEach((c) => companyMap.set(c.id, c));
      });
      const allCompanies = Array.from(companyMap.values());

      const evaluatedNames = new Set(responses.filter((r) => r.surveyType === type).map((r) => r.company));
      const outstanding = allCompanies.filter((c) => !evaluatedNames.has(c.name));

      const total = allCompanies.length;
      const answered = total - outstanding.length;
      const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

      return { type, total, answered, pct, outstanding, hasAssignedForm };
    });
  }, [surveys, partnerCompanies, responses]);

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
              {group.hasAssignedForm ? 'partners evaluated this period' : `No published ${group.type.toLowerCase()} evaluation right now`}
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

      {groups.map(
        (group) =>
          group.hasAssignedForm && (
            <section key={group.type} className="panel">
              <div className={"flex items-center gap-2 " + (group.outstanding.length === 0 ? "mb-1" : "mb-4")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: typeColors[group.type] }} />
                <h3 className="text-base font-semibold">{group.type} — Still Awaiting Evaluation</h3>
              </div>
              {group.outstanding.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Partners no one has submitted a {group.type.toLowerCase()} evaluation for this period.
                </p>
              )}

              {group.outstanding.length === 0 ? (
                <StateMessage compact title="Fully covered" message={`Every ${group.type.toLowerCase()} partner has at least one evaluation this period.`} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.outstanding.map((company) => (
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
            </section>
          )
      )}

      {groups.every((g) => !g.hasAssignedForm) && (
        <StateMessage
          compact
          title="No active evaluation forms"
          message="Publish a evaluation form under Evaluations to start tracking outstanding partner coverage."
        />
      )}
      {groups.some((g) => g.hasAssignedForm) && groups.every((g) => !g.hasAssignedForm || g.outstanding.length === 0) && (
        <section className="panel flex items-center gap-3 border-emerald-100 dark:border-emerald-900/40">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Every partner with an active evaluation has at least one evaluation on record this period.
          </p>
        </section>
      )}
    </div>
  );
}
