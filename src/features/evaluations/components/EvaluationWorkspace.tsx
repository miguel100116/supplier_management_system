import React, { type ReactNode } from 'react';
import { WorkspaceLayout } from '../../../layouts/WorkspaceLayout';
import {
  EVALUATION_WORKSPACE_VIEWS,
  isEvaluationWorkspacePage,
} from '../../../navigation/navigationConfig';
import { PATHS } from '../../../routes/paths';

export const EVALUATION_WORKSPACE_TABS = EVALUATION_WORKSPACE_VIEWS;
export { isEvaluationWorkspacePage };

export type EvaluationWorkspacePage = typeof EVALUATION_WORKSPACE_TABS[number]['key'];

const WORKSPACE_TABS = [
  { label: 'Forms', segment: 'forms' },
  { label: 'Responses', segment: 'responses' },
  { label: 'Coverage', segment: 'coverage' },
  { label: 'Category Labels', segment: 'category-labels' },
] as const;

export function EvaluationWorkspace({ currentPath, onNavigate, children }: {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  return (
    <WorkspaceLayout
      basePath={PATHS.admin.evaluations.workspace.root}
      currentPath={currentPath}
      tabs={WORKSPACE_TABS}
      onNavigate={onNavigate}
    >
      {children}
    </WorkspaceLayout>
  );
}
