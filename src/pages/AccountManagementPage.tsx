import React, { useState, useMemo, useEffect } from 'react';
import { Shield, Search, Plus, Mail, Briefcase, Trash2, Edit2, AlertCircle, RotateCcw, Check, CheckSquare, Square } from 'lucide-react';
import type { AccountProfile } from '../App';
import { PageModuleKey, getDefaultPermissions, getDepartmentDefaultPermissions } from '../utils/rbac';
import { SurveyType } from '../types/survey';
import { TableFilterBar } from '../components/TableFilterBar';
import { compareText } from '../utils/tableFilters';
import { useModalEscape } from '../hooks/useModalEscape';

interface AccountManagementPageProps {
  accounts: AccountProfile[];
  onUpdateAccounts: (accounts: AccountProfile[]) => void;
  isAdmin: boolean;
  currentUserEmail: string;
  departmentPermissions: Record<string, { pages: PageModuleKey[]; surveyTypes: SurveyType[] }>;
  onUpdateDepartmentPermissions: (perms: Record<string, { pages: PageModuleKey[]; surveyTypes: SurveyType[] }>) => void;
}

const ROLE_OPTIONS = ['Employee', 'Admin'] as const satisfies readonly AccountProfile['role'][];
const DESIGNATION_OPTIONS = ['Rank & File', 'Supervisory', 'Managerial', 'Director', 'Executive'] as const satisfies readonly AccountProfile['designation'][];
const DEPARTMENT_OPTIONS = ['Accounts Payable - Trade', 'Business Solutions Manager', 'Executive Office', 'Logistics', 'Procurement Group', 'TASS'] as const satisfies readonly AccountProfile['department'][];

function isOption<T extends string>(options: readonly T[], value: string): value is T {
  return options.includes(value as T);
}

const PAGE_MODULES: { key: PageModuleKey; label: string; description: string }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Personalized performance indicators and KPIs' },
  { key: 'survey-forms', label: 'Evaluations', description: 'Open evaluation forms and related workflows' },
  { key: 'explorer', label: 'Evaluation Responses', description: 'Review complete evaluation response records' },
  { key: 'analytics', label: 'Analytics', description: 'Company-wide statistical charts and trends' },
  { key: 'reports', label: 'Reports', description: 'Create reports and access presentation and export workflows' },
  { key: 'present', label: 'Presentations', description: 'Presentation-ready evaluation results' },
  { key: 'partner-companies', label: 'Partners', description: 'Manage courier, supplier, and subcontractor company records' },
  { key: 'document-register', label: 'Compliance Documents', description: 'Track compliance documents across all partner companies' },
  { key: 'renew-documents', label: 'Renew Compliance Documents', description: 'Action permission: update document expiry dates/status in Partners and Compliance Documents without requiring full Users & Access permissions' },
  { key: 'supplier-ranking', label: 'Supplier Ranking', description: 'Curate and reorder the Top 20 Suppliers evaluable by default in Supplier surveys' },
  { key: 'account-management', label: 'Users & Access', description: 'Configure employee accounts, roles, ranks, and permissions' },
  { key: 'notifications', label: 'Notification Logs', description: 'Audit trails of incoming survey responses' },
  { key: 'archive', label: 'Archive', description: 'Browse and restore archived companies, forms, and responses' },
];

const SURVEY_TYPES: { key: SurveyType; label: string; description: string }[] = [
  { key: 'Courier', label: 'Courier Satisfaction', description: 'Courier and logistics satisfaction reporting' },
  { key: 'Supplier', label: 'Supplier Quality', description: 'Inventory supplier assessment and commercials' },
  { key: 'Subcontractor', label: 'Subcontractor Performance', description: 'On-site subcontractor compliance and execution' },
];

