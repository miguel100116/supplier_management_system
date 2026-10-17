import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { FilterState, PartnerCompany, SurveyType } from '../types/survey';

interface FilterPanelProps {
  filters: FilterState;
  partnerCompanies: PartnerCompany[];
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  isDashboard?: boolean;
  allowedSurveyTypes?: SurveyType[];
}

const defaultSurveyTypeOptions: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
const surveyTypeColors: Record<SurveyType, string> = {
  Courier: '#2563eb',
  Supplier: '#10b981',
  Subcontractor: '#f97316',
};

export function FilterPanel({
  filters,
  partnerCompanies,
  onChange,
  onReset,
  isDashboard,
  allowedSurveyTypes = defaultSurveyTypeOptions,
}: FilterPanelProps) {
  const update = <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => onChange({ ...filters, [key]: value });

  const surveyTypeOptions = useMemo(() => {
    return defaultSurveyTypeOptions.filter(type => allowedSurveyTypes.includes(type));
  }, [allowedSurveyTypes]);

  const toggleSurveyType = (type: SurveyType) => {
    const next = filters.surveyType.includes(type)
      ? filters.surveyType.filter((value) => value !== type)
      : [...filters.surveyType, type];
    
    // If we have a specific company selected, verify if it still matches the new survey type selection
    if (filters.company) {
      const selectedCompanyData = partnerCompanies.find(c => c.name === filters.company);
      if (selectedCompanyData) {
        // If the newly selected types are not empty AND the selected company's type is NOT in the selected types
        if (next.length > 0 && !next.some((t) => t === selectedCompanyData.type)) {
            // Company doesn't match the new survey type filter, so clear the selected company
            onChange({ ...filters, surveyType: next, company: '' });
            return;
        }
      }
    }
    update('evaluationType', next);
  };

  const filteredCompanies = useMemo(() => {
    // Filter first by allowed survey types
    const allowedCompanies = partnerCompanies.filter(c => allowedSurveyTypes.some((t) => t === c.type));
    if (filters.surveyType.length === 0) return allowedCompanies;
    return allowedCompanies.filter(c => filters.surveyType.some((t) => t === c.type));
  }, [partnerCompanies, filters.surveyType, allowedSurveyTypes]);

  return (
    <section className="panel sticky top-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Filters</h3>
        <button className="ghost-button" type="button" onClick={onReset}>
          <RotateCcw size={15} />
          Reset
        </button>
      </div>
      <div className="space-y-4">
        {isDashboard ? (
          <label className="field-label">
            Partner Category
            <select
              className="field mt-1"
              value={filters.surveyType.length === 1 ? filters.surveyType[0] : 'All'}
              onChange={(event) => {
                const val = event.target.value;
                let nextSurveyType: SurveyType[] = [];
                if (val !== 'All') {
                  nextSurveyType = [val as SurveyType];
                }
                
                // Clear company if it doesn't match new filter
                if (filters.company) {
                   const cData = partnerCompanies.find(c => c.name === filters.company);
                   if (cData && nextSurveyType.length > 0 && !nextSurveyType.some((t) => t === cData.type)) {
                       onChange({ ...filters, surveyType: nextSurveyType, company: '' });
                       return;
                   }
                }
                update('evaluationType', nextSurveyType);
              }}
            >
              {allowedSurveyTypes.length > 1 && <option value="All">All Categories</option>}
              {surveyTypeOptions.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="field-label">
            Evaluation Type
            <div className="mt-1 space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              {surveyTypeOptions.map((type) => {
                const checked = filters.surveyType.includes(type);
                return (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center gap-2.5 text-sm font-normal text-slate-600 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-azure focus:ring-azure dark:border-slate-700 dark:bg-slate-900"
                      checked={checked}
                      onChange={() => toggleSurveyType(type)}
                    />
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: surveyTypeColors[type] }}
                    />
                    {type}
                  </label>
                );
              })}
            </div>
            {filters.surveyType.length === 0 && (
              <p className="mt-1 text-xs font-normal text-slate-400 dark:text-slate-500">None selected — showing all allowed types.</p>
            )}
          </div>
        )}
        <label className="field-label">
          Partner
          <select className="field mt-1" value={filters.company} onChange={(event) => update('company', event.target.value)}>
            <option value="">All partners</option>
            {filteredCompanies.map((company) => (
              <option key={company.id} value={company.name}>{company.name}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
