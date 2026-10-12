export type SurveyType = 'Courier' | 'Supplier' | 'Subcontractor';
export type Rating = number | 'N/A';
export type SurveyResponseSource = 'client_csv' | 'production_submission' | 'test_submission';
export type SurveyAccessRole = 'Rank & File' | 'Supervisory' | 'Managerial' | 'Director' | 'Executive';

// A PartnerCompany's type widens SurveyType with 'Uncategorized' — the state
// for master-list rows imported with no accreditation category. Uncategorized
// companies are excluded from survey eligibility (survey assignment already
// filters by SurveyType) until someone manually classifies them.
export type PartnerCompanyType = SurveyType | 'Uncategorized';

// Only meaningful when type === 'Supplier'.
export type SupplierOrigin = 'Local' | 'Foreign';

export type AccreditationStatus = 'Accredited' | 'Unaccredited';

// Computed live from expiryDate at render time — never persisted as the
// source of truth, since "today" changes what these mean.
// 'For Update' is AFS-only: AFS validity follows a fiscal-year rule, not a
// day countdown, so it never passes through 'Expiring Soon'/'Expired'.
export type DocumentStatus = 'Current' | 'Expiring Soon' | 'Expired' | 'Missing' | 'For Update';

export type BranchStatus = 'Pending' | 'Updated' | 'Outdated' | 'Incomplete' | 'Completed' | 'Inactive' | 'Accredited';

export interface ComplianceDocument {
  provided?: boolean;
  expiryDate?: string;
  // status/daysLeft are derived from expiryDate; they may be present on
  // imported rows as a snapshot, but UI should recompute rather than trust
  // a stale value.
  status?: DocumentStatus;
  daysLeft?: number;
}

// One per BP Code / accreditation entry. A company almost always has exactly
// one branch, but a handful of companies have separate normal and "-NT" BP
// Codes that merge onto the same PartnerCompany as distinct branches.
export interface BranchRecord {
  id: string;
  bpCode: string;
  address?: string;
  federalTaxId?: string;
  industry?: string;
  contactPerson?: string;
  position?: string;
  mobilePhone?: string;
  email?: string;
  // Original category string as it appeared in the source sheet, e.g.
  // "Supplier-Foreign-NT", kept for audit even after being normalized into
  // the parent company's type/supplierOrigin.
  rawCategory?: string;
  supplierRank?: string;
  dateAccredited?: string;
  status?: BranchStatus;
  // Original sheet row number, for tracing an imported branch back to source.
  sourceRow?: number;
  documents?: Record<string, ComplianceDocument>;
}

export interface PartnerCompany {
  id: string;
  // Present only on temporary partners created by an isolated evaluation test import.
  testImportBatchId?: string;
  name: string;
  type: PartnerCompanyType;
  supplierOrigin?: SupplierOrigin;
  email?: string;
  affiliation?: string;
  createdAt: string;
  // When this partner record was registered in the system. Purely
  // descriptive metadata - document compliance (see computeCompanyDocumentSummary)
  // is tracked independently and no longer affects evaluation eligibility.
  registeredAt?: string;
  isArchived?: boolean;
  // Set when the record is archived and cleared when it is restored.
  archivedAt?: string;
  accreditationStatus?: AccreditationStatus;
  // 1..n; almost always 1. Absent/empty means "not yet migrated" — callers
  // should treat that the same as a single minimal branch.
  branches?: BranchRecord[];
}

export interface SurveyResponse {
  responseId: string;
  // Provenance controls whether a response belongs in official analytics.
  // Optional for records written before provenance tracking was introduced;
  // those are classified conservatively by responseProvenance.ts.
  dataSource?: SurveyResponseSource;
  importBatchId?: string;
  // Stable source identifiers used by report generation. Optional for rows
  // saved by older builds, which predate these fields.
  surveyId?: string;
  companyId?: string;
  surveyType: SurveyType;
  respondentType: string;
  // When the respondent began answering (opened the Questions Form step, or
  // - for an imported row - the source file's own "Start time" column).
  // Absent on responses recorded before this field existed; never
  // backfilled, since the real moment they started is unrecoverable.
  startTime?: string;
  // When the respondent completed/submitted - what "Completion time"/"Date"
  // means everywhere else in the app (analytics, exports, etc.).
  submissionDate: string;
  // Present only when a legacy record lacked an exact completion timestamp.
  // Consumers may display/use submissionDate, but must not represent an
  // inferred value as an exact source-provided completion time.
  submissionDateInferredFrom?: 'startTime' | 'responseId' | 'recordCreatedAt';
  company: string;
  department?: string;
  address?: string;
  questionId: string;
  questionNumber: number;
  question: string;
  questionCategory: string;
  rating: Rating;
  comment: string;
  respondentEmail?: string;
  archived?: boolean;
  archivedAt?: string;
  archivedBySurveyId?: string;
  archivedBySurveyTitle?: string;
  // Named reporting period this response belongs to (e.g. "1st Half 2026"),
  // set at archive time. Absent on legacy archived rows created before
  // series existed - those fall back to the surveyId+archivedAt grouping.
  seriesId?: string;
}

// A named historical reporting period (e.g. "1st Half 2026"). Not tied to
// any fixed cadence - admins type a freeform label when archiving, and
// responses archived later under the same label (case-insensitive) join
// the same series rather than creating a duplicate.
export interface ArchiveSeries {
  id: string;
  label: string;
  createdAt: string;
}

export interface FilterState {
  surveyType: SurveyType[];
  questionId: string;
  rating: 'All' | Rating;
  company: string;
  search: string;
}

export interface QuestionDefinition {
  questionId: string;
  questionNumber: number;
  question: string;
  questionCategory: string;
  surveyTypes: SurveyType[];
}

export interface KpiSummary {
  overallSatisfactionScore: number;
  totalResponses: number;
  averageRating: number;
  naPercentage: number;
  highestRatedQuestion: string;
  lowestRatedQuestion: string;
  maxRating?: number;
}

export interface ResponseNotification {
  id: string;
  company: string;
  surveyType: SurveyType;
  respondentType: string;
  submissionDate: string;
  questionCount: number;
  respondentEmail?: string;
  department?: string;
  designation?: string;
}

export interface CustomForm {
  id: string;
  title: string;
  surveyType: SurveyType;
  description: string;
  createdAt: string;
  archivedAt?: string;
  /** Timestamp when an Admin explicitly ended this survey, independent of its deadline. */
  manuallyEndedAt?: string;
  deadlineDate?: string;
  status?: 'Running' | 'Paused' | 'Completed' | 'Archived';
  accessDepartments?: string[];
  accessRoles?: SurveyAccessRole[];
  // IDs of PartnerCompany entries this survey should evaluate. Undefined/empty
  // means "all companies of this survey's type" (the default, always kept in
  // sync as companies are added/removed in the Partner Registry). Once an
  // admin customizes the list via "Modify Companies to Evaluate", only the
  // still-existing companies among these IDs are used.
  evaluationCompanyIds?: string[];
  maxRating?: number;
  questions: {
    questionId: string;
    questionNumber: number;
    question: string;
    questionCategory: string;
    inputType?: 'text' | 'rating' | 'typed-rating' | 'select' | 'checkbox' | 'date-range' | 'matrix';
    options?: string[];
    subQuestions?: { id: string; label: string; description?: string; validationRange?: { min: number; max: number; allowNa: boolean } }[];
    validationRange?: { min: number; max: number; allowNa: boolean };
    section?: string;
  }[];
}
