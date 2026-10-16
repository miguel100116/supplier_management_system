import React, { type ReactNode } from 'react';

export interface ModuleWorkspaceView<T extends string> {
  key: T;
  label: string;
}

export function ModuleWorkspace<T extends string>({ activePage, views, onNavigate, navigationLabel, children }: {
  activePage: T;
  views: readonly ModuleWorkspaceView<T>[];
  onNavigate: (page: T) => void;
  navigationLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <nav aria-label={navigationLabel} className="module-tabs">
          {views.map((view) => (
            <button key={view.key} type="button" aria-current={activePage === view.key ? 'page' : undefined} onClick={() => onNavigate(view.key)} className={`module-tab ${activePage === view.key ? 'module-tab-active' : ''}`}>
              {view.label}
            </button>
          ))}
      </nav>
      {children}
    </div>
  );
}