export function AccountManagementPage({ 
  accounts, 
  onUpdateAccounts, 
  isAdmin, 
  currentUserEmail,
  departmentPermissions,
  onUpdateDepartmentPermissions
}: AccountManagementPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tableSort, setTableSort] = useState<'email-asc' | 'email-desc' | 'department-asc' | 'designation-asc'>('email-asc');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [pendingEditAccount, setPendingEditAccount] = useState<AccountProfile | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccountProfile['role']>('Employee');
  const [designation, setDesignation] = useState<AccountProfile['designation']>(DESIGNATION_OPTIONS[0]);
  const [department, setDepartment] = useState<AccountProfile['department']>(DEPARTMENT_OPTIONS[0]);
  
  // Custom permissions overrides state in the form
  const [selectedPages, setSelectedPages] = useState<PageModuleKey[]>([]);
  const [selectedSurveyTypes, setSelectedSurveyTypes] = useState<SurveyType[]>([]);

  const departmentPageCeiling = useMemo(
    () => role === 'Admin'
      ? PAGE_MODULES.map(module => module.key)
      : departmentPermissions[department]?.pages ?? getDepartmentDefaultPermissions(department).pages,
    [department, departmentPermissions, role],
  );

  // Department Access Modal State
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<AccountProfile['department']>(DEPARTMENT_OPTIONS[0]);
  const [deptPages, setDeptPages] = useState<PageModuleKey[]>([]);
  const [deptSurveyTypes, setDeptSurveyTypes] = useState<SurveyType[]>([]);
  useModalEscape(Boolean(pendingEditAccount), () => setPendingEditAccount(null), 60);
  useModalEscape(isDeptOpen, () => setIsDeptOpen(false), 50);
  useModalEscape(isAddOpen, () => setIsAddOpen(false), 50);

  // Load selected department permissions into modal state
  useEffect(() => {
    if (isDeptOpen && selectedDept) {
      const current = departmentPermissions?.[selectedDept];
      if (current) {
        setDeptPages(current.pages);
        setDeptSurveyTypes(current.surveyTypes);
      } else {
        // Load the system standard default permissions for this department
        const defaults = getDepartmentDefaultPermissions(selectedDept);
        setDeptPages(defaults.pages);
        setDeptSurveyTypes(defaults.surveyTypes);
      }
    }
  }, [selectedDept, isDeptOpen, departmentPermissions]);

  const handleOpenDepartmentAccess = () => {
    setSelectedDept(DEPARTMENT_OPTIONS[0]);
    setIsDeptOpen(true);
  };

  const handleSaveDeptAccess = () => {
    const updated = { ...departmentPermissions };
    updated[selectedDept] = {
      pages: deptPages,
      surveyTypes: deptSurveyTypes
    };
    onUpdateDepartmentPermissions(updated);
    alert(`Successfully updated department-level access controls for "${selectedDept}". This will immediately affect all users in this department.`);
    setIsDeptOpen(false);
  };

  const handleResetDeptAccess = () => {
    if (window.confirm(`Are you sure you want to restore "${selectedDept}" department access back to its system standard default?`)) {
      const updated = { ...departmentPermissions };
      delete updated[selectedDept];
      onUpdateDepartmentPermissions(updated);
      
      // Reset local modal state to show standard defaults
      const defaults = getDepartmentDefaultPermissions(selectedDept);
      setDeptPages(defaults.pages);
      setDeptSurveyTypes(defaults.surveyTypes);
      
      alert(`Restored "${selectedDept}" department access back to system standard default.`);
    }
  };

  const toggleDeptPageSelection = (key: PageModuleKey) => {
    setDeptPages(current => 
      current.includes(key) ? current.filter(p => p !== key) : [...current, key]
    );
  };

  const toggleDeptSurveyTypeSelection = (key: SurveyType) => {
    setDeptSurveyTypes(current => 
      current.includes(key) ? current.filter(t => t !== key) : [...current, key]
    );
  };

  // The account currently signed in, used to prevent an admin from removing
  // their own account or another account that shares their access level.
  const currentAccount = useMemo(
    () => accounts.find((a) => a.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase()) || null,
    [accounts, currentUserEmail]
  );

  const canDeleteAccount = (acc: AccountProfile) => {
    if (!currentAccount) return true;
    if (acc.email.trim().toLowerCase() === currentAccount.email.trim().toLowerCase()) return false;
    if (acc.role === currentAccount.role) return false;
    return true;
  };

  const filteredAccounts = useMemo(() => {
    const matching = accounts.filter(a =>
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
      a.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.designation.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return matching.sort((a, b) => {
      if (tableSort === 'email-desc') return compareText(b.email, a.email);
      if (tableSort === 'department-asc') return compareText(a.department, b.department) || compareText(a.email, b.email);
      if (tableSort === 'designation-asc') return compareText(a.designation, b.designation) || compareText(a.email, b.email);
      return compareText(a.email, b.email);
    });
  }, [accounts, searchTerm, tableSort]);

  // Whenever designation or department changes in form, automatically assign default permissions
  // if we are NOT editing, or if we want to reset permissions in editing.
  // We'll also allow manual overrides.
  const applyDefaultPermissionsToForm = (currentDesignation: string, currentDepartment: string) => {
    const defaults = getDefaultPermissions(currentDesignation, currentDepartment);
    setSelectedPages(defaults.pages);
    setSelectedSurveyTypes(defaults.surveyTypes);
  };

  const handleOpenAdd = () => {
    setEmail('');
    setRole('Employee');
    const defaultDesignation = DESIGNATION_OPTIONS[0];
    const defaultDepartment = DEPARTMENT_OPTIONS[0];
    setDesignation(defaultDesignation);
    setDepartment(defaultDepartment);
    setEditingEmail(null);
    
    // Auto-assign defaults for the form
    const defaults = getDefaultPermissions(defaultDesignation, defaultDepartment);
    setSelectedPages(defaults.pages);
    setSelectedSurveyTypes(defaults.surveyTypes);
    
    setIsAddOpen(true);
  };

  const openAccountEditor = (acc: AccountProfile) => {
    setEmail(acc.email);
    setRole(acc.role);
    setDesignation(acc.designation);
    setDepartment(acc.department);
    setEditingEmail(acc.email);
    
    // Admins are always unrestricted. Employee accounts may use an override
    // or fall back to their designation defaults within the department limit.
    if (acc.role === 'Admin') {
      setSelectedPages(PAGE_MODULES.map(module => module.key));
      setSelectedSurveyTypes(SURVEY_TYPES.map(type => type.key));
    } else if (acc.permissions) {
      setSelectedPages(acc.permissions.pages as PageModuleKey[]);
      setSelectedSurveyTypes(acc.permissions.surveyTypes as SurveyType[]);
    } else {
      const defaults = getDefaultPermissions(acc.designation, acc.department);
      setSelectedPages(defaults.pages);
      setSelectedSurveyTypes(defaults.surveyTypes);
    }
    
    setIsAddOpen(true);
  };

  const handleOpenEdit = (acc: AccountProfile) => {
    if (acc.role === 'Employee') setPendingEditAccount(acc);
    else openAccountEditor(acc);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !role || !designation || !department) return;
    
    let updated = [...accounts];
    
    // Determine default permissions for comparison
    const defaults = getDefaultPermissions(designation, department);
    
    // Check if the current selections are different from default to decide whether to save custom permissions
    const isCustomized = 
      selectedPages.length !== defaults.pages.length ||
      selectedSurveyTypes.length !== defaults.surveyTypes.length ||
      !selectedPages.every(p => defaults.pages.includes(p)) ||
      !selectedSurveyTypes.every(t => defaults.surveyTypes.includes(t));

    const permissions = role !== 'Admin' && isCustomized ? {
      pages: selectedPages.filter(page => departmentPageCeiling.includes(page)),
      surveyTypes: selectedSurveyTypes
    } : undefined;

    if (editingEmail) {
      // Edit mode
      updated = updated.map(a => a.email === editingEmail ? { 
        email, 
        role, 
        designation, 
        department,
        permissions
      } : a);
    } else {
      // Add mode - check if exists
      if (updated.some(a => a.email.toLowerCase() === email.toLowerCase())) {
        alert('An account with this email already exists.');
        return;
      }
      updated.push({ 
        email, 
        role, 
        designation, 
        department,
        permissions
      });
    }
    
    onUpdateAccounts(updated);
    setIsAddOpen(false);
  };

  const handleDelete = (targetEmail: string) => {
    const target = accounts.find(a => a.email === targetEmail);
    if (target && !canDeleteAccount(target)) {
      alert('You cannot remove your own account or another account that shares your access level.');
      return;
    }
    if (window.confirm(`Are you sure you want to remove ${targetEmail}?`)) {
      onUpdateAccounts(accounts.filter(a => a.email !== targetEmail));
    }
  };

  const handleResetAccess = (acc: AccountProfile) => {
    // Restore back to default role- and department-based configuration by clearing permissions override
    const updated = accounts.map(a => {
      if (a.email.toLowerCase() === acc.email.toLowerCase()) {
        const { permissions: _oldPermissions, ...rest } = a;
        return rest;
      }
      return a;
    });
    onUpdateAccounts(updated);
    alert(`Restored ${acc.email} permissions back to default role and department configuration.`);
  };

  const togglePageSelection = (key: PageModuleKey) => {
    setSelectedPages(current => 
      current.includes(key) ? current.filter(p => p !== key) : [...current, key]
    );
  };

  const toggleSurveyTypeSelection = (key: SurveyType) => {
    setSelectedSurveyTypes(current => 
      current.includes(key) ? current.filter(t => t !== key) : [...current, key]
    );
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
          <Shield size={28} />
        </div>
        <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Administrator Access Required</h3>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          You need administrator privileges to view and manage system accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage system access, roles, organizational details, and custom permissions for all user accounts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenDepartmentAccess}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200"
            type="button"
          >
            <Shield size={16} className="text-indigo-600 dark:text-indigo-400" />
            Department Access
          </button>
          <button
            onClick={handleOpenAdd}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0866B1] hover:bg-[#07528E] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200"
            type="button"
          >
            <Plus size={16} />
            Add Account
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="panel">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by email, department, or designation..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-800"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700 dark:text-slate-300">{filteredAccounts.length}</span> Accounts Found
          </div>
        </div>

        <div className="mb-4">
          <TableFilterBar
            sortOptions={[
              { value: 'email-asc', label: 'Email: A–Z' },
              { value: 'email-desc', label: 'Email: Z–A' },
              { value: 'department-asc', label: 'Department: A–Z' },
              { value: 'designation-asc', label: 'Designation: A–Z' },
            ]}
            sortValue={tableSort}
            onSortChange={setTableSort}
            resultCount={filteredAccounts.length}
            onReset={() => {
              setSearchTerm('');
              setTableSort('email-asc');
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="pb-3 pl-2 font-medium">Account Email</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Designation</th>
                <th className="pb-3 font-medium">Department</th>
                <th className="pb-3 font-medium">Permissions Status</th>
                <th className="pb-3 text-right pr-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredAccounts.map((acc) => (
                <tr key={acc.email} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 pl-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-semibold text-xs">
                        {acc.email.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{acc.email}</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      acc.role === 'Admin' 
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}>
                      {acc.role}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Briefcase size={14} className="text-slate-400" />
                      {acc.designation}
                    </div>
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-400">
                    {acc.department}
                  </td>
                  <td className="py-3">
                    {acc.permissions ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 text-xs font-semibold">
                        Custom Overrides
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 text-xs font-semibold">
                        Role Defaults
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {acc.permissions && (
                        <button
                          onClick={() => handleResetAccess(acc)}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 mr-2"
                          title="Reset Access back to defaults"
                        >
                          <RotateCcw size={12} />
                          Reset Access
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
                        title="Edit Account"
                      >
                        <Edit2 size={16} />
                      </button>
                      {canDeleteAccount(acc) && (
                        <button
                          onClick={() => handleDelete(acc.email)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors cursor-pointer animate-fade-in"
                          title="Delete Account"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="mb-2 h-8 w-8 text-slate-400" />
                      <p>No accounts found matching your search.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm before opening an employee's access settings */}
      {pendingEditAccount && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-account-edit-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertCircle size={20} aria-hidden="true" />
              </span>
              <div>
                <h3 id="confirm-account-edit-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Confirm account access changes
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Are you sure you want to modify <span className="font-semibold">{pendingEditAccount.email}</span>’s account and access permissions?
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  You can review their role, department, and permitted modules before saving any changes.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingEditAccount(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  openAccountEditor(pendingEditAccount);
                  setPendingEditAccount(null);
                }}
                className="rounded-xl bg-[#0866B1] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#07528E]"
              >
                Continue to permissions
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingEmail ? 'Edit Account Details & Permissions' : 'Add New Account & Permissions'}
              </h3>
              
              <button
                type="button"
                onClick={() => applyDefaultPermissionsToForm(designation, department)}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/20"
                title="Reset overrides back to role defaults"
              >
                <RotateCcw size={12} />
                Load Role Defaults
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <form id="account-form" onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Profile Information Block */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    Profile Information
                  </h4>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={!!editingEmail}
                        className="w-full pl-10 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-blue-500 transition-colors text-sm disabled:opacity-50"
                        placeholder="user@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">System Role</label>
                    <select
                      value={role}
                      onChange={e => {
                        if (!isOption(ROLE_OPTIONS, e.target.value)) return;
                        const nextRole = e.target.value;
                        setRole(nextRole);
                        if (nextRole === 'Admin') {
                          setSelectedPages(PAGE_MODULES.map(module => module.key));
                          setSelectedSurveyTypes(SURVEY_TYPES.map(type => type.key));
                        } else {
                          applyDefaultPermissionsToForm(designation, department);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-blue-500 transition-colors text-sm"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Admin">Administrator</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Designation / Organizational Rank</label>
                    <select
                      required
                      value={designation}
                      onChange={e => {
                        const nextDesig = e.target.value;
                        if (!isOption(DESIGNATION_OPTIONS, nextDesig)) return;
                        setDesignation(nextDesig);
                        applyDefaultPermissionsToForm(nextDesig, department);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-blue-500 transition-colors text-sm"
                    >
                      {DESIGNATION_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
                    <select
                      required
                      value={department}
                      onChange={e => {
                        const nextDept = e.target.value;
                        if (!isOption(DEPARTMENT_OPTIONS, nextDept)) return;
                        setDepartment(nextDept);
                        applyDefaultPermissionsToForm(designation, nextDept);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-blue-500 transition-colors text-sm"
                    >
                      {DEPARTMENT_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Data Access Block */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    Survey Data Access
                  </h4>
                  <p className="text-xs text-slate-500">
                    Determine which operational data the user has visibility over.
                  </p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg px-2.5 py-2">
                    Note: checking a category here grants broad visibility, but a specific form is only visible to the user once you also allow their department/role on that form (Evaluations → Forms → Modify Settings → Access). Sharing a form directly with a department/role there will automatically unlock the matching category here too.
                  </p>
                  
                  <div className="space-y-2">
                    {SURVEY_TYPES.map(type => {
                      const isChecked = selectedSurveyTypes.includes(type.key);
                      return (
                        <button
                          key={type.key}
                          type="button"
                          onClick={() => toggleSurveyTypeSelection(type.key)}
                          className={`flex items-start gap-3 w-full p-2.5 rounded-xl border text-left transition-all ${
                            isChecked 
                              ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/20' 
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="pt-0.5">
                            {isChecked ? (
                              <div className="h-4.5 w-4.5 rounded flex items-center justify-center bg-blue-600 text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="h-4.5 w-4.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{type.label}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{type.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Module Permissions Checklist */}
                <div className="md:col-span-2 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    Permitted Navigation Modules
                  </h4>
                  <p className="text-xs text-slate-500">
                    Explicitly grant or revoke access to system pages. Redundant navigation modules are completely hidden.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PAGE_MODULES.map(module => {
                      const isDepartmentAllowed = departmentPageCeiling.includes(module.key);
                      const isChecked = isDepartmentAllowed && selectedPages.includes(module.key);
                      return (
                        <button
                          key={module.key}
                          type="button"
                          onClick={() => togglePageSelection(module.key)}
                          disabled={!isDepartmentAllowed}
                          title={!isDepartmentAllowed ? `Blocked by department access control for ${department}` : undefined}
                          className={`flex items-start gap-3 p-2.5 rounded-xl border text-left transition-all ${
                            !isDepartmentAllowed
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-50 dark:border-slate-800 dark:bg-slate-950'
                              : isChecked
                                ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/20'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="pt-0.5">
                            {isChecked ? (
                              <div className="h-4.5 w-4.5 rounded flex items-center justify-center bg-blue-600 text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="h-4.5 w-4.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{module.label}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{isDepartmentAllowed ? module.description : 'Blocked by department access control'}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-end gap-3 mt-auto">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="account-form"
                className="px-4 py-2 text-sm font-bold text-white bg-[#0866B1] hover:bg-[#07528E] rounded-xl transition cursor-pointer shadow-md"
              >
                {editingEmail ? 'Save Permissions' : 'Add Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Access Control Modal */}
      {isDeptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Shield size={20} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Department Access Control (RBAC)</h3>
                  <p className="text-xs text-slate-500">Configure bulk system permissions on a per-department level</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetDeptAccess}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 cursor-pointer"
                title="Restore active department back to system default"
              >
                <RotateCcw size={12} />
                Restore Department Default
              </button>
            </div>

            {/* Content area: Two Columns (Left: Departments, Right: Settings) */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Column: Department List */}
              <div className="w-1/3 border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-4 space-y-2 overflow-y-auto">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 mb-3">Departments</h4>
                {DEPARTMENT_OPTIONS.map((dept) => {
                  const isSelected = selectedDept === dept;
                  const isModified = !!departmentPermissions?.[dept];
                  return (
                    <button
                      key={dept}
                      onClick={() => setSelectedDept(dept)}
                      className={`w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 shadow-sm border border-indigo-100 dark:border-indigo-900/30'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
                      }`}
                      type="button"
                    >
                      <span className="truncate">{dept}</span>
                      {isModified && (
                        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 ml-2" title="Has custom department permissions" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Permission Settings */}
              <div className="w-2/3 p-6 overflow-y-auto space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Access Settings for:</span>
                    <span className="inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-0.5 text-xs font-bold">
                      {selectedDept}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Define the maximum boundaries of what members of this department can access. Unchecking a permission will revoke access for all members, even those who have individual overrides.
                  </p>
                </div>

                {/* Survey Type Access */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    Survey Data Access
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {SURVEY_TYPES.map(type => {
                      const isChecked = deptSurveyTypes.includes(type.key);
                      return (
                        <button
                          key={type.key}
                          type="button"
                          onClick={() => toggleDeptSurveyTypeSelection(type.key)}
                          className={`flex items-start gap-3 w-full p-2.5 rounded-xl border text-left transition-all ${
                            isChecked 
                              ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10' 
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="pt-0.5">
                            {isChecked ? (
                              <div className="h-4.5 w-4.5 rounded flex items-center justify-center bg-indigo-600 text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="h-4.5 w-4.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{type.label}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{type.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Navigation Modules */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    Permitted Navigation Modules
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PAGE_MODULES.map(module => {
                      const isChecked = deptPages.includes(module.key);
                      return (
                        <button
                          key={module.key}
                          type="button"
                          onClick={() => toggleDeptPageSelection(module.key)}
                          className={`flex items-start gap-3 p-2.5 rounded-xl border text-left transition-all ${
                            isChecked 
                              ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10' 
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="pt-0.5">
                            {isChecked ? (
                              <div className="h-4.5 w-4.5 rounded flex items-center justify-center bg-indigo-600 text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="h-4.5 w-4.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{module.label}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{module.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeptOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDeptAccess}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition cursor-pointer shadow-md"
              >
                Save Department Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
