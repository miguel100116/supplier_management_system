import { useMemo } from 'react';
import { Award, CalendarClock, ClipboardCheck, LogOut, Mail, MapPin, Moon, Sun, User } from 'lucide-react';
import { SurveyResponse } from '../types/survey';

interface ProfilePageProps {
  email: string;
  role?: string;
  designation?: string;
  department?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  responses: SurveyResponse[];
  onViewAllSubmissions?: () => void;
}

export function ProfilePage({
  email,
  role,
  designation,
  department,
  darkMode,
  onToggleDarkMode,
  onLogout,
  responses,
  onViewAllSubmissions,
}: ProfilePageProps) {
  const initials = email
    .split('@')[0]
    .split('.')
    .map((name) => name[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'ME';

  const displayName = email
    .split('@')[0]
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const mySubmissions = useMemo(() => {
    const mine = responses.filter((r) => r.respondentEmail?.trim().toLowerCase() === email.trim().toLowerCase());
    const groups: Record<string, SurveyResponse[]> = {};
    mine.forEach((r) => {
      if (!groups[r.responseId]) groups[r.responseId] = [];
      groups[r.responseId].push(r);
    });
    return Object.values(groups).sort((a, b) => b[0].submissionDate.localeCompare(a[0].submissionDate));
  }, [responses, email]);

  const companiesCovered = useMemo(() => new Set(mySubmissions.map((s) => s[0].company)).size, [mySubmissions]);
  const lastSubmission = mySubmissions[0]?.[0]?.submissionDate;
  const recentSubmissions = mySubmissions.slice(0, 4);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section className="panel lg:col-span-2">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0866B1]/10 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300 font-bold text-lg">
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{displayName || 'User'}</h3>
            <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 truncate">
              <Mail size={13} className="shrink-0" />
              {email}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-500">
              <User size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{role === 'Admin' ? 'System Administrator' : 'Employee'}</p>
            </div>
          </div>
          {designation && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-500">
                <Award size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{designation}</p>
              </div>
            </div>
          )}
          {department && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-500">
                <MapPin size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Department</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{department}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel lg:col-span-2">
        <h3 className="text-base font-semibold mb-1">My Impact</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Your evaluation activity, at a glance.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Evaluations</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{mySubmissions.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partners Covered</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{companiesCovered}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Submission</p>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
              {lastSubmission ? new Date(lastSubmission).toLocaleDateString() : 'None yet'}
            </p>
          </div>
        </div>
      </section>

      <section className="panel lg:col-span-2">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold">Recent Submissions</h3>
          {onViewAllSubmissions && mySubmissions.length > 0 && (
            <button
              onClick={onViewAllSubmissions}
              type="button"
              className="text-xs font-bold text-[#0866B1] dark:text-blue-400 hover:underline cursor-pointer"
            >
              View all
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Your last few evaluations, newest first.</p>

        {recentSubmissions.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">You haven't submitted any evaluations yet.</p>
        ) : (
          <div className="space-y-2">
            {recentSubmissions.map((group) => {
              const head = group[0];
              return (
                <div
                  key={head.responseId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 dark:border-slate-800 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ClipboardCheck size={15} className="text-[#0866B1] dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{head.company}</p>
                      <p className="text-xs text-slate-400">{head.surveyType}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <CalendarClock size={12} />
                    {new Date(head.submissionDate).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold mb-1">Preferences</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Personal display settings for this device.</p>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon size={18} className="text-blue-400" /> : <Sun size={18} className="text-amber-500" />}
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dark Mode</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Switch the interface between light and dark themes.</p>
            </div>
          </div>
          <button
            onClick={onToggleDarkMode}
            type="button"
            role="switch"
            aria-checked={darkMode}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition cursor-pointer ${darkMode ? 'bg-[#0866B1]' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold mb-1">Session</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Sign out of the Supplier Management System on this device.</p>
        <button
          onClick={onLogout}
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </section>
    </div>
  );
}
