import { useEffect, useRef, useState } from 'react';
import { Bell, Inbox } from 'lucide-react';
import { ResponseNotification, SurveyType } from '../types/survey';
import { formatRelativeTime } from '../utils/time';

interface NotificationBellProps {
  notifications: ResponseNotification[];
  unreadCount: number;
  onOpen: () => void;
  onViewAll: () => void;
}

const surveyTypeColors: Record<SurveyType, string> = {
  Courier: '#2563eb',
  Supplier: '#0f9f6e',
  Subcontractor: '#7c3aed',
};

export function NotificationBell({ notifications, unreadCount, onOpen, onViewAll }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, forceTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep relative timestamps ("2m ago") fresh while the panel is open.
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => forceTick((tick) => tick + 1), 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

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
          isOpen ? 'bg-white/10 text-white' : 'text-blue-100 hover:text-white'
        }`}
        title="Recent activity"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0866B1] bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[calc(100vw-1rem)] max-w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Recent activity</p>
            <span className="text-xs text-slate-400 dark:text-slate-500">Live</span>
          </div>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Inbox size={22} className="text-slate-300 dark:text-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-500">No recent responses yet.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full animate-pulse"
                    style={{ backgroundColor: item.respondentType.includes('Document') ? (item.respondentType.includes('Expired') ? '#ef4444' : '#f59e0b') : surveyTypeColors[item.surveyType] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{item.company}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {item.surveyType} &middot; <span className={item.respondentType.includes('Document') ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>{item.respondentType}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 font-semibold italic truncate">
                      {item.respondentType.includes('Document')
                        ? (item.respondentType.includes('Expired')
                          ? `⚠️ ${item.questionCount} document${item.questionCount === 1 ? '' : 's'} EXPIRED. Please renew.`
                          : `⏳ ${item.questionCount} document${item.questionCount === 1 ? '' : 's'} expiring soon.`)
                        : (item.questionCount > 1
                          ? `Answered ${item.questionCount} questions`
                          : 'Answered 1 question')}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
                    {formatRelativeTime(item.submissionDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onViewAll();
            }}
            className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-azure transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
