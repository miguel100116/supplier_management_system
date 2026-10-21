import { useState, type ReactNode } from 'react';
import type { NavItem, NavLeaf } from '../../../layouts/Shell';
import { useModalEscape } from '../../../hooks/useModalEscape';

type IconName = 'home' | 'clipboard' | 'history' | 'arrow' | 'chevron' | 'help' | 'close';

function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
    clipboard: <><rect x="5" y="5" width="14" height="16" rx="2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></>,
    history: <><path d="M3 10a9 9 0 1 1 1 8M3 4v6h6M12 7v5l3 2" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 8.5a2.5 2.5 0 1 1 3 3.8c-.5.3-.5.7-.5 1.7M12 17h.01" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Brand({ onHome }: { onHome: () => void }) {
  return (
    <button type="button" className="brand" onClick={onHome} aria-label="Go to Home">
      <img src="/microgenesis_logo.png" alt="Microgenesis" />
    </button>
  );
}

interface EmployeeExperienceShellProps<T extends string> {
  pages: NavItem<T>[];
  activePage: T;
  onPageChange: (page: T) => void;
  title: string;
  action: ReactNode;
  children: ReactNode;
}

export function EmployeeExperienceShell<T extends string>({ pages, activePage, onPageChange, title, action, children }: EmployeeExperienceShellProps<T>) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  useModalEscape(isHelpOpen, () => setIsHelpOpen(false));
  const links = pages.filter((page): page is NavLeaf<T> => page.type !== 'group');
  const homePage = links.find((page) => page.key === ('dashboard' as T)) ?? links[0];
  const titleByKey = new Map<string, string>([
    ['dashboard', 'Home'],
    ['fill-form', 'Evaluations'],
    ['my-submissions', 'My submissions'],
  ]);
  const pageTitle = titleByKey.get(activePage) ?? title;

  return (
    <div className="employee-experience app-shell">
      <aside className="sidebar">
        <Brand onHome={() => homePage && onPageChange(homePage.key)} />
        <div className="workspace-label">EMPLOYEE WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map((page) => {
            const iconName: IconName = page.key === ('dashboard' as T) ? 'home' : page.key === ('my-submissions' as T) ? 'history' : 'clipboard';
            const isActive = activePage === page.key;
            return (
              <button
                key={page.key}
                type="button"
                disabled={page.disabled}
                aria-current={isActive ? 'page' : undefined}
                title={page.disabled ? 'Access restricted by an administrator' : undefined}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onPageChange(page.key)}
              >
                <Icon name={iconName} />
                {pageTitle === title && activePage === page.key ? title : titleByKey.get(page.key) ?? page.label}
                {isActive && <span className="nav-indicator" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            {activePage === homePage?.key ? (
              <span aria-current="page">Home</span>
            ) : (
              <button
                type="button"
                className="breadcrumb-home"
                onClick={() => homePage && onPageChange(homePage.key)}
                aria-label="Go to Home"
              >
                Home
              </button>
            )}
            {activePage !== homePage?.key && <><Icon name="chevron" size={13} /><span>{pageTitle}</span></>}
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="icon-button"
              aria-label="View quick guide"
              aria-haspopup="dialog"
              title="View quick guide"
              onClick={() => setIsHelpOpen(true)}
            >
              <Icon name="help" />
            </button>
            {action}
          </div>
        </header>
        <main>{children}<footer className="main-footer"><span>Microgenesis · Employee experience</span><span>Partner evaluations</span></footer></main>
      </div>

      {isHelpOpen && (
        <div className="fixed inset-0 modal-backdrop">
          <section className="modal quick-guide-modal" role="dialog" aria-modal="true" aria-labelledby="quick-guide-title">
            <button className="modal-close icon-button" type="button" aria-label="Close dialog" autoFocus onClick={() => setIsHelpOpen(false)}><Icon name="close" /></button>
            <span className="eyebrow">A QUICK GUIDE</span>
            <h2 id="quick-guide-title">Your experience. Your feedback.</h2>
            <p className="modal-subtitle">Three simple steps to complete an evaluation.</p>
            <ol className="quick-guide-steps">
              <li><span>1</span><div><h3>Choose the right partner</h3><p>Open Evaluations and select the company and survey you want to answer.</p></div></li>
              <li><span>2</span><div><h3>Answer thoughtfully</h3><p>Use your own experience. Required questions are marked with an asterisk. Unfinished answers are not saved when you leave.</p></div></li>
              <li><span>3</span><div><h3>Review, then submit</h3><p>Check the company and your answers. After submission, find your record in My submissions.</p></div></li>
            </ol>
            <p className="quick-guide-note">Your evaluations use the partner information and survey questions assigned to your employee account.</p>
            <button className="primary-button" type="button" onClick={() => setIsHelpOpen(false)}>Got it</button>
          </section>
        </div>
      )}
    </div>
  );
}
