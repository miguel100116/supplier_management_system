import { useMemo, useState } from 'react';
import { CalendarDays, Check, CheckCheck, ChevronDown, ChevronUp, ClipboardCheck, FileText, RotateCcw, Search } from 'lucide-react';
import { ResponseNotification, SurveyType } from '../types/survey';
import { formatLogDate, formatLogTime, formatRelativeTime } from '../utils/time';
import { StateMessage } from '../components/StateMessage';
import { isWithinDateRange } from '../utils/tableFilters';

interface AdminNotificationCenterProps {
  notifications: ResponseNotification[];
  unreadCount: number;
  unreadNotificationIds: ReadonlySet<string>;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkAllRead: () => void;
}

const surveyTypeOptions: Array<'All' | SurveyType> = ['All', 'Courier', 'Supplier', 'Subcontractor'];
type ReadFilter = 'all' | 'unread' | 'read';
type ActivityFilter = 'all' | 'submission' | 'document';
type SortField = 'submissionDate' | 'surveyType' | 'company' | 'respondentEmail' | 'department' | 'designation';
type SortOrder = 'asc' | 'desc';

const sortOptions: Array<{ value: SortField; label: string }> = [
  { value: 'submissionDate', label: 'Date and time' },
  { value: 'surveyType', label: 'Category' },
  { value: 'company', label: 'Company' },
  { value: 'respondentEmail', label: 'Respondent' },
  { value: 'department', label: 'Department' },
  { value: 'designation', label: 'Designation' },
];

const categoryClasses: Record<SurveyType, string> = {
  Courier: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  Supplier: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  Subcontractor: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
};

function isDocumentAlert(item: ResponseNotification) {
  return item.designation === 'Document Alert';
}

function documentAlertLabel(item: ResponseNotification): string {
  if (item.respondentType === 'Document Expired') return 'Expired';
  if (item.respondentType === 'Document For Update') return 'For update';
  if (item.documentDetails?.some((detail) => (detail.milestoneDays ?? 0) > 30)) return 'Early reminder';
  return 'Expiring soon';
}

function documentStatusClasses(item: ResponseNotification) {
  if (item.respondentType === 'Document Expired') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
  if (item.respondentType === 'Document For Update') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
  return 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
}

function formatDocumentDate(date?: string) {
  if (!date) return 'Date unavailable';
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString();
}

function detailLine(item: ResponseNotification) {
  if (isDocumentAlert(item)) return `${item.questionCount} document${item.questionCount === 1 ? '' : 's'} in this alert`;
  return `${item.questionCount} question${item.questionCount === 1 ? '' : 's'} answered`;
}

