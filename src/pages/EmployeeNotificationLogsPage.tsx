import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Inbox,
  ArrowLeft,
  Star,
  MoreVertical,
  CheckSquare,
  Award,
  Search,
  Clock,
  Trash2,
  X,
} from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../types/survey';
import { getEmployeePendingSurveys, EmployeeNotification } from '../utils/employeeNotifications';
import {
  getReadIds,
  getDeletedIds,
  markNotificationRead,
  markNotificationUnread,
  markNotificationsRead,
  deleteNotifications,
  subscribeNotificationState,
} from '../utils/employeeNotificationState';
import { StateMessage } from '../components/StateMessage';
import { getReminderFrequency } from '../utils/reminderSettings';

interface EmployeeNotificationLogsPageProps {
  userEmail: string;
  profile: { department: string; designation: string; role: string } | null;
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  onFillForm: (surveyId: string) => void;
}

export function EmployeeNotificationLogsPage({
  userEmail,
  profile,
  surveys,
  partnerCompanies,
  responses,
  onFillForm,
}: EmployeeNotificationLogsPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [, forceTick] = useState(0);

  // Re-render whenever read/deleted state changes anywhere (e.g. the header bell).
  useEffect(() => subscribeNotificationState(() => forceTick((t) => t + 1)), []);

  const readIds = getReadIds(userEmail);
  const deletedIds = getDeletedIds(userEmail);

  const allNotifications = useMemo(
    () => getEmployeePendingSurveys(userEmail, profile, surveys, partnerCompanies, responses),
    [userEmail, profile, surveys, partnerCompanies, responses],
  );

  const notifications = useMemo(
    () => allNotifications.filter((item) => !deletedIds.has(item.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allNotifications, deletedIds.size],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return notifications;
    const needle = search.trim().toLowerCase();
    return notifications.filter((item) =>
      `${item.surveyTitle} ${item.subject}`.toLowerCase().includes(needle),
    );
  }, [notifications, search]);

  const totalPendingCompanies = useMemo(
    () => notifications.reduce((sum, item) => sum + item.pendingCompanies.length, 0),
    [notifications],
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.has(item.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications, readIds.size],
  );

  const freqHours = getReminderFrequency();
  const frequencyLabel =
    freqHours === '4'
      ? '4 hours'
      : freqHours === '8'
      ? '8 hours'
      : freqHours === '12'
      ? '12 hours'
      : freqHours === '48'
      ? '48 hours (1 per 2 days)'
      : '24 hours (1 per day)';

  const selected = notifications.find((item) => item.id === selectedId) || null;

  const handleOpen = (id: string) => {
    markNotificationRead(userEmail, id);
    setSelectedId(id);
  };

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    deleteNotifications(userEmail, Array.from(checkedIds));
    setCheckedIds(new Set());
  };

  if (selected) {
    return (
      <MessageView
        notification={selected}
        userEmail={userEmail}
        onBack={() => setSelectedId(null)}
        onFillForm={onFillForm}
        frequencyLabel={frequencyLabel}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Pending reminders" value={notifications.length} icon={Mail} />
        <SummaryCard label="Partners to evaluate" value={totalPendingCompanies} icon={CheckSquare} accent="rose" />
        <SummaryCard label="Reminder frequency" value={frequencyLabel} icon={Clock} accent="green" />
      </section>

      <section className="panel overflow-hidden !p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-red-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Mgenesis Mail Inbox</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reminders for evaluations you still need to complete.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {unreadCount} unread
            </span>
            <button
              type="button"
              onClick={() => markNotificationsRead(userEmail, notifications.map((notification) => notification.id))}
              disabled={unreadCount === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0866B1] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
            >
              Mark all as read
            </button>
          </div>
        </div>

        {checkedIds.size > 0 ? (
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-blue-50/60 px-5 py-3 dark:border-slate-800 dark:bg-blue-950/20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCheckedIds(new Set())}
                className="cursor-pointer rounded-full p-1 text-slate-500 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                title="Clear selection"
              >
                <X size={15} />
              </button>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {checkedIds.size} selected
              </span>
            </div>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          </div>
        ) : (
          <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-azure focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:ring-blue-950">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
                placeholder="Search reminders..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-6">
            <StateMessage
              title={notifications.length === 0 ? 'Inbox is empty' : 'No reminders found'}
              message={
                notifications.length === 0
                  ? 'Amazing job! You have accomplished all assigned supplier evaluations.'
                  : 'Try adjusting your search to find what you\u2019re looking for.'
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((item) => {
              const isRead = readIds.has(item.id);
              const isChecked = checkedIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className={`flex w-full items-center gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/40 ${
                    isChecked ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <label
                    className="flex shrink-0 cursor-pointer items-center justify-center p-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecked(item.id)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#0866B1] focus:ring-blue-200 dark:border-slate-600"
                    />
                  </label>
                  <button type="button" onClick={() => handleOpen(item.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
                      M
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm text-slate-900 dark:text-white ${isRead ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-bold'}`}>
                          Microgenesis Administrator
                        </p>
                        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">Today</span>
                      </div>
                      <p className={`truncate text-sm ${isRead ? 'font-medium text-slate-500 dark:text-slate-400' : 'font-semibold text-red-600 dark:text-red-400'}`}>
                        {item.subject}: {item.surveyTitle}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {item.pendingCompanies.length} partner {item.pendingCompanies.length === 1 ? 'company' : 'companies'} still awaiting your evaluation &middot; Due {item.deadlineDate}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRead) markNotificationUnread(userEmail, item.id);
                      else markNotificationRead(userEmail, item.id);
                    }}
                    className="shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0866B1] transition hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
                    aria-label={`${isRead ? 'Mark as unread' : 'Mark as read'}: ${item.surveyTitle}`}
                  >
                    {isRead ? 'Mark as unread' : 'Mark as read'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {notifications.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Showing {filtered.length} of {notifications.length} pending reminders.
          </p>
        )}
      </section>
    </div>
  );
}

function MessageView({
  notification,
  userEmail,
  onBack,
  onFillForm,
  frequencyLabel,
}: {
  notification: EmployeeNotification;
  userEmail: string;
  onBack: () => void;
  onFillForm: (surveyId: string) => void;
  frequencyLabel: string;
}) {
  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="panel overflow-hidden !p-0">
      {/* Gmail Style Header Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-[#f2f6fc] px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer rounded-full p-1.5 text-slate-600 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Back to inbox"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
          <span className="rounded-sm bg-red-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-400">
            Inbox
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="cursor-pointer rounded-full p-1.5 text-amber-400 transition hover:bg-slate-200 dark:hover:bg-slate-800"
            title="Star message"
          >
            <Star size={16} fill="currentColor" />
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-full p-1.5 text-slate-600 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            title="More options"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Email Content Area */}
      <div className="space-y-6 p-6">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
          {notification.subject}: {notification.surveyTitle}
        </h2>

        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-base font-bold text-white shadow-sm">
              M
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Microgenesis Administrator</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">&lt;{notification.sender}&gt;</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">to me &lt;{userEmail}&gt;</p>
            </div>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">{formattedDate}, 10:00 AM</span>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <p className="font-semibold">Dear Employee,</p>

          <p>
            This is a system-generated reminder that you have pending supplier performance evaluations for:
            <span className="mt-1.5 block font-bold text-slate-900 dark:text-white">&bull; {notification.surveyTitle}</span>
          </p>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="mb-2 flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <CheckSquare size={14} className="text-[#0866B1] dark:text-blue-400" />
              <span>Remaining Partners to Evaluate ({notification.pendingCompanies.length}):</span>
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {notification.pendingCompanies.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold dark:border-slate-800 dark:bg-slate-950"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0866B1]" />
                  <span className="truncate">{c.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <p>
            Please accomplish this evaluation on or before{' '}
            <span className="font-black text-rose-600 underline dark:text-rose-400">{notification.deadlineDate}</span>. Your
            direct feedback is crucial to evaluate our supply chain logistics, product quality, and partner adherence to
            SLAs.
          </p>

          <div className="my-4 border-t border-dashed border-slate-200 dark:border-slate-800" />

          <div className="rounded-lg border border-amber-200/50 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/10 dark:text-amber-400">
            <span className="font-bold">Automated Notification System:</span> This reminder is automatically dispatched{' '}
            <span className="font-bold">every {frequencyLabel}</span> in accordance with administrative policy, and will
            continue until all partners under this evaluation have been fully evaluated.
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={() => onFillForm(notification.surveyId)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0866B1] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#07528E] hover:shadow-lg sm:w-auto"
            >
              <Award size={16} />
              <span>Start Evaluation Now</span>
            </button>
          </div>
        </div>

        <div className="space-y-1 border-t border-slate-100 pt-6 text-xs text-slate-400 dark:border-slate-900 dark:text-slate-500">
          <p className="font-bold text-slate-500 dark:text-slate-400">Supplier Management System Admin</p>
          <p>Microgenesis Business Solutions</p>
          <p className="italic">Please do not reply directly to this mail. If you have any inquiries, contact support.</p>
        </div>
      </div>
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
  value: number | string;
  icon: typeof Mail;
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
