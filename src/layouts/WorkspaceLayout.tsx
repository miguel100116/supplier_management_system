import React, { type ReactNode } from 'react';

export interface WorkspaceTab {
  label: string;
  segment: string;
}

const normalizePath = (path: string) => path.split(/[?#]/, 1)[0].replace(/\/+$/, '');

export function resolveWorkspacePath(basePath: string, segment: string) {
  return `${normalizePath(basePath)}/${segment.replace(/^\/+/, '')}`;
}

export function WorkspaceLayout({ basePath, currentPath, tabs, onNavigate, children }: {
  basePath: string;
  currentPath: string;
  tabs: readonly WorkspaceTab[];
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  const pathname = normalizePath(currentPath);
  return (
    <div className="space-y-6">
      <nav aria-label="Evaluation workspace" className="module-tabs">
        {tabs.map((tab) => {
          const path = resolveWorkspacePath(basePath, tab.segment);
          const active = pathname === path || pathname.startsWith(`${path}/`);
          return (
            <button
              key={tab.segment}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(path)}
              className={`module-tab ${active ? 'module-tab-active' : ''}`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
