import { useEffect, useMemo, useState } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { ClipboardList, Search, Eye, FormInput, X, Check, Award, Building2, CalendarClock, ArrowLeft, ArrowRight } from 'lucide-react';
import { CustomForm, SurveyType, PartnerCompany, SurveyAccessRole } from '../types/survey';
import { StateMessage } from '../components/StateMessage';
import { CompletionStatusBar } from '../components/CompletionStatusBar';
import { getAllCompaniesOfType, getSurveyEvaluationCompanies } from '../utils/analytics';
import { getReminderFrequency, saveReminderFrequency } from '../utils/reminderSettings';
import { TableFilterBar } from '../components/TableFilterBar';
import { SurveyFormsToolbar } from '../features/evaluations/components/SurveyFormsToolbar';
import { compareDate, compareText, isWithinDateRange } from '../utils/tableFilters';
import { getSurveyStatus } from '../utils/surveyStatus';
import { parseDDMMYYYY } from '../utils/time';

interface SurveyFormsPageProps {
  surveys: CustomForm[];
  responses: any[];
  partnerCompanies?: PartnerCompany[];
  userEmail?: string;
  onSelectSurvey: (id: string) => void;
  onNavigateToCreate: () => void;
  onFillForm: (id: string) => void;
  onUpdateSurvey?: (survey: CustomForm) => void | Promise<unknown>;
  onUpdateSurveysBulk?: (updatedSurveysList: CustomForm[]) => void | Promise<unknown>;
  onArchiveResponses?: (surveyIds: string[], seriesLabel?: string) => void;
  isAdmin?: boolean;
}

const surveyTypeOptions: Array<'All' | SurveyType> = ['All', 'Courier', 'Supplier', 'Subcontractor'];

const surveyTypeColors: Record<SurveyType, string> = {
  Courier: '#2563eb',
  Supplier: '#10b981',
  Subcontractor: '#f97316',
};

const surveyTypeBadges: Record<SurveyType, string> = {
  Courier: 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/20',
  Supplier: 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/20',
  Subcontractor: 'bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/20',
};

const departmentOptions = [
  'Accounts Payable - Trade',
  'Business Solutions Manager',
  'Executive Office',
  'Logistics',
  'Procurement Group',
  'TASS'
];

const roleOptions: SurveyAccessRole[] = ['Rank & File', 'Supervisory', 'Managerial', 'Director', 'Executive'];

function ddmmToYyyymmdd(ddmm: string): string {
  if (!ddmm) return '';
  const parts = ddmm.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return '';
}

// Default guess for the archive series label, editable by the admin before
// confirming. Not a hard rule - the actual cadence is whatever gets typed.
function suggestSeriesLabel(): string {
  const now = new Date();
  const half = now.getMonth() < 6 ? '1st Half' : '2nd Half';
  return `${half} ${now.getFullYear()}`;
}

function yyyymmddToDdmm(yyyymmdd: string): string {
  if (!yyyymmdd) return '';
  const parts = yyyymmdd.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
  return yyyymmdd;
}

