import { useState, useEffect, useRef } from 'react';
import { Bell, Mail, ArrowLeft, X, CornerUpLeft, MoreVertical, Star, Inbox, CheckSquare, Award } from 'lucide-react';
import { CustomForm, PartnerCompany, SurveyResponse } from '../types/survey';
import { getEmployeePendingSurveys, EmployeeNotification } from '../utils/employeeNotifications';
import {
  getReadIds,
  getDeletedIds,
  markNotificationRead,
  subscribeNotificationState,
} from '../utils/employeeNotificationState';
import { getReminderFrequency } from '../utils/reminderSettings';
import { useModalEscape } from '../hooks/useModalEscape';

interface EmployeeNotificationBellProps {
  userEmail: string;
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  onFillForm: (surveyId: string) => void;
  onViewAll?: () => void;
  variant?: 'header' | 'sidebar';
  isSidebarCollapsed?: boolean;
}

export function EmployeeNotificationBell({
  userEmail,
  surveys,
  partnerCompanies,
  responses,
  onFillForm,
  onViewAll,
  variant = 'header',
  isSidebarCollapsed = false,
}: EmployeeNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<EmployeeNotification | null>(null);
  useModalEscape(Boolean(selectedNotification), () => setSelectedNotification(null), 10);
  useModalEscape(isOpen, () => setIsOpen(false), 0, false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, forceTick] = useState(0);

  // Re-render whenever read/deleted state changes anywhere (e.g. the Survey Reminders page).
  useEffect(() => subscribeNotificationState(() => forceTick((t) => t + 1)), []);

  // Compute pending surveys dynamically
  // To get the user profile structure for matching permissions, we retrieve accounts or create a fallback
  const userAccountsSaved = localStorage.getItem('survey_accounts_v1');
  let matchedProfile = { role: 'Employee', department: 'Logistics', designation: 'Rank & File' };
  if (userAccountsSaved) {
    try {
      const accounts = JSON.parse(userAccountsSaved);
      const found = accounts.find((a: any) => a.email.trim().toLowerCase() === userEmail.trim().toLowerCase());
      if (found) {
        matchedProfile = found;
      }
    } catch (e) {
      // Use fallback
    }
  }

  const deletedIds = getDeletedIds(userEmail);
  const readIds = getReadIds(userEmail);

  const notifications = getEmployeePendingSurveys(
    userEmail,
    matchedProfile,
    surveys,
    partnerCompanies,
    responses
  ).filter((item) => !deletedIds.has(item.id));

  const unreadCount = notifications.filter((item) => !readIds.has(item.id)).length;

  // Retrieve admin notification frequency configuration from localStorage
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

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelectNotification = (notif: EmployeeNotification) => {
    markNotificationRead(userEmail, notif.id);
    setSelectedNotification(notif);
    setIsOpen(false);
  };

  const handleStartSurvey = (surveyId: string) => {
    setSelectedNotification(null);
    onFillForm(surveyId);
  };

  // 1. Render for Collapsed Sidebar
  if (variant === 'sidebar' && isSidebarCollapsed) {
    return (
      <div className="relative flex justify-center py-2" ref={dropdownRef}>
        <button
          type="button"
          onClick={handleToggle}
          className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition cursor-pointer ${
            isOpen
              ? 'bg-blue-50 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-white'
          }`}
          title={`Reminders (${unreadCount} unread)`}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold leading-none text-white dark:border-slate-950">
              {unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute left-12 bottom-0 w-80 rounded-xl border border-slate-200 bg-white shadow-panel z-50 overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            {renderDropdownContent()}
          </div>
        )}

        {selectedNotification && renderGmailModal()}
      </div>
    );
  }

  // 2. Render for Expanded Sidebar
  if (variant === 'sidebar') {
    return (
      <div className="relative px-3 py-2" ref={dropdownRef}>
        <button
          type="button"
          onClick={handleToggle}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition cursor-pointer ${
            isOpen
              ? 'bg-blue-50 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300 font-bold'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-3">
            <Bell size={18} />
            <span>Evaluation Reminders</span>
          </span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute left-3 bottom-12 w-80 rounded-xl border border-slate-200 bg-white shadow-panel z-50 overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            {renderDropdownContent()}
          </div>
        )}

        {selectedNotification && renderGmailModal()}
      </div>
    );
  }

  // 3. Render for Header (Default)
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition cursor-pointer ${
          isOpen ? 'bg-white/10 text-white' : 'text-blue-100 hover:text-white'
        }`}
        title="Pending Evaluation Reminders"
        id="btn-employee-bell"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0866B1] bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1rem)] max-w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900">
          {renderDropdownContent()}
        </div>
      )}

      {selectedNotification && renderGmailModal()}
    </div>
  );

  // Reusable dropdown content render
  function renderDropdownContent() {
    return (
      <>
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800">
          <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Mail size={15} className="text-red-500" />
            <span>Mgenesis Mail Inbox</span>
          </p>
          <span className="rounded-full bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 text-[10px] font-black text-red-600 dark:text-red-400">
            {unreadCount} reminders
          </span>
        </div>

        {unreadCount === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center bg-white dark:bg-slate-900">
            <Inbox size={22} className="text-slate-300 dark:text-slate-700" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Inbox is empty</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Amazing job! You have accomplished all assigned supplier evaluations.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {notifications.map((item) => {
              const isRead = readIds.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectNotification(item)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-500">
                      <Mail size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`truncate text-xs text-slate-900 dark:text-white ${isRead ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-bold'}`}>
                          {item.sender}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                          Today
                        </span>
                      </div>
                      <p className={`truncate text-xs mt-0.5 ${isRead ? 'font-medium text-slate-500 dark:text-slate-400' : 'font-semibold text-red-600 dark:text-red-400'}`}>
                        {item.subject}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {item.surveyTitle} ({item.pendingCompanies.length} pending)
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {onViewAll && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onViewAll();
            }}
            className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-azure transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
          >
            View all reminders
          </button>
        )}
      </>
    );
  }

  // Reusable Gmail Modal render
  function renderGmailModal() {
    if (!selectedNotification) return null;

    const formattedDate = new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          {/* Gmail Style Header Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#f2f6fc] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-600 dark:text-slate-300 cursor-pointer"
                title="Back to inbox"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
              <span className="text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 px-2 py-0.5 rounded-sm uppercase tracking-wide">
                Inbox
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-amber-400 cursor-pointer"
                title="Star message"
              >
                <Star size={16} fill="currentColor" />
              </button>
              <button
                type="button"
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-600 dark:text-slate-300 cursor-pointer"
                title="More options"
              >
                <MoreVertical size={16} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-600 dark:text-slate-300 cursor-pointer ml-1"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Email Content Area */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* Subject Line */}
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span>{selectedNotification.subject}: {selectedNotification.surveyTitle}</span>
              </h2>
            </div>

            {/* Sender and Recipient Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-900 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                  M
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      Microgenesis Administrator
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      &lt;{selectedNotification.sender}&gt;
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    to me &lt;{userEmail}&gt;
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {formattedDate}, 10:00 AM
              </span>
            </div>

            {/* Email Message Body */}
            <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-4">
              <p className="font-semibold">Dear Employee,</p>

              <p>
                This is a system-generated reminder that you have pending supplier performance evaluations for:
                <span className="font-bold block mt-1.5 text-slate-900 dark:text-white">
                  &bull; {selectedNotification.surveyTitle}
                </span>
              </p>

              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                <p className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                  <CheckSquare size={14} className="text-[#0866B1] dark:text-blue-400" />
                  <span>Remaining Partners to Evaluate ({selectedNotification.pendingCompanies.length}):</span>
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedNotification.pendingCompanies.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0866B1]" />
                      <span className="truncate">{c.name}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p>
                Please accomplish this evaluation on or before{' '}
                <span className="font-black text-rose-600 dark:text-rose-400 underline">
                  {selectedNotification.deadlineDate}
                </span>
                . Your direct feedback is crucial to evaluate our supply chain logistics, product quality, and partner adherence to SLAs.
              </p>

              <div className="border-t border-dashed border-slate-200 dark:border-slate-800 my-4" />

              {/* Dynamic Notification Frequency Note */}
              <div className="bg-amber-50/60 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-400">
                <span className="font-bold">Automated Notification System:</span> This reminder is automatically dispatched{' '}
                <span className="font-bold">every {frequencyLabel}</span> in accordance with administrative policy, and will continue until all partners under this evaluation have been fully evaluated.
              </div>

              {/* Call to Action */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleStartSurvey(selectedNotification.surveyId)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-[#0866B1] hover:bg-[#07528E] text-white font-bold py-3 px-6 shadow-md hover:shadow-lg transition cursor-pointer text-sm"
                >
                  <Award size={16} />
                  <span>Start Evaluation Now</span>
                </button>
              </div>
            </div>

            {/* Email Footer / Signature */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-900 text-xs text-slate-400 dark:text-slate-500 space-y-1">
              <p className="font-bold text-slate-500 dark:text-slate-400">
                Supplier Management System Admin
              </p>
              <p>Microgenesis Business Solutions</p>
              <p className="italic">
                Please do not reply directly to this mail. If you have any inquiries, contact support.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
