import { useEffect, useRef, useState } from 'react';
import { Bell, ClipboardCheck, FileText, Inbox } from 'lucide-react';
import { ResponseNotification } from '../../../types/survey';
import { formatRelativeTime } from '../../../utils/time';
import { useModalEscape } from '../../../hooks/useModalEscape';

interface NotificationBellProps {
  notifications: ResponseNotification[];
  unreadCount: number;
  unreadNotificationIds: ReadonlySet<string>;
  onOpen: () => void;
  onViewAll: () => void;
  appearance?: 'brand' | 'neutral';
}

function documentAlertLabel(item: ResponseNotification): string {
  if (item.respondentType === 'Document Expired') return 'Expired';
  if (item.respondentType === 'Document For Update') return 'For update';
  if (item.documentDetails?.some((detail) => (detail.milestoneDays ?? 0) > 30)) return 'Early reminder';
  return 'Expiring soon';
}

function formatExpiryDate(date?: string): string {
  if (!date) return 'date unavailable';
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'date unavailable' : parsed.toLocaleDateString();
}

export function NotificationBell({ notifications, unreadCount, unreadNotificationIds, onOpen, onViewAll, appearance = 'brand' }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, forceTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => forceTick((tick) => tick + 1), 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useModalEscape(isOpen, () => setIsOpen(false), 0, false);

  const handleToggle = () => {
    setIsOpen((value) => {
      const next = !value;
      if (next) onOpen();
      return next;
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition cursor-pointer ${
          appearance === 'neutral'
            ? isOpen ? 'bg-slate-100 text-[#0063a9] dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            : isOpen ? 'bg-white/10 text-white' : 'text-blue-100 hover:text-white'
        }`}
        title="Recent activity"
        aria-label={`Recent activity${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-controls="admin-notification-dropdown"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 ${appearance === 'neutral' ? 'border-white dark:border-slate-950' : 'border-[#0063a9]'} bg-rose-500 px-1 text-[10px] font-bold leading-none text-white`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div id="admin-notification-dropdown" className="fixed inset-x-2 top-16 z-50 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(400px,calc(100vw-1rem))] dark:border-slate-800 dark:bg-slate-900" role="region" aria-label="Recent activity">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-white">
              <Bell size={16} className="text-[#2187CD]" aria-hidden="true" />
              <span>Recent activity</span>
            </p>
            <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-medium text-[#2187CD] dark:bg-blue-950/50">{unreadCount} unread</span>
          </div>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 bg-white px-5 py-8 text-center dark:bg-slate-900">
              <Inbox size={22} className="text-slate-300 dark:text-slate-700" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">You’re all caught up</p>
              <p className="max-w-[260px] text-xs leading-5 text-slate-500 dark:text-slate-400">New survey submissions and document alerts will appear here.</p>
            </div>
          ) : (
            <ul className="max-h-[min(26rem,65vh)] overflow-y-auto divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {notifications.slice(0, 6).map((item) => {
                const isDocumentAlert = item.designation === 'Document Alert';
                const isUnread = unreadNotificationIds.has(item.id);
                const alertClass = item.respondentType === 'Document Expired'
                  ? 'text-rose-600 dark:text-rose-400'
                  : item.respondentType === 'Document For Update'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-amber-700 dark:text-amber-400';
                const iconClass = isDocumentAlert
                  ? item.respondentType === 'Document Expired'
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400'
                    : item.respondentType === 'Document For Update'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                  : 'bg-blue-50 text-[#2187CD] dark:bg-blue-950/40';
                const firstDocument = item.documentDetails?.[0];
                const supportingDetail = isDocumentAlert
                  ? firstDocument
                    ? `${firstDocument.documentName}${firstDocument.branchCode ? ` · ${firstDocument.branchCode}` : ''} · ${formatExpiryDate(firstDocument.expiryDate)} (${firstDocument.status.toLowerCase()})`
                    : `${item.questionCount} document${item.questionCount === 1 ? '' : 's'}`
                  : `${item.respondentEmail || 'Respondent unavailable'}${item.department ? ` · ${item.department}` : ''}`;

                return (
                  <li key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${iconClass}`} aria-hidden="true">
                        {isDocumentAlert ? <FileText size={15} /> : <ClipboardCheck size={15} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`min-w-0 break-words text-sm leading-5 text-slate-800 dark:text-slate-100 ${isUnread ? 'font-semibold' : 'font-medium'}`}>{item.company}</p>
                          <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-400 dark:text-slate-500">{formatRelativeTime(item.submissionDate)}</span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{item.surveyType}</span><span aria-hidden="true">·</span>
                          <span className={isDocumentAlert ? `font-medium ${alertClass}` : ''}>{isDocumentAlert ? documentAlertLabel(item) : item.respondentType || 'Survey submission'}</span>
                          {isUnread && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#2187CD]" title="Unread" aria-label="Unread" />}
                        </p>
                        <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {supportingDetail}
                          {isDocumentAlert && item.documentDetails && item.documentDetails.length > 1 && ` · +${item.documentDetails.length - 1} more document${item.documentDetails.length === 2 ? '' : 's'}`}
                          {!isDocumentAlert && ` · ${item.questionCount} question${item.questionCount === 1 ? '' : 's'} answered`}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onViewAll();
            }}
            className="w-full border-t border-slate-100 px-4 py-3 text-center text-xs font-medium text-[#2187CD] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2187CD] dark:border-slate-800 dark:hover:bg-slate-900/60"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
