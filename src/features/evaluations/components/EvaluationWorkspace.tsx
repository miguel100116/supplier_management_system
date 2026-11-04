import React, { ReactNode } from 'react';
import { PageDescription, PageDescriptionTarget } from '../../../components/PageDescription';

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
    <div className="admin-evaluation-workspace space-y-6">
      <PageDescription>{activePage === 'categories-manager' ? 'Change the displayed scoring category names for each survey type.' : 'Create and manage evaluation forms, assigned companies, deadlines, and access.'}</PageDescription>
      <nav aria-label="Evaluation workspace views" className="admin-evaluation-tabs admin-tab-strip flex max-w-full flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {EVALUATION_WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-current={activePage === tab.key ? 'page' : undefined}
              onClick={() => onNavigate(tab.key)}
              className={activePage === tab.key
                ? 'is-active border-b-2 border-[#0063a9] px-4 py-2.5 text-sm font-semibold text-[#0063a9] dark:text-sky-300'
                : 'border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}
            >
              {tab.label}
            </button>
          ))}
      </nav>
      <PageDescriptionTarget.Provider value={null}>{children}</PageDescriptionTarget.Provider>
    </div>
  );
}
