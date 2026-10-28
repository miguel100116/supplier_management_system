import { toNotification, groupResponsesToNotifications } from '../features/notifications/domain/responseNotifications';
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { QuestionDefinition, ResponseNotification, SurveyResponse, SurveyType, CustomForm, Rating, PartnerCompany, PartnerCompanyType, BranchRecord, ArchiveSeries, SupplierOrigin, ComplianceDocument, DocumentAlertDetail } from '../types/survey';
import { surveyQuestions } from '../data/questions';
import {
  ImportResult,
  MasterListImportReview,
  MasterListSourceFile,
  mergeMasterListSourceFiles,
  prepareMasterListSourceFiles,
} from '../features/partner-companies/services/masterListImport';
import { importArchivedResponsesFromFile, ArchiveImportResult } from '../features/archives/services/archiveResponseTransfer';
import {
  previewRawEvaluationImport as previewRawEvaluationImportFile,
  commitRawEvaluationImport as commitRawEvaluationImportRows,
  RawEvalPreview,
  RawEvalImportSummary,
  CompanyDecision,
} from '../features/evaluation-imports/services/rawEvaluationImport';
import { logAdminActivity } from '../features/account-management/services/adminActivityLog';
import { computeCompanyDocumentSummary, computeDocumentStatus, EXPIRING_SOON_DAYS } from '../features/document-tracker/domain/compliance';
import { parseDeploymentEnvironment, submissionSourceForEnvironment } from '../features/analytics/domain/responseProvenance';
import { reconcileEvaluationBatchPartners } from '../features/evaluation-imports/domain/evaluationBatch';
import { createImportedResponseFilter } from '../features/evaluation-imports/services/importedResponseIdentity';
import { prepareDefaultSurveysForReactivation } from '../features/evaluation-imports/domain/surveyReactivation';
import { testImportToken } from '../features/evaluation-imports/domain/testImport';
import { getRequiredDocumentKeys } from '../features/document-tracker/domain/documentRequirements';
import { getNotificationSettings, NOTIFICATION_SETTINGS_CHANGED_EVENT } from '../features/notifications/services/documentNotificationSettings';
import { loadNormalizedPartnerCompanies, normalizeDatabasePartnerCompany } from '../services/normalizedPartnerCompanies';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { getSupabaseSessionEmail } from '../services/supabasePasswordAuth';
import {
  APPLICATION_RECORD_CHANGED_EVENT,
  APPLICATION_PROFILES_CHANGED_EVENT,
  type ApplicationRecordType,
  deleteApplicationRecords,
  loadApplicationRecords,
  loadApplicationRecordsByIds,
  loadNotificationReadState,
  mergeApplicationRecordsById,
  replaceApplicationRecords,
  renewPartnerDocument,
  saveNotificationReadState,
  surveyResponseRecordId,
  upsertApplicationRecords,
} from '../services/applicationRepository';
import { CATEGORIES_STORAGE_KEY, DEFAULT_CATEGORIES, LEGACY_OVERALL_CATEGORY, OVERALL_CATEGORY, getStoredCategoryLabels } from '../data/questionCategories';
import type { NotificationReadState } from '../features/notifications/domain/notificationReadState';
import {
  createNotificationReadState,
  newestNotificationReadState,
  notificationReadStateUserKey,
  parseNotificationReadState,
} from '../features/notifications/domain/notificationReadState';
import { createDebouncedTask } from '../utils/debouncedTask';
import { createCoalescedTaskRunner, createRefreshGuard } from '../utils/coalescedTask';

// Versioned browser cache for the authenticated Partner Company registry.
// A missing cache starts empty until Supabase hydration completes.
const PARTNER_COMPANIES_STORAGE_KEY = 'survey_analytics_partner_companies_v8';

const NOTIFICATION_HISTORY_LIMIT = 200;
const INITIAL_NOTIFICATION_SEED = 15;
const NOTIFICATION_READ_STATE_STORAGE_PREFIX = 'notification_read_state_v1:';
const ALL_DEPARTMENTS = [
  'Accounts Payable - Trade',
  'Business Solutions Manager',
  'Executive Office',
  'Logistics',
  'Procurement Group',
  'TASS'
];

interface PersistedDocumentReminderDelivery {
  id: string;
  companyId: string;
  company: string;
  surveyType?: SurveyType;
  branchId?: string;
  branchCode?: string;
  documentName: string;
  expiryDate: string;
  daysLeft: number;
  milestone: string;
  deliveredAt: string;
}

function notificationReadStateStorageKey(userEmail: string): string {
  return `${NOTIFICATION_READ_STATE_STORAGE_PREFIX}${notificationReadStateUserKey(userEmail)}`;
}

function loadCachedNotificationReadState(userEmail: string): NotificationReadState | null {
  try {
    const stored = localStorage.getItem(notificationReadStateStorageKey(userEmail));
    return stored ? parseNotificationReadState(JSON.parse(stored), userEmail) : null;
  } catch {
    return null;
  }
}

function cacheNotificationReadState(state: NotificationReadState): void {
  safeSetItem(notificationReadStateStorageKey(state.userEmail), JSON.stringify(state));
}

function documentAlertId(kind: string, companyId: string, details: DocumentAlertDetail[]): string {
  const signature = details
    .map((detail) => [detail.branchId ?? detail.branchCode ?? '', detail.documentName, detail.expiryDate ?? '', detail.milestoneDays ?? ''].join(':'))
    .sort()
    .join('|');
  return `document-${kind}-${companyId}-${encodeURIComponent(signature)}`;
}

const ALL_SURVEY_ACCESS_ROLES = ['Rank & File', 'Supervisory', 'Managerial', 'Director', 'Executive'] as const;

function normalizeSurveyType(value: unknown): SurveyType {
  if (value === 'Contractor') return 'Courier';
  if (value === 'Courier' || value === 'Supplier' || value === 'Subcontractor') return value;
  return 'Courier';
}

function ensureOverallFeedbackQuestion(form: CustomForm): CustomForm {
  const expectedId = 
    form.surveyType === 'Courier' ? 'Q-CON-OVERALL-FEEDBACK' :
    form.surveyType === 'Supplier' ? 'Q-SUP-OVERALL-FEEDBACK' :
    'Q-SUB-OVERALL-FEEDBACK';

  const hasQuestion = form.questions.some(q => q.questionId === expectedId);
  if (hasQuestion) {
    return form;
  }

  const maxNum = form.questions.reduce((max, q) => Math.max(max, q.questionNumber || 0), 0);
  const nextNum = maxNum + 1;

  const feedbackQuestion = {
    questionId: expectedId,
    questionNumber: nextNum,
    question: 'Overall Comments and Feedback on the Company',
    questionCategory: OVERALL_CATEGORY,
    section: 'Overall Comments & Feedback',
    inputType: 'text' as const
  };

  return {
    ...form,
    questions: [...form.questions, feedbackQuestion]
  };
}

// One-time self-healing migration: questions saved before the "Overall"
// category existed carry the old 'General' label - rewrite them in place so
// the survey editor's dropdown (which only offers Overall, not General) and
// every chart/report grouping by questionCategory show one consistent name.
function migrateGeneralCategory(form: CustomForm): CustomForm {
  const hasLegacy = form.questions.some((q) => q.questionCategory === LEGACY_OVERALL_CATEGORY);
  if (!hasLegacy) return form;
  return {
    ...form,
    questions: form.questions.map((q) =>
      q.questionCategory === LEGACY_OVERALL_CATEGORY ? { ...q, questionCategory: OVERALL_CATEGORY } : q
    ),
  };
}

function normalizeCustomForm(form: CustomForm): CustomForm {
  const normForm = {
    ...form,
    surveyType: normalizeSurveyType(form.surveyType),
    accessDepartments: form.accessDepartments?.length ? form.accessDepartments : ALL_DEPARTMENTS,
    accessRoles: form.accessRoles?.length ? form.accessRoles : [...ALL_SURVEY_ACCESS_ROLES],
  };
  return migrateGeneralCategory(ensureOverallFeedbackQuestion(normForm));
}

function normalizePartnerCompanyType(value: unknown): PartnerCompanyType {
  if (value === 'Contractor') return 'Courier';
  if (value === 'Courier' || value === 'Supplier' || value === 'Subcontractor' || value === 'Uncategorized') return value;
  return 'Courier';
}

function normalizePartnerCompany(company: PartnerCompany): PartnerCompany {
  const defaultRegisteredAt = company.createdAt ? company.createdAt.split('T')[0] : '2025-01-15';

  const normalizedType = normalizePartnerCompanyType(company.type);

  // Every company gets at least one branch record so downstream UI (branch
  // list, compliance documents) never has to special-case "hasn't been
  // migrated yet". A company that already has branches (e.g. from a future
  // master-list import) keeps them as-is.
  const defaultBranches: BranchRecord[] =
    company.branches && company.branches.length > 0
      ? company.branches
      : [{ id: `${company.id}-branch-1`, bpCode: '' }];

  return {
    registeredAt: defaultRegisteredAt,
    isArchived: false,
    // Existing/seeded companies are already-registered partners, so default
    // them to Accredited; a real import can override this per row.
    accreditationStatus: 'Accredited',
    // Only Suppliers carry a Local/Foreign origin. Legacy seeded suppliers
    // predate this distinction, so default them to Local (all known to be
    // local vendors) unless already set.
    supplierOrigin: normalizedType === 'Supplier' ? 'Local' : undefined,
    ...company,
    type: normalizedType,
    branches: defaultBranches,
  };
}

function normalizeSurveyResponse(response: SurveyResponse): SurveyResponse {
  return {
    ...response,
    surveyType: normalizeSurveyType(response.surveyType),
    questionCategory: response.questionCategory === LEGACY_OVERALL_CATEGORY ? OVERALL_CATEGORY : response.questionCategory,
  };
}

// Minimal shape needed from an account record — kept structural (not imported
// from App.tsx) to avoid a circular import between the hook and the app shell.
export interface SurveyAccount {
  email: string;
  role: string;
  designation: string;
  department: string;
}