export function SurveyFormsPage({
  surveys,
  responses,
  partnerCompanies = [],
  userEmail = '',
  onSelectSurvey,
  onNavigateToCreate,
  onFillForm,
  onUpdateSurvey,
  onUpdateSurveysBulk,
  onArchiveResponses,
  isAdmin,
}: SurveyFormsPageProps) {
  const [surveyType, setSurveyType] = useState<'All' | SurveyType>('All');
  const [search, setSearch] = useState('');
  const [tableSort, setTableSort] = useState<'title-asc' | 'title-desc' | 'deadline-asc' | 'deadline-desc' | 'created-desc'>('title-asc');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [statusRefresh, setStatusRefresh] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const nextDeadlineEnd = surveys
      .filter((survey) => survey.status !== 'Archived')
      .map((survey) => parseDDMMYYYY(survey.deadlineDate))
      .filter((date): date is Date => date !== null)
      .map((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime())
      .filter((time) => time > now)
      .sort((a, b) => a - b)[0];
    if (nextDeadlineEnd === undefined) return;
    const timer = setTimeout(() => setStatusRefresh((count) => count + 1), Math.min(nextDeadlineEnd - now, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [surveys, statusRefresh]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  // State for bulk modification
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSurveyIds, setSelectedSurveyIds] = useState<Set<string>>(new Set());
  const [isModifyOpen, setIsModifyOpen] = useState(false);
  const [overrideDeadline, setOverrideDeadline] = useState(false);
  const [newDeadlineDate, setNewDeadlineDate] = useState('');
  const [overrideStatus, setOverrideStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<'Running' | 'Paused' | 'Completed' | 'Archived'>('Running');
  const [overrideAccess, setOverrideAccess] = useState(false);
  const [accessDepartments, setAccessDepartments] = useState<string[]>(departmentOptions);
  const [accessRoles, setAccessRoles] = useState<SurveyAccessRole[]>(roleOptions);

  // State for the "Modify Companies to Evaluate" picker (single-survey modify only)
  const [isCompanyPickerOpen, setIsCompanyPickerOpen] = useState(false);
  const [evaluationCompanyIds, setEvaluationCompanyIds] = useState<string[]>([]);

  // Destructive-action confirmation modals. Authorization is enforced by the
  // authenticated Admin route and Supabase RLS, not a browser-side passcode.
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  useModalEscape(isArchiveConfirmOpen || isResetConfirmOpen, () => {
    if (isResetConfirmOpen) setIsResetConfirmOpen(false);
    else setIsArchiveConfirmOpen(false);
  }, 60);
  useModalEscape(isCompanyPickerOpen, () => setIsCompanyPickerOpen(false), 55);
  useModalEscape(isModifyOpen, () => setIsModifyOpen(false), 50);
  useModalEscape(isModalOpen, () => setIsModalOpen(false), 50);
  const [archiveError, setArchiveError] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSeriesLabel, setResetSeriesLabel] = useState('');

  // Notification configuration states
  const [modifyStep, setModifyStep] = useState<1 | 2>(1);
  const [notificationFrequency, setNotificationFrequency] = useState(() => {
    return getReminderFrequency();
  });

  // Identify unique set of evaluated companies for this user
  const userEvaluations = useMemo(() => {
    if (!userEmail) return new Set<string>();
    const set = new Set<string>();
    const normalizedUserEmail = userEmail.trim().toLowerCase();
    responses.forEach((resp) => {
      if (resp.respondentEmail && resp.respondentEmail.trim().toLowerCase() === normalizedUserEmail) {
        set.add(resp.company.trim().toLowerCase());
      }
    });
    return set;
  }, [responses, userEmail]);

  // A category only "counts" toward this user's evaluation progress if they actually
  // have a real, non-archived survey form assigned/accessible to them for it. Having
  // broad access to a survey type (e.g. via an Account Management checkmark) isn't
  // enough on its own if no form has actually been configured/shared for that type -
  // otherwise the progress card shows companies the user has no way to evaluate yet.
  const assignedSurveyTypes = useMemo(() => {
    const set = new Set<SurveyType>();
    surveys.forEach((survey) => {
      if (survey.status !== 'Archived') set.add(survey.surveyType);
    });
    return set;
  }, [surveys]);

  // Companies the user can actually be asked to evaluate right now. This
  // respects each survey's own "Modify Companies to Evaluate" selection
  // (falling back to every company of that survey's type when uncustomized),
  // and is always computed live against the current Partner Registry so
  // additions/removals there are reflected immediately.
  const evaluableCompanies = useMemo(() => {
    const map = new Map<string, PartnerCompany>();
    surveys.forEach((survey) => {
      if (survey.status === 'Archived') return;
      if (!assignedSurveyTypes.has(survey.surveyType)) return;
      getSurveyEvaluationCompanies(survey, partnerCompanies).forEach((c) => map.set(c.id, c));
    });
    return Array.from(map.values());
  }, [surveys, partnerCompanies, assignedSurveyTypes]);

  // Group pending partner companies
  const groupedPendingCompanies = useMemo(() => {
    const pending: Record<SurveyType, PartnerCompany[]> = {
      Courier: [],
      Supplier: [],
      Subcontractor: [],
    };

    evaluableCompanies.forEach((company) => {
      const isEvaluated = userEvaluations.has(company.name.trim().toLowerCase());
      if (!isEvaluated && company.type !== 'Uncategorized') {
        if (pending[company.type]) {
          pending[company.type].push(company);
        }
      }
    });

    return pending;
  }, [evaluableCompanies, userEvaluations]);

  const totalCompanies = evaluableCompanies.length;
  const pendingCount =
    groupedPendingCompanies.Courier.length +
    groupedPendingCompanies.Supplier.length +
    groupedPendingCompanies.Subcontractor.length;
  const evaluatedCount = totalCompanies - pendingCount;
  const completionPercentage = totalCompanies > 0 ? Math.round((evaluatedCount / totalCompanies) * 100) : 0;

  // Per-survey totals and completed counts, used to show each survey's own
  // completion status. Scoped to that specific survey's evaluation company
  // list (its "Modify Companies to Evaluate" selection, or every company of
  // its type by default), so the percentage always normalizes to 100%
  // against the correct denominator instead of every company in the system.
  const companyTotalsBySurveyId = useMemo(() => {
    const totals: Record<string, number> = {};
    surveys.forEach((survey) => {
      totals[survey.id] = getSurveyEvaluationCompanies(survey, partnerCompanies).length;
    });
    return totals;
  }, [surveys, partnerCompanies]);

  const companyCompletedBySurveyId = useMemo(() => {
    const completed: Record<string, number> = {};
    surveys.forEach((survey) => {
      const companies = getSurveyEvaluationCompanies(survey, partnerCompanies);
      completed[survey.id] = companies.filter((c) => userEvaluations.has(c.name.trim().toLowerCase())).length;
    });
    return completed;
  }, [surveys, partnerCompanies, userEvaluations]);

  const formatDeadline = (deadlineDate?: string) => {
    if (!deadlineDate) return 'No deadline set';
    return deadlineDate;
  };

  const filteredSurveys = useMemo(() => {
    const matching = surveys.filter((survey) => {
      // If Archived, it must not be seen in the table
      if (survey.status === 'Archived') return false;

      if (surveyType !== 'All' && survey.surveyType !== surveyType) return false;

      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = `${survey.title} ${survey.description} ${survey.surveyType}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (!isWithinDateRange(survey.deadlineDate, deadlineFrom, deadlineTo)) return false;

      return true;
    });
    return matching.sort((a, b) => {
      if (tableSort === 'title-desc') return compareText(b.title, a.title);
      if (tableSort === 'deadline-asc') return compareDate(a.deadlineDate, b.deadlineDate);
      if (tableSort === 'deadline-desc') return compareDate(b.deadlineDate, a.deadlineDate);
      if (tableSort === 'created-desc') return compareDate(b.createdAt, a.createdAt);
      return compareText(a.title, b.title);
    });
  }, [surveys, surveyType, search, tableSort, deadlineFrom, deadlineTo]);

  const handleToggleSelect = (id: string) => {
    setSelectedSurveyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const allFilteredIds = filteredSurveys.map((s) => s.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedSurveyIds.has(id));
    if (allSelected) {
      setSelectedSurveyIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedSurveyIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const resetModifyState = () => {
    setIsModifyOpen(false);
    setModifyStep(1);
    setOverrideDeadline(false);
    setOverrideStatus(false);
    setOverrideAccess(false);
    setNewDeadlineDate('');
    setNewStatus('Running');
    setAccessDepartments(departmentOptions);
    setAccessRoles(roleOptions);
    setIsCompanyPickerOpen(false);
    setEvaluationCompanyIds([]);
  };

  const openBulkModify = () => {
    setModifyStep(1);
    setOverrideDeadline(false);
    setOverrideStatus(false);
    setOverrideAccess(false);
    setNewDeadlineDate('');
    setNewStatus('Running');
    setAccessDepartments(departmentOptions);
    setAccessRoles(roleOptions);
    setIsCompanyPickerOpen(false);
    setEvaluationCompanyIds([]);
    setIsModifyOpen(true);
  };

  const openSingleModify = (survey: CustomForm) => {
    setSelectedSurveyIds(new Set([survey.id]));
    setIsSelectMode(false);
    setModifyStep(1);
    setNewStatus(getSurveyStatus(survey));
    setNewDeadlineDate(ddmmToYyyymmdd(survey.deadlineDate || ''));
    setAccessDepartments(survey.accessDepartments?.length ? survey.accessDepartments : departmentOptions);
    setAccessRoles(survey.accessRoles?.length ? survey.accessRoles : roleOptions);
    setOverrideStatus(true);
    setOverrideDeadline(true);
    setOverrideAccess(true);
    // Default to whatever the survey already has saved; if it's never been
    // customized, default to every company of this survey's type (standard
    // "select all" default), always resolved live against the current
    // Partner Registry.
    setEvaluationCompanyIds(
      getSurveyEvaluationCompanies(survey, partnerCompanies).map((c) => c.id)
    );
    setIsCompanyPickerOpen(false);
    setIsModifyOpen(true);
  };

  const toggleDepartmentAccess = (department: string) => {
    setOverrideAccess(true);
    setAccessDepartments((current) =>
      current.includes(department)
        ? current.filter((item) => item !== department)
        : [...current, department]
    );
  };

  const toggleRoleAccess = (role: SurveyAccessRole) => {
    setOverrideAccess(true);
    setAccessRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    );
  };

  const handleBulkSaveChanges = () => {
    if (!onUpdateSurveysBulk && !onUpdateSurvey) return;
    if (selectedSurveyIds.size === 0) return;
    if (!overrideDeadline && !overrideStatus && !overrideAccess) {
      alert("Please select at least one property to update.");
      return;
    }
    if (overrideAccess && (accessDepartments.length === 0 || accessRoles.length === 0)) {
      alert("Please select at least one department and one role that can answer the survey.");
      return;
    }

    const updatedSurveysList: CustomForm[] = [];
    const statusChangedAt = new Date().toISOString();
    surveys.forEach((survey) => {
      if (selectedSurveyIds.has(survey.id)) {
        const updated = { ...survey };
        if (overrideDeadline) {
          updated.deadlineDate = yyyymmddToDdmm(newDeadlineDate);
        }
        if (overrideStatus) {
          updated.status = newStatus;
          updated.archivedAt = newStatus === 'Archived' ? statusChangedAt : undefined;
        }
        if (overrideDeadline) updated.status = getSurveyStatus(updated);
        if (overrideAccess) {
          updated.accessDepartments = accessDepartments;
          updated.accessRoles = accessRoles;
        }
        // Single-survey modify only: persist the "Modify Companies to
        // Evaluate" selection. If it still matches every company of this
        // survey's type, store it as "unset" so the list keeps following the
        // Partner Registry automatically (the standard default); otherwise
        // store the explicit custom selection.
        if (!isSelectMode) {
          const allIdsOfType = getSurveyEvaluationCompanies(
            { surveyType: survey.surveyType, evaluationCompanyIds: undefined },
            partnerCompanies
          ).map((c) => c.id);
          const isFullSelection =
            evaluationCompanyIds.length === allIdsOfType.length &&
            allIdsOfType.every((id) => evaluationCompanyIds.includes(id));
          updated.evaluationCompanyIds = isFullSelection ? undefined : evaluationCompanyIds;
        }
        updatedSurveysList.push(updated);
      }
    });

    // Save selected notification frequency
    saveReminderFrequency(notificationFrequency);

    if (onUpdateSurveysBulk) {
      onUpdateSurveysBulk(updatedSurveysList);
    } else if (onUpdateSurvey) {
      updatedSurveysList.forEach((s) => onUpdateSurvey(s));
    }

    // Reset select state and exit
    setIsSelectMode(false);
    setSelectedSurveyIds(new Set());
    resetModifyState();
  };

  const handleProceedArchive = async () => {
    if (!onUpdateSurveysBulk && !onUpdateSurvey) {
      setArchiveError('Survey update callback is not configured.');
      return;
    }

    const updatedSurveysList: CustomForm[] = [];
    const archivedAt = new Date().toISOString();
    surveys.forEach((survey) => {
      if (selectedSurveyIds.has(survey.id)) {
        updatedSurveysList.push({ ...survey, status: 'Archived', archivedAt });
      }
    });

    setArchiveError('');
    setIsArchiving(true);

    try {
      if (onUpdateSurveysBulk) {
        await onUpdateSurveysBulk(updatedSurveysList);
      } else if (onUpdateSurvey) {
        await Promise.all(updatedSurveysList.map((survey) => onUpdateSurvey(survey)));
      }

      alert("Selected survey forms have been successfully archived!");
      setIsSelectMode(false);
      setSelectedSurveyIds(new Set());
      setIsModifyOpen(false);
      setIsArchiveConfirmOpen(false);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Unable to archive the selected survey forms.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleProceedReset = () => {
    if (onArchiveResponses) {
      onArchiveResponses([...selectedSurveyIds], resetSeriesLabel);
      alert("Selected survey responses have been archived successfully, and the forms have been reset!");
      setIsSelectMode(false);
      setSelectedSurveyIds(new Set());
      setIsModifyOpen(false);
      setIsResetConfirmOpen(false);
      setResetError('');
      setResetSeriesLabel('');
    } else {
      setResetError('Response archiver callback is not configured.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Cards Row */}
      {!isAdmin && (
        <section className="grid gap-4">
          {totalCompanies === 0 ? (
            <div className="panel flex items-start justify-between gap-3 border-2 border-dashed border-slate-200 bg-slate-50/25 p-4 dark:border-slate-800/80 dark:bg-transparent sm:items-center sm:p-5">
              <div className="min-w-0 flex-1 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Your Evaluation Progress</span>
                <h3 className="text-base font-extrabold text-slate-500 dark:text-slate-400">No Task Yet</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No survey forms have been assigned to you yet.
                </p>
              </div>
            </div>
          ) : (
          <button
            onClick={() => setIsModalOpen(true)}
            className="panel group flex w-full items-start justify-between gap-3 border border-slate-100 p-4 text-left transition hover:border-[#0866B1] hover:bg-slate-50/50 dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-slate-900/10 sm:items-center sm:p-5 cursor-pointer"
            type="button"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0866B1] dark:text-blue-400">Your Evaluation Progress</span>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-[#0866B1] dark:group-hover:text-blue-400 transition">
                {evaluatedCount} of {totalCompanies} Partners Evaluated
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {completionPercentage === 100 ? '🎉 All evaluations completed!' : 'Click to view pending companies by type'}
              </p>
            </div>
            
            <div className="relative flex items-center justify-center shrink-0 ml-4">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  strokeWidth="5"
                  fill="transparent"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  className="stroke-[#0866B1] dark:stroke-blue-500 transition-all duration-500 ease-out"
                  strokeWidth="5"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 26}`}
                  strokeDashoffset={`${2 * Math.PI * 26 * (1 - completionPercentage / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-black text-[#0866B1] dark:text-blue-400">
                {completionPercentage}%
              </span>
            </div>
          </button>
          )}
        </section>
      )}

      {/* Main List Section */}
      <section className="panel">
        {isAdmin ? (
          <>
            <SurveyFormsToolbar
              surveyType={surveyType}
              onSurveyTypeChange={setSurveyType}
              search={search}
              onSearchChange={setSearch}
              sort={tableSort}
              onSortChange={setTableSort}
              deadlineFrom={deadlineFrom}
              deadlineTo={deadlineTo}
              onDeadlineFromChange={setDeadlineFrom}
              onDeadlineToChange={setDeadlineTo}
              onResetFilters={() => {
                setTableSort('title-asc');
                setDeadlineFrom('');
                setDeadlineTo('');
              }}
              onCreateForm={onNavigateToCreate}
              isSelectMode={isSelectMode}
              onToggleSelection={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedSurveyIds(new Set());
                setIsModifyOpen(false);
              }}
            />
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {filteredSurveys.length} {filteredSurveys.length === 1 ? 'form' : 'forms'}
            </p>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-base font-semibold">Active Survey Forms</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Interactive forms for evaluating performance metrics, contracts, and service level agreements.
                </p>
              </div>
              <div className="segmented-control max-w-full">
                {surveyTypeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={surveyType === option ? 'segmented-active' : ''}
                    onClick={() => setSurveyType(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <TableFilterBar
                sortOptions={[
                  { value: 'title-asc', label: 'Title: A–Z' },
                  { value: 'title-desc', label: 'Title: Z–A' },
                  { value: 'deadline-asc', label: 'Deadline: earliest first' },
                  { value: 'deadline-desc', label: 'Deadline: latest first' },
                  { value: 'created-desc', label: 'Created: newest first' },
                ]}
                sortValue={tableSort}
                onSortChange={setTableSort}
                resultCount={filteredSurveys.length}
                dateFrom={deadlineFrom}
                dateTo={deadlineTo}
                onDateFromChange={setDeadlineFrom}
                onDateToChange={setDeadlineTo}
                dateLabel="Deadline range"
                onReset={() => {
                  setSearch('');
                  setSurveyType('All');
                  setTableSort('title-asc');
                  setDeadlineFrom('');
                  setDeadlineTo('');
                }}
              >
                <label className="min-w-[220px] flex-1">
                  <span className="sr-only">Search survey forms</span>
                  <span className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white pl-3 pr-3 transition focus-within:border-azure focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:ring-blue-950">
                    <Search size={16} className="shrink-0 text-[#0866B1] dark:text-blue-300" />
                    <span className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
                    <input
                      className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-slate-400 dark:text-slate-100"
                      placeholder="Search survey title or description..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </span>
                </label>
              </TableFilterBar>
            </div>
          </>
        )}

        {filteredSurveys.length === 0 ? (
          <StateMessage
            compact
            title="No survey forms found"
            message={
              surveys.length === 0
                ? "No custom survey forms have been created yet."
                : "Try adjusting the filters or search to find what you're looking for."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      {isSelectMode && (
                        <input
                          type="checkbox"
                          checked={filteredSurveys.length > 0 && filteredSurveys.every(s => selectedSurveyIds.has(s.id))}
                          onChange={handleToggleSelectAll}
                          className="h-4.5 w-4.5 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1] transition cursor-pointer"
                        />
                      )}
                      <span>Survey Title</span>
                    </div>
                  </th>
                  <th className="px-4 py-3.5">Category Type</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Completion</th>
                  <th className="px-4 py-3.5">Deadline Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSurveys.map((survey) => {
                  const deadlineLabel = formatDeadline(survey.deadlineDate);
                  const effectiveStatus = getSurveyStatus(survey);
                  const totalForType = companyTotalsBySurveyId[survey.id] || 0;
                  const completedForType = companyCompletedBySurveyId[survey.id] || 0;
 
                  return (
                    <tr key={survey.id} className="align-middle hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {isSelectMode && (
                            <input
                              type="checkbox"
                              checked={selectedSurveyIds.has(survey.id)}
                              onChange={() => handleToggleSelect(survey.id)}
                              className="h-4.5 w-4.5 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1] transition cursor-pointer"
                            />
                          )}
                          <div className="space-y-0.5 max-w-sm">
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {survey.title}
                            </span>
                            <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1" title={survey.description}>
                              {survey.description || 'No description provided.'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${surveyTypeBadges[survey.surveyType]}`}>
                          {survey.surveyType}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                          effectiveStatus === 'Running' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400' :
                          effectiveStatus === 'Paused' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400' :
                          effectiveStatus === 'Completed' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400' :
                          'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}>
                          {effectiveStatus === 'Running' ? 'ACTIVE' :
                           effectiveStatus === 'Completed' ? 'ENDED' :
                           effectiveStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <CompletionStatusBar completed={completedForType} total={totalForType} />
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock size={13} className="text-slate-400" />
                          {deadlineLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={() => onSelectSurvey(survey.id)}
                              className="inline-flex items-center justify-center gap-2 w-36 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 px-4 py-2 text-sm font-semibold transition cursor-pointer"
                              type="button"
                              title="Manage questions and details"
                            >
                              <Eye size={16} />
                              <span>Manage</span>
                            </button>
                            <button
                              onClick={() => openSingleModify(survey)}
                              className="inline-flex items-center justify-center gap-2 w-36 rounded-lg bg-[#0866B1] text-white hover:bg-[#07528E] dark:bg-blue-600 dark:hover:bg-blue-700 px-4 py-2 text-sm font-bold transition cursor-pointer"
                              type="button"
                              title="Modify Survey"
                            >
                              <ClipboardList size={16} />
                              <span>Modify</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={() => onSelectSurvey(survey.id)}
                              className="inline-flex items-center justify-center gap-2 w-36 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 px-4 py-2 text-sm font-semibold transition cursor-pointer"
                              type="button"
                              title="View survey details"
                            >
                              <Eye size={16} />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => onFillForm(survey.id)}
                              className="inline-flex items-center justify-center gap-2 w-36 rounded-lg bg-[#0866B1] text-white hover:bg-[#07528E] dark:bg-blue-600 dark:hover:bg-blue-700 px-4 py-2 text-sm font-bold transition cursor-pointer"
                              type="button"
                              title="Answer Survey"
                            >
                              <FormInput size={16} />
                              <span>Answer Survey</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pending Companies Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />
          
          {/* Modal Panel */}
          <div className="relative bg-white dark:bg-slate-950 rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                  <Building2 size={18} className="text-[#0866B1] dark:text-blue-400" />
                  <span>Pending Partner Evaluations</span>
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Workers must complete evaluations for all registered partners.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable List */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Overall Stat banner */}
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 flex items-center gap-4 border border-slate-100 dark:border-slate-800/60">
                <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeWidth="4"
                      fill="transparent"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      className="stroke-[#0866B1] dark:stroke-blue-500"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 20}`}
                      strokeDashoffset={`${2 * Math.PI * 20 * (1 - completionPercentage / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-extrabold text-[#0866B1] dark:text-blue-400">
                    {completionPercentage}%
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-100">
                    Current progress: {evaluatedCount} / {totalCompanies} companies
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {completionPercentage === 100 
                      ? "Awesome job! You have fully evaluated all active companies."
                      : `You still have ${totalCompanies - evaluatedCount} partners left to evaluate.`
                    }
                  </p>
                </div>
              </div>

              {completionPercentage === 100 ? (
                <div className="text-center py-8 space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400">
                    <Award size={28} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white">All Completed!</h4>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Thank you! You have evaluated all Courier, Supplier, and Subcontractor companies.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {(['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]).map((type) => {
                    const pendingList = groupedPendingCompanies[type] || [];
                    const typeColors = {
                      Courier: 'text-blue-600 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-950/20 dark:border-blue-900/30',
                      Supplier: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-900/30',
                      Subcontractor: 'text-orange-600 bg-orange-50 border-orange-100 dark:text-orange-400 dark:bg-orange-950/20 dark:border-orange-900/30',
                    };

                    return (
                      <div key={type} className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-1.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${typeColors[type]}`}>
                            {type}s
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {pendingList.length} pending
                          </span>
                        </div>

                        {pendingList.length === 0 ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50/50 border border-emerald-100/50 dark:text-emerald-400 dark:bg-emerald-950/10 dark:border-emerald-900/20 rounded-lg p-3">
                            <Check size={14} className="shrink-0" />
                            <span>All {type}s evaluated! Excellent work.</span>
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {pendingList.map((company) => (
                              <div
                                key={company.id}
                                className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 bg-slate-50/30 dark:border-slate-900 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-600 shrink-0" />
                                <span className="truncate" title={company.name}>{company.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg bg-[#0866B1] hover:bg-[#07528E] text-white px-4 py-2 text-xs font-bold shadow-sm transition cursor-pointer"
                type="button"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Bulk Modify Footer Selection Bar & Modal Popup */}
      {isAdmin && (isSelectMode || isModifyOpen) && (
        <>
          {/* Bottom Sticky Selection Bar (only when modal is NOT open) */}
          {isSelectMode && !isModifyOpen && (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] p-4 transition-all duration-300 animate-in slide-in-from-bottom">
              <div className="max-w-5xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#0866B1] dark:bg-blue-500 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <strong className="text-slate-900 dark:text-white font-extrabold">{selectedSurveyIds.size}</strong> {selectedSurveyIds.size === 1 ? 'survey' : 'surveys'} selected
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsSelectMode(false);
                      setSelectedSurveyIds(new Set());
                    }}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-semibold transition cursor-pointer"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (selectedSurveyIds.size === 0) {
                        alert("Please select at least one survey form to modify.");
                        return;
                      }
                      openBulkModify();
                    }}
                    disabled={selectedSurveyIds.size === 0}
                    className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-bold shadow-sm transition cursor-pointer ${
                      selectedSurveyIds.size === 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-900 dark:text-slate-600'
                        : 'bg-[#0866B1] text-white hover:bg-[#07528E] dark:bg-blue-600 dark:hover:bg-blue-700'
                    }`}
                    type="button"
                  >
                    Modify Selected Survey
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Centered Modal with Darkened Background Overlay */}
          {isModifyOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Darkened Backdrop */}
              <div 
                className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
                onClick={resetModifyState}
              />

              {/* Centered Modal Container */}
              <div className="relative w-full max-w-2xl h-[85vh] max-h-[85vh] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Modal Title/Header (Static) */}
                <div className="border-b border-slate-100 dark:border-slate-800 p-5 flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950 dark:text-white">
                      {isSelectMode ? 'Bulk Modify Settings' : 'Modify Settings'}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Applying to {selectedSurveyIds.size} selected survey {selectedSurveyIds.size === 1 ? 'form' : 'forms'} (Step {modifyStep} of 2)
                    </p>
                  </div>
                  <button
                    onClick={resetModifyState}
                    className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
                  
                  {modifyStep === 1 ? (
                    <>
                      {/* Section 1: Survey Status & Archive */}
                      <div className="space-y-3">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                          Survey Status
                        </span>

                        {/* Radio Choice List */}
                        <div className="space-y-2 bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100 dark:border-slate-800/60">
                          <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="bulkStatus"
                              checked={overrideStatus && newStatus === 'Running'}
                              onChange={() => {
                                setNewStatus('Running');
                                setOverrideStatus(true);
                              }}
                              className="h-4.5 w-4.5 text-[#0866B1] focus:ring-[#0866B1] transition"
                            />
                            <span>Active</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="bulkStatus"
                              checked={overrideStatus && newStatus === 'Paused'}
                              onChange={() => {
                                setNewStatus('Paused');
                                setOverrideStatus(true);
                              }}
                              className="h-4.5 w-4.5 text-[#0866B1] focus:ring-[#0866B1] transition"
                            />
                            <span>Paused</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name="bulkStatus"
                              checked={overrideStatus && newStatus === 'Completed'}
                              onChange={() => {
                                setNewStatus('Completed');
                                setOverrideStatus(true);
                              }}
                              className="h-4.5 w-4.5 text-[#0866B1] focus:ring-[#0866B1] transition"
                            />
                            <span>Ended</span>
                          </label>
                        </div>
                      </div>

                      {/* Section 2: Survey Access */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block uppercase tracking-wider">
                            Survey Access
                          </label>
                          {isSelectMode && (
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={overrideAccess}
                                onChange={(event) => setOverrideAccess(event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                              />
                              <span>Update access</span>
                            </label>
                          )}
                        </div>

                        <div className={`grid gap-4 md:grid-cols-2 ${!overrideAccess ? 'opacity-60' : ''}`}>
                          <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">Departments</span>
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0866B1] dark:text-blue-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={!overrideAccess}
                                  checked={accessDepartments.length === departmentOptions.length}
                                  onChange={(event) => {
                                    setOverrideAccess(true);
                                    setAccessDepartments(event.target.checked ? departmentOptions : []);
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                                />
                                <span>All</span>
                              </label>
                            </div>
                            <div className="space-y-1.5">
                              {departmentOptions.map((department) => (
                                <label key={department} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={!overrideAccess}
                                    checked={accessDepartments.includes(department)}
                                    onChange={() => toggleDepartmentAccess(department)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                                  />
                                  <span>{department}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">Roles</span>
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0866B1] dark:text-blue-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={!overrideAccess}
                                  checked={accessRoles.length === roleOptions.length}
                                  onChange={(event) => {
                                    setOverrideAccess(true);
                                    setAccessRoles(event.target.checked ? roleOptions : []);
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                                />
                                <span>All</span>
                              </label>
                            </div>
                            <div className="space-y-1.5">
                              {roleOptions.map((role) => (
                                <label key={role} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={!overrideAccess}
                                    checked={accessRoles.includes(role)}
                                    onChange={() => toggleRoleAccess(role)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                                  />
                                  <span>{role}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setArchiveError('');
                            setIsArchiveConfirmOpen(true);
                          }}
                          className="inline-flex items-center justify-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30 px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                          type="button"
                        >
                          Archive Form
                        </button>
                      </div>

                      {/* Section 3: Set Deadline */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block uppercase tracking-wider">
                          Set Deadline
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0866B1] pl-10 cursor-pointer"
                            value={newDeadlineDate}
                            onChange={(e) => {
                              setNewDeadlineDate(e.target.value);
                              setOverrideDeadline(true);
                            }}
                          />
                          <CalendarClock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Section 4: Set Notification */}
                      <div className="space-y-3 pt-2">
                        <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block uppercase tracking-wider">
                          Set Notification
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100 dark:border-slate-800/60">
                          {[
                            { value: '4', label: 'Every 4 Hours (High Frequency)' },
                            { value: '8', label: 'Every 8 Hours' },
                            { value: '12', label: 'Every 12 Hours' },
                            { value: '24', label: 'Every 24 Hours (Standard)' },
                            { value: '48', label: 'Every 48 Hours' },
                          ].map((opt) => (
                            <label
                              key={opt.value}
                              className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                                notificationFrequency === opt.value
                                  ? 'border-[#0866B1] bg-blue-50/40 text-[#0866B1] dark:border-blue-500 dark:bg-blue-950/20 dark:text-blue-300'
                                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800/40 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="popupReminderFreq"
                                checked={notificationFrequency === opt.value}
                                onChange={() => setNotificationFrequency(opt.value)}
                                className="h-4 w-4 text-[#0866B1] focus:ring-[#0866B1] transition cursor-pointer"
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Modify Companies to Evaluate - single-survey modify only */}
                      {!isSelectMode && (
                        <div className="pt-2">
                          <button
                            onClick={() => setIsCompanyPickerOpen(true)}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:bg-slate-100 dark:hover:bg-slate-800/60 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 transition cursor-pointer"
                            type="button"
                          >
                            <Building2 size={14} />
                            <span>Modify Companies to Evaluate</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}

                </div>

                {/* Modal Footer (Static) */}
                <div className="flex items-center justify-between p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 shrink-0">
                  {modifyStep === 1 ? (
                    <button
                      onClick={() => setModifyStep(2)}
                      className="ml-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 dark:border-slate-750 dark:text-slate-300 dark:hover:bg-slate-800 text-xs font-bold uppercase tracking-wider cursor-pointer transition"
                      type="button"
                    >
                      <span>Next</span>
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setModifyStep(1)}
                      className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 dark:border-slate-750 dark:text-slate-300 dark:hover:bg-slate-800 text-xs font-bold uppercase tracking-wider cursor-pointer transition"
                      type="button"
                    >
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </button>
                  )}

                  {modifyStep === 2 && (
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => {
                          setResetError('');
                          setResetSeriesLabel(suggestSeriesLabel());
                          setIsResetConfirmOpen(true);
                        }}
                        className="px-4 py-2.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 dark:border-rose-900/30 dark:hover:bg-rose-950/20 text-xs font-bold uppercase tracking-wider cursor-pointer transition"
                        type="button"
                      >
                        Reset Form/s
                      </button>
                      <button
                        onClick={handleBulkSaveChanges}
                        className="px-4 py-2.5 rounded-xl bg-[#0866B1] text-white hover:bg-[#07528E] dark:bg-blue-600 dark:hover:bg-blue-700 text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-md"
                        type="button"
                      >
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* Modify Companies to Evaluate - full-screen picker (single-survey modify only) */}
          {isCompanyPickerOpen && (() => {
            const targetSurvey = surveys.find((s) => selectedSurveyIds.has(s.id));
            // Shows every registered company of this survey's type, not just
            // Supplier's curated Top 20 - so the admin can see (and opt into
            // evaluating) the full pool. Checked state still defaults to the
            // Top 20 via evaluationCompanyIds (seeded in openSingleModify from
            // getSurveyEvaluationCompanies), so it stays in sync with the
            // Supplier Ranking page automatically for any survey that hasn't
            // been manually customized.
            const pickerCompanies = targetSurvey
              ? getAllCompaniesOfType(targetSurvey.surveyType, partnerCompanies)
              : [];
            const allSelected = pickerCompanies.length > 0 && pickerCompanies.every((c) => evaluationCompanyIds.includes(c.id));

            const toggleCompany = (id: string) => {
              setEvaluationCompanyIds((current) =>
                current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
              );
            };

            return (
              <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
                <div
                  className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
                  onClick={() => setIsCompanyPickerOpen(false)}
                />
                <div className="relative w-full max-w-2xl h-[85vh] max-h-[85vh] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="border-b border-slate-100 dark:border-slate-800 p-5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsCompanyPickerOpen(false)}
                        className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Back to Modify Settings"
                        type="button"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-950 dark:text-white">
                          Modify Companies to Evaluate
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {targetSurvey ? `${targetSurvey.surveyType} partners` : 'Partners'} · {evaluationCompanyIds.length} / {pickerCompanies.length} selected
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsCompanyPickerOpen(false)}
                      className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Close"
                      type="button"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Choose which registered {targetSurvey ? targetSurvey.surveyType.toLowerCase() : ''} partner companies this survey should evaluate. This list always reflects the companies currently in the Partner Registry, and every completion percentage for this survey is calculated against your selection here.
                    </p>

                    <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 px-3.5 py-2.5 cursor-pointer">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Select All
                      </span>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) =>
                          setEvaluationCompanyIds(event.target.checked ? pickerCompanies.map((c) => c.id) : [])
                        }
                        className="h-4 w-4 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                      />
                    </label>

                    {pickerCompanies.length === 0 ? (
                      <div className="text-center py-10 text-sm font-semibold text-slate-400 dark:text-slate-500">
                        No {targetSurvey?.surveyType.toLowerCase()} partner companies are registered yet.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {pickerCompanies.map((company) => (
                          <label
                            key={company.id}
                            className="flex items-center gap-2.5 rounded-lg border border-slate-100 dark:border-slate-800/60 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                          >
                            <input
                              type="checkbox"
                              checked={evaluationCompanyIds.includes(company.id)}
                              onChange={() => toggleCompany(company.id)}
                              className="h-4 w-4 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                            />
                            <Building2 size={14} className="text-slate-400 shrink-0" />
                            <span className="flex-1">{company.name}</span>
                            {targetSurvey?.surveyType === 'Supplier' && !(company.evaluationRank && company.evaluationRank >= 1 && company.evaluationRank <= 20) && (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                Not in Top 20
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 shrink-0">
                    <button
                      onClick={() => setIsCompanyPickerOpen(false)}
                      className="px-5 py-2.5 rounded-xl bg-[#0866B1] text-white hover:bg-[#07528E] dark:bg-blue-600 dark:hover:bg-blue-700 text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-md"
                      type="button"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Custom Archive Confirmation Modal */}
          {isArchiveConfirmOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div 
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
                onClick={() => {
                  if (!isArchiving) setIsArchiveConfirmOpen(false);
                }}
              />
              <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-rose-100 dark:border-rose-950/30 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30">
                    <X size={20} className="text-rose-600 dark:text-rose-400" />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950 dark:text-white uppercase tracking-wider">
                      Archive Selected Forms
                    </h3>
                    <p className="text-xs text-rose-500 font-semibold mt-0.5">
                      Applying to {selectedSurveyIds.size} survey forms
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="bg-rose-50/75 dark:bg-rose-950/15 p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/30 text-xs text-rose-700 dark:text-rose-300 leading-relaxed space-y-1.5">
                    <p className="font-bold">⚠️ CRITICAL WARNING:</p>
                    <p>Archiving these survey forms will completely hide them from both active administrator tables and employee evaluation dashboards.</p>
                    <p>The forms will no longer accept responses, but their historic responses will be preserved in the Archive Center.</p>
                  </div>

                  {archiveError && (
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400" role="alert">
                      {archiveError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setIsArchiveConfirmOpen(false);
                      setArchiveError('');
                    }}
                    disabled={isArchiving}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 text-xs font-bold uppercase tracking-wider cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProceedArchive}
                    disabled={isArchiving}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800 text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                  >
                    {isArchiving ? 'Archiving...' : 'Proceed & Archive'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Custom Reset Confirmation Modal */}
          {isResetConfirmOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div 
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
                onClick={() => setIsResetConfirmOpen(false)}
              />
              <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-amber-100 dark:border-amber-950/30 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                    <X size={20} className="text-amber-600 dark:text-amber-400" />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950 dark:text-white uppercase tracking-wider">
                      Reset Selected Forms
                    </h3>
                    <p className="text-xs text-amber-500 font-semibold mt-0.5">
                      Applying to {selectedSurveyIds.size} survey forms
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="bg-amber-50/75 dark:bg-amber-950/15 p-3.5 rounded-xl border border-amber-100 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-300 leading-relaxed space-y-1.5">
                    <p className="font-bold">⚠️ CRITICAL WARNING:</p>
                    <p>Resetting these forms will archive all previous responses submitted by employees for these specific survey questions.</p>
                    <p>This allows employees to answer the evaluation forms completely fresh, while previous answers are moved securely to historical archives.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block uppercase tracking-wider">
                      Period / Series Label:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 1st Half 2026"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      value={resetSeriesLabel}
                      onChange={(e) => setResetSeriesLabel(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Names this batch of archived responses so it shows up as its own period in Archive Center's history and trend charts. Reusing an existing label merges into that same period.
                    </p>
                  </div>

                  {resetError && (
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400" role="alert">
                      {resetError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setIsResetConfirmOpen(false);
                      setResetError('');
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 text-xs font-bold uppercase tracking-wider cursor-pointer transition"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProceedReset}
                    className="px-4 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-md"
                    type="button"
                  >
                    Proceed & Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
