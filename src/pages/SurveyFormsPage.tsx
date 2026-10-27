import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { ClipboardList, Search, Eye, FormInput, X, Check, Award, Building2, CalendarClock, ArrowLeft, Archive, Send, Pencil, CircleCheck, Clock3, Info } from 'lucide-react';
import { CustomForm, SurveyType, PartnerCompany, SurveyAccessRole } from '../types/survey';
import { StateMessage } from '../components/StateMessage';
import { CompletionStatusBar } from '../features/evaluations/components/CompletionStatusBar';
import { Pagination } from '../components/Pagination';
import { getAllCompaniesOfType, getSurveyEvaluationCompanies } from '../features/analytics/domain/analytics';
import { getReminderFrequency, saveReminderFrequency } from '../features/notifications/services/reminderSettings';
import { TableFilterBar } from '../components/TableFilterBar';
import { SurveyFormsToolbar } from '../features/evaluations/components/SurveyFormsToolbar';
import { compareDate, compareText, isWithinDateRange } from '../utils/tableFilters';
import { getPendingEvaluationCompanies } from '../features/evaluations/domain/evaluationProgress';
import { getSurveyStatus } from '../features/evaluations/domain/surveyStatus';
import { SurveyAccessStatus } from '../features/evaluations/components/SurveyAccessStatus';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { SendFormConfirmation } from '../features/evaluations/components/SendFormConfirmation';
import { SendFormCompanySelection } from '../features/evaluations/components/SendFormCompanySelection';
import { applyDistributionCompanySelection, requiresDistributionCompanySelection } from '../features/evaluations/domain/formDistribution';
import { parseDDMMYYYY } from '../utils/time';
import { getEvaluationLeaderboardTopTwenty } from '../features/evaluations/domain/leaderboardSelection';
import { CreateSurveyPage } from './CreateSurveyPage';
import type { PersistedProfile } from '../features/account-management/domain/accountProfile';
import { getEligibleFormRecipients, type DepartmentSurveyPermissions } from '../features/evaluations/domain/formRecipients';
import { getAdminActivity, logAdminActivity, type AdminActivityEntry } from '../features/account-management/services/adminActivityLog';

interface SurveyFormsPageProps {
  surveys: CustomForm[];
  knownSurveys?: CustomForm[];
  responses: any[];
  partnerCompanies?: PartnerCompany[];
  userEmail?: string;
  onSelectSurvey: (id: string) => void;
  onNavigateToCreate: () => void;
  employeeProfiles?: PersistedProfile[];
  departmentPermissions?: DepartmentSurveyPermissions;
  onFillForm: (id: string) => void;
  onUpdateSurvey?: (survey: CustomForm) => void | Promise<unknown>;
  onUpdateSurveysBulk?: (updatedSurveysList: CustomForm[]) => void | Promise<unknown>;
  onArchiveResponses?: (surveyIds: string[], seriesLabel?: string) => void;
  onArchiveSurveyTypes?: (surveyTypes: SurveyType[], seriesLabel: string, surveyIds?: string[]) => Promise<void>;
  isAdmin?: boolean;
}

const surveyTypeOptions: Array<'All' | SurveyType> = ['All', 'Courier', 'Supplier', 'Subcontractor'];
const EVALUATION_ACTIVITY_PAGE_SIZE = 8;

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

