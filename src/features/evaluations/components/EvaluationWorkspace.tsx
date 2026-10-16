import React, { type ReactNode } from 'react';
import { ModuleWorkspace } from '../../../components/ModuleWorkspace';

export const EVALUATION_WORKSPACE_TABS = [
  { key: 'survey-forms', label: 'Forms' },
  { key: 'explorer', label: 'Responses' },
  { key: 'pending-review', label: 'Coverage' },
  { key: 'import-evaluations', label: 'Import Responses' },
  { key: 'categories-manager', label: 'Settings' },
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
    <ModuleWorkspace activePage={activePage} views={EVALUATION_WORKSPACE_TABS} onNavigate={onNavigate} navigationLabel="Evaluation views">
      {children}
    </ModuleWorkspace>
  );
}
