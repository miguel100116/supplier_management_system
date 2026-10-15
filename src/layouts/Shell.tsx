import { LucideIcon, Menu, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { EmployeeExperienceShell } from '../features/employee-experience/components/EmployeeExperienceShell';

interface NavChild<T extends string> {
  key: T;
  label: string;
  badgeCount?: number;
  disabled?: boolean;
}

// A single clickable destination in the sidebar.
export interface NavLeaf<T extends string> {
  type?: 'link';
  key: T;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  disabled?: boolean;
}

// A collapsible parent that groups related destinations (e.g. "Suppliers" ->
// Supplier List / Supplier Profiles / Feedback Hub). The parent itself never
// navigates anywhere - clicking it only expands/collapses its children.
export interface NavGroup<T extends string> {
  type: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavChild<T>[];
}

export type NavItem<T extends string> = NavLeaf<T> | NavGroup<T>;

interface ModuleScrollTarget {
  scrollTo: (options: ScrollToOptions) => void;
}

export function scrollModuleToTop(target: ModuleScrollTarget = window) {
  target.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

interface ShellProps<T extends string> {
  pages: NavItem<T>[];
  activePage: T;
  onPageChange: (page: T) => void;
  title: string;
  action: ReactNode;
  children: ReactNode;
  pageHeading?: string;
  hidePageHeading?: boolean;
  hideModuleContext?: boolean;
  compactPageHeader?: boolean;
  sidebarExtra?: (isCollapsed: boolean) => ReactNode;
  adminMode?: boolean;
  navigationLabel?: string;
  employeeMode?: boolean;
}

// Flattens groups so we can look up the active item's label/icon regardless
// of whether it's a top-level link or nested inside a group.
function flattenPages<T extends string>(pages: NavItem<T>[]): { key: T; label: string; icon: LucideIcon }[] {
  return pages.flatMap((page) =>
    page.type === 'group'
      ? page.children.map((child) => ({ key: child.key, label: child.label, icon: page.icon }))
      : [{ key: page.key, label: page.label, icon: page.icon }]
  );
}

export function Shell<T extends string>({
  pages,
  activePage,
  onPageChange,
  title,
  action,
  children,
  pageHeading,
  hidePageHeading = false,
  hideModuleContext = false,
  compactPageHeader = false,
  sidebarExtra,
  adminMode = false,
  navigationLabel,
  employeeMode = false,
}: ShellProps<T>) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const flatPages = flattenPages(pages);
  const activePageItem = flatPages.find((p) => p.key === activePage);
  const homePage = flatPages.find((page) => page.key === ('dashboard' as T)) ?? flatPages[0];
  const ActiveIcon = activePageItem?.icon ?? Menu;
  const moduleLabel = activePageItem?.label ?? title;
  const contentHeading = pageHeading || title;
  const showModuleContext = !hideModuleContext && moduleLabel !== contentHeading;

  // Auto-expand whichever group currently contains the active page, without
  // collapsing groups the user has already opened manually.
  useEffect(() => {
    const activeGroup = pages.find(
      (page): page is NavGroup<T> => page.type === 'group' && page.children.some((child) => child.key === activePage)
    );
    if (activeGroup) {
      setExpandedGroups((prev) => (prev.has(activeGroup.id) ? prev : new Set(prev).add(activeGroup.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  useEffect(() => {
    scrollModuleToTop();
  }, [activePage]);

  if (employeeMode) {
    return (
      <EmployeeExperienceShell
        pages={pages}
        activePage={activePage}
        onPageChange={onPageChange}
        title={title}
        action={action}
      >
        {children}
      </EmployeeExperienceShell>
    );
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-cloud text-ink dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Top Header Layer */}
      <header className={`sticky top-0 z-40 h-20 border-b flex items-center justify-between w-full lg:pr-8 ${adminMode ? 'border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950' : 'border-[#00528c] bg-[#0063a9] shadow-sm'}`}>
        <div className="flex items-center h-full flex-1 min-w-0">
          {/* Brand Box / Logo Area - Fixed Width, unaffected by collapsing */}
          <div className={`relative z-10 flex h-full shrink-0 items-center justify-center px-2 min-[380px]:px-3 sm:px-4 ${adminMode ? 'w-[92px] min-[380px]:w-[116px] sm:w-[180px] lg:w-[264px] bg-white dark:bg-slate-950' : 'w-[92px] min-[380px]:w-[116px] sm:w-[180px] lg:w-[220px] bg-[#0063a9]'}`}>
            <button
               onClick={() => {
                 const homePage = pages.find((p) => p.type !== 'group' && (p as NavLeaf<T>).key === ('dashboard' as any));
                 const fallback = homePage ? (homePage as NavLeaf<T>).key : flatPages[0]?.key;
                 if (fallback) onPageChange(fallback);
               }}
              className="group flex w-full h-full items-center justify-center outline-none transition cursor-pointer overflow-hidden"
              title="Go to Dashboard"
            >
              <img
                src="/microgenesis_logo.png"
                alt="Microgenesis Logo"
                className={`max-w-full shrink-0 object-contain transition duration-200 group-hover:opacity-90 ${adminMode ? 'h-7 sm:h-8' : 'h-8 brightness-0 invert sm:h-10'}`}
                referrerPolicy="no-referrer"
              />
            </button>
          </div>

          {/* Title Area */}
          <div className={`hidden sm:flex min-w-0 flex-1 items-center pl-6 ${adminMode ? 'gap-2 text-xs text-slate-400 dark:text-slate-500' : ''}`}>
            {adminMode && <>
              <button
                type="button"
                onClick={() => homePage && onPageChange(homePage.key)}
                aria-label="Go to Home"
                className="text-slate-400 dark:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                Workspace
              </button>
              <ChevronRight size={14} />
              <span className="text-slate-700 dark:text-slate-200" aria-current="page">{contentHeading}</span>
            </>}
          </div>
        </div>

        {/* Header Actions */}
        <div className={`flex shrink-0 items-center gap-0.5 px-1 min-[380px]:gap-1 min-[380px]:px-2 sm:gap-3 sm:px-4 ${adminMode ? 'text-slate-600 dark:text-slate-300' : ''}`}>
          {action}
        </div>
      </header>

      {/* Navigation for Smaller Screens: tap-to-open dropdown instead of a scrollable tab row */}
      <div className="sticky top-20 z-30 relative bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setIsMobileNavOpen((value) => !value)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-[#0063a9] transition dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300"
        >
          <span className="flex items-center gap-2.5">
            <ActiveIcon size={16} className="shrink-0" />
            <span className="truncate">{activePageItem?.label ?? 'Menu'}</span>
          </span>
          <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${isMobileNavOpen ? 'rotate-180' : ''}`} />
        </button>

        {isMobileNavOpen && (
          <>
            {/* Backdrop: closes the menu on outside tap, sits above content but below the menu itself */}
            <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setIsMobileNavOpen(false)} />
            <div className="absolute left-4 right-4 top-full mt-1.5 z-40 max-h-[70vh] overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-lg dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
              {pages.map((page) => {
                if (page.type === 'group') {
                  const GroupIcon = page.icon;
                  return (
                    <div key={page.id} className="py-1">
                      <div className="flex items-center gap-2 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <GroupIcon size={13} className="shrink-0" />
                        <span className="truncate">{page.label}</span>
                      </div>
                      {page.children.map((child) => {
                        const active = activePage === child.key;
                        return (
                          <button
                            key={child.key}
                            type="button"
                            disabled={child.disabled}
                            onClick={() => {
                              onPageChange(child.key);
                              setIsMobileNavOpen(false);
                            }}
                            title={child.disabled ? 'Access restricted by an administrator' : undefined}
                            className={`flex w-full items-center gap-2.5 py-2.5 pl-8 pr-3.5 text-left text-sm font-medium transition ${
                              child.disabled
                                ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                                : active
                                  ? 'bg-blue-50 text-[#0063a9] font-bold dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <span className="truncate">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                const Icon = page.icon;
                const active = activePage === page.key;
                return (
                  <button
                    key={page.key}
                    type="button"
                    disabled={page.disabled}
                    onClick={() => {
                      onPageChange(page.key);
                      setIsMobileNavOpen(false);
                    }}
                    title={page.disabled ? 'Access restricted by an administrator' : undefined}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-sm font-medium transition ${
                      page.disabled
                        ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                        : active
                          ? 'bg-blue-50 text-[#0063a9] font-bold dark:bg-blue-950/40 dark:text-blue-300'
                          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{page.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Main layout below header */}
      <div className="flex flex-1">
        {/* Sidebar - Below Header */}
        <div className={`relative sticky top-20 h-[calc(100vh-80px)] hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:block transition-all duration-300 shrink-0 ${isSidebarCollapsed ? 'w-16' : adminMode ? 'w-[264px]' : 'w-[220px]'}`}>
          {/* Toggle Sidebar Button on the right border - centered on the sidebar's
              own height (not a fixed pixel offset), so it stays vertically
              centered regardless of viewport height (1366x768, 1920x1080, etc). */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-30 h-7 w-7 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-md flex items-center justify-center text-slate-500 hover:text-[#0063a9] hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-105 transition-all cursor-pointer"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>

          <aside className={`h-full flex flex-col justify-between py-6 transition-all duration-300 ${isSidebarCollapsed ? 'px-2' : 'px-3'} overflow-hidden`}>
            <nav className="space-y-1 overflow-y-auto pr-1 flex-1">
              {navigationLabel && !isSidebarCollapsed && (
                <p className="px-3 pb-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{navigationLabel}</p>
              )}
              {pages.map((page) => {
                if (page.type === 'group') {
                  const GroupIcon = page.icon;
                  const isExpanded = expandedGroups.has(page.id);
                  const groupHasActiveChild = page.children.some((child) => child.key === activePage);

                  return (
                    <div key={page.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isSidebarCollapsed) setIsSidebarCollapsed(false);
                          toggleGroup(page.id);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                          groupHasActiveChild
                            ? 'text-[#0063a9] dark:text-blue-200 font-bold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                        } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                        title={isSidebarCollapsed ? page.label : undefined}
                      >
                        <GroupIcon size={18} className="shrink-0" />
                        {!isSidebarCollapsed && (
                          <span className="flex-1 flex items-center justify-between min-w-0">
                            <span className="truncate pr-1">{page.label}</span>
                            <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </span>
                        )}
                      </button>

                      {isExpanded && !isSidebarCollapsed && (
                        <div className="mt-1 mb-1.5 pl-4 space-y-0.5 border-l border-slate-100 dark:border-slate-800">
                          {page.children.map((child) => {
                            const active = activePage === child.key;
                            return (
                              <button
                                key={child.key}
                                type="button"
                                disabled={child.disabled}
                                onClick={() => onPageChange(child.key)}
                                title={child.disabled ? 'Access restricted by an administrator' : undefined}
                                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium transition ${
                                  child.disabled
                                    ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                                    : active
                                      ? 'bg-blue-50 text-[#0063a9] font-bold dark:bg-blue-950/60 dark:text-blue-200'
                                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <span className="truncate">{child.label}</span>
                                {child.badgeCount !== undefined && child.badgeCount > 0 && (
                                  <span className="ml-2 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm">
                                    {child.badgeCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const Icon = page.icon;
                const active = activePage === page.key;

                return (
                  <button
                    key={page.key}
                    type="button"
                    disabled={page.disabled}
                    onClick={() => onPageChange(page.key)}
                    title={page.disabled ? 'Access restricted by an administrator' : isSidebarCollapsed ? page.label : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                      page.disabled
                        ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                        : active
                          ? 'bg-blue-50 text-[#0063a9] dark:bg-blue-950/60 dark:text-blue-200 shadow-sm font-bold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                    } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                  >
                    <Icon size={18} className="shrink-0" />
                    {!isSidebarCollapsed && (
                      <span className="flex-1 flex items-center justify-between min-w-0">
                        <span className="truncate pr-1">{page.label}</span>
                        {page.badgeCount !== undefined && page.badgeCount > 0 && (
                          <span className="ml-2 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-white dark:ring-slate-950">
                            {page.badgeCount}
                          </span>
                        )}
                      </span>
                    )}
                    {isSidebarCollapsed && page.badgeCount !== undefined && page.badgeCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white dark:ring-slate-950">
                        {page.badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            {sidebarExtra && (
              <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                {sidebarExtra(isSidebarCollapsed)}
              </div>
            )}
          </aside>
        </div>

        {/* Page Content - Below Header */}
        <main className="min-w-0 flex-1 transition-colors duration-300 dark:bg-slate-900">
          <div className={`px-3 py-4 sm:px-4 sm:py-6 ${adminMode ? 'lg:px-10' : 'lg:px-8'}`}>
            {!hidePageHeading && (
              <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${compactPageHeader ? 'mb-3' : 'mb-6'}`}>
                <div className="min-w-0">
                  {showModuleContext && (
                    <p className="mb-1 break-words text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-xs">
                      {moduleLabel}
                    </p>
                  )}
                  <h2 className="break-words text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{contentHeading}</h2>
                </div>
                <div id="shell-header-action"></div>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
