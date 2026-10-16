import { useState, useRef, useEffect } from 'react';
import { LogOut, User, ChevronDown, Award, MapPin, Settings } from 'lucide-react';

interface AccountMenuProps {
  email: string;
  designation?: string;
  department?: string;
  role?: string;
  onOpenSettings: () => void;
  onLogout: () => void;
}


export function AccountMenu({ email, designation, department, role, onOpenSettings, onLogout }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const initials = email
    .split('@')[0]
    .split('.')
    .map((name) => name[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'AD';

  return (
    <div className="relative" ref={menuRef} id="account-menu-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-lg border border-blue-400/25 bg-[#07528E]/40 px-1.5 py-1.5 text-sm font-medium text-white outline-none transition hover:bg-[#07528E]/60 min-[380px]:gap-2 min-[380px]:px-2 sm:px-3 cursor-pointer animate-fade-in"
        type="button"
        id="account-menu-trigger"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[#0866B1] font-bold text-xs shadow-sm shrink-0">
          {initials}
        </div>
        <span className="hidden md:inline truncate max-w-28 text-blue-100 group-hover:text-white">
          {email}
        </span>
        <ChevronDown size={14} className={`text-blue-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-64 origin-top-right rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none dark:border-slate-800 dark:bg-slate-950 animate-in fade-in slide-in-from-top-1 duration-150"
          id="account-menu-dropdown"
        >
          <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Account Session</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5" title={email}>
              {email}
            </p>
          </div>
          
          <div className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex flex-col gap-2 px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <User size={13} className="text-[#0866B1] dark:text-blue-400" />
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {role === 'Admin' ? 'System Administrator' : 'Employee Access'}
                </span>
              </div>
              {designation && (
                <div className="flex items-center gap-2 pl-5">
                  <Award size={12} className="text-slate-400" />
                  <span>Designation: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{designation}</strong></span>
                </div>
              )}
              {department && (
                <div className="flex items-center gap-2 pl-5">
                  <MapPin size={12} className="text-slate-400" />
                  <span>Department: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{department}</strong></span>
                </div>
              )}
            </div>
            
            <div className="pt-1.5 pb-0.5">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900 cursor-pointer"
                type="button"
                id="settings-button"
              >
                <Settings size={15} />
                <span>Settings</span>
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 transition cursor-pointer"
                type="button"
                id="logout-button"
              >
                <LogOut size={15} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
