import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Building2,
  ClipboardList,
  LogOut,
  Mail,
  MapPin,
  Moon,
  RotateCcw,
  Sun,
  Users,
} from 'lucide-react';
import { getAdminActivity } from '../features/account-management/services/adminActivityLog';

interface SettingsPageProps {
  modalLayout?: boolean;
  email: string;
  role?: string;
  designation?: string;
  department?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  accountsCount: number;
  activePartnerCompaniesCount: number;
  totalResponsesCount: number;
}

export function SettingsPage({
  modalLayout = false,
  email,
  role,
  designation,
  department,
  darkMode,
  onToggleDarkMode,
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
    return () => {
      window.removeEventListener('admin-activity-updated', refresh);
    };
  }, []);

  const lastReset = useMemo(() => getAdminActivity().find((a) => a.action.toLowerCase().includes('reset')), [tick]);

  return (
    <div className={modalLayout ? 'admin-settings-modal-content' : 'space-y-5'}>
      <section className="panel">
        <h3 className="text-base font-semibold mb-1">System Snapshot</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">A quick read on the state of the system right now.</p>
        <div className="settings-snapshot-grid grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <p className="text-[10px] font-bold uppercase tracking-wider">Counted Forms</p>
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

      <div className="settings-modal-groups grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section className="panel">
        <h3 className="text-base font-semibold mb-1">Account</h3>
        <div className="settings-account-identity mt-3 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0063a9]/10 text-[#0063a9] dark:bg-blue-950/40 dark:text-blue-300 font-bold">
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
        <div className="settings-account-details mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 pt-4 border-t border-slate-100 dark:border-slate-800">
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
        <div className="settings-appearance-row flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
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
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition cursor-pointer ${darkMode ? 'bg-[#0063a9]' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
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

    </div>
  );
}