interface CompressedSubmission {
  i: string; // responseId
  ui?: string; // surveyId
  ci?: string; // companyId
  ds?: SurveyResponse['dataSource']; // analytics provenance
  ib?: string; // importBatchId
  t: SurveyType; // surveyType
  r: string; // respondentType
  st?: string; // startTime
  s: string; // submissionDate
  c: string; // company
  d?: string; // department
  ad?: string; // address
  e?: string; // respondentEmail
  ar?: boolean; // archived
  aat?: string; // archivedAt
  asi?: string; // archivedBySurveyId
  ast?: string; // archivedBySurveyTitle
  si?: string; // seriesId
  a: { // answers
    q: string; // questionId
    n: number; // questionNumber
    x: string; // question
    g: string; // questionCategory
    v: Rating; // rating
    m: string; // comment
  }[];
}

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to save key "${key}" to localStorage:`, error);
    return false;
  }
}

function compressResponses(responses: SurveyResponse[]): CompressedSubmission[] {
  const map = new Map<string, CompressedSubmission>();
  
  for (const resp of responses) {
    let comp = map.get(resp.responseId);
    if (!comp) {
      comp = {
        i: resp.responseId,
        t: resp.surveyType,
        r: resp.respondentType,
        s: resp.submissionDate,
        c: resp.company,
        a: []
      };
      if (resp.surveyId !== undefined) comp.ui = resp.surveyId;
      if (resp.companyId !== undefined) comp.ci = resp.companyId;
      if (resp.dataSource !== undefined) comp.ds = resp.dataSource;
      if (resp.importBatchId !== undefined) comp.ib = resp.importBatchId;
      if (resp.startTime !== undefined) comp.st = resp.startTime;
      if (resp.department !== undefined) comp.d = resp.department;
      if (resp.address !== undefined) comp.ad = resp.address;
      if (resp.respondentEmail !== undefined) comp.e = resp.respondentEmail;
      if (resp.archived !== undefined) comp.ar = resp.archived;
      if (resp.archivedAt !== undefined) comp.aat = resp.archivedAt;
      if (resp.archivedBySurveyId !== undefined) comp.asi = resp.archivedBySurveyId;
      if (resp.archivedBySurveyTitle !== undefined) comp.ast = resp.archivedBySurveyTitle;
      if (resp.seriesId !== undefined) comp.si = resp.seriesId;

      map.set(resp.responseId, comp);
    }
    comp.a.push({
      q: resp.questionId,
      n: resp.questionNumber,
      x: resp.question,
      g: resp.questionCategory,
      v: resp.rating,
      m: resp.comment
    });
  }
  
  return Array.from(map.values());
}

function decompressResponses(compressed: any[]): SurveyResponse[] {
  if (!Array.isArray(compressed)) return [];
  if (compressed.length === 0) return [];
  
  // If the elements are in the old uncompressed format, return them directly
  if ('responseId' in compressed[0]) {
    return compressed as SurveyResponse[];
  }
  
  const responses: SurveyResponse[] = [];
  for (const item of compressed as CompressedSubmission[]) {
    for (const ans of item.a) {
      const resp: SurveyResponse = {
        responseId: item.i,
        surveyType: item.t,
        respondentType: item.r,
        submissionDate: item.s,
        company: item.c,
        questionId: ans.q,
        questionNumber: ans.n,
        question: ans.x,
        questionCategory: ans.g,
        rating: ans.v,
        comment: ans.m
      };
      if (item.ui !== undefined) resp.surveyId = item.ui;
      if (item.ci !== undefined) resp.companyId = item.ci;
      if (item.ds !== undefined) resp.dataSource = item.ds;
      if (item.ib !== undefined) resp.importBatchId = item.ib;
      if (item.st !== undefined) resp.startTime = item.st;
      if (item.d !== undefined) resp.department = item.d;
      if (item.ad !== undefined) resp.address = item.ad;
      if (item.e !== undefined) resp.respondentEmail = item.e;
      if (item.ar !== undefined) resp.archived = item.ar;
      if (item.aat !== undefined) resp.archivedAt = item.aat;
      if (item.asi !== undefined) resp.archivedBySurveyId = item.asi;
      if (item.ast !== undefined) resp.archivedBySurveyTitle = item.ast;
      if (item.si !== undefined) resp.seriesId = item.si;

      responses.push(resp);
    }
  }
  
  return responses;
}

export function useSurveyData(accounts: SurveyAccount[] = [], currentUserEmail?: string | null, isAdmin?: boolean) {
  const [responses, setResponsesState] = useState<SurveyResponse[]>([]);
  const activeUserRef = useRef(currentUserEmail);
  activeUserRef.current = currentUserEmail;
  const responsesRef = useRef(responses);
  const [responseRefreshGuard] = useState(createRefreshGuard);
  const setResponses = useCallback((update: SetStateAction<SurveyResponse[]>) => {
    const next = typeof update === 'function' ? update(responsesRef.current) : update;
    if (next !== responsesRef.current) responseRefreshGuard.invalidate();
    responsesRef.current = next;
    setResponsesState(next);
  }, [responseRefreshGuard]);
  const [surveys, setSurveys] = useState<CustomForm[]>([]);
  const [partnerCompanies, setPartnerCompanies] = useState<PartnerCompany[]>([]);
  const [categoryLabels, setCategoryLabels] = useState<Record<SurveyType, string[]>>(() => getStoredCategoryLabels());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<ResponseNotification[]>([]);
  const [unreadNotificationIds, setUnreadNotificationIds] = useState<Set<string>>(() => new Set());
  const knownSystemNotificationIdsRef = useRef<Set<string>>(new Set());
  const readNotificationIdsRef = useRef<Set<string>>(new Set());
  const systemNotificationDetectedAtRef = useRef<Map<string, string>>(new Map());
  const notificationOwnerRef = useRef<string | null>(currentUserEmail?.trim().toLowerCase() ?? null);
  const notificationPersistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [documentClock, setDocumentClock] = useState(() => new Date());
  const [documentReminderDeliveries, setDocumentReminderDeliveries] = useState<PersistedDocumentReminderDelivery[]>([]);

  useEffect(() => {
    if (!isAdmin) {
      setDocumentReminderDeliveries([]);
      return;
    }
    const controller = new AbortController();
    void loadApplicationRecords<PersistedDocumentReminderDelivery>('document_reminder_delivery', { signal: controller.signal })
      .then(setDocumentReminderDeliveries)
      .catch(() => { if (!controller.signal.aborted) setDocumentReminderDeliveries([]); });
    const refreshDeliveries = (event: Event) => {
      const recordType = (event as CustomEvent<{ recordType?: ApplicationRecordType }>).detail?.recordType;
      if (recordType !== 'document_reminder_delivery') return;
      void loadApplicationRecords<PersistedDocumentReminderDelivery>('document_reminder_delivery', { signal: controller.signal })
        .then(setDocumentReminderDeliveries)
        .catch(() => { if (!controller.signal.aborted) setDocumentReminderDeliveries([]); });
    };
    window.addEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshDeliveries);
    return () => { controller.abort(); window.removeEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshDeliveries); };
  }, [isAdmin]);

  useEffect(() => {
    const timer = window.setInterval(() => setDocumentClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const detectedAtForNotification = (id: string, currentDate: Date): string => {
    const existing = systemNotificationDetectedAtRef.current.get(id);
    if (existing) return existing;
    const detectedAt = currentDate.toISOString();
    systemNotificationDetectedAtRef.current.set(id, detectedAt);
    return detectedAt;
  };

  const persistRemoteAsync = async (operation: Promise<void>): Promise<void> => {
    setError(null);
    try {
      await operation;
    } catch (persistenceError) {
      if (isMountedRef.current) {
        setError(persistenceError instanceof Error ? persistenceError.message : 'Unable to save data to Supabase.');
      }
      throw persistenceError;
    }
  };

  const persistRemote = (operation: Promise<void>) => {
    void persistRemoteAsync(operation).catch(() => undefined);
  };

  const persistNotificationReadIds = (readIds: Set<string>) => {
    if (!currentUserEmail) return;
    const state = createNotificationReadState(currentUserEmail, readIds);
    readNotificationIdsRef.current = new Set(state.readNotificationIds);
    cacheNotificationReadState(state);
    if (isSupabaseConfigured) {
      const operation = notificationPersistenceQueueRef.current
        .catch(() => undefined)
        .then(() => saveNotificationReadState(state));
      notificationPersistenceQueueRef.current = operation;
      persistRemote(operation);
    }
  };

  const [archiveSeries, setArchiveSeries] = useState<ArchiveSeries[]>(() => {
    try {
      const data = localStorage.getItem('survey_archive_series_v1');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  });

  // Resolves a freeform label to an existing series (case-insensitive match)
  // or creates+persists a new one. Returns the series id to stamp onto
  // responses being archived.
  const getOrCreateSeries = (label: string): string => {
    const trimmed = label.trim();
    const existing = archiveSeries.find((s) => s.label.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;

    const newSeries: ArchiveSeries = {
      id: `series-${Date.now()}`,
      label: trimmed,
      createdAt: new Date().toISOString(),
    };
    const updated = [...archiveSeries, newSeries];
    setArchiveSeries(updated);
    safeSetItem('survey_archive_series_v1', JSON.stringify(updated));
    persistRemote(upsertApplicationRecords('archive_series', [newSeries], (series) => series.id));
    return newSeries.id;
  };

  const renameArchiveSeries = (id: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const updated = archiveSeries.map((s) => (s.id === id ? { ...s, label: trimmed } : s));
    setArchiveSeries(updated);
    safeSetItem('survey_archive_series_v1', JSON.stringify(updated));
    const renamed = updated.find((series) => series.id === id);
    if (renamed) persistRemote(upsertApplicationRecords('archive_series', [renamed], (series) => series.id));
  };

  const isMountedRef = useRef(true);

  // Initialize and load surveys & responses
  useEffect(() => {
    isMountedRef.current = true;

    // When Supabase is configured, skip the localStorage-first boot entirely.
    // The Supabase hydration useEffect below is the sole data source in that
    // case. Loading from localStorage first and then overwriting it 1-3
    // seconds later is what causes visible data inconsistency: users see
    // stale local state before Supabase arrives. Starting empty and waiting
    // for the real source avoids the flicker and ensures every user sees the
    // same shared dataset immediately after sign-in.
    if (isSupabaseConfigured) {
      // Run one-time cleanup of any stale localStorage keys from older builds
      // so they don't re-appear if Supabase is later removed/deconfigured.
      localStorage.removeItem('survey_analytics_surveys_v6');
      localStorage.removeItem('survey_analytics_responses_v6');
      localStorage.removeItem(PARTNER_COMPANIES_STORAGE_KEY);
      return;
    }

    function initData() {
      try {
        setIsLoading(true);

        // One-time cleanup for stale frontend-generated records left by older
        // builds. The partner registry cache is retained until authenticated
        // Supabase hydration replaces it.
        if (localStorage.getItem('survey_analytics_migration_v7_fresh') !== 'true') {
          localStorage.removeItem('survey_analytics_surveys_v6');
          localStorage.removeItem('survey_analytics_responses_v6');
          localStorage.removeItem('survey_analytics_full_dataset_active');
          localStorage.removeItem('survey_sim_clock_v1');
          localStorage.setItem('survey_analytics_migration_v7_fresh', 'true');
        }

        // 1. Handle Surveys (Forms)
        let loadedSurveys: CustomForm[] = [];
        const savedSurveys = localStorage.getItem('survey_analytics_surveys_v6');
        if (savedSurveys) {
          loadedSurveys = JSON.parse(savedSurveys).map(normalizeCustomForm);
          safeSetItem('survey_analytics_surveys_v6', JSON.stringify(loadedSurveys));
        } else {
          // Create 3 standard default surveys based on initial static questions
          const contractorQuestions = [
            {
              questionId: 'Q-CON-03',
              questionNumber: 1,
              question: 'Period Covered',
              questionCategory: 'General',
              section: 'SECTION 2',
              inputType: 'select' as const,
              options: [
                '1st Half',
                '2nd Half',
                'Annual'
              ]
            },
            {
              questionId: 'Q-CON-04',
              questionNumber: 2,
              question: 'Does the courier consistently deliver our goods to our customers on the agreed date or period?',
              questionCategory: 'Delivery',
              section: 'SECTION 2: Reliability/Delivery (30 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 15, allowNa: true }
            },
            {
              questionId: 'Q-CON-05',
              questionNumber: 5,
              question: 'Does the courier service maintain a consistent level of acceptable service over time?',
              questionCategory: 'Delivery',
              section: 'SECTION 2: Reliability/Delivery (30 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 15, allowNa: true }
            },
            {
              questionId: 'Q-CON-06',
              questionNumber: 6,
              question: 'Please provide any additional comments on Reliability and Delivery performance.',
              questionCategory: 'Delivery',
              section: 'SECTION 2: Reliability/Delivery (30 points)',
              inputType: 'text' as const
            },
            {
              questionId: 'Q-CON-07',
              questionNumber: 7,
              question: "Are the courier's rates competitive and transparent?",
              questionCategory: 'Commercial',
              section: 'SECTION 3: Cost (20 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 7, allowNa: true }
            },
            {
              questionId: 'Q-CON-08',
              questionNumber: 8,
              question: 'Are there any hidden fees or surcharges?',
              questionCategory: 'Commercial',
              section: 'SECTION 3: Cost (20 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 7, allowNa: true }
            },
            {
              questionId: 'Q-CON-09',
              questionNumber: 9,
              question: 'Are they offering flexible payment options, e.g., credit cards or invoicing, and payment credit line?',
              questionCategory: 'Commercial',
              section: 'SECTION 3: Cost (20 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 6, allowNa: true }
            },
            {
              questionId: 'Q-CON-10',
              questionNumber: 10,
              question: 'Please provide any additional comments on Cost and pricing.',
              questionCategory: 'Commercial',
              section: 'SECTION 3: Cost (20 points)',
              inputType: 'text' as const
            },
            {
              questionId: 'Q-CON-11',
              questionNumber: 11,
              question: 'Do they have advanced tracking systems allowing customers for real-time monitoring of the status and location of their packages?',
              questionCategory: 'Technology',
              section: 'SECTION 4: Technology (10 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 5, allowNa: true }
            },
            {
              questionId: 'Q-CON-12',
              questionNumber: 12,
              question: 'Do they have online platforms and mobile apps provided to customers to schedule pickups, make payments, and arrange deliveries?',
              questionCategory: 'Technology',
              section: 'SECTION 4: Technology (10 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 5, allowNa: true }
            },
            {
              questionId: 'Q-CON-13',
              questionNumber: 13,
              question: 'Please provide any additional comments on Technology and online tools.',
              questionCategory: 'Technology',
              section: 'SECTION 4: Technology (10 points)',
              inputType: 'text' as const
            },
            {
              questionId: 'Q-CON-14',
              questionNumber: 14,
              question: 'Do they have a helpful and responsive customer support team?',
              questionCategory: 'Support',
              section: 'SECTION 5: Customer Service (25 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 10, allowNa: true }
            },
            {
              questionId: 'Q-CON-15',
              questionNumber: 15,
              question: "Do they effectively handle the customer's issues, and complaints, e.g., lost shipment, item, defective items?",
              questionCategory: 'Support',
              section: 'SECTION 5: Customer Service (25 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 10, allowNa: true }
            },
            {
              questionId: 'Q-CON-16',
              questionNumber: 16,
              question: 'Does the courier have a prompt payment process in case of mishandled goods, e.g., broken or missing goods?',
              questionCategory: 'Support',
              section: 'SECTION 5: Customer Service (25 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 5, allowNa: true }
            },
            {
              questionId: 'Q-CON-17',
              questionNumber: 17,
              question: 'Please provide any additional comments on Customer Service and support.',
              questionCategory: 'Support',
              section: 'SECTION 5: Customer Service (25 points)',
              inputType: 'text' as const
            },
            {
              questionId: 'Q-CON-18',
              questionNumber: 18,
              question: 'Do they ensure the safety and security of our packages/parcels during transit and delivery to the client\'s site?',
              questionCategory: 'Security',
              section: 'SECTION 6: Security (15 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 5, allowNa: true }
            },
            {
              questionId: 'Q-CON-19',
              questionNumber: 19,
              question: 'Do they include insurance options to cover potential loss or damage to our items?',
              questionCategory: 'Security',
              section: 'SECTION 6: Security (15 points)',
              inputType: 'typed-rating' as const,
              validationRange: { min: 0, max: 10, allowNa: true }
            },
            {
              questionId: 'Q-CON-20',
              questionNumber: 20,
              question: 'Please provide any additional comments on Security and safety.',
              questionCategory: 'Security',
              section: 'SECTION 6: Security (15 points)',
              inputType: 'text' as const
            }
          ];
          const supplierQuestions = [
  {
    "questionId": "Q-SUP-03",
    "questionNumber": 1,
    "question": "Period Covered",
    "questionCategory": "General",
    "section": "SECTION 1",
    "inputType": "select",
    "options": [
      "1st Half",
      "2nd Half",
      "Annual"
    ]
  },
  {
    "questionId": "Q-SUP-05",
    "questionNumber": 2,
    "question": "Does the supplier use the correct documents to facilitate the delivery of sale transaction? (BIR Registered, DR, SI/BS, OR/CR)",
    "questionCategory": "Documentation",
    "section": "Documentation (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 4,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-06",
    "questionNumber": 3,
    "question": "Are the required documents complete for every transaction?",
    "questionCategory": "Documentation",
    "section": "Documentation (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 4,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-07",
    "questionNumber": 4,
    "question": "Are documents clean, neat and readable?",
    "questionCategory": "Documentation",
    "section": "Documentation (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 4,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-08",
    "questionNumber": 5,
    "question": "Are documents presented/submitted upon delivery?",
    "questionCategory": "Documentation",
    "section": "Documentation (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 4,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-09",
    "questionNumber": 6,
    "question": "Are documents presented/submitted upon payments?",
    "questionCategory": "Documentation",
    "section": "Documentation (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 4,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-10",
    "questionNumber": 7,
    "question": "Documentation Remarks",
    "questionCategory": "Documentation",
    "section": "Documentation (20 points)",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUP-11",
    "questionNumber": 8,
    "question": "Does the supplier deliver the product on time based on the agreed schedule?",
    "questionCategory": "Delivery",
    "section": "Delivery (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-12",
    "questionNumber": 9,
    "question": "Does the supplier deliver the product in proper packaging and in good condition?",
    "questionCategory": "Delivery",
    "section": "Delivery (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-13",
    "questionNumber": 10,
    "question": "Does the supplier deliver the products sealed and safe and free for possible contamination?",
    "questionCategory": "Delivery",
    "section": "Delivery (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 6,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-14",
    "questionNumber": 11,
    "question": "Delivery Remarks",
    "questionCategory": "Delivery",
    "section": "Delivery (20 points)",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUP-15",
    "questionNumber": 12,
    "question": "Does the supplier change the price without any notice to MBS Procurement/BSM?",
    "questionCategory": "Price",
    "section": "Price/Cost Effectiveness (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 6,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-16",
    "questionNumber": 13,
    "question": "Is the supplier open for negotiation in terms of price?",
    "questionCategory": "Price",
    "section": "Price/Cost Effectiveness (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-17",
    "questionNumber": 14,
    "question": "Is the supplier pricing competitive with other suppliers?",
    "questionCategory": "Price",
    "section": "Price/Cost Effectiveness (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-18",
    "questionNumber": 15,
    "question": "Price/Cost Effectiveness Remarks",
    "questionCategory": "Price",
    "section": "Price/Cost Effectiveness (20 points)",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUP-19",
    "questionNumber": 16,
    "question": "Does the supplier deliver the product with good quality?",
    "questionCategory": "Quality",
    "section": "Quality (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-20",
    "questionNumber": 17,
    "question": "Does the supplier take immediate action for defective product upon delivery/RMA?",
    "questionCategory": "Quality",
    "section": "Quality (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 6,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-21",
    "questionNumber": 18,
    "question": "Does the supplier replace the defective product immediately?",
    "questionCategory": "Quality",
    "section": "Quality (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-22",
    "questionNumber": 19,
    "question": "Quality Remarks",
    "questionCategory": "Quality",
    "section": "Quality (20 points)",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUP-23",
    "questionNumber": 20,
    "question": "Do supplier responsive and easy to contact?",
    "questionCategory": "Communication",
    "section": "Communication (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-24",
    "questionNumber": 21,
    "question": "Does the supplier proactively communicate to MBS Representatives in terms of any discrepancy or changes in transaction?",
    "questionCategory": "Communication",
    "section": "Communication (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 6,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-25",
    "questionNumber": 22,
    "question": "Does the supplier proactively communicate to MBS Representatives fact-based concern on product/technology?",
    "questionCategory": "Communication",
    "section": "Communication (20 points)",
    "inputType": "typed-rating",
    "validationRange": {
      "min": 0,
      "max": 7,
      "allowNa": true
    }
  },
  {
    "questionId": "Q-SUP-26",
    "questionNumber": 23,
    "question": "Communication Remarks",
    "questionCategory": "Communication",
    "section": "Communication (20 points)",
    "inputType": "text"
  }
];
          const subcontractorQuestions = [
  {
    "questionId": "Q-SUB-01",
    "questionNumber": 1,
    "question": "Project Name",
    "questionCategory": "General",
    "section": "SECTION 1",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUB-02",
    "questionNumber": 2,
    "question": "Products or Services",
    "questionCategory": "General",
    "section": "SECTION 1",
    "inputType": "checkbox",
    "options": [
      "Access Control System",
      "CCTV System",
      "Civil Works",
      "Electrical Works",
      "Fire Suppression System",
      "Mechanical Works",
      "Structured Cabling System",
      "Others"
    ]
  },
  {
    "questionId": "Q-SUB-03",
    "questionNumber": 3,
    "question": "Project Duration",
    "questionCategory": "General",
    "section": "SECTION 1",
    "inputType": "date-range"
  },
  {
    "questionId": "Q-SUB-04",
    "questionNumber": 4,
    "question": "Delivery / Project Timeliness",
    "questionCategory": "Delivery",
    "section": "SECTION 4",
    "inputType": "matrix",
    "subQuestions": [
      {
        "id": "a",
        "label": "Except for circumstances beyond the subcontractor's control, tasks and deliverables were completed on time or ahead of the schedule in the contact.",
        "description": "Always = 2, <2wks late = 1, >2wks late = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "b",
        "label": "Delivers and use all resources required to the project and turnover all excess materials to MBS Project Manager.",
        "description": "Consistently = 2, Inconsistent = 1, Not at all = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      }
    ]
  },
  {
    "questionId": "Q-SUB-05",
    "questionNumber": 5,
    "question": "Delivery / Project Timeliness Remarks",
    "questionCategory": "Delivery",
    "section": "SECTION 4",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUB-06",
    "questionNumber": 6,
    "question": "Documentation / Invoicing",
    "questionCategory": "Documentation",
    "section": "SECTION 5",
    "inputType": "matrix",
    "subQuestions": [
      {
        "id": "a",
        "label": "The subcontractor's invoices/billing were correct, accurate and contained all information of references.",
        "description": "Always = 2, Limited correction/tolerable = 1, Multiple important corrections/delays = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "b",
        "label": "All required documents are submitted on time or within the time frames of agreement e.g. Service report, billing, COC, etc.",
        "description": "Very timely = 2, <1 week = 1, >1 week = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "c",
        "label": "The proposal provides a clear breakdown matched with what MBS requires.",
        "description": "Consistently = 2, Scope inaccurate but no price increase = 1, Incomplete/leads to price increase = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      }
    ]
  },
  {
    "questionId": "Q-SUB-07",
    "questionNumber": 7,
    "question": "Documentation / Invoicing Remarks",
    "questionCategory": "Documentation",
    "section": "SECTION 5",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUB-08",
    "questionNumber": 8,
    "question": "Cost Control / Pricing",
    "questionCategory": "Cost",
    "section": "SECTION 6",
    "inputType": "matrix",
    "subQuestions": [
      {
        "id": "a",
        "label": "Give competitive prices, discount, and reasonable prices.",
        "description": "Yes/accommodate within MBS budget = 2, No = 1, (unused) = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "b",
        "label": "Request for change of orders for additional works/cost ONLY outside the scope of contract.",
        "description": "Yes = 2, Seldom requests = 1, Does not accommodate = 0",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "c",
        "label": "Indication that the subcontractor has financial problem which cannot meet the terms and conditions stated in contract.",
        "description": "Healthy financial position = 2, Liquid for at least <1M = 1, Always needs fund to mobilize project = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      }
    ]
  },
  {
    "questionId": "Q-SUB-09",
    "questionNumber": 9,
    "question": "Cost Control / Pricing Remarks",
    "questionCategory": "Cost",
    "section": "SECTION 6",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUB-10",
    "questionNumber": 10,
    "question": "Quality and Technical Competence",
    "questionCategory": "Quality",
    "section": "SECTION 7",
    "inputType": "matrix",
    "subQuestions": [
      {
        "id": "a",
        "label": "The Subcontractor work products complied with the contract, PO scope of work, rules and applicable program guidance.",
        "description": "Consistently met, no re-work = 2, Mostly met/minor re-work = 1, Substandard = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "b",
        "label": "The subcontractor performed site assessment tasks efficiently and effectively, proposed cost-effective changes in scope, provided an accurate summary and proposed cost-effective recommendations for future work and course of action.",
        "description": "Consistently = 2, Minor ineffective/inaccurate summary = 1, Summaries had to be re-worked = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "c",
        "label": "The subcontractor proposed appropriate changes to monitoring points, parameters, and or frequency based on changing site conditions.",
        "description": "Consistently = 2, Minor changes not proposed = 1, Changes not proposed though warranted = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "d",
        "label": "The remedial action plan adequately and cost-effectively addressed the site conditions.",
        "description": "Always = 2, Minor inconsistent guidelines = 1, Remedial action had to be reworked = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "e",
        "label": "The subcontractor initiates Certificate of Completion when the project has been done.",
        "description": "Yes = 2, Only when prompted by MBS accounting/PM = 1, Not at all = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      }
    ]
  },
  {
    "questionId": "Q-SUB-11",
    "questionNumber": 11,
    "question": "Quality and Technical Competence Remarks",
    "questionCategory": "Quality",
    "section": "SECTION 7",
    "inputType": "text"
  },
  {
    "questionId": "Q-SUB-12",
    "questionNumber": 12,
    "question": "Communication",
    "questionCategory": "Communication",
    "section": "SECTION 8",
    "inputType": "matrix",
    "subQuestions": [
      {
        "id": "a",
        "label": "The subcontractor communicated and proposed solutions of project changes, problems, delays and issues to MBS representative as they occurred and ahead of deadlines.",
        "description": "Always = 2, Some untimely/less helpful = 1, Problems from untimely/poor comms = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "b",
        "label": "The subcontractor responded within a reasonable time frame to telephone messages and emails from MBS representative.",
        "description": "Within 2 business days = 2, Within 3-5 days = 1, More than 5 days = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      },
      {
        "id": "c",
        "label": "The subcontractor is professional in their approach, provide assistance whenever needed, courteous and polite.",
        "description": "Always regardless of who = 2, Depends on position = 1, Unprofessional at all times = 0, Not Applicable = N/A",
        "validationRange": {
          "min": 0,
          "max": 2,
          "allowNa": true
        }
      }
    ]
  },
  {
    "questionId": "Q-SUB-13",
    "questionNumber": 13,
    "question": "Communication Remarks",
    "questionCategory": "Communication",
    "section": "SECTION 8",
    "inputType": "text"
  }
];

          loadedSurveys = [
            {
              id: 'default-courier',
              title: 'Courier Satisfaction Survey',
              surveyType: 'Courier',
              description: 'Standard satisfaction reporting for external courier and logistics.',
              createdAt: new Date('2025-01-01T08:00:00Z').toISOString(),
              deadlineDate: '31/12/2026',
              // Migrated system: prior evaluation rounds were run in the old
              // system, so every survey starts CLOSED here. Admins reopen (set
              // to Running) when a new evaluation period begins.
              status: 'Completed',
              accessDepartments: ALL_DEPARTMENTS,
              accessRoles: [...ALL_SURVEY_ACCESS_ROLES],
              questions: contractorQuestions as any,
            },
            {
              id: 'default-supplier',
              title: 'Supplier Quality Survey',
              surveyType: 'Supplier',
              description: 'Product quality and commercial terms assessment for inventory suppliers.',
              createdAt: new Date('2025-01-01T08:00:00Z').toISOString(),
              deadlineDate: '31/12/2026',
              status: 'Completed',
              accessDepartments: ALL_DEPARTMENTS,
              accessRoles: [...ALL_SURVEY_ACCESS_ROLES],
              questions: supplierQuestions as any,
            },
            {
              id: 'default-subcontractor',
              title: 'Subcontractor Performance Survey',
              surveyType: 'Subcontractor',
              description: 'On-site execution, compliance, and schedule feedback for active subcontractors.',
              createdAt: new Date('2025-01-01T08:00:00Z').toISOString(),
              deadlineDate: '31/12/2026',
              status: 'Completed',
              accessDepartments: ALL_DEPARTMENTS,
              accessRoles: [...ALL_SURVEY_ACCESS_ROLES],
              questions: subcontractorQuestions as any,
            },
          ];
          // Run default survey templates through the same normalization as
          // saved ones so they include the standard overall-feedback field.
          loadedSurveys = loadedSurveys.map(normalizeCustomForm);
          safeSetItem('survey_analytics_surveys_v6', JSON.stringify(loadedSurveys));
        }

        // 2. Handle Partner Companies
        let loadedCompanies: PartnerCompany[] = [];
        const savedCompanies = localStorage.getItem(PARTNER_COMPANIES_STORAGE_KEY);
        if (savedCompanies) {
          loadedCompanies = JSON.parse(savedCompanies).map(normalizePartnerCompany);
          safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(loadedCompanies));
        } else {
          loadedCompanies = [];
        }

        // 3. Handle Responses
        if (localStorage.getItem('survey_analytics_v6_cleared_by_agent_final') !== 'true') {
          localStorage.removeItem('survey_analytics_responses');
          localStorage.removeItem('survey_analytics_responses_v4');
          localStorage.removeItem('survey_analytics_responses_v5');
          localStorage.removeItem('survey_analytics_responses_v6');
          localStorage.removeItem('survey_analytics_full_dataset_active');
          safeSetItem('survey_analytics_v6_cleared_by_agent_final', 'true');
        }

        let loadedResponses: SurveyResponse[] = [];
        const savedResponses = localStorage.getItem('survey_analytics_responses_v6');
        let parsedResponses: any[] = [];
        try {
          parsedResponses = savedResponses ? JSON.parse(savedResponses) : [];
        } catch (e) {}

        if (savedResponses && parsedResponses.length > 0) {
          loadedResponses = decompressResponses(parsedResponses).map(normalizeSurveyResponse);
          safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(loadedResponses)));
        } else {
          loadedResponses = [];
          safeSetItem('survey_analytics_responses_v6', JSON.stringify([]));
        }

        if (isMountedRef.current) {
          setSurveys(loadedSurveys);
          setPartnerCompanies(loadedCompanies);
          setResponses(loadedResponses);

          const groupedNotifs = groupResponsesToNotifications(loadedResponses);
          setNotifications(groupedNotifs.slice(0, INITIAL_NOTIFICATION_SEED));
        }
      } catch (loadError) {
        if (isMountedRef.current) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load survey data.');
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    initData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset account-specific notification state before the derived document
  // alerts run. The local record is an authenticated browser cache;
  // hydration below reconciles it with the owner's Supabase record.
  useEffect(() => {
    const owner = currentUserEmail?.trim().toLowerCase() ?? null;
    if (notificationOwnerRef.current !== owner) {
      notificationOwnerRef.current = owner;
      systemNotificationDetectedAtRef.current.clear();
    }
    knownSystemNotificationIdsRef.current = new Set();
    setUnreadNotificationIds(new Set());
    if (!currentUserEmail) {
      readNotificationIdsRef.current = new Set();
      return;
    }
    const cached = loadCachedNotificationReadState(currentUserEmail);
    readNotificationIdsRef.current = new Set(cached?.readNotificationIds ?? []);
  }, [currentUserEmail]);

  // Supabase is the shared source of truth after authentication. localStorage
  // remains an authenticated startup/offline cache only.
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserEmail) return;
    let cancelled = false;
    const controller = new AbortController();
    const readOptions = { signal: controller.signal };
    let initialHydration: Promise<void> | undefined;
    const refreshTimers = new Map<ApplicationRecordType, ReturnType<typeof createDebouncedTask>>();
    let activeBackgroundRefreshes = 0;
    let pendingSurveyResponseIds = new Set<string>();
    let refreshAllSurveyResponses = false;
    let hasHydratedResponses = false;

    const applyNotificationReadState = (remoteNotificationState: NotificationReadState | null) => {
      const cachedNotificationState = loadCachedNotificationReadState(currentUserEmail);
      const notificationState = newestNotificationReadState(remoteNotificationState, cachedNotificationState);
      const restoredReadIds = new Set(notificationState?.readNotificationIds ?? []);
      readNotificationIdsRef.current = restoredReadIds;
      knownSystemNotificationIdsRef.current = new Set();
      setUnreadNotificationIds((current) => new Set(Array.from(current).filter((id) => !restoredReadIds.has(id))));
      if (notificationState) {
        cacheNotificationReadState(notificationState);
        if (!remoteNotificationState || notificationState.updatedAt !== remoteNotificationState.updatedAt) {
          persistRemote(saveNotificationReadState(notificationState));
        }
      }
    };

    const hydrateFromSupabase = async () => {
      const isCurrent = responseRefreshGuard.start();
      setError(null);
      const sessionEmail = await getSupabaseSessionEmail();
      if (!sessionEmail || sessionEmail !== currentUserEmail.trim().toLowerCase()) return;
      const [storedCompanies, storedSurveys, storedResponses] = await Promise.all([
        loadApplicationRecords<PartnerCompany>('partner_company', readOptions),
        loadApplicationRecords<CustomForm>('survey', readOptions),
        loadApplicationRecords<SurveyResponse>('survey_response', readOptions),
      ]);
      const companies = storedCompanies.length > 0
        ? storedCompanies
        : await loadNormalizedPartnerCompanies();
      if (cancelled) return;

      const normalizedCompanies = companies.map(normalizeDatabasePartnerCompany).map(normalizePartnerCompany);
      const normalizedSurveys = storedSurveys.map(normalizeCustomForm);
      const normalizedResponses = storedResponses.map(normalizeSurveyResponse).filter(await createImportedResponseFilter(storedResponses));
      if (cancelled) return;
      setPartnerCompanies(normalizedCompanies);
      setSurveys(normalizedSurveys);
      if (isCurrent()) {
        hasHydratedResponses = true;
        setResponses(normalizedResponses);
      } else {
        refreshAllSurveyResponses = true;
        runHydration(true, 'survey_response');
      }
      safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(normalizedCompanies));
      safeSetItem('survey_analytics_surveys_v6', JSON.stringify(normalizedSurveys));

      // The dashboard's primary records are ready. Load supporting settings and
      // notification state in the background so they don't extend the login
      // loading screen. Defer CPU-heavy derived/cache work until after paint.
      const scheduleAfterPaint = (work: () => void) => {
        window.requestAnimationFrame(() => {
          window.setTimeout(() => {
            if (!cancelled) work();
          }, 0);
        });
      };
      scheduleAfterPaint(() => {
        setNotifications(groupResponsesToNotifications(responsesRef.current).slice(0, INITIAL_NOTIFICATION_SEED));
        safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(responsesRef.current)));
      });

      void (async () => {
        let [storedSeries, storedCategoryLabels, remoteNotificationState] = await Promise.all([
          loadApplicationRecords<ArchiveSeries>('archive_series', readOptions),
          loadApplicationRecords<Record<SurveyType, string[]>>('category_labels', readOptions),
          loadNotificationReadState(currentUserEmail),
        ]);

        const migrationKey = 'survey_shared_supabase_migrated_v1';
        if (isAdmin && localStorage.getItem(migrationKey) !== 'true') {
          if (storedSeries.length === 0) {
            try {
              const localSeries = JSON.parse(localStorage.getItem('survey_archive_series_v1') ?? '[]') as ArchiveSeries[];
              if (localSeries.length > 0) {
                await upsertApplicationRecords('archive_series', localSeries, (series) => series.id);
                storedSeries = localSeries;
              }
            } catch {
              // Invalid legacy cache is ignored; the empty remote value wins.
            }
          }
          if (storedCategoryLabels.length === 0) {
            const localLabels = getStoredCategoryLabels();
            await upsertApplicationRecords('category_labels', [localLabels], () => 'global');
            storedCategoryLabels = [localLabels];
          }
          localStorage.setItem(migrationKey, 'true');
        }
        if (cancelled) return;

        setArchiveSeries(storedSeries);
        const hydratedCategoryLabels = storedCategoryLabels[0] ?? {
          Courier: [...DEFAULT_CATEGORIES.Courier],
          Supplier: [...DEFAULT_CATEGORIES.Supplier],
          Subcontractor: [...DEFAULT_CATEGORIES.Subcontractor],
        };
        setCategoryLabels(hydratedCategoryLabels);
        applyNotificationReadState(remoteNotificationState);
        safeSetItem('survey_archive_series_v1', JSON.stringify(storedSeries));
        safeSetItem(CATEGORIES_STORAGE_KEY, JSON.stringify(hydratedCategoryLabels));
      })().catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load supporting Supabase data.');
        }
      });
    };

    const refreshRecordType = async (recordType: ApplicationRecordType) => {
      // Reconcile the subscription gap after startup, without two competing full reads.
      await initialHydration?.catch(() => {});
      if (cancelled) return;
      setError(null);
      const sessionEmail = await getSupabaseSessionEmail();
      if (!sessionEmail || sessionEmail !== currentUserEmail.trim().toLowerCase()) return;

      switch (recordType) {
        case 'partner_company': {
          const storedCompanies = await loadApplicationRecords<PartnerCompany>('partner_company', readOptions);
          const companies = storedCompanies.length > 0 ? storedCompanies : await loadNormalizedPartnerCompanies();
          if (cancelled) return;
          const normalizedCompanies = companies.map(normalizeDatabasePartnerCompany).map(normalizePartnerCompany);
          setPartnerCompanies(normalizedCompanies);
          safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(normalizedCompanies));
          return;
        }
        case 'survey': {
          const storedSurveys = await loadApplicationRecords<CustomForm>('survey', readOptions);
          if (cancelled) return;
          const normalizedSurveys = storedSurveys.map(normalizeCustomForm);
          setSurveys(normalizedSurveys);
          safeSetItem('survey_analytics_surveys_v6', JSON.stringify(normalizedSurveys));
          return;
        }
        case 'survey_response': {
          const isCurrent = responseRefreshGuard.start();
          const submissionIds = [...pendingSurveyResponseIds];
          const recordIds = responsesRef.current.filter((row) => pendingSurveyResponseIds.has(row.responseId)).map(surveyResponseRecordId);
          const shouldRefreshAll = refreshAllSurveyResponses || submissionIds.length === 0 || !hasHydratedResponses;
          pendingSurveyResponseIds = new Set();
          refreshAllSurveyResponses = false;
          const storedResponses = shouldRefreshAll
            ? await loadApplicationRecords<SurveyResponse>('survey_response', readOptions)
            : await loadApplicationRecordsByIds<SurveyResponse>('survey_response', submissionIds, 'payload->>responseId', undefined, controller.signal);
          if (cancelled) return;
          const normalizedResponses = storedResponses.map(normalizeSurveyResponse);
          const mergedResponses = shouldRefreshAll
            ? normalizedResponses
            : mergeApplicationRecordsById(
              responsesRef.current,
              normalizedResponses,
              recordIds,
              surveyResponseRecordId,
            );
          const deduplicated = mergedResponses.filter(await createImportedResponseFilter(mergedResponses));
          if (cancelled) return;
          if (!isCurrent()) {
            refreshAllSurveyResponses = true;
            runHydration(true, 'survey_response');
            return;
          }
          const nextResponses = mergeApplicationRecordsById(
            responsesRef.current, deduplicated,
            [...responsesRef.current, ...deduplicated].map(surveyResponseRecordId), surveyResponseRecordId,
          );
          if (cancelled) return;
          hasHydratedResponses = true;
          setResponses(nextResponses);
          setNotifications(groupResponsesToNotifications(nextResponses).slice(0, INITIAL_NOTIFICATION_SEED));
          safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(nextResponses)));
          return;
        }
        case 'archive_series': {
          const storedSeries = await loadApplicationRecords<ArchiveSeries>('archive_series', readOptions);
          if (cancelled) return;
          setArchiveSeries(storedSeries);
          safeSetItem('survey_archive_series_v1', JSON.stringify(storedSeries));
          return;
        }
        case 'category_labels': {
          const storedCategoryLabels = await loadApplicationRecords<Record<SurveyType, string[]>>('category_labels', readOptions);
          if (cancelled) return;
          const hydratedCategoryLabels = storedCategoryLabels[0] ?? {
            Courier: [...DEFAULT_CATEGORIES.Courier],
            Supplier: [...DEFAULT_CATEGORIES.Supplier],
            Subcontractor: [...DEFAULT_CATEGORIES.Subcontractor],
          };
          setCategoryLabels(hydratedCategoryLabels);
          safeSetItem(CATEGORIES_STORAGE_KEY, JSON.stringify(hydratedCategoryLabels));
          return;
        }
        case 'notification_read_state': {
          const remoteNotificationState = await loadNotificationReadState(currentUserEmail);
          if (!cancelled) applyNotificationReadState(remoteNotificationState);
          return;
        }
        default:
          return;
      }
    };

    const refreshRecordTypeCoalesced = createCoalescedTaskRunner(refreshRecordType, () => cancelled);

    const runHydration = (backgroundRefresh = false, recordType?: ApplicationRecordType) => {
      if (backgroundRefresh) {
        activeBackgroundRefreshes += 1;
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const operation = backgroundRefresh && recordType
        ? refreshRecordTypeCoalesced(recordType)
        : (initialHydration = hydrateFromSupabase());

      void operation
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load shared Supabase data.');
        }
      })
      .finally(() => {
        if (cancelled) return;
        if (backgroundRefresh) {
          activeBackgroundRefreshes -= 1;
          if (activeBackgroundRefreshes === 0) setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      });
    };

    const refreshChangedRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ recordType?: ApplicationRecordType; recordId?: string; responseId?: string }>).detail;
      const recordType = detail?.recordType;
      if (!recordType || ![
        'partner_company', 'survey', 'survey_response', 'archive_series',
        'category_labels', 'notification_read_state',
      ].includes(recordType)) return;
      if (recordType === 'survey_response') {
        const responseId = detail.responseId ?? responsesRef.current.find((row) => surveyResponseRecordId(row) === detail.recordId)?.responseId;
        if (responseId && !refreshAllSurveyResponses) {
          pendingSurveyResponseIds.add(responseId);
        } else {
          pendingSurveyResponseIds = new Set();
          refreshAllSurveyResponses = true;
        }
      }
      let batch = refreshTimers.get(recordType);
      if (!batch) {
        batch = createDebouncedTask(() => {
          refreshTimers.delete(recordType);
          runHydration(true, recordType);
        }, recordType === 'survey_response' ? 500 : 100, 1500);
        refreshTimers.set(recordType, batch);
      }
      batch.schedule();
    };

    const refreshResponsesAfterProfileChange = (event: Event) => {
      const changedEmail = (event as CustomEvent<{ email?: string }>).detail?.email?.trim().toLowerCase();
      if (changedEmail && changedEmail !== currentUserEmail.trim().toLowerCase()) return;
      pendingSurveyResponseIds = new Set();
      refreshAllSurveyResponses = true;
      runHydration(true, 'survey_response');
    };

    setIsRefreshing(false);
    runHydration();
    window.addEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshChangedRecord);
    window.addEventListener(APPLICATION_PROFILES_CHANGED_EVENT, refreshResponsesAfterProfileChange);

    return () => {
      cancelled = true;
      controller.abort();
      refreshTimers.forEach((batch) => batch.cancel());
      refreshTimers.clear();
      window.removeEventListener(APPLICATION_RECORD_CHANGED_EVENT, refreshChangedRecord);
      window.removeEventListener(APPLICATION_PROFILES_CHANGED_EVENT, refreshResponsesAfterProfileChange);
    };
  }, [currentUserEmail, isAdmin]);

  // Create a new survey form
  const createSurvey = async (newForm: Omit<CustomForm, 'id' | 'createdAt'>) => {
    const id = `survey-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const configuredPeriod = surveys.find((survey) =>
      (survey.surveyType === 'Courier' || survey.surveyType === 'Supplier') && survey.periodCovered
    )?.periodCovered ?? '1st Half';
    const surveyWithId: CustomForm = {
      ...normalizeCustomForm({
        ...newForm,
        ...((newForm.surveyType === 'Courier' || newForm.surveyType === 'Supplier')
          ? { periodCovered: newForm.periodCovered ?? configuredPeriod }
          : {}),
      } as CustomForm),
      id,
      createdAt,
    };

    if (isSupabaseConfigured) await persistRemoteAsync(upsertApplicationRecords('survey', [surveyWithId], (survey) => survey.id));
    const updatedSurveys = [surveyWithId, ...surveys];
    setSurveys(updatedSurveys);
    safeSetItem('survey_analytics_surveys_v6', JSON.stringify(updatedSurveys));
    return surveyWithId;
  };

  // Update an existing survey form
  const updateSurvey = async (updatedForm: CustomForm) => {
    const normalizedForm = normalizeCustomForm(updatedForm);
    await persistRemoteAsync(upsertApplicationRecords('survey', [normalizedForm], (survey) => survey.id));
    setSurveys((current) => {
      const updated = current.map((survey) => survey.id === normalizedForm.id ? normalizedForm : survey);
      safeSetItem('survey_analytics_surveys_v6', JSON.stringify(updated));
      return updated;
    });
    return normalizedForm;
  };

  // Bulk update multiple survey forms simultaneously to prevent React state batching overwrites
  const updateSurveysBulk = async (updatedSurveysList: CustomForm[]) => {
    const map = new Map(updatedSurveysList.map((s) => [s.id, normalizeCustomForm(s)]));
    const updated = surveys.map((survey) => map.get(survey.id) ?? survey);
    setSurveys(updated);
    safeSetItem('survey_analytics_surveys_v6', JSON.stringify(updated));
    await persistRemoteAsync(replaceApplicationRecords('survey', updated, (survey) => survey.id));
  };

  // Renames one of a survey type's 5 categories (Categories Manager). Every
  // question across every survey of that type - and every already-submitted
  // response's stored questionCategory, active or archived - that carries
  // the old label is rewritten to the new one in the same pass, so the
  // rename is immediately visible everywhere that groups by questionCategory
  // (bar charts and reports) without leaving old-label data
  // behind as an orphaned bucket. The radar chart (which groups by
  // questionWeights.ts's own section labels, not questionCategory) picks up
  // the rename separately via getLiveCategoryLabel, which reads the same
  // categoryLabels storage this function writes to.
  const renameCategory = (surveyType: SurveyType, slotIndex: number, newLabel: string) => {
    const trimmed = newLabel.trim();
    const oldLabel = categoryLabels[surveyType][slotIndex];
    if (!trimmed || trimmed === oldLabel) return;

    setCategoryLabels((current) => {
      const updated = { ...current, [surveyType]: current[surveyType].map((label, i) => (i === slotIndex ? trimmed : label)) };
      safeSetItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updated));
      persistRemote(upsertApplicationRecords('category_labels', [updated], () => 'global'));
      return updated;
    });

    setSurveys((currentSurveys) => {
      const updated = currentSurveys.map((s) => {
        if (s.surveyType !== surveyType) return s;
        if (!s.questions.some((q) => q.questionCategory === oldLabel)) return s;
        return { ...s, questions: s.questions.map((q) => (q.questionCategory === oldLabel ? { ...q, questionCategory: trimmed } : q)) };
      });
      safeSetItem('survey_analytics_surveys_v6', JSON.stringify(updated));
      persistRemote(replaceApplicationRecords('survey', updated, (survey) => survey.id));
      return updated;
    });

    setResponses((currentResponses) => {
      const updated = currentResponses.map((r) =>
        r.surveyType === surveyType && r.questionCategory === oldLabel ? { ...r, questionCategory: trimmed } : r
      );
      safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updated)));
      persistRemote(upsertApplicationRecords('survey_response', updated, surveyResponseRecordId));
      return updated;
    });
  };

  // Restores all 5 categories of one survey type to their factory defaults
  // in one pass (Categories Manager's "Restore to Default").
  const restoreDefaultCategories = (surveyType: SurveyType) => {
    DEFAULT_CATEGORIES[surveyType].forEach((defaultLabel, slotIndex) => {
      if (categoryLabels[surveyType][slotIndex] !== defaultLabel) {
        renameCategory(surveyType, slotIndex, defaultLabel);
      }
    });
  };

  // Delete a survey form
  const deleteSurvey = (surveyId: string) => {
    const updatedSurveys = surveys.filter((s) => s.id !== surveyId);
    setSurveys(updatedSurveys);
    safeSetItem('survey_analytics_surveys_v6', JSON.stringify(updatedSurveys));
    persistRemote(replaceApplicationRecords('survey', updatedSurveys, (survey) => survey.id));

    // Also optionally clean up custom responses submitted specifically to this survey?
    // Let's filter out responses that match the deleted survey's questions and aren't default ones.
    // However, to be safe, let's keep responses unless specifically wanted, or just clean them up.
    // Actually, cleaning them up keeps analytics clean! Let's do it if we want, or keep it simple.
  };

  // Submit a survey response
  const submitResponse = async (
    surveyId: string,
    company: string,
    department: string,
    respondentType: string,
    address: string | undefined,
    answers: { questionId: string; questionNumber: number; question: string; questionCategory: string; rating: Rating; comment: string }[],
    respondentEmail?: string,
    startTime?: string
  ) => {
    const targetSurvey = surveys.find((s) => s.id === surveyId);
    if (!targetSurvey) return null;

    const responseId = `RESP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const submissionDate = new Date().toISOString();
    const matchingCompanies = partnerCompanies.filter(
      (candidate) =>
        !candidate.isArchived &&
        candidate.type === targetSurvey.surveyType &&
        candidate.name === company,
    );
    // The current survey form submits the display name. Persist an ID only
    // when that legacy input resolves unambiguously; report generation will
    // reject ambiguous legacy rows rather than attach them to the wrong record.
    const companyId = matchingCompanies.length === 1 ? matchingCompanies[0].id : undefined;

    const newResponses: SurveyResponse[] = answers.map((ans) => ({
      responseId,
      dataSource: submissionSourceForEnvironment(parseDeploymentEnvironment(
        window.__SMS_RUNTIME_CONFIG__?.deploymentEnvironment || import.meta.env.VITE_DEPLOYMENT_ENV,
      )),
      surveyId: targetSurvey.id,
      companyId,
      surveyType: targetSurvey.surveyType,
      respondentType,
      startTime,
      submissionDate,
      company,
      department,
      address,
      questionId: ans.questionId,
      questionNumber: ans.questionNumber,
      question: ans.question,
      questionCategory: ans.questionCategory,
      rating: ans.rating,
      comment: ans.comment || '',
      respondentEmail,
    }));

    await persistRemoteAsync(upsertApplicationRecords(
      'survey_response', newResponses, surveyResponseRecordId, { ownRecords: true },
    ));
    if (activeUserRef.current !== currentUserEmail) throw new Error('Your session changed while saving. Sign in again to view the saved evaluation.');
    setResponses((current) => {
      const updated = mergeApplicationRecordsById(current, newResponses, newResponses.map(surveyResponseRecordId), surveyResponseRecordId);
      safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updated)));
      return updated;
    });

    // Add notification
    const notification = toNotification(newResponses);
    if (notification) {
      setNotifications((current) => [notification, ...current].slice(0, NOTIFICATION_HISTORY_LIMIT));
      setUnreadNotificationIds((current) => new Set(current).add(notification.id));
    }

    return responseId;
  };

  // Create or add a partner company
  const addPartnerCompany = async (
    name: string,
    type: SurveyType,
    affiliation?: string,
    registeredAt?: string,
    bpCode?: string,
    ntBpCode?: string,
    supplierOrigin?: SupplierOrigin
  ) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const id = `pc-${Date.now()}`;
    // Mirrors the Master List's own category string (e.g. "Supplier-Local",
    // "Courier-NT") so a manually-registered company is picked up by
    // computeCategoryRankSummary the same way an imported row is - that
    // summary reads branch.rawCategory, not company.type/supplierOrigin.
    const rawCategoryBase = type === 'Supplier' ? `Supplier-${supplierOrigin === 'Foreign' ? 'Foreign' : 'Local'}` : type;
    // A second, Non-Trade BP Code registers as its own branch (mirrors how a
    // Master List row with a "-NT" BP Code merges in) so it shows up as its
    // own row in the Document Tracker, distinct from the regular branch.
    const branches: BranchRecord[] = [{ id: `${id}-branch-1`, bpCode: (bpCode ?? '').trim(), rawCategory: rawCategoryBase }];
    if (ntBpCode?.trim()) {
      branches.push({ id: `${id}-branch-2`, bpCode: ntBpCode.trim(), rawCategory: `${rawCategoryBase}-NT` });
    }
    const newCompany: PartnerCompany = normalizePartnerCompany({
      id,
      name: name.trim(),
      type,
      supplierOrigin: type === 'Supplier' ? (supplierOrigin ?? 'Local') : undefined,
      affiliation: affiliation?.trim() || 'General partner',
      createdAt: new Date().toISOString(),
      registeredAt: registeredAt || todayStr,
      isArchived: false,
      branches,
    });
    const updated = [...partnerCompanies, newCompany];
    setPartnerCompanies(updated);
    safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(updated));
    await persistRemoteAsync(upsertApplicationRecords('partner_company', [newCompany], (company) => company.id));
    return newCompany;
  };

  // Update an existing partner company
  const updatePartnerCompany = async (updatedCompany: PartnerCompany) => {
    const normalizedCompany = normalizePartnerCompany(updatedCompany);
    await persistRemoteAsync(upsertApplicationRecords('partner_company', [normalizedCompany], (company) => company.id));
    const updated = partnerCompanies.map((company) => company.id === normalizedCompany.id ? normalizedCompany : company);
    setPartnerCompanies(updated);
    safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(updated));
    return normalizedCompany;
  };

  const updatePartnerDocument = async (
    companyId: string,
    branchId: string,
    documentName: string,
    expectedDocument: ComplianceDocument,
    nextDocument: Pick<ComplianceDocument, 'provided'> & Partial<Pick<ComplianceDocument, 'expiryDate' | 'remarks' | 'description'>>,
  ): Promise<PartnerCompany> => {
    const updatedCompany = await renewPartnerDocument(
      companyId,
      branchId,
      documentName,
      expectedDocument,
      nextDocument,
    );
    setPartnerCompanies((currentCompanies) => {
      const updated = currentCompanies.map((company) => company.id === companyId ? updatedCompany : company);
      safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    return updatedCompany;
  };

  // Import the Master List Excel: fuzzy-matches each row's BP Name against
  // existing companies (merging as a branch when matched, creating a new
  // company otherwise). This only parses/merges and returns the result for
  // review - nothing is saved until the caller confirms via
  // commitMasterListImport, so the admin can see exactly which existing
  // companies would change (category, documents) before anything is
  // overwritten.
  const previewMasterListImport = async (files: File[], options?: { replace?: boolean }): Promise<MasterListImportReview> => {
    // Replace mode starts from an empty registry so the result mirrors the file
    // exactly (its category/rank totals match the sheet), instead of merging
    // the file's rows on top of whatever is already loaded.
    const base = options?.replace ? [] : partnerCompanies;
    const sourceFiles = await prepareMasterListSourceFiles(files);
    const excludedRowKeys: string[] = [];
    const result = mergeMasterListSourceFiles(sourceFiles, excludedRowKeys, base);
    return { files: sourceFiles, excludedRowKeys, result };
  };

  const rebuildMasterListImportPreview = (
    files: MasterListSourceFile[],
    excludedRowKeys: string[],
    options?: { replace?: boolean },
  ): ImportResult => {
    const base = options?.replace ? [] : partnerCompanies;
    return mergeMasterListSourceFiles(files, excludedRowKeys, base);
  };

  // Applies a previously-previewed import result to the live registry.
  const commitMasterListImport = async (result: ImportResult) => {
    const normalized = result.companies.map(normalizePartnerCompany);
    setPartnerCompanies(normalized);
    safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(normalized));
    await persistRemoteAsync(replaceApplicationRecords('partner_company', normalized, (company) => company.id));
  };

  // Remove a partner company
  const removePartnerCompany = async (id: string) => {
    const updated = partnerCompanies.filter((c) => c.id !== id);
    setPartnerCompanies(updated);
    safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(updated));
    await persistRemoteAsync(deleteApplicationRecords('partner_company', [id]));
  };

  // Clear frontend caches so the next authenticated load rehydrates shared
  // records. This does not mutate remote data.
  const resetAllData = () => {
    localStorage.removeItem('survey_analytics_surveys');
    localStorage.removeItem('survey_analytics_surveys_v4');
    localStorage.removeItem('survey_analytics_surveys_v5');
    localStorage.removeItem('survey_analytics_surveys_v6');
    localStorage.removeItem('survey_analytics_responses');
    localStorage.removeItem('survey_analytics_responses_v4');
    localStorage.removeItem('survey_analytics_responses_v5');
    localStorage.removeItem('survey_analytics_responses_v6');
    localStorage.removeItem('survey_analytics_partner_companies_v4');
    localStorage.removeItem('survey_analytics_partner_companies_v5');
    localStorage.removeItem('survey_analytics_partner_companies_v6');
    localStorage.removeItem('survey_analytics_partner_companies_v7');
    localStorage.removeItem(PARTNER_COMPANIES_STORAGE_KEY);
    localStorage.removeItem(CATEGORIES_STORAGE_KEY);
    window.location.reload();
  };

  // removed in Account Management — no hardcoded headcount to maintain.
  const markNotificationsRead = () => {
    const nextReadIds = new Set(readNotificationIdsRef.current);
    combinedNotifications.forEach((notification) => nextReadIds.add(notification.id));
    persistNotificationReadIds(nextReadIds);
    setUnreadNotificationIds(new Set());
  };

  const markNotificationRead = (id: string) => {
    const nextReadIds = new Set(readNotificationIdsRef.current).add(id);
    persistNotificationReadIds(nextReadIds);
    setUnreadNotificationIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const markNotificationUnread = (id: string) => {
    const nextReadIds = new Set(readNotificationIdsRef.current);
    nextReadIds.delete(id);
    persistNotificationReadIds(nextReadIds);
    setUnreadNotificationIds((current) => new Set(current).add(id));
  };

  // Split active and archived responses so the active dashboard is unaffected
  const activeResponses = useMemo(() => {
    return responses.filter(r => !r.archived);
  }, [responses]);

  const archivedResponses = useMemo(() => {
    return responses.filter(r => r.archived);
  }, [responses]);

  const archiveResponsesForSurveys = (surveyIds: string[], seriesLabel?: string) => {
    const targetSurveys = surveys.filter(s => surveyIds.includes(s.id));
    const questionIdsToArchive = new Map<string, { id: string; title: string }>();
    const archiveDate = new Date().toISOString();
    const seriesId = seriesLabel && seriesLabel.trim() ? getOrCreateSeries(seriesLabel) : undefined;

    targetSurveys.forEach(s => {
      s.questions.forEach(q => {
        questionIdsToArchive.set(q.questionId, { id: s.id, title: s.title });
        if (q.subQuestions) {
          q.subQuestions.forEach(sub => questionIdsToArchive.set(`${q.questionId}-${sub.id}`, { id: s.id, title: s.title }));
        }
      });
    });

    const updatedResponses = responses.map(r => {
      const surveyInfo = questionIdsToArchive.get(r.questionId);
      if (surveyInfo) {
        return {
          ...r,
          archived: true,
          archivedAt: archiveDate,
          archivedBySurveyId: surveyInfo.id,
          archivedBySurveyTitle: surveyInfo.title,
          ...(seriesId ? { seriesId } : {}),
        };
      }
      return r;
    });

    setResponses(updatedResponses);
    safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updatedResponses)));
    persistRemote(upsertApplicationRecords(
      'survey_response',
      updatedResponses.filter((response) => questionIdsToArchive.has(response.questionId)),
      surveyResponseRecordId,
    ));
  };

  const archiveResponsesForSurveyTypes = async (surveyTypes: SurveyType[], seriesLabel: string, surveyIds: string[] = []) => {
    const targetTypes = new Set(surveyTypes);
    if (!targetTypes.size) return;
    const existingSeries = archiveSeries.find((series) => series.label.trim().toLowerCase() === seriesLabel.trim().toLowerCase());
    const activeResponsesToArchive = responses.filter((response) => !response.archived && targetTypes.has(response.surveyType));
    const responsesToRetry = existingSeries
      ? responses.filter((response) => response.archived && response.seriesId === existingSeries.id && targetTypes.has(response.surveyType))
      : [];
    if (!activeResponsesToArchive.length && !responsesToRetry.length) return;
    const changedResponses = [...activeResponsesToArchive, ...responsesToRetry];

    const targetSurveyByType = new Map<SurveyType, CustomForm>();
    surveys.forEach((survey) => {
      if (targetTypes.has(survey.surveyType) && (!surveyIds.length || surveyIds.includes(survey.id)) && !targetSurveyByType.has(survey.surveyType)) {
        targetSurveyByType.set(survey.surveyType, survey);
      }
    });
    const seriesId = existingSeries?.id ?? getOrCreateSeries(seriesLabel);
    const archivedAt = new Date().toISOString();

    const targetSurveyIds = new Map([...targetSurveyByType].map(([type, survey]) => [type, survey.id]));
    const targetSurveyTitles = new Map([...targetSurveyByType].map(([type, survey]) => [type, survey.title]));
    const series = existingSeries ?? { id: seriesId, label: seriesLabel.trim(), createdAt: archivedAt };
    const updatedResponses = responses.map((response) => {
      if (response.archived || !targetTypes.has(response.surveyType)) return response;
      return {
        ...response,
        archived: true,
        archivedAt,
        archivedBySurveyId: targetSurveyIds.get(response.surveyType),
        archivedBySurveyTitle: targetSurveyTitles.get(response.surveyType),
        seriesId,
      };
    });

    setResponses(updatedResponses);
    safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updatedResponses)));
    await persistRemoteAsync(upsertApplicationRecords('archive_series', [series], (archive) => archive.id));
    await persistRemoteAsync(upsertApplicationRecords('survey_response', changedResponses.map((response) => {
      const survey = targetSurveyByType.get(response.surveyType);
      return {
        ...response,
        archived: true,
        archivedAt,
        archivedBySurveyId: survey?.id,
        archivedBySurveyTitle: survey?.title,
        seriesId,
      };
    }), surveyResponseRecordId));
  };

  const restoreResponseGroup = async (responseId: string) => {
    const updatedResponses = responses.map(r => {
      if (r.responseId === responseId) {
        return { ...r, archived: false };
      }
      return r;
    });

    setResponses(updatedResponses);
    safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updatedResponses)));
    await persistRemoteAsync(upsertApplicationRecords(
      'survey_response',
      updatedResponses.filter((response) => response.responseId === responseId),
      surveyResponseRecordId,
    ));
  };

  const restoreResponsesForSurvey = async (surveyId: string) => {
    const targetSurvey = surveys.find(s => s.id === surveyId);
    if (!targetSurvey) return;
    const questionIdsToRestore = new Set<string>();
    targetSurvey.questions.forEach(q => {
      questionIdsToRestore.add(q.questionId);
      if (q.subQuestions) {
        q.subQuestions.forEach(sub => questionIdsToRestore.add(`${q.questionId}-${sub.id}`));
      }
    });

    const updatedResponses = responses.map(r => {
      if (questionIdsToRestore.has(r.questionId)) {
        return { ...r, archived: false };
      }
      return r;
    });

    setResponses(updatedResponses);
    safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updatedResponses)));
    await persistRemoteAsync(upsertApplicationRecords(
      'survey_response',
      updatedResponses.filter((response) => questionIdsToRestore.has(response.questionId)),
      surveyResponseRecordId,
    ));
  };

  const deleteArchivedResponseGroups = async (groupIds: { archivedAt: string; surveyId: string }[]) => {
    const updatedResponses = responses.filter(r => {
      if (!r.archived || !r.archivedAt || !r.archivedBySurveyId) return true;
      const match = groupIds.some(g => g.archivedAt === r.archivedAt && g.surveyId === r.archivedBySurveyId);
      return !match;
    });
    setResponses(updatedResponses);
    safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updatedResponses)));
    const remainingIds = new Set(updatedResponses.map(surveyResponseRecordId));
    const removedIds = responses.map(surveyResponseRecordId).filter((id) => !remainingIds.has(id));
    await persistRemoteAsync(deleteApplicationRecords('survey_response', removedIds));
  };

  const restoreArchivedResponseGroups = async (groupIds: { archivedAt: string; surveyId: string }[]) => {
    const updatedResponses = responses.map(r => {
      if (!r.archived || !r.archivedAt || !r.archivedBySurveyId) return r;
      const match = groupIds.some(g => g.archivedAt === r.archivedAt && g.surveyId === r.archivedBySurveyId);
      if (match) {
        return { ...r, archived: false };
      }
      return r;
    });
    setResponses(updatedResponses);
    safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updatedResponses)));
    await persistRemoteAsync(upsertApplicationRecords(
      'survey_response',
      updatedResponses.filter((response) => groupIds.some(
        (group) => group.archivedAt === response.archivedAt && group.surveyId === response.archivedBySurveyId,
      )),
      surveyResponseRecordId,
    ));
  };

  // Restores a previously-exported archived-response file (see
  // archiveResponseTransfer.ts). Every imported row is forced archived
  // regardless of what the file says, and duplicates (by responseId) are
  // skipped - see mergeImportedResponses for the exact rules.
  const importArchivedResponses = async (file: File): Promise<ArchiveImportResult> => {
    const result = await importArchivedResponsesFromFile(file, responses, getOrCreateSeries);
    const existingIds = new Set(responses.map(surveyResponseRecordId));
    const imported = result.responses.filter((row) => !existingIds.has(surveyResponseRecordId(row)));
    await persistRemoteAsync(upsertApplicationRecords('survey_response', imported, surveyResponseRecordId));
    if (activeUserRef.current !== currentUserEmail) throw new Error('Your session changed while importing. Sign in again to view the saved results.');
    setResponses((current) => {
      const updated = mergeApplicationRecordsById(current, imported, imported.map(surveyResponseRecordId), surveyResponseRecordId);
      safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updated)));
      return updated;
    });
    return result;
  };

  // Parses a raw Microsoft Forms export of one of the three official
  // evaluation forms (Supplier/Subcontractor/Courier) and resolves each row's
  // company name against the full Partner Registry (any type/archived state -
  // a perfect name match sitting there Uncategorized/archived is still the
  // same company, just misclassified). Nothing is committed yet - genuinely
  // unmatched companies are returned for the caller to decide skip/add-as-partner
  // via commitRawEvaluations.
  const previewRawEvaluations = async (file: File, surveyType: SurveyType): Promise<RawEvalPreview> => {
    const accountProfiles = accounts.map((a) => ({ email: a.email, designation: a.designation, department: a.department }));
    return previewRawEvaluationImportFile(file, surveyType, partnerCompanies.filter((company) => !company.testImportBatchId), accountProfiles);
  };

  // Commits a previously-parsed import. Re-uploading the same file is safe:
  // each source row's own "ID" column becomes part of a deterministic
  // responseId (IMPORT-{TYPE}-{id}), so a re-run replaces those exact rows in
  // place instead of duplicating them. Companies the admin chose "add as
  // partner" for are created as minimal, unaccredited registry entries.
  const commitRawEvaluations = async (preview: RawEvalPreview, decisions: Record<string, CompanyDecision>): Promise<RawEvalImportSummary> => {
    const summaries = await commitRawEvaluationsBatch([{ preview, decisions }]);
    return summaries[0];
  };

  const commitRawEvaluationsBatch = async (
    entries: Array<{ preview: RawEvalPreview; decisions: Record<string, CompanyDecision> }>,
  ): Promise<RawEvalImportSummary[]> => {
    const committed = reconcileEvaluationBatchPartners(entries.map(({ preview, decisions }) => ({
      preview,
      ...commitRawEvaluationImportRows(preview, decisions),
    })));
    const allRows = committed.flatMap((entry) => entry.responses);
    const keepResponse = await createImportedResponseFilter(allRows);
    const recordIds = allRows.map(surveyResponseRecordId);
    if (new Set(recordIds).size !== recordIds.length) {
      throw new Error('This batch contains duplicate response IDs. No responses were imported.');
    }
    const newIds = new Set(allRows.map((response) => response.responseId));
    const replacedIds = new Set(responses.filter((response) => newIds.has(response.responseId)).map((response) => response.responseId));
    const addedCompaniesById = new Map<string, PartnerCompany>();
    committed.forEach((entry) => entry.newPartnerCompanies.forEach((company) => addedCompaniesById.set(company.id, company)));
    const newCompanies = [...addedCompaniesById.values()].map(normalizePartnerCompany);
    // Publish only durable, complete evaluations; failed writes retain the current view.
    if (newCompanies.length) {
      await persistRemoteAsync(upsertApplicationRecords('partner_company', newCompanies, (company) => company.id));
      if (activeUserRef.current !== currentUserEmail) throw new Error('Your session changed while importing. Sign in again to continue.');
      setPartnerCompanies((current) => {
        const existingIds = new Set(current.map((company) => company.id));
        const updated = [...current, ...newCompanies.filter((company) => !existingIds.has(company.id))];
        safeSetItem(PARTNER_COMPANIES_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }
    await persistRemoteAsync(upsertApplicationRecords('survey_response', allRows, surveyResponseRecordId));
    if (activeUserRef.current !== currentUserEmail) throw new Error('Your session changed while importing. Sign in again to view the saved results.');
    setResponses((current) => {
      const updated = [...current.filter((response) => !newIds.has(response.responseId)), ...allRows].filter(keepResponse);
      safeSetItem('survey_analytics_responses_v6', JSON.stringify(compressResponses(updated)));
      return updated;
    });

    const importedSurveyTypes = [...new Set(committed
      .filter((entry) => !testImportToken(entry.preview.importBatchId))
      .map((entry) => entry.preview.surveyType))];
    const surveysToReactivate = prepareDefaultSurveysForReactivation(surveys, importedSurveyTypes);
    const reactivatedSurveyTypes = new Set<SurveyType>();
    const surveyReactivationErrors = new Map<SurveyType, string>();

    if (surveysToReactivate.length > 0) {
      try {
        await persistRemoteAsync(upsertApplicationRecords('survey', surveysToReactivate, (survey) => survey.id));
        const reopenedById = new Map(surveysToReactivate.map((survey) => [survey.id, survey]));
        setSurveys((current) => {
          const updated = current.map((survey) => reopenedById.get(survey.id) ?? survey);
          safeSetItem('survey_analytics_surveys_v6', JSON.stringify(updated));
          return updated;
        });
        surveysToReactivate.forEach((survey) => reactivatedSurveyTypes.add(survey.surveyType));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown survey access update error.';
        surveysToReactivate.forEach((survey) => surveyReactivationErrors.set(
          survey.surveyType,
          `Responses were imported, but this form could not be reopened automatically. Set it to Active in Manage Access. ${reason}`,
        ));
      }
    }

    const summaries = committed.map((entry) => ({
      ...entry.summary,
      replaced: new Set(entry.responses.map((response) => response.responseId)
        .filter((responseId) => replacedIds.has(responseId))).size,
      ...(reactivatedSurveyTypes.has(entry.preview.surveyType) ? { accessReactivated: true } : {}),
      ...(surveyReactivationErrors.has(entry.preview.surveyType)
        ? { accessReactivationError: surveyReactivationErrors.get(entry.preview.surveyType) }
        : {}),
    }));
    const totalSubmissions = summaries.reduce((total, summary) => total + summary.imported, 0);
    logAdminActivity(
      entries.length === 3 && new Set(entries.map((entry) => entry.preview.fileName)).size === 1
        ? 'Imported combined evaluation workbook'
        : 'Imported evaluation response files',
      `${totalSubmissions} submissions across ${summaries.map((summary) => summary.surveyType).join(', ')}` +
        `${reactivatedSurveyTypes.size ? `; reopened access for ${[...reactivatedSurveyTypes].join(', ')}` : ''}` +
        `${surveyReactivationErrors.size ? `; access reopening failed for ${[...surveyReactivationErrors.keys()].join(', ')}` : ''}`,
    );
    return summaries;
  };

  // Derive unique active survey types (Courier, Supplier, Subcontractor)
  const surveyTypes = useMemo<SurveyType[]>(() => {
    return ['Courier', 'Supplier', 'Subcontractor'];
  }, []);

  // Derive list of all questions across all surveys
  const questions = useMemo<QuestionDefinition[]>(() => {
    // Generate standard definitions from currently loaded surveys
    const questionMap: Record<string, QuestionDefinition> = {};
    surveys.forEach((survey) => {
      survey.questions.forEach((q) => {
        if (!questionMap[q.questionId]) {
          questionMap[q.questionId] = {
            questionId: q.questionId,
            questionNumber: q.questionNumber,
            question: q.question,
            questionCategory: q.questionCategory,
            surveyTypes: [],
          };
        }
        if (!questionMap[q.questionId].surveyTypes.includes(survey.surveyType)) {
          questionMap[q.questionId].surveyTypes.push(survey.surveyType);
        }
      });
    });
    return Object.values(questionMap).sort((a, b) => a.questionNumber - b.questionNumber);
  }, [surveys]);

  const companies = useMemo(() => {
    return partnerCompanies.map((c) => c.name).sort();
  }, [partnerCompanies]);

  // Dynamic compliance-document alerts are grouped by company and status,
  // while retaining the exact branch/document/date in each notification.
  const documentNotifications = useMemo<ResponseNotification[]>(() => {
    const currentDate = documentClock;
    const list: ResponseNotification[] = [];

    partnerCompanies.forEach((c) => {
      if (c.isArchived) return;
      const summary = computeCompanyDocumentSummary(c, currentDate);
      const groups: Array<{ kind: string; respondentType: string; details: DocumentAlertDetail[] }> = [
        { kind: 'expired', respondentType: 'Document Expired', details: summary.issues.filter((item) => item.status === 'Expired') },
        { kind: 'expiring-soon', respondentType: 'Document Expiring Soon', details: summary.issues.filter((item) => item.status === 'Expiring Soon' && !documentReminderDeliveries.some((delivery) =>
          delivery.companyId === c.id && delivery.branchId === item.branchId && delivery.documentName === item.documentName && delivery.expiryDate === item.expiryDate && item.daysLeft !== undefined && item.daysLeft <= 30
        )) },
        { kind: 'for-update', respondentType: 'Document For Update', details: summary.issues.filter((item) => item.status === 'For Update') },
      ];

      groups.forEach(({ kind, respondentType, details }) => {
        if (details.length === 0) return;
        const id = documentAlertId(kind, c.id, details);
        list.push({
          id,
          company: c.name,
          surveyType: c.type as SurveyType,
          respondentType,
          submissionDate: detectedAtForNotification(id, currentDate),
          questionCount: details.length,
          respondentEmail: 'system@mgenesis.com',
          department: 'Logistics',
          designation: 'Document Alert',
          documentDetails: details,
        });
      });
    });

    return list;
  }, [partnerCompanies, documentClock, documentReminderDeliveries]);

  const persistedReminderNotifications = useMemo<ResponseNotification[]>(() => {
    if (!isAdmin) return [];
    const groups = new Map<string, PersistedDocumentReminderDelivery[]>();
    documentReminderDeliveries.forEach((delivery) => {
      const groupKey = `${delivery.companyId}:${delivery.deliveredAt.slice(0, 10)}`;
      const rows = groups.get(groupKey) ?? [];
      rows.push(delivery);
      groups.set(groupKey, rows);
    });
    return [...groups.entries()].map(([groupKey, rows]) => {
      const details: DocumentAlertDetail[] = rows.map((delivery) => ({
        documentName: delivery.documentName,
        branchId: delivery.branchId,
        branchCode: delivery.branchCode,
        expiryDate: delivery.expiryDate,
        daysLeft: delivery.daysLeft,
        status: 'Expiring Soon',
        milestoneDays: delivery.milestone.startsWith('day-') ? Number(delivery.milestone.slice(4)) : undefined,
      }));
      const ids = rows.map((row) => row.id).sort();
      return {
        id: `document-reminder:${groupKey}:${ids.join(':')}`,
        company: rows[0].company,
        surveyType: rows[0].surveyType ?? 'Supplier',
        respondentType: 'Document Expiring Soon',
        submissionDate: rows.map((row) => row.deliveredAt).sort().at(-1) ?? documentClock.toISOString(),
        questionCount: rows.length,
        respondentEmail: 'system@mgenesis.com',
        department: 'Logistics',
        designation: 'Document Expiry Reminder',
        documentDetails: details,
      };
    });
  }, [documentReminderDeliveries, documentClock, isAdmin]);

  // Legacy optional advance notices remain configurable through the existing
  // notification screen. The durable 60/30/daily schedule is delivered from
  // database-backed document reminder records above.
  const [notificationSettingsVersion, setNotificationSettingsVersion] = useState(0);
  useEffect(() => {
    const handler = () => setNotificationSettingsVersion((v) => v + 1);
    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handler);
  }, []);

  const earlyMilestoneNotifications = useMemo<ResponseNotification[]>(() => {
    const currentDate = documentClock;
    const list: ResponseNotification[] = [];
    const rules = getNotificationSettings().filter(
      (r) => r.enabled && r.mode === 'day-milestones' && r.earlyMilestoneDays.length > 0
    );
    if (rules.length === 0) return list;

    partnerCompanies.forEach((c) => {
      if (c.isArchived) return;
      const requiredKeys = getRequiredDocumentKeys(c.type, c.supplierOrigin, c.businessClassification);

      rules.forEach((rule) => {
        if (!requiredKeys.includes(rule.docName)) return;
        const details = (c.branches ?? []).flatMap((branch) => {
          const doc = branch.documents?.[rule.docName];
          if (!doc || (!doc.provided && !doc.expiryDate)) return [];

          const { status, daysLeft } = computeDocumentStatus(doc, currentDate, rule.docName);
          if (status !== 'Current' || typeof daysLeft !== 'number') return [];
          // Inside 30 days the standard alert takes over. For longer
          // thresholds, include every matching branch's copy of the document.
          const milestone = rule.earlyMilestoneDays
            .filter((days) => days > EXPIRING_SOON_DAYS)
            .sort((a, b) => a - b)
            .find((days) => daysLeft === days);
          if (milestone === undefined) return [];
          if (documentReminderDeliveries.some((delivery) => delivery.companyId === c.id
            && delivery.branchId === branch.id && delivery.documentName === rule.docName
            && delivery.expiryDate === doc.expiryDate && delivery.milestone === `day-${milestone}`)) return [];
          return [{
            documentName: rule.docName,
            branchId: branch.id,
            branchCode: branch.bpCode,
            expiryDate: doc.expiryDate,
            daysLeft,
            status: 'Expiring Soon' as const,
            milestoneDays: milestone,
          }];
        });
        if (details.length === 0) return;

        const id = documentAlertId(`milestone-${rule.docName}`, c.id, details);
        list.push({
          id,
          company: c.name,
          surveyType: c.type as SurveyType,
          respondentType: 'Document Expiring Soon',
          submissionDate: detectedAtForNotification(id, currentDate),
          questionCount: details.length,
          respondentEmail: 'system@mgenesis.com',
          department: 'Logistics',
          designation: 'Document Alert',
          documentDetails: details,
        });
      });
    });

    return list;
  }, [partnerCompanies, notificationSettingsVersion, documentClock, documentReminderDeliveries]);

  const combinedNotifications = useMemo(() => {
    const list = [...documentNotifications, ...earlyMilestoneNotifications, ...persistedReminderNotifications, ...notifications];
    return list.sort((a, b) => b.submissionDate.localeCompare(a.submissionDate));
  }, [documentNotifications, earlyMilestoneNotifications, persistedReminderNotifications, notifications]);

  useEffect(() => {
    const systemNotifications = [...documentNotifications, ...earlyMilestoneNotifications, ...persistedReminderNotifications];
    const currentIds = new Set(systemNotifications.map((notification) => notification.id));
    const newSystemIds = systemNotifications
      .map((notification) => notification.id)
      .filter((id) => !knownSystemNotificationIdsRef.current.has(id) && !readNotificationIdsRef.current.has(id));
    knownSystemNotificationIdsRef.current = currentIds;
    if (newSystemIds.length === 0) return;

    setUnreadNotificationIds((current) => {
      const next = new Set(current);
      newSystemIds.forEach((id) => next.add(id));
      return next;
    });
  }, [documentNotifications, earlyMilestoneNotifications, persistedReminderNotifications]);

  const combinedUnreadNotificationIds = useMemo(
    () => new Set(combinedNotifications.filter((notification) => !readNotificationIdsRef.current.has(notification.id)).map((notification) => notification.id)),
    [combinedNotifications, unreadNotificationIds],
  );

  return {
    responses: activeResponses,
    archivedResponses,
    archiveSeries,
    renameArchiveSeries,
    archiveResponsesForSurveys,
    archiveResponsesForSurveyTypes,
    restoreResponseGroup,
    restoreResponsesForSurvey,
    deleteArchivedResponseGroups,
    restoreArchivedResponseGroups,
    importArchivedResponses,
    previewRawEvaluations,
    commitRawEvaluations,
    commitRawEvaluationsBatch,
    surveys,
    surveyTypes,
    questions,
    companies,
    partnerCompanies,
    addPartnerCompany,
    updatePartnerCompany,
    updatePartnerDocument,
    removePartnerCompany,
    previewMasterListImport,
    rebuildMasterListImportPreview,
    commitMasterListImport,
    isLoading,
    isRefreshing,
    error,
    notifications: combinedNotifications,
    unreadCount: combinedUnreadNotificationIds.size,
    unreadNotificationIds: combinedUnreadNotificationIds,
    markNotificationsRead,
    markNotificationRead,
    markNotificationUnread,
    createSurvey,
    updateSurvey,
    updateSurveysBulk,
    deleteSurvey,
    submitResponse,
    categoryLabels,
    renameCategory,
    restoreDefaultCategories,
    resetAllData,
  };
}
