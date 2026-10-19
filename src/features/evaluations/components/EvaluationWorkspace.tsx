import React, { ReactNode } from 'react';

export const EVALUATION_WORKSPACE_TABS = [
  { key: 'survey-forms', label: 'Forms', description: 'Create and manage evaluation forms, assigned companies, deadlines, and access.' },
  { key: 'explorer', label: 'Responses', description: 'Select a form to review or export its submissions.' },
  { key: 'pending-review', label: 'Coverage', description: 'See which assigned companies have evaluations in the current response records.' },
  { key: 'categories-manager', label: 'Category Labels', description: 'Change the displayed scoring category names for each survey type.' },
] as const;

export type EvaluationWorkspacePage = typeof EVALUATION_WORKSPACE_TABS[number]['key'];

export function isEvaluationWorkspacePage(page: string): page is EvaluationWorkspacePage {
  return EVALUATION_WORKSPACE_TABS.some((tab) => tab.key === page);
}

export function EvaluationWorkspace({ activePage, onNavigate, children }: {
  activePage: EvaluationWorkspacePage;
  onNavigate: (page: EvaluationWorkspacePage) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <p className="-mt-3 text-base text-slate-500 dark:text-slate-400">{activePage === 'categories-manager' ? 'Change the displayed scoring category names for each survey type.' : 'Create and manage evaluation forms, assigned companies, deadlines, and access.'}</p>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <nav aria-label="Evaluation workspace views" className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          {EVALUATION_WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-current={activePage === tab.key ? 'page' : undefined}
              onClick={() => onNavigate(tab.key)}
              className={activePage === tab.key
                ? 'rounded-md bg-[#0063a9] px-5 py-2 text-sm font-semibold text-white shadow-sm dark:bg-blue-600'
                : 'rounded-md px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-white/70 dark:text-slate-300'}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </section>
      {children}
    </div>
  );
}
