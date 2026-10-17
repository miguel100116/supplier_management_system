import { useMemo, useState } from 'react';
import { Bell, Inbox, Search } from 'lucide-react';
import { ResponseNotification, SurveyType } from '../types/survey';
import { formatLogDate, formatLogTime, formatRelativeTime } from '../utils/time';
import { StateMessage } from '../components/StateMessage';
import { TableFilterBar } from '../components/TableFilterBar';
import { isWithinDateRange } from '../utils/tableFilters';

interface NotificationLogsPageProps {
  notifications: ResponseNotification[];
  unreadCount: number;
  unreadNotificationIds: ReadonlySet<string>;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkAllRead: () => void;
}

const surveyTypeOptions: Array<'All' | SurveyType> = ['All', 'Courier', 'Supplier', 'Subcontractor'];

const surveyTypeColors: Record<SurveyType, string> = {
  Courier: '#2563eb',
  Supplier: '#0f9f6e',
  Subcontractor: '#7c3aed',
};

export function NotificationLogsPage({
  notifications,
  unreadCount,
  unreadNotificationIds,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
}: NotificationLogsPageProps) {
  const [surveyType, setSurveyType] = useState<'All' | SurveyType>('All');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activityType, setActivityType] = useState<'all' | 'submission' | 'document'>('all');

  type SortField = 'submissionDate' | 'evaluationType' | 'company' | 'respondentEmail' | 'department' | 'designation';
  type SortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField>('submissionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const enriched = useMemo(
    () => notifications.map((item) => ({ ...item, isNew: unreadNotificationIds.has(item.id) })),
    [notifications, unreadNotificationIds],
  );

  const filtered = useMemo(() => {
    return enriched.filter((item) => {
      if (surveyType !== 'All' && item.surveyType !== surveyType) return false;
      if (!isWithinDateRange(item.submissionDate, dateFrom, dateTo)) return false;
      const isDocumentAlert = item.designation === 'Document Alert';
      if (activityType === 'document' && !isDocumentAlert) return false;
      if (activityType === 'submission' && isDocumentAlert) return false;

      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = `${item.company || ''} ${item.respondentEmail || ''} ${item.surveyType || ''} ${item.department || ''} ${item.designation || ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [enriched, surveyType, search, dateFrom, dateTo, activityType]);

  const sortedAndFiltered = useMemo(() => {
    const result = [...filtered];
    result.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'submissionDate') {
        valA = a.submissionDate || '';
        valB = b.submissionDate || '';
      } else if (sortField === 'evaluationType') {
        valA = a.surveyType || '';
        valB = b.surveyType || '';
      } else if (sortField === 'company') {
        valA = a.company || '';
        valB = b.company || '';
      } else if (sortField === 'respondentEmail') {
        valA = a.respondentEmail || '';
        valB = b.respondentEmail || '';
      } else if (sortField === 'department') {
        valA = a.department || '';
        valB = b.department || '';
      } else if (sortField === 'designation') {
        valA = a.designation || '';
        valB = b.designation || '';
      }

      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [filtered, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return notifications.filter((item) => item.submissionDate.slice(0, 10) === today).length;
  }, [notifications]);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total logged" value={notifications.length} icon={Bell} />
        <SummaryCard label="Unread" value={unreadCount} icon={Bell} accent="rose" />
        <SummaryCard label="Today" value={todayCount} icon={Bell} accent="green" />
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold">Activity log</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Every evaluation submission received, with details of each response.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented-control">
              {surveyTypeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={surveyType === option ? 'segmented-active' : ''}
                  onClick={() => setSurveyType(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0866B1] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
            >
              Mark all as read
            </button>
          </div>
        </div>

        <div className="mb-5">
          <label className="field-label">
            Search
            <div className="mt-1 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white pl-3 pr-3 transition focus-within:border-azure focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:ring-blue-950">
              <Search size={16} className="shrink-0 text-[#0866B1] dark:text-blue-300" />
              <span className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
              <input
                className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
                placeholder="Partner, respondent, department..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="mb-5">
          <TableFilterBar
            sortOptions={[
              { value: 'date-desc', label: 'Date: newest first' },
              { value: 'date-asc', label: 'Date: oldest first' },
              { value: 'company-asc', label: 'Partner: A–Z' },
              { value: 'company-desc', label: 'Partner: Z–A' },
            ]}
            sortValue={sortField === 'company' ? `partner-${sortOrder}` : `date-${sortOrder}`}
            onSortChange={(value) => {
              const [field, order] = value.split('-') as ['date' | 'company', SortOrder];
              setSortField(field === 'date' ? 'submissionDate' : 'company');
              setSortOrder(order);
            }}
            resultCount={sortedAndFiltered.length}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            dateLabel="Activity date"
            onReset={() => {
              setSearch('');
              setSurveyType('All');
              setActivityType('all');
              setDateFrom('');
              setDateTo('');
              setSortField('submissionDate');
              setSortOrder('desc');
            }}
          >
            <label className="min-w-[160px] flex-1 sm:flex-none">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Activity type</span>
              <select
                value={activityType}
                onChange={(event) => setActivityType(event.target.value as typeof activityType)}
                className="field !mt-0 w-full py-2 text-xs sm:w-[170px]"
              >
                <option value="all">All activity</option>
                <option value="submission">Evaluation submissions</option>
                <option value="document">Document alerts</option>
              </select>
            </label>
          </TableFilterBar>
        </div>

        {sortedAndFiltered.length === 0 ? (
          <StateMessage
            title="No notifications found"
            message={
              notifications.length === 0
                ? 'No evaluation responses have been logged yet.'
                : 'Try adjusting the filters or search to find what you\u2019re looking for.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition" onClick={() => handleSort('submissionDate')}>
                    <div className="flex items-center gap-1.5">
                      <span>Date &amp; Time</span>
                      {sortField === 'submissionDate' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-normal">↕</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition" onClick={() => handleSort('evaluationType')}>
                    <div className="flex items-center gap-1.5">
                      <span>Category</span>
                      {sortField === 'evaluationType' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-normal">↕</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition" onClick={() => handleSort('company')}>
                    <div className="flex items-center gap-1.5">
                      <span>Partner</span>
                      {sortField === 'company' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-normal">↕</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition" onClick={() => handleSort('respondentEmail')}>
                    <div className="flex items-center gap-1.5">
                      <span>Respondent</span>
                      {sortField === 'respondentEmail' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-normal">↕</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition" onClick={() => handleSort('department')}>
                    <div className="flex items-center gap-1.5">
                      <span>Department</span>
                      {sortField === 'department' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-normal">↕</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition" onClick={() => handleSort('designation')}>
                    <div className="flex items-center gap-1.5">
                      <span>Designation</span>
                      {sortField === 'designation' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-normal">↕</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedAndFiltered.map((item) => (
                  <tr key={item.id} className="align-middle hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap text-xs">
                          {formatLogDate(item.submissionDate)} {formatLogTime(item.submissionDate)}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                          {formatRelativeTime(item.submissionDate)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: surveyTypeColors[item.surveyType] }}
                        />
                        {item.surveyType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {item.isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="New" />}
                          <span className="font-bold text-slate-800 dark:text-slate-100">{item.company}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#0866B1] dark:text-blue-400">
                      {item.designation === 'Document Alert' ? '⚠️ SYSTEM ALERT' : item.respondentEmail}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-semibold text-xs">
                      {item.designation === 'Document Alert' ? (item.respondentType === 'Document Expired' ? 'Expired Document(s)' : 'Expiring Soon') : item.department}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                        item.designation === 'Document Alert'
                          ? (item.respondentType === 'Document Expired'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400')
                          : 'bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}>
                        {item.designation}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => (item.isNew ? onMarkRead(item.id) : onMarkUnread(item.id))}
                        className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0866B1] transition hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
                        aria-label={`${item.isNew ? 'Mark as read' : 'Mark as unread'}: ${item.company}`}
                      >
                        {item.isNew ? 'Mark as read' : 'Mark as unread'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notifications.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Showing {sortedAndFiltered.length} of {notifications.length} logged notifications.
          </p>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent = 'blue',
}: {
  label: string;
  value: number;
  icon: typeof Bell;
  accent?: 'blue' | 'rose' | 'green';
}) {
  const accentClasses = {
    blue: 'bg-blue-50 text-azure dark:bg-blue-950/60',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  }[accent];

  return (
    <article className="panel flex items-center gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accentClasses}`}>
        {value === 0 ? <Inbox size={20} /> : <Icon size={20} />}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </article>
  );
}
