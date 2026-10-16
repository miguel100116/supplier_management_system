import React, { type ReactNode } from 'react';
import { ModuleWorkspace } from '../../../components/ModuleWorkspace';
import {
  EVALUATION_WORKSPACE_VIEWS,
  isEvaluationWorkspacePage,
} from '../../../navigation/navigationConfig';

export const EVALUATION_WORKSPACE_TABS = EVALUATION_WORKSPACE_VIEWS;
export { isEvaluationWorkspacePage };

export type EvaluationWorkspacePage = typeof EVALUATION_WORKSPACE_TABS[number]['key'];

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