const surveyBadgeClassName = 'inline-flex items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold uppercase leading-4 tracking-wider';

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
  knownSurveys = surveys,
  responses,
  partnerCompanies = [],
  userEmail = '',
  onSelectSurvey,
  onNavigateToCreate,
  onFillForm,
  onUpdateSurvey,
  onUpdateSurveysBulk,
  onArchiveSurveyTypes,
  isAdmin,
  employeeProfiles = [],
  departmentPermissions = {},
}: SurveyFormsPageProps) {
  const [surveyType, setSurveyType] = useState<'All' | SurveyType>('All');
  const [search, setSearch] = useState('');
  const [tableSort, setTableSort] = useState<'title-asc' | 'title-desc' | 'deadline-asc' | 'deadline-desc' | 'created-desc'>('title-asc');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [statusRefresh, setStatusRefresh] = useState(0);
  const [accessPickerOpen, setAccessPickerOpen] = useState(false);
  const [previewSurveyId, setPreviewSurveyId] = useState<string | null>(null);
  const [isSavingPreviewPeriod, setIsSavingPreviewPeriod] = useState(false);
  const [previewPeriodSaveMessage, setPreviewPeriodSaveMessage] = useState('');
  const [previewPeriodSaveError, setPreviewPeriodSaveError] = useState('');
  const previewPeriodSaveInFlight = useRef(false);
  const [previewEditSurveyId, setPreviewEditSurveyId] = useState<string | null>(null);
  const [sendConfirmationSurveyId, setSendConfirmationSurveyId] = useState<string | null>(null);
  const [isSendApprovalOpen, setIsSendApprovalOpen] = useState(false);
  const [isDiscardSendOpen, setIsDiscardSendOpen] = useState(false);
  const [sendCompanyIds, setSendCompanyIds] = useState<string[] | null>(null);
  const [distributionFeedback, setDistributionFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [isSavingPreviewEdit, setIsSavingPreviewEdit] = useState(false);
  const [isSendingForm, setIsSendingForm] = useState(false);
  const [previewEditError, setPreviewEditError] = useState('');
  const [activityEntries, setActivityEntries] = useState<AdminActivityEntry[]>(() => getAdminActivity());
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(EVALUATION_ACTIVITY_PAGE_SIZE);

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
  const [archiveEndedCategory, setArchiveEndedCategory] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [saveChangesError, setSaveChangesError] = useState('');
  const [overrideAccess, setOverrideAccess] = useState(false);
  const [accessDepartments, setAccessDepartments] = useState<string[]>(departmentOptions);
  const [accessRoles, setAccessRoles] = useState<SurveyAccessRole[]>(roleOptions);

  // State for the "Modify Companies to Evaluate" picker (single-survey modify only)
  const [isCompanyPickerOpen, setIsCompanyPickerOpen] = useState(false);
  const [evaluationCompanyIds, setEvaluationCompanyIds] = useState<string[]>([]);
  const [evaluationCompanyPreset, setEvaluationCompanyPreset] = useState<'within-top-20' | 'active-companies' | null>(null);

  // Destructive-action confirmation modals. Authorization is enforced by the
  // authenticated Admin route and Supabase RLS, not a browser-side passcode.
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const previewEditCloseRequest = useRef<(() => void) | null>(null);
  const registerPreviewEditCloseRequest = useCallback((requestClose: (() => void) | null) => {
    previewEditCloseRequest.current = requestClose;
  }, []);
  const requestClosePreviewEdit = () => {
    if (previewEditCloseRequest.current) previewEditCloseRequest.current();
    else setPreviewEditSurveyId(null);
  };
  const requestCloseSendConfirmation = () => {
    if (isSendingForm) return;
    if (sendCompanyIds !== null) { setIsDiscardSendOpen(true); return; }
    setSendConfirmationSurveyId(null);
    setSendCompanyIds(null);
  };
  useModalEscape(isArchiveConfirmOpen, () => setIsArchiveConfirmOpen(false), 60);
  useModalEscape(isCompanyPickerOpen, () => setIsCompanyPickerOpen(false), 55);
  useModalEscape(isModifyOpen, () => setIsModifyOpen(false), 50);
  useModalEscape(isModalOpen, () => setIsModalOpen(false), 50);
  useModalEscape(accessPickerOpen, () => setAccessPickerOpen(false), 65);
  useModalEscape(Boolean(previewEditSurveyId), requestClosePreviewEdit, 75);
  useModalEscape(Boolean(sendConfirmationSurveyId), requestCloseSendConfirmation, 80);
  useModalEscape(Boolean(previewSurveyId) && !previewEditSurveyId && !sendConfirmationSurveyId, () => setPreviewSurveyId(null), 70);

  useEffect(() => {
    const refresh = () => {
      setActivityEntries(getAdminActivity());
      setActivityPage(1);
    };
    window.addEventListener('admin-activity-updated', refresh);
    refresh();
    return () => window.removeEventListener('admin-activity-updated', refresh);
  }, []);

  const evaluationActivityEntries = activityEntries.filter((entry) => /evaluation form|evaluation access/i.test(entry.action));
  const activityTotalPages = Math.max(1, Math.ceil(evaluationActivityEntries.length / activityPageSize));
  const currentActivityPage = Math.min(activityPage, activityTotalPages);
  const activityStartIndex = (currentActivityPage - 1) * activityPageSize;
  const visibleActivityEntries = evaluationActivityEntries.slice(activityStartIndex, activityStartIndex + activityPageSize);

  const previewSurvey = surveys.find((survey) => survey.id === previewSurveyId) ?? null;
  const previewEditSurvey = surveys.find((survey) => survey.id === previewEditSurveyId) ?? null;
  const sendConfirmationSurvey = surveys.find((survey) => survey.id === sendConfirmationSurveyId) ?? null;
  const sendCompanySelectionRequired = Boolean(sendConfirmationSurvey && requiresDistributionCompanySelection(sendConfirmationSurvey.surveyType));
  const sendTopCompanies = useMemo(() => sendConfirmationSurvey && requiresDistributionCompanySelection(sendConfirmationSurvey.surveyType)
    ? getEvaluationLeaderboardTopTwenty(partnerCompanies, responses, sendConfirmationSurvey.surveyType) : [],
  [sendConfirmationSurvey?.surveyType, partnerCompanies, responses]);
  const eligibleRecipients = sendConfirmationSurvey
    ? getEligibleFormRecipients(sendConfirmationSurvey, employeeProfiles, departmentPermissions)
    : [];
  const sendDeadline = sendConfirmationSurvey?.deadlineDate ? parseDDMMYYYY(sendConfirmationSurvey.deadlineDate) : null;
  const sendDeadlineExpired = Boolean(sendDeadline && new Date(sendDeadline.getFullYear(), sendDeadline.getMonth(), sendDeadline.getDate()).getTime() < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime());

  const handleSavePreviewEdit = async (formData: Omit<CustomForm, 'id' | 'createdAt'>) => {
    if (!previewEditSurvey || !onUpdateSurvey || isSavingPreviewEdit) return;
    setPreviewEditError('');
    setIsSavingPreviewEdit(true);
    try {
      await onUpdateSurvey({ ...previewEditSurvey, ...formData, id: previewEditSurvey.id, createdAt: previewEditSurvey.createdAt });
      logAdminActivity('Updated evaluation form', `${previewEditSurvey.title} (${previewEditSurvey.surveyType}) · by ${userEmail || 'Admin'}`);
      setPreviewEditSurveyId(null);
      setDistributionFeedback({ kind: 'success', text: 'Form changes saved. The updated questions are shown in the preview.' });
    } catch (error) {
      setPreviewEditError(error instanceof Error ? error.message : 'Unable to save the form changes. Please try again.');
      throw error;
    } finally {
      setIsSavingPreviewEdit(false);
    }
  };

  const handlePreviewPeriodChange = async (periodCovered: NonNullable<CustomForm['periodCovered']>) => {
    if (!previewSurvey || !isAdmin || (!onUpdateSurveysBulk && !onUpdateSurvey) || previewPeriodSaveInFlight.current) return;
    const sharedSurveys = knownSurveys.filter((survey) => survey.surveyType === 'Courier' || survey.surveyType === 'Supplier');
    if (sharedSurveys.length > 0 && sharedSurveys.every((survey) => (survey.periodCovered ?? '1st Half') === periodCovered)) return;

    previewPeriodSaveInFlight.current = true;
    setIsSavingPreviewPeriod(true);
    setPreviewPeriodSaveMessage('');
    setPreviewPeriodSaveError('');
    try {
      const updatedSurveys = knownSurveys
        .filter((survey) => survey.surveyType === 'Courier' || survey.surveyType === 'Supplier')
        .map((survey) => ({ ...survey, periodCovered }));
      if (onUpdateSurveysBulk) await onUpdateSurveysBulk(updatedSurveys);
      else if (onUpdateSurvey) await Promise.all(updatedSurveys.map((survey) => onUpdateSurvey(survey)));
      setPreviewPeriodSaveMessage('Saved. Employee evaluations will use this period.');
    } catch (error) {
      setPreviewPeriodSaveError(error instanceof Error ? error.message : 'Unable to save this period. Please try again.');
    } finally {
      previewPeriodSaveInFlight.current = false;
      setIsSavingPreviewPeriod(false);
    }
  };

  const handleConfirmSend = async () => {
    if (!isSendApprovalOpen || !isAdmin || !sendConfirmationSurvey || !onUpdateSurvey || isSendingForm || eligibleRecipients.length === 0) return;
    if (getSurveyStatus(sendConfirmationSurvey) === 'Archived') {
      setDistributionFeedback({ kind: 'error', text: 'Archived forms cannot be sent.' });
      return;
    }
    if (sendDeadlineExpired) {
      setDistributionFeedback({ kind: 'error', text: 'This evaluation deadline has passed. Update the deadline before sending this form.' });
      return;
    }

    setIsSendingForm(true);
    try {
      await onUpdateSurvey({ ...applyDistributionCompanySelection(sendConfirmationSurvey, sendCompanyIds, partnerCompanies), status: 'Running', manuallyEndedAt: undefined, archivedAt: undefined, distributionId: crypto.randomUUID(), lastDistributedAt: new Date().toISOString() });
      logAdminActivity(
        'Made evaluation form available',
        `${sendConfirmationSurvey.title} (${sendConfirmationSurvey.surveyType}) · ${eligibleRecipients.length} eligible employees · by ${userEmail || 'Admin'}`,
      );
      setIsSendApprovalOpen(false);
      setSendConfirmationSurveyId(null);
      setSendCompanyIds(null);
      setDistributionFeedback({ kind: 'success', text: `${sendConfirmationSurvey.title} is available to ${eligibleRecipients.length} eligible employees. Employee survey reminders are generated from active accessible forms.` });
    } catch (error) {
      setDistributionFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'The form could not be made available. No notification success is reported.' });
    } finally {
      setIsSendingForm(false);
    }
  };
  const [archiveError, setArchiveError] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  // Notification configuration states
  const [modifyStep, setModifyStep] = useState<1 | 2>(1);
  const [newPeriodCovered, setNewPeriodCovered] = useState<NonNullable<CustomForm['periodCovered']>>('1st Half');
  const [notificationFrequency, setNotificationFrequency] = useState(() => {
    return getReminderFrequency();
  });

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
      if (getSurveyStatus(survey) !== 'Running') return;
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

    const pendingIds = new Set(surveys.filter((survey) => getSurveyStatus(survey) === 'Running')
      .flatMap((survey) => getPendingEvaluationCompanies(survey, knownSurveys, partnerCompanies, responses, userEmail ?? '').map((company) => company.id)));
    evaluableCompanies.forEach((company) => {
      if (pendingIds.has(company.id) && company.type !== 'Uncategorized') pending[company.type].push(company);
    });

    return pending;
  }, [evaluableCompanies, surveys, knownSurveys, partnerCompanies, responses, userEmail]);

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
      completed[survey.id] = companies.length - getPendingEvaluationCompanies(survey, knownSurveys, partnerCompanies, responses, userEmail ?? '').length;
    });
    return completed;
  }, [surveys, knownSurveys, partnerCompanies, responses, userEmail]);

  const formatDeadline = (deadlineDate?: string) => {
    if (!deadlineDate) return 'No deadline set';
    return deadlineDate;
  };

  const filteredSurveys = useMemo(() => {
    const matching = surveys.filter((survey) => {
      if (survey.status === 'Archived' && !isAdmin) return false;

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
      if (isAdmin && (a.status === 'Archived') !== (b.status === 'Archived')) return a.status === 'Archived' ? 1 : -1;
      if (tableSort === 'title-desc') return compareText(b.title, a.title);
      if (tableSort === 'deadline-asc') return compareDate(a.deadlineDate, b.deadlineDate);
      if (tableSort === 'deadline-desc') return compareDate(b.deadlineDate, a.deadlineDate);
      if (tableSort === 'created-desc') return compareDate(b.createdAt, a.createdAt);
      return compareText(a.title, b.title);
    });
  }, [surveys, surveyType, search, tableSort, deadlineFrom, deadlineTo, isAdmin]);

  const formLifecycleCounts = useMemo(() => {
    const counts: Record<'Running' | 'Paused' | 'Completed' | 'Archived', number> = {
      Running: 0,
      Paused: 0,
      Completed: 0,
      Archived: 0,
    };
    surveys.forEach((survey) => {
      counts[getSurveyStatus(survey)] += 1;
    });
    return counts;
  }, [surveys]);

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
    setArchiveEndedCategory(false);
    setOverrideAccess(false);
    setNewDeadlineDate('');
    setNewStatus('Running');
    setAccessDepartments(departmentOptions);
    setAccessRoles(roleOptions);
    setIsCompanyPickerOpen(false);
    setEvaluationCompanyIds([]);
    setEvaluationCompanyPreset(null);
  };

  const openBulkModify = () => {
    setModifyStep(1);
    setOverrideDeadline(false);
    setOverrideStatus(false);
    setArchiveEndedCategory(false);
    setOverrideAccess(false);
    setNewDeadlineDate('');
    setNewStatus('Running');
    setAccessDepartments(departmentOptions);
    setAccessRoles(roleOptions);
    setIsCompanyPickerOpen(false);
    setEvaluationCompanyIds([]);
    setEvaluationCompanyPreset(null);
    setIsModifyOpen(true);
  };

  const openSingleModify = (survey: CustomForm) => {
    setSelectedSurveyIds(new Set([survey.id]));
    setIsSelectMode(false);
    setModifyStep(1);
    setNewStatus(getSurveyStatus(survey));
    setNewPeriodCovered(survey.periodCovered ?? '1st Half');
    setArchiveEndedCategory(false);
    setNewDeadlineDate(ddmmToYyyymmdd(survey.deadlineDate || ''));
    setAccessDepartments(survey.accessDepartments?.length ? survey.accessDepartments : departmentOptions);
    setAccessRoles(survey.accessRoles?.length ? survey.accessRoles : roleOptions);
    setOverrideStatus(true);
    setOverrideDeadline(true);
    setOverrideAccess(true);
    // Default to the survey's saved company selection; if it has never been
    // customized, getSurveyEvaluationCompanies resolves to all active
    // companies of the survey type.
    setEvaluationCompanyIds(
      getSurveyEvaluationCompanies(survey, partnerCompanies).map((c) => c.id)
    );
    setEvaluationCompanyPreset(null);
    setIsCompanyPickerOpen(false);
    setIsModifyOpen(true);
  };

  const handleManageAccessCategoryChange = (category: SurveyType) => {
    const categorySurveys = surveys.filter(
      (survey) => survey.surveyType === category && survey.status !== 'Archived'
    );
    setSurveyType(category);

    if (isSelectMode) {
      setSelectedSurveyIds(new Set(categorySurveys.map((survey) => survey.id)));
      return;
    }

    const targetSurvey = categorySurveys.reduce<CustomForm | undefined>((latest, candidate) => {
      if (!latest) return candidate;
      const latestCreatedAt = Date.parse(latest.createdAt) || 0;
      const candidateCreatedAt = Date.parse(candidate.createdAt) || 0;
      return candidateCreatedAt > latestCreatedAt ? candidate : latest;
    }, undefined);

    if (targetSurvey) openSingleModify(targetSurvey);
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

  const handleBulkSaveChanges = async () => {
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
    if (!isSelectMode && overrideAccess) {
      const survey = surveys.find((candidate) => selectedSurveyIds.has(candidate.id));
      const activeCompanies = survey ? getAllCompaniesOfType(survey.surveyType, partnerCompanies) : [];
      if (activeCompanies.length > 0 && evaluationCompanyIds.length === 0) {
        alert('Please select at least one active partner company to evaluate.');
        return;
      }
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
          if (archiveEndedCategory && newStatus === 'Completed') updated.manuallyEndedAt = survey.manuallyEndedAt || statusChangedAt;
          else if (newStatus !== 'Completed') updated.manuallyEndedAt = undefined;
        }
        if (overrideDeadline && !archiveEndedCategory) updated.status = getSurveyStatus(updated);
        if (overrideAccess) {
          updated.accessDepartments = accessDepartments;
          updated.accessRoles = accessRoles;
        }
        // Single-survey modify only: preserve an explicit Analytics Top 20
        // snapshot. Other full-default selections stay unset so they keep
        // following the active Partner Registry; custom selections save IDs.
        if (!isSelectMode) {
          if (survey.surveyType === 'Courier' || survey.surveyType === 'Supplier') {
            updated.periodCovered = newPeriodCovered;
          }
          const allIdsOfType = getSurveyEvaluationCompanies(
            { surveyType: survey.surveyType, evaluationCompanyIds: undefined },
            partnerCompanies
          ).map((c) => c.id);
          const isFullSelection =
            evaluationCompanyIds.length === allIdsOfType.length &&
            allIdsOfType.every((id) => evaluationCompanyIds.includes(id));
          updated.evaluationCompanyIds = evaluationCompanyPreset === 'within-top-20'
            ? evaluationCompanyIds
            : isFullSelection ? undefined : evaluationCompanyIds;
        }
        updatedSurveysList.push(updated);
      }
    });

    if (!isSelectMode) {
      const singleUpdate = updatedSurveysList[0];
      if (singleUpdate?.surveyType === 'Courier' || singleUpdate?.surveyType === 'Supplier') {
        const updatedById = new Map(updatedSurveysList.map((survey) => [survey.id, survey]));
        knownSurveys.forEach((survey) => {
          if (survey.surveyType !== 'Courier' && survey.surveyType !== 'Supplier') return;
          const updatedSurvey = updatedById.get(survey.id) ?? survey;
          updatedById.set(survey.id, { ...updatedSurvey, periodCovered: singleUpdate.periodCovered ?? newPeriodCovered });
        });
        updatedSurveysList.splice(0, updatedSurveysList.length, ...updatedById.values());
      }
    }

    // Save selected notification frequency
    saveReminderFrequency(notificationFrequency);

    setSaveChangesError('');
    setIsSavingChanges(true);
    let surveysSaved = false;
    try {
      if (onUpdateSurveysBulk) {
        await onUpdateSurveysBulk(updatedSurveysList);
      } else if (onUpdateSurvey) {
        await Promise.all(updatedSurveysList.map((survey) => onUpdateSurvey(survey)));
      }
      surveysSaved = true;

      if (archiveEndedCategory && newStatus === 'Completed' && onArchiveSurveyTypes) {
        const endedSurveys = updatedSurveysList.filter((survey) => survey.status === 'Completed');
        const endedTypes = [...new Set(endedSurveys.map((survey) => survey.surveyType))];
        const endedAt = endedSurveys.find((survey) => survey.manuallyEndedAt)?.manuallyEndedAt || new Date().toISOString();
        const period = new Date(endedAt).toLocaleString();
        const periodLabel = `${endedTypes.join(' & ')} · Ended ${period}`;
        await onArchiveSurveyTypes(endedTypes, periodLabel, endedSurveys.map((survey) => survey.id));
      }
      logAdminActivity('Updated evaluation access', `${updatedSurveysList.map((survey) => survey.title).join(', ')} · by ${userEmail || 'Admin'}`);
    } catch (error) {
      setSaveChangesError(surveysSaved
        ? `Survey status was saved, but its category archive failed: ${error instanceof Error ? error.message : 'Unable to archive these responses.'} You can retry Save Changes.`
        : error instanceof Error ? error.message : 'Unable to save these survey changes.');
      setIsSavingChanges(false);
      return;
    }

    // Reset select state and exit
    setIsSelectMode(false);
    setSelectedSurveyIds(new Set());
    resetModifyState();
    setIsSavingChanges(false);
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

      updatedSurveysList.forEach((survey) => logAdminActivity('Archived evaluation form', `${survey.title} (${survey.surveyType}) · by ${userEmail || 'Admin'}`));

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

  const selectedAccessCategories = [...new Set(
    surveys.filter((survey) => selectedSurveyIds.has(survey.id)).map((survey) => survey.surveyType)
  )];
  const selectedAccessCategory = selectedAccessCategories.length === 1
    ? selectedAccessCategories[0]
    : selectedAccessCategories.length > 1 ? 'Multiple Categories' : 'No Category';

  return (
    <div className="admin-survey-forms-page space-y-5">
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
            className="panel group flex w-full items-start justify-between gap-3 border border-slate-100 p-4 text-left transition hover:border-[#2187CD] hover:bg-slate-50/50 dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-slate-900/10 sm:items-center sm:p-5 cursor-pointer"
            type="button"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#2187CD] dark:text-blue-400">Your Evaluation Progress</span>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-[#2187CD] dark:group-hover:text-blue-400 transition">
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
                  className="stroke-[#2187CD] dark:stroke-blue-500 transition-all duration-500 ease-out"
                  strokeWidth="5"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 26}`}
                  strokeDashoffset={`${2 * Math.PI * 26 * (1 - completionPercentage / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-black text-[#2187CD] dark:text-blue-400">
                {completionPercentage}%
              </span>
            </div>
          </button>
          )}
        </section>
      )}

      {/* Main List Section */}
      <section className="panel" aria-labelledby={isAdmin ? 'form-lifecycle-heading' : undefined}>
        {isAdmin ? (
          <>
            <header className="flex flex-col gap-4 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[1.25px] text-slate-400">Evaluation setup</p>
                <h2 id="form-lifecycle-heading" className="mt-1 text-[16px] font-semibold tracking-[-.25px] text-slate-800 dark:text-slate-100">Form lifecycle</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Review availability, deadlines, and response coverage for each form.</p>
              </div>
              <dl aria-label="Form status summary" className="grid grid-cols-4 gap-3 sm:gap-5">
                {([
                  ['Active', formLifecycleCounts.Running],
                  ['Paused', formLifecycleCounts.Paused],
                  ['Ended', formLifecycleCounts.Completed],
                  ['Archived', formLifecycleCounts.Archived],
                ] as const).map(([label, count]) => (
                  <div key={label} className="min-w-[48px]">
                    <dt className="text-[10px] text-slate-400">{label}</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{count}</dd>
                  </div>
                ))}
              </dl>
            </header>
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
              onManageAccess={() => setAccessPickerOpen(true)}
            />
            <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              Showing {filteredSurveys.length} {filteredSurveys.length === 1 ? 'form' : 'forms'}
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
                  <span className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white pl-3 pr-3 transition focus-within:border-[#2187CD] focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:ring-blue-950">
                    <Search size={16} className="shrink-0 text-[#2187CD] dark:text-blue-300" />
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
            <table className="survey-forms-table w-full min-w-[960px] table-fixed border-collapse text-xs">
              <colgroup>
                <col className="survey-forms-title-column" />
                <col className="survey-forms-category-column" />
                <col className="survey-forms-status-column" />
                <col className="survey-forms-completion-column" />
                <col className="survey-forms-deadline-column" />
                <col className="survey-forms-actions-column" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th scope="col" className="px-3 py-2.5">Survey Title</th>
                  <th scope="col" className="px-3 py-2.5">Category Type</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">Completion</th>
                  <th scope="col" className="px-3 py-2.5">Deadline Date</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSurveys.map((survey) => {
                  const deadlineLabel = formatDeadline(survey.deadlineDate);
                  const effectiveStatus = getSurveyStatus(survey);
                  const totalForType = companyTotalsBySurveyId[survey.id] || 0;
                  const completedForType = companyCompletedBySurveyId[survey.id] || 0;
 
                  return (
                    <tr key={survey.id} className={`align-middle hover:bg-slate-50/40 dark:hover:bg-slate-900/10 ${survey.status === 'Archived' ? 'bg-slate-50/80 text-slate-400 opacity-70 dark:bg-slate-950/50' : ''}`}>
                      <td className="px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="space-y-0.5">
                            <button
                              type="button"
                              onClick={() => { setPreviewSurveyId(survey.id); setDistributionFeedback(null); setPreviewPeriodSaveMessage(''); setPreviewPeriodSaveError(''); }}
                              className="block max-w-full truncate text-left text-[13px] font-semibold leading-5 text-slate-800 hover:text-[#2187CD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:text-slate-100 dark:hover:text-blue-300"
                              aria-label={`Preview ${survey.title}`}
                            >
                              {survey.title}
                            </button>
                            <p className="line-clamp-1 text-[11px] leading-4 text-slate-400 dark:text-slate-500" title={survey.description}>
                              {survey.description || 'No description provided.'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`${surveyBadgeClassName} ${surveyTypeBadges[survey.surveyType]}`}>
                          {survey.surveyType}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`${surveyBadgeClassName} ${
                          effectiveStatus === 'Running' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/20' :
                          effectiveStatus === 'Paused' ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/20' :
                          effectiveStatus === 'Completed' ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/20' :
                          'bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
                        }`}>
                          {effectiveStatus === 'Running' ? 'ACTIVE' :
                           effectiveStatus === 'Completed' ? 'ENDED' :
                           effectiveStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <CompletionStatusBar completed={completedForType} total={totalForType} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
                          <CalendarClock size={13} className="text-slate-400" />
                          {deadlineLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isAdmin ? (
                          <div className="survey-forms-row-actions flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => { setSelectedSurveyIds(new Set([survey.id])); setArchiveError(''); setIsArchiveConfirmOpen(true); }}
                              disabled={survey.status === 'Archived'}
                              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-2.5 text-xs font-semibold leading-none text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                              type="button"
                              title="Archive form"
                            >
                              <Archive size={14} aria-hidden="true" />
                              <span>Archive</span>
                            </button>
                            <button
                              onClick={() => { setPreviewSurveyId(survey.id); setDistributionFeedback(null); setPreviewPeriodSaveMessage(''); setPreviewPeriodSaveError(''); }}
                              disabled={survey.status === 'Archived'}
                              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#2187CD] px-2.5 text-xs font-semibold leading-none text-white transition hover:bg-[#1976B5] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-600 dark:hover:bg-blue-700"
                              type="button"
                              title="Preview and send form"
                            >
                              <Send size={14} aria-hidden="true" />
                              <span>Send</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={() => onSelectSurvey(survey.id)}
                              className="inline-flex items-center justify-center gap-2 w-36 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 px-4 py-2 text-sm font-semibold transition cursor-pointer"
                              type="button"
                              title="View evaluation details"
                            >
                              <Eye size={16} />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => onFillForm(survey.id)}
                              className="inline-flex items-center justify-center gap-2 w-36 rounded-lg bg-[#2187CD] text-white hover:bg-[#1976B5] dark:bg-blue-600 dark:hover:bg-blue-700 px-4 py-2 text-sm font-bold transition cursor-pointer"
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

      {isAdmin && (
        <section className="panel mt-4" aria-labelledby="evaluation-activity-heading">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 id="evaluation-activity-heading" className="text-base font-bold">Recent Activity</h2>
              <p className="text-xs text-slate-500">Evaluation form changes and distribution history</p>
            </div>
            <Clock3 size={18} className="text-slate-400" aria-hidden="true" />
          </div>
          {evaluationActivityEntries.length > 0 ? (
            <>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleActivityEntries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><b>{entry.action}</b><span className="ml-2 text-slate-500">{entry.details}</span></span>
                    <time className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
              <Pagination page={currentActivityPage} pageSize={activityPageSize} totalItems={evaluationActivityEntries.length}
                onPageChange={setActivityPage} onPageSizeChange={(size) => { setActivityPageSize(size); setActivityPage(1); }}
                ariaLabel="Recent Activity pagination" className="mt-3" showPageControls={activityTotalPages > 1 || activityPageSize !== EVALUATION_ACTIVITY_PAGE_SIZE} />
            </>
          ) : (
            <p className="py-4 text-sm text-slate-500">No evaluation activity recorded yet.</p>
          )}
        </section>
      )}

      {isAdmin && accessPickerOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="access-picker-title">
          <div aria-hidden="true" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" />
          <section className="relative flex max-h-[min(82vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 id="access-picker-title" className="text-lg font-bold text-slate-900 dark:text-white">Manage Access</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a form to update access and schedule.</p>
              </div>
              <button onClick={() => setAccessPickerOpen(false)} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close">
                <X size={20}/>
              </button>
            </header>

            <div className="space-y-4 overflow-y-auto px-6 py-5">
                <div className="space-y-2.5">
                {surveys
                  .filter((survey) => survey.status !== 'Archived')
                  .map((survey) => {
                    return (
                      <button
                        key={survey.id}
                        onClick={() => { setAccessPickerOpen(false); openSingleModify(survey); }}
                        className="group flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2187CD] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-800 dark:hover:bg-slate-800/70"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{survey.title}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{survey.surveyType}</span>
                            <SurveyAccessStatus survey={survey} />
                          </span>
                        </span>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition group-hover:border-sky-200 group-hover:text-[#2187CD] dark:border-slate-700 dark:text-slate-400 dark:group-hover:border-sky-800 dark:group-hover:text-sky-300" aria-hidden="true">
                          <Pencil size={15}/>
                        </span>
                      </button>
                    );
                  })}
                {surveys.filter((survey) => survey.status !== 'Archived').length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No forms available in this category.</p>
                )}
              </div>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">Click a survey card to open its access settings.</p>
              <button onClick={() => setAccessPickerOpen(false)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800">Dismiss</button>
            </footer>
          </section>
        </div>
      )}
      {previewSurvey && !previewEditSurveyId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="survey-preview-title">
          <div aria-hidden="true" className="fixed inset-0 bg-slate-950/45" />
          <section className="relative flex max-h-[88vh] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800"><div><p className="text-xs font-bold uppercase tracking-wide text-[#2187CD]">Survey preview · {previewSurvey.surveyType}</p><h2 id="survey-preview-title" className="mt-1 text-xl font-bold">{previewSurvey.title}</h2><p className="mt-1 text-sm text-slate-500">{previewSurvey.description}</p></div><button onClick={() => setPreviewSurveyId(null)} aria-label="Close preview"><X size={24}/></button></header>
            <div className="flex-1 space-y-3 overflow-y-auto p-5 sm:p-7">{previewSurvey.questions.slice().sort((a,b) => a.questionNumber-b.questionNumber).map((question, index) => <article key={question.questionId} className="rounded-xl border border-slate-200 p-5 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs font-semibold text-slate-500">{question.section ? `${question.section} · ` : ''}{question.questionCategory} · Question {question.questionNumber || index + 1}</p><h3 className="mt-2 font-semibold text-slate-800 dark:text-slate-100">{question.question}</h3>{question.question === 'Period Covered' && isAdmin ? <><div className="mt-3 space-y-2" role="radiogroup" aria-label="Set period covered for employee evaluations">{(['1st Half', '2nd Half', 'Annual'] as const).map((option) => <label key={option} className="flex min-h-8 cursor-pointer items-center gap-3 text-sm text-slate-600 dark:text-slate-300"><input type="radio" name={`period-covered-${previewSurvey.id}`} className="h-4 w-4 accent-[#2187CD] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2187CD]" checked={(previewSurvey.periodCovered ?? '1st Half') === option} disabled={(!onUpdateSurveysBulk && !onUpdateSurvey) || isSavingPreviewPeriod} onClick={() => void handlePreviewPeriodChange(option)} onChange={() => void handlePreviewPeriodChange(option)}/>{option}</label>)}</div>{isSavingPreviewPeriod && <p className="mt-2 text-xs text-slate-500" role="status">Saving period…</p>}{previewPeriodSaveMessage && <p className="mt-2 text-xs text-emerald-700" role="status">{previewPeriodSaveMessage}</p>}{previewPeriodSaveError && <p className="mt-2 text-xs text-rose-600" role="alert">{previewPeriodSaveError}</p>}</> : question.inputType === 'checkbox' || question.inputType === 'select' ? <div className="mt-3 space-y-2">{(question.options ?? []).map((option) => <div key={option} className="flex items-center gap-3 text-sm text-slate-600"><span className="h-4 w-4 rounded border border-slate-300"/>{option}</div>)}</div> : question.inputType === 'matrix' ? <div className="mt-3 space-y-2">{(question.subQuestions ?? []).map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><b>{item.label}</b>{item.description && <p className="text-xs text-slate-500">{item.description}</p>}</div>)}</div> : <div className="mt-3 max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-400">{question.inputType === 'typed-rating' ? `Enter a number from ${question.validationRange?.min ?? 0} to ${question.validationRange?.max ?? previewSurvey.maxRating ?? 100}${question.validationRange?.allowNa ? ' or N/A' : ''}` : question.inputType === 'date-range' ? 'Select date range' : question.inputType === 'text' ? 'Enter your response' : `Rating scale: 0 to ${previewSurvey.maxRating ?? 100}`}</div>}</article>)}</div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 dark:border-slate-800">{distributionFeedback && <p className={`mr-auto text-sm ${distributionFeedback.kind === 'error' ? 'text-rose-600' : 'text-emerald-700'}`} role="status">{distributionFeedback.text}</p>}<div className="ml-auto flex gap-2"><button onClick={() => { setPreviewEditError(''); setPreviewEditSurveyId(previewSurvey.id); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"><Pencil size={15}/> Edit Form</button><button onClick={() => { setSendCompanyIds(null); setDistributionFeedback(null); setSendConfirmationSurveyId(previewSurvey.id); }} className="inline-flex items-center gap-2 rounded-lg bg-[#2187CD] px-4 py-2 text-sm font-semibold text-white"><Send size={15}/> Send Form</button></div></footer>
          </section>
        </div>
      )}

      {previewEditSurvey && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label="Edit evaluation form">
          <section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900 sm:p-6"><div className="mb-3 flex justify-end"><button onClick={requestClosePreviewEdit} aria-label="Close editor"><X size={20}/></button></div>{previewEditError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{previewEditError}</p>}<CreateSurveyPage key={previewEditSurvey.id} surveyToEdit={previewEditSurvey} onBack={() => setPreviewEditSurveyId(null)} onRequestCloseReady={registerPreviewEditCloseRequest} onSave={handleSavePreviewEdit}/>{isSavingPreviewEdit && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/25"><p className="rounded-lg bg-white px-5 py-3 font-semibold shadow">Saving form…</p></div>}</section>
        </div>
      )}

      {sendConfirmationSurvey && isSendApprovalOpen && (
        <SendFormConfirmation
          title={sendConfirmationSurvey.title}
          surveyType={sendConfirmationSurvey.surveyType}
          recipientCount={eligibleRecipients.length}
          companyCount={getSurveyEvaluationCompanies({ ...sendConfirmationSurvey, ...(sendCompanyIds !== null ? { evaluationCompanyIds: sendCompanyIds } : {}) }, partnerCompanies).length}
          busy={isSendingForm}
          error={distributionFeedback?.kind === 'error' ? distributionFeedback.text : undefined}
          onClose={() => { if (!isSendingForm) setIsSendApprovalOpen(false); }}
          onConfirm={handleConfirmSend}
        />
      )}
      {sendConfirmationSurvey && isDiscardSendOpen && (
        <UnsavedChangesDialog
          description="Discard the company selection and close Send Form?"
          onContinue={() => setIsDiscardSendOpen(false)}
          onDiscard={() => {
            setIsDiscardSendOpen(false);
            setIsSendApprovalOpen(false);
            setSendConfirmationSurveyId(null);
            setSendCompanyIds(null);
          }}
        />
      )}
      {sendConfirmationSurvey && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="send-form-title">
          <div aria-hidden="true" className="absolute inset-0 bg-slate-950/50" />
            <section className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><header className="mb-3"><h2 id="send-form-title" className="text-lg font-bold">Confirm form distribution</h2><p className="text-sm text-slate-500">{sendConfirmationSurvey.title} · {sendConfirmationSurvey.surveyType}</p><p className="mt-2 text-sm"><b>{eligibleRecipients.length}</b> eligible employee{eligibleRecipients.length === 1 ? '' : 's'} based on category permissions and this form’s access settings.</p></header><SendFormCompanySelection surveyType={sendConfirmationSurvey.surveyType} companies={sendTopCompanies} selectedIds={sendCompanyIds} busy={isSendingForm || !onUpdateSurvey} onSelect={setSendCompanyIds} />{distributionFeedback?.kind === 'error' && <p role="alert" className="mb-3 text-sm text-rose-600">{distributionFeedback.text}</p>}<div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2">Employee</th><th className="p-2">Department</th><th className="p-2">Designation</th></tr></thead><tbody>{eligibleRecipients.map((recipient) => <tr key={recipient.email} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{recipient.email}</td><td className="p-2">{recipient.department}</td><td className="p-2">{recipient.designation}</td></tr>)}</tbody></table>{eligibleRecipients.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No eligible employees match the current access settings.</p>}</div>{sendDeadlineExpired && <p className="mt-3 text-sm text-rose-600">The deadline has passed. Update it in Manage Access before sending.</p>}<footer className="mt-4 flex justify-end gap-2"><button onClick={requestCloseSendConfirmation} disabled={isSendingForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button><button onClick={() => { setDistributionFeedback(null); setIsSendApprovalOpen(true); }} disabled={isSendingForm || !onUpdateSurvey || !eligibleRecipients.length || sendDeadlineExpired || (sendCompanySelectionRequired && !sendCompanyIds?.length)} className="rounded-lg bg-[#2187CD] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSendingForm ? 'Sending…' : (sendCompanyIds !== null || sendCompanySelectionRequired) ? 'Confirm & Save Selection' : getSurveyStatus(sendConfirmationSurvey) === 'Running' ? 'Confirm & Resend' : 'Confirm & Make Available'}</button></footer></section>
        </div>
      )}

      {/* Pending Companies Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
          />
          
          {/* Modal Panel */}
          <div className="relative bg-white dark:bg-slate-950 rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                  <Building2 size={18} className="text-[#2187CD] dark:text-blue-400" />
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
                      className="stroke-[#2187CD] dark:stroke-blue-500"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 20}`}
                      strokeDashoffset={`${2 * Math.PI * 20 * (1 - completionPercentage / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-extrabold text-[#2187CD] dark:text-blue-400">
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
                className="rounded-lg bg-[#2187CD] hover:bg-[#1976B5] text-white px-4 py-2 text-xs font-bold shadow-sm transition cursor-pointer"
                type="button"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Bulk Modify Footer Selection Bar & Modal Popup */}
      {isAdmin && (isSelectMode || isModifyOpen || isArchiveConfirmOpen) && (
        <>
          {/* Bottom Sticky Selection Bar (only when modal is NOT open) */}
          {isSelectMode && !isModifyOpen && (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] p-4 transition-all duration-300 animate-in slide-in-from-bottom">
              <div className="max-w-5xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#2187CD] dark:bg-blue-500 animate-pulse" />
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
                        : 'bg-[#2187CD] text-white hover:bg-[#1976B5] dark:bg-blue-600 dark:hover:bg-blue-700'
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
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] transition-opacity"
              />

              {/* Centered Modal Container */}
              <div className="relative w-full max-w-2xl h-[88vh] max-h-[calc(100dvh-2rem)] min-h-0 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Modal Title/Header (Static) */}
                <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                      Manage Access
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Applying to {selectedSurveyIds.size} selected survey {selectedSurveyIds.size === 1 ? 'form' : 'forms'} {selectedSurveyIds.size === 1 && surveys.find((survey) => selectedSurveyIds.has(survey.id)) ? <> (<span className="font-semibold text-slate-600 dark:text-slate-300">{surveys.find((survey) => selectedSurveyIds.has(survey.id))?.title}</span>)</> : null} · Step 2 of 2
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

                <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Manage access steps">
                    <button role="tab" aria-selected={modifyStep === 1} onClick={() => setModifyStep(1)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${modifyStep === 1 ? 'bg-[#2187CD] text-white shadow-sm' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700'}`}>Access &amp; Status</button>
                    <button role="tab" aria-selected={modifyStep === 2} onClick={() => setModifyStep(2)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${modifyStep === 2 ? 'bg-[#2187CD] text-white shadow-sm' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700'}`}>Schedule &amp; Notifications</button>
                  </div>
                </div>

                {/* Scrollable Content Area */}
                <div className={`flex-1 overflow-y-auto overscroll-contain ${modifyStep === 1 ? 'px-6 pb-6 pt-6 sm:px-12' : 'px-6 py-6'} space-y-6`}>
                  
                  {modifyStep === 1 ? (
                    <>
                      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                        <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">Category Filter:</span>
                        <select
                          aria-label="Filter manage access by category"
                          value={selectedAccessCategory}
                          onChange={(event) => {
                            const category = surveyTypeOptions.find(
                              (option): option is SurveyType => option !== 'All' && option === event.target.value
                            );
                            if (category) handleManageAccessCategoryChange(category);
                          }}
                          className="h-9 min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-[#2187CD] focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-950"
                        >
                          {surveyTypeOptions.filter((category): category is SurveyType => category !== 'All').map((category) => {
                            const categorySurveyCount = surveys.filter(
                              (survey) => survey.surveyType === category && survey.status !== 'Archived'
                            ).length;
                            return (
                              <option key={category} value={category} disabled={categorySurveyCount === 0}>
                                {category} ({categorySurveyCount} {categorySurveyCount === 1 ? 'form' : 'forms'})
                              </option>
                            );
                          })}
                          {selectedAccessCategories.length > 1 && <option value="Multiple Categories" disabled>Multiple Categories</option>}
                          {selectedAccessCategories.length === 0 && <option value="No Category" disabled>No Category</option>}
                        </select>
                      </label>

                      {/* Section 1: Survey Status & Archive */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">SURVEY STATUS</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">Select workflow state</span>
                        </div>

                        {/* Workflow state cards */}
                        <div className="grid gap-2 sm:grid-cols-3">
                          {([
                            { value: 'Running' as const, label: 'Active', dot: 'bg-emerald-500', detail: 'Open for incoming supplier submissions' },
                            { value: 'Paused' as const, label: 'Paused', dot: 'bg-amber-500', detail: 'Temporarily halt new incoming evaluations' },
                            { value: 'Completed' as const, label: 'Ended', dot: 'bg-rose-500', detail: 'Evaluation period ended and submissions closed' },
                          ]).map((option) => (
                            <label key={option.value} className={`relative min-h-[91px] cursor-pointer rounded-xl border p-3 text-xs transition ${overrideStatus && newStatus === option.value ? 'border-sky-500 bg-slate-100/80 dark:bg-slate-800/80' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                              <input type="radio" name="bulkStatus" checked={overrideStatus && newStatus === option.value} onChange={() => { setNewStatus(option.value); setArchiveEndedCategory(option.value === 'Completed'); setOverrideStatus(true); }} className="peer sr-only" />
                              <span className="absolute right-3 top-3 grid h-4 w-4 place-items-center rounded-full border border-slate-300 bg-white text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#2187CD] peer-checked:border-[#2187CD] peer-checked:bg-[#2187CD] dark:border-slate-600 dark:bg-slate-900 dark:peer-checked:bg-[#2187CD]">{overrideStatus && newStatus === option.value && <Check size={11} strokeWidth={3} />}</span>
                              <span className="flex items-center gap-2 pr-6 font-semibold text-slate-800 dark:text-slate-100"><i className={`h-2 w-2 rounded-full ${option.dot}`} />{option.label}</span>
                              <span className="mt-2 block pr-2 text-[11px] font-normal leading-4 text-slate-500 dark:text-slate-400">{option.detail}</span>
                            </label>
                          ))}
                          {overrideStatus && newStatus === 'Completed' && <p className="col-span-full flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"><Info size={14} className="mt-0.5 shrink-0"/><span><b>Important:</b> Saving as Ended archives current results for this partner category. You can view archived final rankings anytime in <span className="font-semibold underline">Company Leaderboard → Archives</span>.</span></p>}
                        </div>
                      </div>

                      {/* Section 2: Survey Access */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block uppercase tracking-wider">
                            Survey Access Restrictions
                          </label>
                          {isSelectMode && (
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={overrideAccess}
                                onChange={(event) => setOverrideAccess(event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]"
                              />
                              <span>Update access</span>
                            </label>
                          )}
                        </div>
                        <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">Specify departments and corporate tiers permitted to complete this evaluation.</p>

                        <div className={`grid gap-4 md:grid-cols-2 ${!overrideAccess ? 'opacity-60' : ''}`}>
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70">
                              <span className="text-[11px] font-bold uppercase text-slate-700 dark:text-slate-200">Departments</span>
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2187CD] dark:text-blue-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={!overrideAccess}
                                  checked={accessDepartments.length === departmentOptions.length}
                                  onChange={(event) => {
                                    setOverrideAccess(true);
                                    setAccessDepartments(event.target.checked ? departmentOptions : []);
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2187CD] focus:ring-[#2187CD]"
                                />
                                <span>Select All</span>
                              </label>
                            </div>
                            <div className="px-3 py-1">
                              {departmentOptions.map((department) => (
                                <label key={department} className="flex min-h-[31px] items-center gap-2 border-b border-slate-100 text-xs font-normal text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={!overrideAccess}
                                    checked={accessDepartments.includes(department)}
                                    onChange={() => toggleDepartmentAccess(department)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2187CD] focus:ring-[#2187CD]"
                                  />
                                  <span>{department}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70">
                              <span className="text-[11px] font-bold uppercase text-slate-700 dark:text-slate-200">Roles</span>
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2187CD] dark:text-blue-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={!overrideAccess}
                                  checked={accessRoles.length === roleOptions.length}
                                  onChange={(event) => {
                                    setOverrideAccess(true);
                                    setAccessRoles(event.target.checked ? roleOptions : []);
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2187CD] focus:ring-[#2187CD]"
                                />
                                <span>Select All</span>
                              </label>
                            </div>
                            <div className="px-3 py-1">
                              {roleOptions.map((role) => (
                                <label key={role} className="flex min-h-[31px] items-center gap-2 border-b border-slate-100 text-xs font-normal text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={!overrideAccess}
                                    checked={accessRoles.includes(role)}
                                    onChange={() => toggleRoleAccess(role)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2187CD] focus:ring-[#2187CD]"
                                  />
                                  <span>{role}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Modify Companies to Evaluate - single-survey modify only */}
                      {!isSelectMode && (
                        <div className="space-y-2 pt-1">
                          <h4 className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100">MODIFY COMPANIES TO EVALUATE</h4>
                          <button
                            onClick={() => setIsCompanyPickerOpen(true)}
                            className="w-full inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-left transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:bg-slate-800/60 cursor-pointer"
                            type="button"
                          >
                            <span className="rounded-lg border border-sky-100 bg-sky-50 p-2 text-[#2187CD] dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300"><Building2 size={16} /></span>
                            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">Modify Companies to Evaluate</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{evaluationCompanyIds.length} partner companies currently assigned</span></span>
                            <span className="shrink-0 text-xs font-semibold text-slate-400">Configure ›</span>
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {!isSelectMode && (() => {
                        const selectedSurvey = surveys.find((survey) => selectedSurveyIds.has(survey.id));
                        if (!selectedSurvey || (selectedSurvey.surveyType !== 'Courier' && selectedSurvey.surveyType !== 'Supplier')) return null;

                        return (
                          <div className="space-y-2">
                            <p className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100">PERIOD COVERED</p>
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                              <label htmlFor="manage-access-period" className="mb-2 block text-[11px] font-medium text-slate-600 dark:text-slate-300">Prefilled on employee evaluations</label>
                              <select
                                id="manage-access-period"
                                className="h-9 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2187CD] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                value={newPeriodCovered}
                                onChange={(event) => setNewPeriodCovered(event.target.value as NonNullable<CustomForm['periodCovered']>)}
                              >
                                <option value="1st Half">1st Half</option>
                                <option value="2nd Half">2nd Half</option>
                                <option value="Annual">Annual</option>
                              </select>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Section 3: Set Deadline */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-slate-900 dark:text-slate-100">SET DEADLINE</label>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                          <label htmlFor="manage-access-deadline" className="mb-2 block text-[11px] font-medium text-slate-600 dark:text-slate-300">Submission Cutoff Date</label>
                          <div className="relative max-w-xs">
                            <input
                              id="manage-access-deadline"
                              type="date"
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 pl-9 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2187CD] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                              value={newDeadlineDate}
                              onChange={(e) => {
                                setNewDeadlineDate(e.target.value);
                                setOverrideDeadline(true);
                              }}
                            />
                            <CalendarClock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Set Notification */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="block text-xs font-bold uppercase text-slate-900 dark:text-slate-100">SET NOTIFICATION</label>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">Saved preference only; scheduled delivery is not enabled.</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {[
                            { value: '4', label: 'Every 4 Hours', detail: 'High Frequency' },
                            { value: '8', label: 'Every 8 Hours' },
                            { value: '12', label: 'Every 12 Hours' },
                            { value: '24', label: 'Every 24 Hours', detail: 'STANDARD' },
                            { value: '48', label: 'Every 48 Hours' },
                          ].map((opt) => (
                            <label
                              key={opt.value}
                              className={`relative flex min-h-[46px] items-center gap-2 rounded-xl border px-3.5 py-2 pr-10 text-xs cursor-pointer transition last:sm:col-span-2 ${
                                notificationFrequency === opt.value
                                  ? 'border-2 border-[#2187CD] bg-sky-50/70 font-semibold text-[#2187CD] dark:border-blue-500 dark:bg-blue-950/20 dark:text-blue-300'
                                  : 'border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/30'
                              }`}
                            >
                              <input
                                type="radio"
                                name="popupReminderFreq"
                                checked={notificationFrequency === opt.value}
                                onChange={() => setNotificationFrequency(opt.value)}
                                className="peer sr-only"
                              />
                              <span className={`absolute right-3.5 grid h-4 w-4 place-items-center rounded-full ${notificationFrequency === opt.value ? 'bg-[#2187CD] text-white' : 'border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'}`}>
                                {notificationFrequency === opt.value && <Check size={11} strokeWidth={3} />}
                              </span>
                              <span>{opt.label}</span>
                              {opt.detail && <span className={opt.value === '24' ? 'rounded-full bg-[#2187CD] px-2 py-0.5 text-[9px] font-bold text-white' : 'text-[10px] font-normal text-slate-400'}>{opt.value === '4' ? '(High Frequency)' : opt.detail}</span>}
                            </label>
                          ))}
                        </div>
                      </div>

                    </>
                  )}

                </div>

                {/* Modal Footer (Static) */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <button
                    onClick={resetModifyState}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    type="button"
                  >
                    <ArrowLeft size={14} />
                    <span>Back</span>
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={handleBulkSaveChanges}
                      disabled={isSavingChanges}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-[#2187CD] px-4 text-xs font-semibold text-white transition hover:bg-[#1976B5] disabled:cursor-wait disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-700"
                      type="button"
                    >
                      {isSavingChanges ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                  {saveChangesError && <p className="w-full text-right text-xs font-semibold text-rose-600 dark:text-rose-400" role="alert">{saveChangesError}</p>}
                </div>

              </div>
            </div>
          )}

          {/* Modify Companies to Evaluate - full-screen picker (single-survey modify only) */}
          {isCompanyPickerOpen && (() => {
            const targetSurvey = surveys.find((s) => selectedSurveyIds.has(s.id));
            // The list contains active registered companies only. The Top 20
            // preset follows this category's volume-weighted Analytics ranking
            // and fills remaining slots with unscored active companies.
            const pickerCompanies = targetSurvey
              ? getAllCompaniesOfType(targetSurvey.surveyType, partnerCompanies)
              : [];
            const topTwentyCompanies = targetSurvey
              ? getEvaluationLeaderboardTopTwenty(partnerCompanies, responses, targetSurvey.surveyType)
              : [];
            const topTwentyCompanyIds = new Set(topTwentyCompanies.map((company) => company.id));
            const isExactSelection = (companies: PartnerCompany[]) =>
              companies.length === evaluationCompanyIds.length
              && companies.every((company) => evaluationCompanyIds.includes(company.id));
            const topTwentySelected = topTwentyCompanies.length > 0 && isExactSelection(topTwentyCompanies);
            const activeCompaniesSelected = pickerCompanies.length > 0 && isExactSelection(pickerCompanies);

            const toggleCompany = (id: string) => {
              setEvaluationCompanyIds((current) =>
                current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
              );
            };

            return (
              <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
                <div
                  className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
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
                      Choose which active {targetSurvey ? targetSurvey.surveyType.toLowerCase() : ''} partner companies this survey should evaluate. Archived companies are excluded. Within the Top 20 follows the current volume-weighted Analytics Company Leaderboard; active companies without scores fill any remaining spots. This selection controls which companies employees can rate.
                    </p>

                    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30" aria-label="Company selection presets">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                          <input
                            type="checkbox"
                            checked={topTwentySelected}
                            disabled={topTwentyCompanies.length === 0}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setEvaluationCompanyIds(topTwentyCompanies.map((company) => company.id));
                                setEvaluationCompanyPreset('within-top-20');
                              } else {
                                setEvaluationCompanyIds([]);
                                setEvaluationCompanyPreset(null);
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]"
                          />
                          <span>Within the Top 20 ({topTwentyCompanies.length})</span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={activeCompaniesSelected}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setEvaluationCompanyIds(pickerCompanies.map((company) => company.id));
                              setEvaluationCompanyPreset('active-companies');
                            } else {
                              setEvaluationCompanyIds([]);
                              setEvaluationCompanyPreset(null);
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]"
                        />
                        <span>Active Partners ({pickerCompanies.length})</span>
                      </label>
                    </div>

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
                              onChange={() => {
                                setEvaluationCompanyPreset(null);
                                toggleCompany(company.id);
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]"
                            />
                            <Building2 size={14} className="text-slate-400 shrink-0" />
                            <span className="flex-1">{company.name}</span>
                            {!topTwentyCompanyIds.has(company.id) && (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                Outside Current Top 20
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
                      className="px-5 py-2.5 rounded-xl bg-[#2187CD] text-white hover:bg-[#1976B5] dark:bg-blue-600 dark:hover:bg-blue-700 text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-md"
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
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="archive-form-title">
              <div aria-hidden="true" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" />
              <section className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                      <Archive size={17} />
                    </span>
                    <div>
                      <h3 id="archive-form-title" className="text-base font-semibold text-slate-900 dark:text-white">
                        Archive this form?
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {surveys.filter((survey) => selectedSurveyIds.has(survey.id)).map((survey) => survey.title).join(', ') || `${selectedSurveyIds.size} selected forms`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    disabled={isArchiving}
                    onClick={() => setIsArchiveConfirmOpen(false)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <X size={18} />
                  </button>
                </header>

                <div className="space-y-3 px-5 py-4">
                  <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">
                    This form will move below active forms and stop accepting responses. Its questions, settings, and historical responses will be preserved.
                  </p>
                  {archiveError && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" role="alert">
                      {archiveError}
                    </p>
                  )}
                </div>

                <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/30">
                  <button
                    onClick={() => {
                      setIsArchiveConfirmOpen(false);
                      setArchiveError('');
                    }}
                    disabled={isArchiving}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProceedArchive}
                    disabled={isArchiving}
                    className="h-9 rounded-lg bg-rose-600 px-3.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                    type="button"
                  >
                    {isArchiving ? 'Archiving…' : 'Archive form'}
                  </button>
                </footer>
              </section>
            </div>
          )}

        </>
      )}
    </div>
  );
}
