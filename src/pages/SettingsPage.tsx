import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Building2,
  ClipboardList,
  Download,
  History,
  LogOut,
  Mail,
  MapPin,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  UserCog,
  Users,
} from 'lucide-react';
import { getAdminActivity } from '../utils/adminActivityLog';
import { getExportHistory } from '../utils/exportHistory';

interface SettingsPageProps {
  email: string;
  role?: string;
  designation?: string;
  department?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onResetSystemData: () => void;
  onLogout: () => void;
  accountsCount: number;
  activePartnerCompaniesCount: number;
  totalResponsesCount: number;
}

interface ActivityRow {
  id: string;
  label: string;
  detail?: string;
  timestamp: string;
  kind: 'reset' | 'accounts' | 'export';
}

export function SettingsPage({
  email,
  role,
  designation,
  department,
  darkMode,
  onToggleDarkMode,
  onResetSystemData,
  onLogout,
  accountsCount,
  activePartnerCompaniesCount,
  totalResponsesCount,
}: SettingsPageProps) {
  const initials = email
    .split('@')[0]
    .split('.')
    .map((name) => name[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'AD';

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener('admin-activity-updated', refresh);
    window.addEventListener('export-history-updated', refresh);
    return () => {
      window.removeEventListener('admin-activity-updated', refresh);
      window.removeEventListener('export-history-updated', refresh);
    };
  }, []);

  const activity = useMemo<ActivityRow[]>(() => {
    const adminRows: ActivityRow[] = getAdminActivity().map((a) => ({
      id: a.id,
      label: a.action,
      detail: a.details,
      timestamp: a.timestamp,
      kind: a.action.toLowerCase().includes('reset') ? 'reset' : 'accounts',
    }));
    const exportRows: ActivityRow[] = getExportHistory().map((e) => ({
      id: e.id,
      label: `Exported "${e.title}"`,
      detail: e.filename,
      timestamp: e.exportedAt,
      kind: 'export',
    }));
    return [...adminRows, ...exportRows].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const lastReset = useMemo(() => getAdminActivity().find((a) => a.action.toLowerCase().includes('reset')), [tick]);

  const activityIcon = (kind: ActivityRow['kind']) => {
    if (kind === 'reset') return <RotateCcw size={15} className="text-rose-500 shrink-0" />;
    if (kind === 'export') return <Download size={15} className="text-[#0866B1] dark:text-blue-400 shrink-0" />;
    return <UserCog size={15} className="text-emerald-500 shrink-0" />;
  };

  return (
    <div className="space-y-5">
      <section className="panel">
        <h3 className="text-base font-semibold mb-1">System Snapshot</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">A quick read on the state of the system right now.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Users size={13} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Accounts</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{accountsCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Building2 size={13} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Active Partners</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{activePartnerCompaniesCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <ClipboardList size={13} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Responses Logged</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{totalResponsesCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <RotateCcw size={13} />
              <p className="text-[10px] font-bold uppercase tracking-wider">Last Reset</p>
            </div>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
              {lastReset ? new Date(lastReset.timestamp).toLocaleDateString() : 'Never'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section className="panel">
        <h3 className="text-base font-semibold mb-1">Account</h3>
        <div className="mt-3 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0866B1]/10 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300 font-bold">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
              <Mail size={13} className="shrink-0" />
              {email}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{role === 'Admin' ? 'System Administrator' : 'Employee'}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          {designation && (
            <div className="flex items-center gap-2.5">
              <Award size={15} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Designation: <strong className="text-slate-800 dark:text-slate-200">{designation}</strong></span>
            </div>
          )}
          {department && (
            <div className="flex items-center gap-2.5">
              <MapPin size={15} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Department: <strong className="text-slate-800 dark:text-slate-200">{department}</strong></span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold mb-1">Appearance</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Applies to everyone using this browser session.</p>
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

      <section className="panel xl:col-span-2">
        <h3 className="text-base font-semibold mb-1">System Tools</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Administrative data-management tools.</p>

        <div className="space-y-3">
          <button
            onClick={onResetSystemData}
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-rose-200 dark:border-rose-900/50 px-4 py-3 text-left hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="text-rose-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Clear Local Cache</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Clear cached frontend records and reload shared data.</p>
              </div>
            </div>
          </button>
        </div>
      </section>

      <section className="panel xl:col-span-2">
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

      <section className="panel">
        <div className="flex items-center gap-2 mb-1">
          <History size={16} className="text-[#0866B1] dark:text-blue-400" />
          <h3 className="text-base font-semibold">Recent Activity</h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          The last database resets, account changes, and exports on this device.
        </p>

        {activity.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No admin activity logged yet.</p>
        ) : (
          <div className="space-y-1.5">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {activityIcon(item.kind)}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">{item.label}</p>
                    {item.detail && <p className="text-xs text-slate-400 truncate">{item.detail}</p>}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{new Date(item.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
