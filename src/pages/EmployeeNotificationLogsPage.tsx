import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, Check, ChevronDown, ClipboardList } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../types/survey';
import { getEmployeePendingSurveys } from '../features/notifications/domain/employeeNotifications';
import {
  getReadIds,
  getDeletedIds,
  markNotificationRead,
  markNotificationUnread,
  markNotificationsRead,
  subscribeNotificationState,
} from '../features/notifications/services/employeeNotificationState';
import { StateMessage } from '../components/StateMessage';

interface EmployeeNotificationLogsPageProps {
  userEmail: string;
  profile: { department: string; designation: string; role: string } | null;
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  onFillForm: (surveyId: string, companyName?: string) => void;
}

export function EmployeeNotificationLogsPage({
  userEmail,
  profile,
  surveys,
  partnerCompanies,
  responses,
  onFillForm,
}: EmployeeNotificationLogsPageProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('unread');
  const [notificationVersion, forceTick] = useState(0);

  // Keep read state in sync with changes made from the notification bell.
  useEffect(() => subscribeNotificationState(() => forceTick((tick) => tick + 1)), []);

  const readIds = getReadIds(userEmail);
  const deletedIds = getDeletedIds(userEmail);

  const allNotifications = useMemo(
    () => getEmployeePendingSurveys(userEmail, profile, surveys, partnerCompanies, responses),
    [userEmail, profile, surveys, partnerCompanies, responses],
  );
  const notifications = useMemo(
    () => allNotifications.filter((item) => !deletedIds.has(item.id)),
    // The state service publishes changes rather than exposing a React store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allNotifications, deletedIds.size, notificationVersion],
  );
  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.has(item.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications, readIds.size, notificationVersion],
  );
  const readCount = notifications.length - unreadCount;
  const filtered = useMemo(
    () => notifications.filter((item) => {
      const isRead = readIds.has(item.id);
      return filter === 'all' || (filter === 'read' ? isRead : !isRead);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications, filter, notificationVersion],
  );

  const toggleExpanded = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    markNotificationRead(userEmail, id);
    setFilter('all');
    setExpandedId(id);
  };

  const emptyTitle = notifications.length === 0
    ? 'No pending evaluations'
    : filter === 'unread'
      ? 'No unread reminders'
      : 'No read reminders';
  const emptyMessage = notifications.length === 0
    ? 'You’re up to date with your assigned evaluations.'
    : filter === 'unread'
      ? 'You’re all caught up. You have no unread reminders; your read reminders are in the Read tab.'
      : 'You have not read any reminders yet.';

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
        <div className="inline-flex rounded-md bg-slate-100 p-1 dark:bg-slate-900" role="group" aria-label="Filter reminders">
          {([
            ['all', 'All', notifications.length],
            ['unread', 'Unread', unreadCount],
            ['read', 'Read', readCount],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded px-2.5 py-1.5 text-xs transition sm:px-3 ${filter === value ? 'bg-white font-semibold text-[#2187CD] shadow-sm dark:bg-slate-800' : 'font-medium text-slate-500 hover:text-[#2187CD] dark:text-slate-400 dark:hover:text-[#2187CD]'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            markNotificationsRead(userEmail, notifications.map((item) => item.id));
            setFilter('unread');
          }}
          disabled={unreadCount === 0}
          aria-label="Mark all reminders as read"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-[#2187CD] transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-sky-950/30"
        >
          <Check size={14} aria-hidden="true" />
          <span>Mark all read</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="py-6">
          <StateMessage title={emptyTitle} message={emptyMessage} />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((item) => {
            const isRead = readIds.has(item.id);
            const isExpanded = expandedId === item.id;
            const pendingCount = item.pendingCompanies.length;

            return (
              <li key={item.id} className="px-4 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/30 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isRead ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-sky-50 text-[#2187CD] dark:bg-sky-950/40'}`} aria-hidden="true">
                      <ClipboardList size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(item.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`reminder-companies-${item.id}`}
                          className={`text-left text-sm leading-5 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] ${isRead ? 'font-medium text-slate-700 dark:text-slate-200' : 'font-semibold text-slate-900 dark:text-white'}`}
                        >
                          {item.surveyTitle}
                        </button>
                        <span className="rounded border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-[#2187CD] dark:border-sky-900/60 dark:bg-sky-950/40">
                          {item.surveyType}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${isRead ? 'text-slate-400 dark:text-slate-500' : 'text-[#2187CD]'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-[#2187CD]'}`} aria-hidden="true" />
                          {isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 size={13} aria-hidden="true" />
                          {pendingCount} partner {pendingCount === 1 ? 'company' : 'companies'} to evaluate
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={13} aria-hidden="true" />
                          Due {item.deadlineDate}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`reminder-companies-${item.id}`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      {isExpanded ? 'Hide companies' : 'View companies'}
                      <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        markNotificationRead(userEmail, item.id);
                        onFillForm(item.surveyId);
                      }}
                      className="inline-flex items-center justify-center rounded-md bg-[#2187CD] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#176FAE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                    >
                      Start evaluation
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div id={`reminder-companies-${item.id}`} className="ml-12 mt-3 border-l-2 border-slate-100 pl-3 dark:border-slate-800 sm:ml-12">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Companies awaiting evaluation</p>
                      <button
                        type="button"
                        onClick={() => isRead ? markNotificationUnread(userEmail, item.id) : markNotificationRead(userEmail, item.id)}
                        className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[#2187CD] transition hover:bg-sky-50 dark:hover:bg-sky-950/30"
                        aria-label={`${isRead ? 'Mark as unread' : 'Mark as read'}: ${item.surveyTitle}`}
                      >
                        Mark as {isRead ? 'unread' : 'read'}
                      </button>
                    </div>
                    <ul className="grid max-h-36 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2" aria-label="Partner companies awaiting evaluation">
                      {item.pendingCompanies.map((company) => (
                        <li key={company.id} className="min-w-0 py-0.5">
                          <button
                            type="button"
                            onClick={() => onFillForm(item.surveyId, company.name)}
                            className="block max-w-full truncate text-left text-[#2187CD] transition hover:underline hover:underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD]"
                            title={`Start evaluation for ${company.name}`}
                          >
                            {company.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notifications.length > 0 && filtered.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:px-5">
          Showing {filtered.length} of {notifications.length} reminders.
        </p>
      )}
    </section>
  );
}