export function AdminNotificationCenter({
  notifications,
  unreadCount,
  unreadNotificationIds,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
}: AdminNotificationCenterProps) {
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [surveyType, setSurveyType] = useState<'All' | SurveyType>('All');
  const [activityType, setActivityType] = useState<ActivityFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('submissionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);

  const readCount = Math.max(0, notifications.length - unreadCount);
  const enriched = useMemo(
    () => notifications.map((item) => ({ ...item, isUnread: unreadNotificationIds.has(item.id) })),
    [notifications, unreadNotificationIds],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return enriched.filter((item) => {
      if (readFilter === 'unread' && !item.isUnread) return false;
      if (readFilter === 'read' && item.isUnread) return false;
      if (surveyType !== 'All' && item.surveyType !== surveyType) return false;
      if (!isWithinDateRange(item.submissionDate, dateFrom, dateTo)) return false;
      if (activityType === 'document' && !isDocumentAlert(item)) return false;
      if (activityType === 'submission' && isDocumentAlert(item)) return false;
      if (!needle) return true;

      const documentText = item.documentDetails?.map((detail) => `${detail.documentName} ${detail.branchCode ?? ''} ${detail.expiryDate ?? ''} ${detail.status}`).join(' ') ?? '';
      const haystack = `${item.company} ${item.respondentEmail ?? ''} ${item.respondentType} ${item.surveyType} ${item.department ?? ''} ${item.designation ?? ''} ${documentText}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [enriched, readFilter, surveyType, dateFrom, dateTo, activityType, search]);

  const sortedNotifications = useMemo(() => {
    const result = [...filtered];
    result.sort((a, b) => {
      const left = String(a[sortField] ?? '');
      const right = String(b[sortField] ?? '');
      const compared = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? compared : -compared;
    });
    return result;
  }, [filtered, sortField, sortOrder]);

  const hasActiveFilters = Boolean(search.trim() || surveyType !== 'All' || activityType !== 'all' || dateFrom || dateTo || sortField !== 'submissionDate' || sortOrder !== 'desc');
  const resetFilters = () => {
    setSearch('');
    setSurveyType('All');
    setActivityType('all');
    setDateFrom('');
    setDateTo('');
    setSortField('submissionDate');
    setSortOrder('desc');
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
        <div className="inline-flex max-w-full flex-wrap rounded-md bg-slate-100 p-1 dark:bg-slate-900" role="group" aria-label="Filter notifications by read status">
          {([
            ['all', 'All', notifications.length],
            ['unread', 'Unread', unreadCount],
            ['read', 'Read', readCount],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={readFilter === value}
              onClick={() => setReadFilter(value)}
              className={`rounded px-2.5 py-1.5 text-xs transition sm:px-3 ${readFilter === value ? 'bg-white font-semibold text-[#2187CD] shadow-sm dark:bg-slate-800' : 'font-medium text-slate-500 hover:text-[#2187CD] dark:text-slate-400 dark:hover:text-[#2187CD]'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          aria-label="Mark all notifications as read"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-[#2187CD] transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-sky-950/30"
        >
          <CheckCheck size={14} aria-hidden="true" />
          <span>Mark all read</span>
        </button>
      </div>

      <div className="space-y-3 border-b border-slate-100 p-3 dark:border-slate-800 sm:p-4">
        <label className="sr-only" htmlFor="admin-notification-search">Search notifications</label>
        <div className="flex min-h-11 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-[#2187CD] focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:ring-blue-950">
          <Search size={16} className="shrink-0 text-[#2187CD]" aria-hidden="true" />
          <input
            id="admin-notification-search"
            className="min-w-0 w-full bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
            placeholder="Search companies, respondents, or documents…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            Category
            <select value={surveyType} onChange={(event) => setSurveyType(event.target.value as 'All' | SurveyType)} className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-[#2187CD] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950">
              {surveyTypeOptions.map((option) => <option key={option} value={option}>{option === 'All' ? 'All categories' : option}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            Activity
            <select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityFilter)} className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-[#2187CD] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950">
              <option value="all">All activity</option>
              <option value="submission">Survey submissions</option>
              <option value="document">Document alerts</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            Sort by
            <span className="mt-1 flex min-w-0 gap-1.5">
              <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)} className="min-h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-[#2187CD] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950">
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setSortOrder((order) => order === 'asc' ? 'desc' : 'asc')}
                aria-label={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
                title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
                className="inline-flex min-h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#2187CD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {sortOrder === 'asc' ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
              </button>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[130px] flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" /> From</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} aria-label="Activity date from" className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-[#2187CD] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950" />
          </label>
          <label className="min-w-[130px] flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" /> To</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Activity date to" className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-[#2187CD] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950" />
          </label>
          {hasActiveFilters && <button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-[#2187CD] transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:hover:bg-sky-950/30"><RotateCcw size={13} aria-hidden="true" />Reset filters</button>}
        </div>
      </div>

      {sortedNotifications.length === 0 ? (
        <div className="px-4 py-8 sm:px-5">
          <StateMessage
            title={notifications.length === 0 ? 'No notifications yet' : 'No notifications found'}
            message={notifications.length === 0 ? 'Survey submissions and document alerts will appear here.' : 'Try changing your search or filters to find a notification.'}
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Notifications">
          {sortedNotifications.map((item) => {
            const isDocument = isDocumentAlert(item);
            const expanded = expandedDocumentId === item.id;
            const documents = item.documentDetails ?? [];
            return (
              <li key={item.id} className="px-4 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/30 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isDocument ? documentStatusClasses(item) : 'bg-sky-50 text-[#2187CD] dark:bg-sky-950/40'}`} aria-hidden="true">
                      {isDocument ? <FileText size={17} /> : <ClipboardCheck size={17} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className={`break-words text-sm leading-5 text-slate-900 dark:text-white ${item.isUnread ? 'font-semibold' : 'font-medium'}`}>{item.company || 'Company unavailable'}</h3>
                        <span className={`rounded border border-transparent px-1.5 py-0.5 text-[10px] font-medium leading-4 ${categoryClasses[item.surveyType]}`}>{item.surveyType}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${item.isUnread ? 'text-[#2187CD]' : 'text-slate-400 dark:text-slate-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${item.isUnread ? 'bg-[#2187CD]' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden="true" />
                          {item.isUnread ? 'Unread' : 'Read'}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {isDocument ? <span className={`font-semibold ${item.respondentType === 'Document Expired' ? 'text-rose-700 dark:text-rose-300' : item.respondentType === 'Document For Update' ? 'text-blue-700 dark:text-blue-300' : 'text-amber-800 dark:text-amber-300'}`}>{documentAlertLabel(item)}</span> : item.respondentType || 'Survey submission'}
                        {!isDocument && item.respondentEmail && <span className="font-normal text-slate-500 dark:text-slate-400"> · {item.respondentEmail}</span>}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {isDocument ? (
                          <span>{detailLine(item)}</span>
                        ) : (
                          <>
                            <span>{item.department || 'Department unavailable'}{item.designation ? ` · ${item.designation}` : ''}</span>
                            <span>{detailLine(item)}</span>
                          </>
                        )}
                      </div>

                      {isDocument && documents.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {(expanded ? documents : documents.slice(0, 2)).map((detail) => (
                            <p key={`${detail.branchId ?? detail.branchCode}-${detail.documentName}-${detail.expiryDate}`} className="break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                              <span className="font-medium text-slate-700 dark:text-slate-200">{detail.documentName}</span>
                              {detail.branchCode && ` · ${detail.branchCode}`}
                              {` · ${formatDocumentDate(detail.expiryDate)} · ${detail.status}`}
                              {typeof detail.daysLeft === 'number' && ` (${detail.daysLeft} days)`}
                              {detail.milestoneDays ? ` · ${detail.milestoneDays}-day reminder` : ''}
                            </p>
                          ))}
                          {documents.length > 2 && (
                            <button type="button" onClick={() => setExpandedDocumentId(expanded ? null : item.id)} aria-expanded={expanded} className="min-h-7 rounded px-1 text-xs font-medium text-[#2187CD] transition hover:bg-sky-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:hover:bg-sky-950/30">
                              {expanded ? 'Show fewer documents' : `View all ${documents.length} documents`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                    <time dateTime={item.submissionDate} className="flex flex-col text-left text-[11px] text-slate-500 dark:text-slate-400 sm:text-right">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{formatLogDate(item.submissionDate)} {formatLogTime(item.submissionDate)}</span>
                      <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{formatRelativeTime(item.submissionDate)}</span>
                    </time>
                    <button
                      type="button"
                      onClick={() => (item.isUnread ? onMarkRead(item.id) : onMarkUnread(item.id))}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-[#2187CD] transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:hover:bg-sky-950/30"
                      aria-label={`${item.isUnread ? 'Mark as read' : 'Mark as unread'}: ${item.company}`}
                    >
                      <Check size={14} aria-hidden="true" />
                      {item.isUnread ? 'Mark read' : 'Mark unread'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {notifications.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:px-5">
          Showing {sortedNotifications.length} of {notifications.length} notifications.
        </p>
      )}
    </section>
  );
}
