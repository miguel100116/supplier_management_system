import { LucideIcon, Menu, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';

interface NavChild<T extends string> {
  key: T;
  label: string;
  path: string;
  end?: boolean;
  badgeCount?: number;
  disabled?: boolean;
}

// A single clickable destination in the sidebar.
export interface NavLeaf<T extends string> {
  type?: 'link';
  key: T;
  label: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
  pinnedBottom?: boolean;
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
  path: string;
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
  currentPath: string;
  onPageChange: (page: T) => void;
  title: string;
  action: ReactNode;
  children: ReactNode;
  pageDescription?: string;
  breadcrumbs?: readonly { label: string; page?: T }[];
  compactPageHeader?: boolean;
  sidebarExtra?: (isCollapsed: boolean) => ReactNode;
}

// Flattens groups so we can look up the active item's label/icon regardless
// of whether it's a top-level link or nested inside a group.
function flattenPages<T extends string>(pages: NavItem<T>[]): { key: T; label: string; path: string; end?: boolean; icon: LucideIcon }[] {
  return pages.flatMap((page) =>
    page.type === 'group'
      ? page.children.map((child) => ({ key: child.key, label: child.label, path: child.path, end: child.end, icon: page.icon }))
      : [{ key: page.key, label: page.label, path: page.path, end: page.end, icon: page.icon }]
  );
}

const normalizePath = (path: string) => path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';

export function isNavigationPathActive(currentPath: string, itemPath: string, end = false) {
  const current = normalizePath(currentPath);
  const item = normalizePath(itemPath);
  return current === item || (!end && current.startsWith(`${item}/`));
}

export function Shell<T extends string>({
  pages,
  activePage,
  currentPath,
  onPageChange,
  title,
  action,
  children,
  pageDescription,
  breadcrumbs = [],
  compactPageHeader = false,
  sidebarExtra,
}: ShellProps<T>) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const flatPages = flattenPages(pages);
  const activePageItem = flatPages
    .filter((page) => isNavigationPathActive(currentPath, page.path, page.end))
    .sort((left, right) => normalizePath(right.path).length - normalizePath(left.path).length)[0]
    ?? flatPages.find((page) => page.key === activePage);
  const ActiveIcon = activePageItem?.icon ?? Menu;
  const mainPages = pages.filter((page) => page.type === 'group' || !page.pinnedBottom);
  const pinnedPages = pages.filter((page): page is NavLeaf<T> => page.type !== 'group' && page.pinnedBottom === true);

  // Auto-expand whichever group currently contains the active page, without
  // collapsing groups the user has already opened manually.
  useEffect(() => {
    const activeGroup = pages.find(
      (page): page is NavGroup<T> => page.type === 'group' && isNavigationPathActive(currentPath, page.path)
    );
    if (activeGroup) {
      setExpandedGroups((prev) => (prev.has(activeGroup.id) ? prev : new Set(prev).add(activeGroup.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    scrollModuleToTop();
  }, [activePage]);

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
      <header className="sticky top-0 z-40 h-20 border-b border-[#07528E] bg-[#0866B1] flex items-center justify-between w-full lg:pr-8 shadow-sm">
        <div className="flex items-center h-full flex-1 min-w-0">
          {/* Brand Box / Logo Area - Fixed Width, unaffected by collapsing */}
          <div className="relative z-10 flex h-full w-[92px] shrink-0 items-center justify-center bg-[#0866B1] px-2 min-[380px]:w-[116px] sm:w-[180px] sm:px-4 lg:w-[220px]">
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
                className="h-8 max-w-full shrink-0 object-contain brightness-0 invert transition duration-200 group-hover:opacity-90 sm:h-10"
                referrerPolicy="no-referrer"
              />
            </button>
          </div>

          {/* Title Area */}
          <div className="hidden sm:flex min-w-0 flex-1 items-center pl-6" />
        </div>

        {/* Header Actions */}
        <div className="flex shrink-0 items-center gap-0.5 px-1 min-[380px]:gap-1 min-[380px]:px-2 sm:gap-3 sm:px-4">
          {action}
        </div>
      </header>

      {/* Navigation for Smaller Screens: tap-to-open dropdown instead of a scrollable tab row */}
      <div className="sticky top-20 z-30 relative bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setIsMobileNavOpen((value) => !value)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-[#0866B1] transition dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300"
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
              {mainPages.map((page) => {
                if (page.type === 'group') {
                  const GroupIcon = page.icon;
                  const isExpanded = expandedGroups.has(page.id);
                  const groupIsActive = isNavigationPathActive(currentPath, page.path);
                  return (
                    <div key={page.id} className="py-1">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleGroup(page.id)}
                        className={`flex w-full items-center gap-2 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider ${groupIsActive ? 'text-[#0866B1] dark:text-blue-300' : 'text-slate-400 dark:text-slate-500'}`}
                      >
                        <GroupIcon size={13} className="shrink-0" />
                        <span className="flex-1 truncate text-left">{page.label}</span>
                        <ChevronDown size={13} className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && page.children.map((child) => {
                        const active = isNavigationPathActive(currentPath, child.path, child.end);
                        return (
                          <button
                            key={child.key}
                            type="button"
                            aria-current={active ? 'page' : undefined}
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
                                  ? 'bg-blue-50 text-[#0866B1] font-bold dark:bg-blue-950/40 dark:text-blue-300'
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
                const active = isNavigationPathActive(currentPath, page.path, page.end);
                return (
                  <button
                    key={page.key}
                    type="button"
                    aria-current={active ? 'page' : undefined}
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
                          ? 'bg-blue-50 text-[#0866B1] font-bold dark:bg-blue-950/40 dark:text-blue-300'
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
        <div className={`relative sticky top-20 h-[calc(100vh-80px)] hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:block transition-all duration-300 shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-[220px]'}`}>
          {/* Toggle Sidebar Button on the right border - centered on the sidebar's
              own height (not a fixed pixel offset), so it stays vertically
              centered regardless of viewport height (1366x768, 1920x1080, etc). */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-30 h-7 w-7 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-md flex items-center justify-center text-slate-500 hover:text-[#0866B1] hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-105 transition-all cursor-pointer"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>

          <aside className={`h-full flex flex-col justify-between py-6 transition-all duration-300 ${isSidebarCollapsed ? 'px-2' : 'px-3'} overflow-hidden`}>
            <nav aria-label="Primary navigation" className="space-y-1 overflow-y-auto pr-1 flex-1">
              {mainPages.map((page) => {
                if (page.type === 'group') {
                  const GroupIcon = page.icon;
                  const isExpanded = expandedGroups.has(page.id);
                  const groupHasActiveChild = isNavigationPathActive(currentPath, page.path);

                  return (
                    <div key={page.id}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => {
                          if (isSidebarCollapsed) setIsSidebarCollapsed(false);
                          toggleGroup(page.id);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                          groupHasActiveChild
                            ? 'text-[#0866B1] dark:text-blue-200 font-bold'
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
                            const active = isNavigationPathActive(currentPath, child.path, child.end);
                            return (
                              <button
                                key={child.key}
                                type="button"
                                aria-current={active ? 'page' : undefined}
                                disabled={child.disabled}
                                onClick={() => onPageChange(child.key)}
                                title={child.disabled ? 'Access restricted by an administrator' : undefined}
                                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium transition ${
                                  child.disabled
                                    ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                                    : active
                                      ? 'bg-blue-50 text-[#0866B1] font-bold dark:bg-blue-950/60 dark:text-blue-200'
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
                const active = isNavigationPathActive(currentPath, page.path, page.end);

                return (
                  <button
                    key={page.key}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    disabled={page.disabled}
                    onClick={() => onPageChange(page.key)}
                    title={page.disabled ? 'Access restricted by an administrator' : isSidebarCollapsed ? page.label : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                      page.disabled
                        ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                        : active
                          ? 'bg-blue-50 text-[#0866B1] dark:bg-blue-950/60 dark:text-blue-200 shadow-sm font-bold'
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
            {(pinnedPages.length > 0 || sidebarExtra) && (
              <div className="mt-auto space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800 shrink-0">
                <nav aria-label="Account navigation" className="space-y-1">
                  {pinnedPages.map((page) => {
                    const Icon = page.icon;
                    const active = isNavigationPathActive(currentPath, page.path, page.end);
                    return (
                      <button
                        key={page.key}
                        type="button"
                        disabled={page.disabled}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onPageChange(page.key)}
                        title={page.disabled ? 'Access restricted by an administrator' : isSidebarCollapsed ? page.label : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${active ? 'bg-blue-50 text-[#0866B1] dark:bg-blue-950/60 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'} ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                      >
                        <Icon size={18} className="shrink-0" />
                        {!isSidebarCollapsed && <span className="truncate">{page.label}</span>}
                      </button>
                    );
                  })}
                </nav>
                {sidebarExtra && <div className={pinnedPages.length > 0 ? 'pt-2' : ''}>{sidebarExtra(isSidebarCollapsed)}</div>}
              </div>
            )}
          </aside>
        </div>

        {/* Page Content - Below Header */}
        <main className="min-w-0 flex-1 transition-colors duration-300 dark:bg-slate-900">
          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${compactPageHeader ? 'mb-4' : 'mb-6'}`}>
              <div className="min-w-0">
                {breadcrumbs.length > 0 ? (
                  <nav aria-label="Breadcrumb" className="mb-1">
                    <ol className="flex flex-wrap items-center gap-1 text-[13px] text-text-secondary dark:text-slate-400">
                      {breadcrumbs.map((breadcrumb, index) => {
                        const isCurrent = index === breadcrumbs.length - 1;
                        return (
                          <li key={breadcrumb.label} className="flex min-w-0 items-center gap-1">
                            {index > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-slate-400" />}
                            {!isCurrent && breadcrumb.page ? (
                              <button
                                type="button"
                                onClick={() => onPageChange(breadcrumb.page as T)}
                                className="truncate rounded-sm font-medium text-text-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:text-slate-400 dark:hover:text-blue-300"
                              >
                                {breadcrumb.label}
                              </button>
                            ) : (
                              <span aria-current={isCurrent ? 'page' : undefined} className="truncate font-medium">
                                {breadcrumb.label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                ) : null}
                <h1 className="page-title break-words">{title}</h1>
                {pageDescription && (
                  <p className="mt-1 text-[13px] font-normal text-text-secondary dark:text-slate-400">
                    {pageDescription}
                  </p>
                )}
              </div>
              <div id="shell-header-action"></div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
