import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalEscape } from '../hooks/useModalEscape';
import { Pagination } from '../components/Pagination';
import {
  Plus,
  Trash,
  AlertCircle,
  Sparkles,
  Building,
  Info,
  Calendar,
  ClipboardList,
  Award,
  X,
  ChevronUp,
  ChevronDown,
  Clock,
  Settings,
  Archive,
  RefreshCw,
  FileText,
  Check,
  Upload,
  Loader2,
  Globe,
  MapPin,
  Tag,
  Mail,
  User,
  Phone,
  AlertTriangle
} from 'lucide-react';
import { AccreditationStatus, BranchRecord, BranchStatus, BusinessClassification, ComplianceDocument, DocumentStatus, PartnerCompany, PartnerCompanyType, SupplierOrigin, SurveyResponse, SurveyType } from '../types/survey';
import { getMaxRatingForResponses } from '../features/analytics/domain/analytics';
import { computeCompanyComposite } from '../features/evaluations/domain/scoring';
import { formatCompositeScore } from '../data/questionWeights';
import { branchAwareCompanyLabel, computeDocumentStatus, computeCompanyDocumentSummary, CompanyDocumentSummary, isNTBranch } from '../features/document-tracker/domain/compliance';
import { computeCategoryRankSummary } from '../features/partner-companies/domain/categorySummary';
import { getRequiredDocumentKeys, isExpiryDocument } from '../features/document-tracker/domain/documentRequirements';
import { companyDocumentRemarksError } from '../features/document-tracker/domain/documentValidation';
import { findMissingProfileFields, MISSING_FIELD_LABELS, MissingProfileField } from '../features/partner-companies/domain/dataCompleteness';
import {
  ImportResult,
  MasterListImportReview,
  MasterListFileDuplicate,
  MasterListSourceFile,
  findDuplicateMasterListFiles,
  masterListRowKey,
} from '../features/partner-companies/services/masterListImport';
import { isWithinDateRange } from '../utils/tableFilters';
import { ActiveCompaniesModal } from '../features/active-companies/components/ActiveCompaniesModal';
import { ActiveCompanyUploadCards } from '../features/active-companies/components/ActiveCompanyUploadCards';
import { DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, DocumentMaintenanceSettings, loadDocumentMaintenanceSettings } from '../features/notifications/services/documentMaintenanceSettings';
import { PartnerCompaniesFilterToolbar } from '../features/partner-companies/components/PartnerCompaniesFilterToolbar';
import { PartnerCompanyDirectoryCard } from '../features/partner-companies/components/PartnerCompanyDirectoryCard';
import { PartnerRegistryOverview } from '../features/partner-companies/components/PartnerRegistryOverview';
import { PartnerCategoryRankBreakdown } from '../features/partner-companies/components/PartnerCategoryRankBreakdown';
import { PartnerDirectoryArchiveButton } from '../features/partner-companies/components/PartnerDirectoryArchiveButton';

const MISSING_FIELD_ICONS: Record<MissingProfileField, typeof MapPin> = {
  address: MapPin,
  contact: User,
  email: Mail,
  phone: Phone,
};

export function typeBadgeClasses(type: PartnerCompanyType): string {
  switch (type) {
    case 'Courier':
      return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400';
    case 'Supplier':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400';
    case 'Subcontractor':
      return 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/20 dark:text-orange-400';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700';
  }
}

export function directoryCategoryBadgeClasses(type: PartnerCompanyType, origin?: SupplierOrigin): string {
  if (type === 'Supplier' && origin === 'Foreign') return 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/60';
  return typeBadgeClasses(type);
}

// Toggle options for a branch's Status field - mirrors the Master List's own
// "Status" column dropdown (Masterlist Database sheet) exactly, so a value
// picked here round-trips cleanly through a future re-import.
export const BRANCH_STATUS_OPTIONS: BranchStatus[] = ['Pending', 'Updated', 'Outdated', 'Incomplete', 'Completed', 'Accredited', 'Inactive'];

export function branchStatusBadgeClasses(status: BranchStatus): string {
  switch (status) {
    case 'Completed':
    case 'Updated':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400';
    case 'Accredited':
      return 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-950/20 dark:text-teal-400';
    case 'Outdated':
      return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400';
    case 'Incomplete':
      return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400';
    case 'Inactive':
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400'; // Pending
  }
}

// A company can hold more than one branch (e.g. a normal + "-NT" BP Code) -
// the non-NT branch is treated as the "primary" one for any single-value
// summary of the company (e.g. the simplified registry list), falling back
// to whichever branch exists when there's no non-NT one.
export function primaryBranch(c: Pick<PartnerCompany, 'branches'>): BranchRecord | undefined {
  const branches = c.branches ?? [];
  if (branches.length === 0) return undefined;
  return branches.find((b) => !isNTBranch(b)) ?? branches[0];
}

// Higher = more urgent/needs-action, for sorting the simplified list's
// Document Status column by the same Status value shown in the Document
// Tracker, worst-first.
const BRANCH_STATUS_SEVERITY: Record<BranchStatus, number> = {
  Incomplete: 5,
  Outdated: 4,
  Pending: 3,
  Completed: 2,
  Updated: 1,
  Accredited: 0,
  Inactive: -1,
};

// Keep the simplified registry table manageable to scan. Pagination applies
// after filtering and sorting.
const COMPANIES_PAGE_SIZE = 10;

const DOCUMENT_STATUS_STYLES: Record<DocumentStatus, string> = {
  Current: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40',
  'Expiring Soon': 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40',
  Expired: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40',
  'For Update': 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40',
  Missing: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
};

interface PartnerCompaniesPageProps {
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  onAddCompany: (
    name: string,
    type: SurveyType,
    affiliation?: string,
    registeredAt?: string,
    bpCode?: string,
    ntBpCode?: string,
    supplierOrigin?: SupplierOrigin
  ) => Promise<PartnerCompany>;
  onRemoveCompany: (id: string) => Promise<void>;
  onUpdateCompany: (company: PartnerCompany) => Promise<PartnerCompany>;
  onRenewDocument: (
    companyId: string,
    branchId: string,
    documentName: string,
    expectedDocument: ComplianceDocument,
    nextDocument: Pick<ComplianceDocument, 'provided'> & Partial<Pick<ComplianceDocument, 'expiryDate' | 'remarks' | 'description'>>,
  ) => Promise<PartnerCompany>;
  onPreviewMasterListImport?: (files: File[], options?: { replace?: boolean }) => Promise<MasterListImportReview>;
  onRebuildMasterListImport?: (
    files: MasterListSourceFile[],
    excludedRowKeys: string[],
    options?: { replace?: boolean },
  ) => ImportResult;
  onCommitMasterListImport?: (result: ImportResult) => Promise<void>;
  isAdmin?: boolean;
  /** Distinct from isAdmin - can be granted to a role without full Admin access (Account Management -> "Renew Compliance Documents"). */
  canRenewDocuments?: boolean;
  /** Deep-link support: opens this company's detail/edit panel on arrival. */
  initialFocusCompanyId?: string | null;
  onFocusConsumed?: () => void;
  currentUserEmail?: string;
}

export function PartnerCompaniesPage({
  partnerCompanies,
  responses,
  onAddCompany,
  onRemoveCompany,
  onUpdateCompany,
  onRenewDocument,
  onPreviewMasterListImport,
  onRebuildMasterListImport,
  onCommitMasterListImport,
  isAdmin,
  canRenewDocuments,
  initialFocusCompanyId,
  onFocusConsumed,
  currentUserEmail = '',
}: PartnerCompaniesPageProps) {
  const canRenew = isAdmin || canRenewDocuments;
  const [currentPage, setCurrentPage] = useState(1);
  // Affiliation filter
  const [activeTab, setActiveTab] = useState<PartnerCompanyType | 'All'>('All');
  // Local/Foreign sub-filter, only meaningful while activeTab === 'Supplier'
  const [originFilter, setOriginFilter] = useState<'All' | 'Local' | 'Foreign'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [documentFilter, setDocumentFilter] = useState<'all' | 'current' | 'expiring' | 'expired' | 'missing'>('all');
  const [importReplace, setImportReplace] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerModalTab, setRegisterModalTab] = useState<'manual' | 'upload'>('manual');
  const [isActiveCompaniesOpen, setIsActiveCompaniesOpen] = useState(false);
  const [documentMaintenanceSettings, setDocumentMaintenanceSettings] = useState<DocumentMaintenanceSettings>(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS);

  // Detail Modal State
  const [selectedCompany, setSelectedCompany] = useState<PartnerCompany | null>(null);
  const [selectedCompanyView, setSelectedCompanyView] = useState<'overview' | 'branches' | 'performance'>('overview');
  const [businessClassificationDraft, setBusinessClassificationDraft] = useState<BusinessClassification | ''>('');
  const [businessClassificationRemarks, setBusinessClassificationRemarks] = useState<Record<string, string>>({});
  
  // Document Renewal Date Picker State - which branch/document is being
  // renewed (null = closed), defaulting to today.
  const [renewalTarget, setRenewalTarget] = useState<{ branchId: string; docName: string } | null>(null);
  const [renewalYear, setRenewalYear] = useState(() => new Date().getFullYear());
  const [renewalMonth, setRenewalMonth] = useState(() => new Date().getMonth());
  const [renewalDay, setRenewalDay] = useState(() => new Date().getDate());
  const [renewalStep, setRenewalStep] = useState<1 | 2 | 3 | 4>(1);

  // Confirm-before-apply gate for flag-only documents (provided/not-provided
  // checklist items) - these used to flip the instant the badge was clicked,
  // with no way to back out and no audit trail. Clicking now only opens this
  // dialog; toggleFlagDocument (called from its Confirm button) applies it.
  const [flagConfirmTarget, setFlagConfirmTarget] = useState<{ branch: BranchRecord; docName: string; remarks: string } | null>(null);

  const maxRating = useMemo(() => {
    return getMaxRatingForResponses(responses);
  }, [responses]);
  
  // Registration Form State
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<SurveyType>('Courier');
  // Only meaningful when newType === 'Supplier' - decides Local vs Foreign
  // supplier doc checklist (see documentRequirements.ts) and which
  // Category Summary bucket (Supplier-Local/-Foreign) this registration counts toward.
  const [newSupplierOrigin, setNewSupplierOrigin] = useState<SupplierOrigin>('Local');
  const [newAffiliation, setNewAffiliation] = useState('');
  const [newRegDate, setNewRegDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newBpCode, setNewBpCode] = useState('');
  // A company can carry a second, Non-Trade BP Code (e.g. "ABC123-NT")
  // alongside its regular one - checking this reveals a second field so both
  // get registered as separate branches and both show up as their own row
  // in the Document Tracker (see displayRows in DocumentRegisterPage).
  const [newHasNTBranch, setNewHasNTBranch] = useState(false);
  const [newNtBpCode, setNewNtBpCode] = useState('');

  // Feedback Messages
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Destructive-action confirmation state. Authorization is enforced by the
  // authenticated Admin route and Supabase RLS, not a browser-side passcode.
  const [companyToDelete, setCompanyToDelete] = useState<PartnerCompany | null>(null);
  const [companyToArchive, setCompanyToArchive] = useState<PartnerCompany | null>(null);

  // Master List import state
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  // Parsed + merged result awaiting admin confirmation - nothing is saved
  // until they click "Apply Update" on the review modal below.
  const [importPreview, setImportPreview] = useState<MasterListImportReview | null>(null);
  const [duplicateMasterListReview, setDuplicateMasterListReview] = useState<{ files: File[]; duplicates: MasterListFileDuplicate[] } | null>(null);
  const [isReplaceConfirmationOpen, setIsReplaceConfirmationOpen] = useState(false);
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const [importError, setImportError] = useState('');
  useModalEscape(Boolean(flagConfirmTarget), () => setFlagConfirmTarget(null), 60);
  useModalEscape(Boolean(renewalTarget && selectedCompany), () => setRenewalTarget(null), 60);
  useModalEscape(Boolean(companyToDelete), () => setCompanyToDelete(null), 60);
  useModalEscape(Boolean(companyToArchive), () => setCompanyToArchive(null), 60);
  useModalEscape(Boolean(importPreview), () => setImportPreview(null), 50);
  useModalEscape(Boolean(importResult), () => setImportResult(null), 50);
  useModalEscape(Boolean(duplicateMasterListReview), () => setDuplicateMasterListReview(null), 80);
  useModalEscape(isReplaceConfirmationOpen, () => setIsReplaceConfirmationOpen(false), 90);
  useModalEscape(isRegisterOpen, () => setIsRegisterOpen(false), 50);
  useModalEscape(Boolean(selectedCompany), () => setSelectedCompany(null), 50);
  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    void loadDocumentMaintenanceSettings(controller.signal).then(setDocumentMaintenanceSettings).catch(() => undefined);
    return () => controller.abort();
  }, [isAdmin]);
  useEffect(() => {
    setBusinessClassificationDraft('');
    setBusinessClassificationRemarks({});
  }, [selectedCompany?.id]);

  type SortKey = 'name' | 'type' | 'registeredAt' | 'docStatus';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  const effectiveNow = new Date();
  const currentDateStr = effectiveNow.toISOString().slice(0, 10);

  // Always a valid summary (falls back to an empty company shape) so the
  // detail modal JSX never needs a null check on selectedCompany's status.
  const selectedCompanyDocSummary = useMemo(
    () => computeCompanyDocumentSummary(selectedCompany ?? { type: 'Uncategorized', branches: [] }, effectiveNow),
    [selectedCompany, effectiveNow]
  );

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Compute composite and status counts
  const companyStats = useMemo(() => {
    const stats: Record<string, { totalResponses: number; sumRating: number; countRating: number }> = {};

    responses.forEach((r) => {
      if (!stats[r.company]) {
        stats[r.company] = { totalResponses: 0, sumRating: 0, countRating: 0 };
      }
      stats[r.company].totalResponses += 1;
      if (r.rating !== 'N/A') {
        stats[r.company].sumRating += r.rating as number;
        stats[r.company].countRating += 1;
      }
    });

    return stats;
  }, [responses]);

  const getCompanyScoreDetails = (companyName: string, companyType: PartnerCompanyType) => {
    if (companyType === 'Uncategorized') {
      return { rating: 'N/A', pct: 0, count: 0, label: 'Unrated', hex: '#94a3b8' };
    }
    const composite = computeCompanyComposite(companyName, companyType, responses);
    if (!composite) {
      return { rating: 'N/A', pct: 0, count: 0, label: 'Unrated', hex: '#94a3b8' };
    }
    return {
      rating: formatCompositeScore(companyType, composite.compositeScore).text,
      pct: Math.round(composite.compositeScore),
      count: composite.evaluationCount,
      label: composite.band.label,
      hex: composite.band.hex,
    };
  };

  // "Active Partners" is every non-archived (i.e. accredited/categorized)
  // company - the whole roster you can track documents for - not a subset
  // that shrinks based on document compliance. "Expired" is a filtered LENS
  // into that same active roster (which companies need a renewal right
  // now), not a separate partition subtracted from Active - a company with
  // an expired document is still an active partner, just one that needs
  // attention, so it appears in both Active and Expired.
  const classifiedCompanies = useMemo(() => {
    const active: PartnerCompany[] = [];
    const expired: PartnerCompany[] = [];
    const archived: PartnerCompany[] = [];

    partnerCompanies.forEach((c) => {
      if (c.isArchived) {
        archived.push(c);
        return;
      }
      active.push(c);
      if (computeCompanyDocumentSummary(c, effectiveNow).status === 'Expired') {
        expired.push(c);
      }
    });

    return { active, expired, archived };
  }, [partnerCompanies, effectiveNow]);

  // Mirrors the Master List's own "Category Summary" / "Supplier Rank Summary"
  // legend blocks - counted per BRANCH (BP Code), NT separate. Shared with the
  // Dashboard's "Active Partners" KPI so both agree on the total (see
  // computeCategoryRankSummary).
  const categoryRankSummary = useMemo(() => computeCategoryRankSummary(partnerCompanies), [partnerCompanies]);

  // Cross-cutting filter, not a partition: a company can be both Expired
  // (document status) and Incomplete (profile) at once, so this pulls from
  // every non-archived company rather than being mutually exclusive with
  // Active/Expired the way those two are with each other.
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newName.trim()) {
      setErrorMessage('Company name cannot be blank.');
      return;
    }

    const exists = partnerCompanies.some(
      (c) => c.name.toLowerCase() === newName.trim().toLowerCase()
    );
    if (exists) {
      setErrorMessage(`"${newName.trim()}" is already in the partner list.`);
      return;
    }

    const trimmedBpCode = newBpCode.trim();
    // Falls back to the suggested "<BP Code>-NT" value if the admin left the
    // NT field blank after checking the box - the placeholder is a suggestion,
    // not a requirement to retype it.
    const trimmedNtBpCode = newHasNTBranch
      ? (newNtBpCode.trim() || (trimmedBpCode ? `${trimmedBpCode}-NT` : ''))
      : undefined;

    try {
      await onAddCompany(
        newName.trim(),
        newType,
        newAffiliation || undefined,
        newRegDate,
        trimmedBpCode || undefined,
        trimmedNtBpCode || undefined,
        newType === 'Supplier' ? newSupplierOrigin : undefined
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add the partner company.');
      return;
    }

    setSuccessMessage(
      `"${newName.trim()}" successfully added as a Partner ${newType}${newType === 'Supplier' ? ` (${newSupplierOrigin})` : ''}.`
    );
    setNewName('');
    setNewAffiliation('');
    setNewBpCode('');
    setNewHasNTBranch(false);
    setNewNtBpCode('');
    setNewSupplierOrigin('Local');
    setIsRegisterOpen(false);

    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const previewMasterListFiles = async (files: File[]) => {
    if (!files.length || !onPreviewMasterListImport) return;
    setIsImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      // Parse + merge only - nothing is saved until the admin reviews the
      // changes and confirms via applyImportPreview.
      const review = await onPreviewMasterListImport(files, { replace: importReplace });
      setImportPreview(review);
      setIsRegisterOpen(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import the Master List file.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file next time
    if (!files.length || !onPreviewMasterListImport) return;

    setIsImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const duplicates = await findDuplicateMasterListFiles(files);
      if (duplicates.length) {
        setDuplicateMasterListReview({ files, duplicates });
        setIsRegisterOpen(false);
        return;
      }
      const review = await onPreviewMasterListImport(files, { replace: importReplace });
      setImportPreview(review);
      setIsRegisterOpen(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to inspect the Master List files.');
    } finally {
      setIsImporting(false);
    }
  };

  const cancelDuplicateMasterListReview = () => {
    setDuplicateMasterListReview(null);
    setRegisterModalTab('upload');
    setIsRegisterOpen(true);
  };

  const continueWithoutDuplicateMasterListFiles = () => {
    if (!duplicateMasterListReview) return;
    const duplicateIndexes = new Set(duplicateMasterListReview.duplicates.map(({ duplicateIndex }) => duplicateIndex));
    const uniqueFiles = duplicateMasterListReview.files.filter((_, index) => !duplicateIndexes.has(index));
    setDuplicateMasterListReview(null);
    void previewMasterListFiles(uniqueFiles);
  };

  async function commitImportPreview() {
    if (!importPreview || !onCommitMasterListImport || isApplyingImport) return;
    if (importReplace && importPreview.result.companies.length === 0) {
      setImportError('Keep at least one partner company in the reviewed Master List before replacing the registry.');
      return;
    }
    setIsApplyingImport(true);
    setImportError('');
    try {
      await onCommitMasterListImport(importPreview.result);
      setImportResult(importPreview.result);
      setImportPreview(null);
      setIsReplaceConfirmationOpen(false);
      setImportReplace(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to apply the Master List import.');
    } finally {
      setIsApplyingImport(false);
    }
  }

  async function applyImportPreview() {
    if (importReplace && importPreview && importPreview.result.companies.length === 0) {
      setImportError('Keep at least one partner company in the reviewed Master List before replacing the registry.');
      return;
    }
    if (importReplace) {
      setIsReplaceConfirmationOpen(true);
      return;
    }
    await commitImportPreview();
  }

  const toggleImportRow = (fileId: string, sourceRow: number, excluded: boolean) => {
    if (!importPreview || !onRebuildMasterListImport) return;
    const key = masterListRowKey(fileId, sourceRow);
    const excludedRowKeys = excluded
      ? [...importPreview.excludedRowKeys, key]
      : importPreview.excludedRowKeys.filter((rowKey) => rowKey !== key);
    const result = onRebuildMasterListImport(importPreview.files, excludedRowKeys, { replace: importReplace });
    setImportPreview({ ...importPreview, excludedRowKeys, result });
  };

  const cancelImportPreview = () => setImportPreview(null);

  const downloadImportLog = () => {
    if (!importResult) return;
    const blob = new Blob([JSON.stringify(importResult.log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master-list-import-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startDelete = (company: PartnerCompany, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCompanyToDelete(company);
  };

  const confirmDelete = async () => {
    if (companyToDelete) {
      setErrorMessage('');
      try {
        await onRemoveCompany(companyToDelete.id);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to remove the partner company.');
        return;
      }
      setSuccessMessage(`Successfully removed partner "${companyToDelete.name}".`);
      setCompanyToDelete(null);
      if (selectedCompany?.id === companyToDelete.id) {
        setSelectedCompany(null);
      }
      setTimeout(() => setSuccessMessage(''), 4000);
    }
  };

  const updateArchiveStatus = async (company: PartnerCompany): Promise<boolean> => {
    const nextIsArchived = !company.isArchived;
    const updated: PartnerCompany = {
      ...company,
      isArchived: nextIsArchived,
      archivedAt: nextIsArchived ? new Date().toISOString() : undefined,
    };
    setErrorMessage('');
    try {
      await onUpdateCompany(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the partner company.');
      return false;
    }
    
    // update current selected company if open
    if (selectedCompany?.id === company.id) {
      setSelectedCompany(updated);
    }

    setSuccessMessage(`"${company.name}" successfully ${updated.isArchived ? 'archived' : 'restored to active'}.`);
    setTimeout(() => setSuccessMessage(''), 4000);
    return true;
  };

  const toggleArchive = async (company: PartnerCompany, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!company.isArchived) {
      setCompanyToArchive(company);
      return;
    }
    await updateArchiveStatus(company);
  };

  const confirmArchive = async () => {
    if (!companyToArchive) return;
    const didArchive = await updateArchiveStatus(companyToArchive);
    if (didArchive) setCompanyToArchive(null);
  };

  // Filter and sort companies by category and directory controls.
  const filteredCompanies = useMemo(() => {
    let baseList: PartnerCompany[] = [...classifiedCompanies.active, ...classifiedCompanies.archived];

    if (activeTab !== 'All') {
      baseList = baseList.filter((c) => c.type === activeTab);
    }

    if (activeTab === 'Supplier' && originFilter !== 'All') {
      baseList = baseList.filter((c) => (c.supplierOrigin ?? 'Local') === originFilter);
    }

    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.trim().toLowerCase();
      baseList = baseList.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.branches ?? []).some((b) => b.bpCode?.toLowerCase().includes(q))
      );
    }

    baseList = baseList.filter((company) =>
      isWithinDateRange(company.registeredAt || company.createdAt, registeredFrom, registeredTo)
    );

    if (documentFilter !== 'all') {
      baseList = baseList.filter((company) => {
        const summary = computeCompanyDocumentSummary(company, effectiveNow);
        if (documentFilter === 'current') return summary.status === 'Current';
        if (documentFilter === 'expiring') return summary.status === 'Expiring Soon';
        if (documentFilter === 'expired') return summary.status === 'Expired';
        return summary.status === 'Missing';
      });
    }

    if (sortConfig) {
      // docStatus has no direct field on PartnerCompany - rank by the primary
      // branch's Status value (same one shown/edited in the Document Tracker).
      const docSeverity = (c: PartnerCompany) => {
        const status = primaryBranch(c)?.status;
        return status ? BRANCH_STATUS_SEVERITY[status] : -2;
      };
      baseList = [...baseList].sort((a, b) => {
        const valA = sortConfig.key === 'docStatus'
          ? docSeverity(a)
          : sortConfig.key === 'registeredAt'
          ? (a.registeredAt || a.createdAt || '')
          : (a[sortConfig.key] || '');
        const valB = sortConfig.key === 'docStatus'
          ? docSeverity(b)
          : sortConfig.key === 'registeredAt'
          ? (b.registeredAt || b.createdAt || '')
          : (b[sortConfig.key] || '');
        if (valA < valB) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return baseList;
  }, [classifiedCompanies, activeTab, originFilter, debouncedSearchQuery, sortConfig, effectiveNow, registeredFrom, registeredTo, documentFilter]);

  // Jump back to page 1 whenever a filter/search/sort narrows or reshuffles
  // the result set - otherwise the user can land on a now-empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, originFilter, debouncedSearchQuery, sortConfig, registeredFrom, registeredTo, documentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / COMPANIES_PAGE_SIZE));
  // Clamp defensively (e.g. the list shrinks from a delete while on a later
  // page) so pagination stays correct without waiting for the effect above.
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCompanies = useMemo(
    () => filteredCompanies.slice((safePage - 1) * COMPANIES_PAGE_SIZE, safePage * COMPANIES_PAGE_SIZE),
    [filteredCompanies, safePage]
  );
  const hasArchivedCompanies = filteredCompanies.some((company) => company.isArchived);

  // Click handler to open company details modal
  const handleCompanyClick = (company: PartnerCompany, view: 'overview' | 'branches' | 'performance' = 'overview') => {
    setSelectedCompanyView(view);
    setSelectedCompany(company);
  };

  // Edits one field on one branch of the currently-open company (used by the
  // Address/Contact Person/Mobile Phone/Email inputs in the branch card -
  // these are exactly the fields the Incomplete Profiles tab checks).
  const updateBranchField = (branchId: string, field: 'address' | 'contactPerson' | 'mobilePhone' | 'email', value: string) => {
    if (!selectedCompany || !isAdmin) return;
    const updatedBranches = (selectedCompany.branches ?? []).map((b) =>
      b.id === branchId ? { ...b, [field]: value } : b
    );
    const updated = { ...selectedCompany, branches: updatedBranches };
    setSelectedCompany(updated);
    onUpdateCompany(updated);
  };

  // Lets an admin toggle a branch's Status directly in the registry, the same
  // field the Master List import populates from its "Status" column dropdown.
  const updateBranchStatus = (branchId: string, status: BranchStatus) => {
    if (!selectedCompany || !isAdmin) return;
    const updatedBranches = (selectedCompany.branches ?? []).map((b) =>
      b.id === branchId ? { ...b, status } : b
    );
    const updated = { ...selectedCompany, branches: updatedBranches };
    setSelectedCompany(updated);
    onUpdateCompany(updated);
  };

  // Deep-link: a caller can request this company's detail panel open on arrival.
  useEffect(() => {
    if (!initialFocusCompanyId) return;
    const company = partnerCompanies.find((c) => c.id === initialFocusCompanyId);
    if (company) handleCompanyClick(company);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusCompanyId]);

  // Open the date picker for renewing one branch's expiry-bearing document
  // (e.g. Business Permit, AFS). currentExpiry pre-fills the picker so the
  // admin is nudging an existing date forward rather than starting blank.
  const openDocumentRenewalPicker = (branchId: string, docName: string, currentExpiry?: string) => {
    const defaultDate = currentExpiry ? new Date(currentExpiry) : new Date(effectiveNow);
    const validityYears = documentMaintenanceSettings.validityYears[docName as keyof DocumentMaintenanceSettings['validityYears']];
    if (!currentExpiry && typeof validityYears === 'number') defaultDate.setFullYear(defaultDate.getFullYear() + validityYears);
    setRenewalYear(defaultDate.getFullYear());
    setRenewalMonth(defaultDate.getMonth());
    setRenewalDay(defaultDate.getDate());
    setRenewalStep(1);
    setRenewalTarget({ branchId, docName });
  };

  // Get total days in a month dynamically for correct date selection
  const daysInMonth = useMemo(() => {
    return new Date(renewalYear, renewalMonth + 1, 0).getDate();
  }, [renewalYear, renewalMonth]);

  // Toggle a flag-only document (e.g. SIF, Owner's ID) that has no expiry
  // date of its own - just a provided/not-provided accreditation checklist
  // item. Called from the confirm dialog's Confirm button (see
  // flagConfirmTarget/requestFlagToggle) rather than directly from the badge
  // click, and logged the same way Document Register logs its own edits so
  // both entry points share one audit trail.
  const toggleFlagDocument = async (branchId: string, docName: string, provided: boolean, remarks = '') => {
    if (!selectedCompany) return;
    const expectedDocument = (selectedCompany.branches ?? []).find((branch) => branch.id === branchId)?.documents?.[docName] ?? {};
    setErrorMessage('');
    try {
      const validationError = !provided ? companyDocumentRemarksError(selectedCompany, docName, { provided, remarks, expiryDate: expectedDocument.expiryDate }) : null;
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
      const updated = await onRenewDocument(selectedCompany.id, branchId, docName, expectedDocument, { provided, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) });
      setSelectedCompany(updated);
      setSuccessMessage(`"${docName}" was marked ${provided ? 'provided' : 'not provided'} for "${selectedCompany.name}".`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the compliance document.');
    }
  };

  const requestFlagToggle = (branch: BranchRecord, docName: string) => {
    if (!canRenew) return;
    setFlagConfirmTarget({ branch, docName, remarks: branch.documents?.[docName]?.remarks ?? '' });
  };

  // Assigns/changes a partner's type (and origin, for Suppliers) - the
  // category that determines which compliance documents apply. Moving a
  // company out of Uncategorized also accredits and unarchives it, mirroring
  // what a Master List import does when a row's category is recognized.
  const handleClassifyCompany = async (newType: PartnerCompanyType, newOrigin?: SupplierOrigin) => {
    if (!selectedCompany || !isAdmin) return;
    const becomingCategorized = newType !== 'Uncategorized' && selectedCompany.type === 'Uncategorized';
    const updated: PartnerCompany = {
      ...selectedCompany,
      type: newType,
      supplierOrigin: newType === 'Supplier' ? (newOrigin ?? selectedCompany.supplierOrigin ?? 'Local') : undefined,
      ...(becomingCategorized
        ? { accreditationStatus: 'Accredited' as AccreditationStatus, isArchived: false }
        : {}),
    };
    setErrorMessage('');
    try {
      await onUpdateCompany(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to classify the partner company.');
      return;
    }
    setSelectedCompany(updated);
    setSuccessMessage(
      `"${selectedCompany.name}" classified as ${newType}${newType === 'Supplier' ? ` (${updated.supplierOrigin})` : ''}.`
    );
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const saveBusinessClassification = async () => {
    if (!selectedCompany || !isAdmin || !businessClassificationDraft) return;
    const classDocumentNames = businessClassificationDraft === 'CORP' ? ['GIS (Corp)', 'SEC (Corp)'] : ['DTI (Sole)'];
    const needs: Array<{ branch: BranchRecord; docName: string; key: string }> = [];
    (selectedCompany.branches ?? []).forEach((branch) => classDocumentNames.forEach((docName) => {
      const doc = branch.documents?.[docName];
      const isMissing = !doc?.provided || (['GIS (Corp)', 'DTI (Sole)'].includes(docName) && !doc.expiryDate);
      if (isMissing) needs.push({ branch, docName, key: `${branch.id}:${docName}` });
    }));
    const missingRemark = needs.find(({ key, branch, docName }) => !(businessClassificationRemarks[key] ?? branch.documents?.[docName]?.remarks ?? '').trim());
    if (missingRemark) {
      setErrorMessage(`Add a required remark for ${missingRemark.docName} (${missingRemark.branch.bpCode || 'branch'}).`);
      return;
    }
    const branches = (selectedCompany.branches ?? []).map((branch) => {
      const documents = { ...(branch.documents ?? {}) };
      needs.filter((need) => need.branch.id === branch.id).forEach(({ docName, key }) => {
        documents[docName] = { ...(documents[docName] ?? {}), provided: false, remarks: (businessClassificationRemarks[key] ?? documents[docName]?.remarks ?? '').trim() };
      });
      return { ...branch, documents };
    });
    const updated = { ...selectedCompany, businessClassification: businessClassificationDraft, branches };
    setErrorMessage('');
    try {
      const saved = await onUpdateCompany(updated);
      setSelectedCompany(saved);
      setBusinessClassificationDraft('');
      setBusinessClassificationRemarks({});
      setSuccessMessage(`Business classification saved as ${businessClassificationDraft}.`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save business classification.');
    }
  };

  const handleConfirmDocumentRenewal = async () => {
    if (!selectedCompany || !renewalTarget) return;

    const pad = (n: number) => String(n).padStart(2, '0');
    const newExpiryStr = `${renewalYear}-${pad(renewalMonth + 1)}-${pad(renewalDay)}`;
    const { branchId, docName } = renewalTarget;
    const expectedDocument = (selectedCompany.branches ?? []).find((branch) => branch.id === branchId)?.documents?.[docName] ?? {};
    setErrorMessage('');
    try {
      const updated = await onRenewDocument(
        selectedCompany.id,
        branchId,
        docName,
        expectedDocument,
        { provided: true, expiryDate: newExpiryStr },
      );
      setSelectedCompany(updated);
      setRenewalTarget(null);
      setSuccessMessage(`"${docName}" renewed for "${selectedCompany.name}" until ${formatDate(newExpiryStr)}.`);
      setTimeout(() => setSuccessMessage(''), 5000);
      // The server RPC writes the audit entry atomically with the document change.
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to renew the compliance document.');
    }
  };

  return (
    <div className="admin-directory-page space-y-5" id="partner-companies-page">
      {/* Messages */}
      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-xs font-semibold flex items-center gap-2 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400">
          <Sparkles size={16} className="text-emerald-500" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose px-4 py-3 text-xs font-semibold flex items-center gap-2 dark:bg-rose-950/20 dark:border-rose-900">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <PartnerRegistryOverview
        category={activeTab}
        onCategoryChange={(value) => { setActiveTab(value); if (value !== 'Supplier') setOriginFilter('All'); }}
        isAdmin={isAdmin}
        onOpenActiveCompanies={() => setIsActiveCompaniesOpen(true)}
        onOpenRegister={() => { setErrorMessage(''); setRegisterModalTab('manual'); setIsRegisterOpen(true); }}
        directoryControls={(
      <PartnerCompaniesFilterToolbar
        categoryTab={activeTab}
        onCategoryChange={(value) => { setActiveTab(value); if (value !== 'Supplier') setOriginFilter('All'); }}
        originFilter={originFilter}
        onOriginChange={setOriginFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
        sortOptions={[
          { value: 'default', label: 'Default order' },
          { value: 'name-asc', label: 'Company: A–Z' },
          { value: 'name-desc', label: 'Company: Z–A' },
          { value: 'type-asc', label: 'Category: A-Z' },
          { value: 'type-desc', label: 'Category: Z-A' },
          { value: 'registeredAt-desc', label: 'Registered: newest first' },
          { value: 'registeredAt-asc', label: 'Registered: oldest first' },
          { value: 'docStatus-desc', label: 'Branch status: needs attention first' },
          { value: 'docStatus-asc', label: 'Branch status: lowest priority first' },
        ]}
        sortValue={sortConfig ? `${sortConfig.key}-${sortConfig.direction}` : 'default'}
        onSortChange={(value) => {
          if (value === 'default') {
            setSortConfig(null);
            return;
          }
          const separator = value.lastIndexOf('-');
          setSortConfig({
            key: value.slice(0, separator) as SortKey,
            direction: value.slice(separator + 1) as 'asc' | 'desc',
          });
        }}
        registeredFrom={registeredFrom}
        registeredTo={registeredTo}
        onRegisteredFromChange={setRegisteredFrom}
        onRegisteredToChange={setRegisteredTo}
        documentFilter={documentFilter}
        onDocumentFilterChange={setDocumentFilter}
        onReset={() => {
          setSearchQuery('');
          setDebouncedSearchQuery('');
          setActiveTab('All');
          setOriginFilter('All');
          setRegisteredFrom('');
          setRegisteredTo('');
          setDocumentFilter('all');
          setSortConfig(null);
        }}
      />
        )}
      >
        <PartnerCategoryRankBreakdown
          categorySummary={categoryRankSummary}
          branchCount={partnerCompanies.reduce((total, company) => total + (company.branches?.length ?? 0), 0)}
        />
      </PartnerRegistryOverview>
      <input ref={importFileInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleImportFileSelected} />
      <section className="space-y-3" aria-label="Partner directory workspace">

      {importError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-xs font-semibold flex items-center gap-2 dark:bg-rose-950/20 dark:border-rose-900">
          <AlertCircle size={16} />
          <span>{importError}</span>
        </div>
      )}

      {/*
      <TableFilterBar
        sortOptions={[
          { value: 'name-asc', label: 'Company: A–Z' },
          { value: 'name-desc', label: 'Company: Z–A' },
          { value: 'registeredAt-desc', label: 'Registered: newest first' },
          { value: 'registeredAt-asc', label: 'Registered: oldest first' },
          { value: 'docStatus-desc', label: 'Documents: most urgent first' },
        ]}
        sortValue={sortConfig ? `${sortConfig.key}-${sortConfig.direction}` : 'name-asc'}
        onSortChange={(value) => {
          const separator = value.lastIndexOf('-');
          setSortConfig({
            key: value.slice(0, separator) as SortKey,
            direction: value.slice(separator + 1) as 'asc' | 'desc',
          });
        }}
        dateFrom={registeredFrom}
        dateTo={registeredTo}
        onDateFromChange={setRegisteredFrom}
        onDateToChange={setRegisteredTo}
        dateLabel="Registration date"
        onReset={() => {
          setSearchQuery('');
          setActiveTab('All');
          setOriginFilter('All');
          setRegisteredFrom('');
          setRegisteredTo('');
          setDocumentFilter('all');
          setSortConfig({ key: 'name', direction: 'asc' });
        }}
      >
        <label className="min-w-[180px] flex-1 sm:flex-none">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Document expiration</span>
          <select
            value={documentFilter}
            onChange={(event) => setDocumentFilter(event.target.value as typeof documentFilter)}
            className="field !mt-0 w-full py-2 text-xs sm:w-[190px]"
          >
            <option value="all">All document states</option>
            <option value="current">Current</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired / for update</option>
            <option value="missing">Missing required docs</option>
          </select>
        </label>
      </TableFilterBar>
      */}

      {filteredCompanies.length === 0 ? (
        <div className="admin-directory-empty panel py-14 text-center text-slate-400">
          <Building size={30} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No partners match these filters.</p>
          <p className="mt-1 text-xs text-slate-400">Try changing or resetting the filters.</p>
        </div>
      ) : (
        <section className="admin-directory-table-shell panel overflow-hidden !p-0" aria-label="Partner company directory">
          <div className="overflow-x-auto">
            <table className={`admin-directory-table w-full min-w-[980px] border-collapse text-[13px] ${hasArchivedCompanies ? 'is-archived' : ''}`}>
              <colgroup>
                <col className="admin-directory-col-partner" />
                <col className="admin-directory-col-category" />
                <col className="admin-directory-col-registered" />
                {hasArchivedCompanies && <col className="admin-directory-col-archived" />}
                <col className="admin-directory-col-branch" />
                <col className="admin-directory-col-health" />
                <col className="admin-directory-col-actions" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
                  <th className="px-5 py-3" aria-sort={sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="admin-directory-sort-button" onClick={() => handleSort('name')}>Partner{sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</button>
                  </th>
                  <th className="px-5 py-3" aria-sort={sortConfig?.key === 'type' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="admin-directory-sort-button" onClick={() => handleSort('type')}>Category{sortConfig?.key === 'type' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</button>
                  </th>
                  <th className="px-5 py-3">Registered</th>
                  {hasArchivedCompanies && <th className="px-5 py-3">Archived</th>}
                  <th className="px-5 py-3" aria-sort={sortConfig?.key === 'docStatus' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="admin-directory-sort-button" onClick={() => handleSort('docStatus')}>Branch status{sortConfig?.key === 'docStatus' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</button>
                  </th>
                  <th className="px-5 py-3">Document health</th>
                  <th className="px-5 py-3 text-right" aria-label="Partner actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedCompanies.map((c) => {
                  const docSummary = computeCompanyDocumentSummary(c, effectiveNow);
                  const missingProfileFields = findMissingProfileFields(c);
                  const branch = primaryBranch(c);
                  const attentionCount = docSummary.expiredCount + docSummary.forUpdateCount + docSummary.expiringSoonCount + docSummary.missingCount;

                  return (
                    <tr
                      key={c.id}
                      className="admin-directory-row transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30"
                    >
                      <td className="px-5 py-3.5 align-middle">
                        <button type="button" onClick={() => handleCompanyClick(c)} className="admin-directory-company-link" aria-label={`Open ${c.name} partner record`}>
                          <span className="admin-directory-company-name">{c.name}</span>
                          {branch?.bpCode && <span className="admin-directory-company-code">BP Code {branch.bpCode}</span>}
                          {(c.branches?.length ?? 0) > 1 && <span className="admin-directory-company-code">{c.branches?.length} branches</span>}
                        </button>
                        {missingProfileFields.length > 0 && <span className="admin-directory-missing-profile" title={`Missing ${missingProfileFields.map((f) => MISSING_FIELD_LABELS[f]).join(', ')}`}>{missingProfileFields.length} profile fields missing</span>}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold border ${directoryCategoryBadgeClasses(c.type, c.supplierOrigin)}`}>
                            {c.type === 'Supplier' && c.supplierOrigin ? `Supplier ${c.supplierOrigin}` : c.type}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                        {formatDate(c.registeredAt || c.createdAt)}
                      </td>
                      {hasArchivedCompanies && (
                        <td
                          className="px-5 py-3.5 align-middle whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs"
                          title={c.archivedAt ?? undefined}
                        >
                          {c.isArchived ? formatDateTime(c.archivedAt) : '—'}
                        </td>
                      )}
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap text-xs font-medium">
                        {branch?.status ? (
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold border ${branchStatusBadgeClasses(branch.status)}`}>
                            {branch.status}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${c.isArchived ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' : DOCUMENT_STATUS_STYLES[docSummary.status]}`}>
                            {c.isArchived ? 'Archived' : docSummary.status}
                          </span>
                          {!c.isArchived && attentionCount > 0 && <span className="text-[10px] text-slate-400">{attentionCount} follow-up item{attentionCount === 1 ? '' : 's'}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-middle text-right">
                        <div className="admin-directory-actions" onClick={(e) => e.stopPropagation()}>
                          {(docSummary.status === 'Expired' || docSummary.status === 'Missing') && canRenew && (
                            <button
                              onClick={() => handleCompanyClick(c, 'branches')}
                              className="admin-directory-review-link"
                            >
                              <FileText size={15} aria-hidden="true" />
                              <span className="sr-only">Review documents</span>
                            </button>
                          )}
                          {isAdmin && (
                            <PartnerDirectoryArchiveButton companyName={c.name} isArchived={Boolean(c.isArchived)} onArchiveOrRestore={() => toggleArchive(c)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="admin-directory-mobile-list" aria-label="Partner company directory">
            {paginatedCompanies.map((company) => {
              const summary = computeCompanyDocumentSummary(company, effectiveNow);
              const branch = primaryBranch(company);
              const missingProfileCount = findMissingProfileFields(company).length;
              const attentionCount = summary.expiredCount + summary.forUpdateCount + summary.expiringSoonCount + summary.missingCount;
              return <PartnerCompanyDirectoryCard
                key={company.id}
                company={company}
                categoryClassName={directoryCategoryBadgeClasses(company.type, company.supplierOrigin)}
                documentStatus={summary.status}
                documentStatusClassName={DOCUMENT_STATUS_STYLES[summary.status]}
                branchStatusClassName={branch?.status ? branchStatusBadgeClasses(branch.status) : undefined}
                primaryBranchCode={branch?.bpCode}
                primaryBranchStatus={branch?.status}
                registeredDate={formatDate(company.registeredAt || company.createdAt)}
                archivedDate={company.isArchived && company.archivedAt ? formatDateTime(company.archivedAt) : undefined}
                attentionCount={attentionCount}
                missingProfileCount={missingProfileCount}
                canReviewDocuments={Boolean(canRenew && (summary.status === 'Expired' || summary.status === 'Missing'))}
                isAdmin={Boolean(isAdmin)}
                onOpen={() => handleCompanyClick(company)}
                onReviewDocuments={() => handleCompanyClick(company, 'branches')}
                onArchiveOrRestore={() => toggleArchive(company)}
              />;
            })}
          </div>
        </section>
      )}

      {filteredCompanies.length > 0 && <Pagination page={safePage} pageSize={COMPANIES_PAGE_SIZE} totalItems={filteredCompanies.length}
        onPageChange={setCurrentPage} ariaLabel="Partner companies pagination" showPageSizeSelector={false}
        showPageControls={totalPages > 1} className="admin-directory-pagination panel px-5" />}
      </section>

      {/* PARTNER DETAILS & CONTRACT CONFIGURATION DRAWER/MODAL */}
      {selectedCompany && createPortal(
        <div className="admin-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="admin-partner-details-dialog w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="admin-partner-dialog-topbar">
              {/* Modal Header */}
              <div className="admin-partner-details-header flex min-w-0 flex-col gap-2">
                <h3 className="min-w-0 break-words text-lg font-semibold leading-6 text-slate-900 dark:text-white">{selectedCompany.name}</h3>
                <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs leading-4 text-slate-500 dark:text-slate-400">
                  <span className="break-all">ID: {selectedCompany.id}</span>
                  <span className="min-w-0 break-words">Scope: {selectedCompany.affiliation || 'General partnership'}</span>
                </p>
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${directoryCategoryBadgeClasses(selectedCompany.type, selectedCompany.supplierOrigin)}`}>
                    {selectedCompany.type === 'Supplier' && selectedCompany.supplierOrigin ? `Supplier ${selectedCompany.supplierOrigin}` : selectedCompany.type}
                  </span>
                  {selectedCompany.accreditationStatus && (
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      selectedCompany.accreditationStatus === 'Accredited'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400'
                    }`}>
                      {selectedCompany.accreditationStatus}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedCompany(null)}
                className="admin-partner-details-close"
                title="Close panel"
                aria-label="Close partner record"
                type="button"
              >
                <X size={18} />
              </button>

              <div className="admin-partner-dialog-tabs" role="group" aria-label="Partner record sections">
                <button type="button" aria-pressed={selectedCompanyView === 'overview'} onClick={() => setSelectedCompanyView('overview')}>Overview</button>
                <button type="button" aria-pressed={selectedCompanyView === 'branches'} onClick={() => setSelectedCompanyView('branches')}>
                  Branches &amp; documents <span>{(selectedCompany.branches ?? []).length}</span>
                </button>
                <button type="button" aria-pressed={selectedCompanyView === 'performance'} onClick={() => setSelectedCompanyView('performance')}>Performance</button>
              </div>
            </div>

            <div className="admin-partner-dialog-content">
            {selectedCompanyView === 'overview' && <div className="space-y-5">
            {/* Partner Classification - which document set applies (Courier/Supplier-Local/
                Supplier-Foreign/Subcontractor) is driven entirely by this, so it's editable
                by the same role that can renew documents. Master-List rows that imported with
                no recognizable category land here as Uncategorized/archived until classified. */}
            <div className="admin-partner-classification mt-6">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Tag size={14} />
                <span>Partner Classification</span>
              </h4>
              <div className="mt-2 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
                {selectedCompany.type === 'Uncategorized' && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    <span>Uncategorized partners are archived and excluded from surveys until classified.</span>
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="classify-type-sel" className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Partner Type</label>
                    <select
                      id="classify-type-sel"
                      className="field text-xs py-2"
                      value={selectedCompany.type}
                      disabled={!isAdmin}
                      onChange={(e) => handleClassifyCompany(e.target.value as PartnerCompanyType)}
                    >
                      <option value="Uncategorized">Uncategorized</option>
                      <option value="Courier">Courier</option>
                      <option value="Supplier">Supplier</option>
                      <option value="Subcontractor">Subcontractor</option>
                    </select>
                  </div>
                  {selectedCompany.type === 'Supplier' && (
                    <div>
                      <label htmlFor="classify-origin-sel" className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Supplier Origin</label>
                      <select
                        id="classify-origin-sel"
                        className="field text-xs py-2"
                        value={selectedCompany.supplierOrigin ?? 'Local'}
                        disabled={!isAdmin}
                        onChange={(e) => handleClassifyCompany('Supplier', e.target.value as SupplierOrigin)}
                      >
                        <option value="Local">Local</option>
                        <option value="Foreign">Foreign</option>
                      </select>
                    </div>
                  )}
                  {selectedCompany.type !== 'Uncategorized' && !(selectedCompany.type === 'Supplier' && selectedCompany.supplierOrigin === 'Foreign') && (
                    <div className="sm:col-span-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <label htmlFor="business-classification" className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Business Classification</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <select id="business-classification" className="field w-32 text-xs py-2" disabled={!isAdmin}
                          value={businessClassificationDraft || selectedCompany.businessClassification || ''}
                          onChange={(event) => { setBusinessClassificationDraft(event.target.value as BusinessClassification | ''); setBusinessClassificationRemarks({}); setErrorMessage(''); }}>
                          <option value="">Select CORP / SOL</option>
                          <option value="CORP">CORP</option>
                          <option value="SOL">SOL</option>
                        </select>
                        {businessClassificationDraft && businessClassificationDraft !== selectedCompany.businessClassification && (
                          <button type="button" onClick={saveBusinessClassification} disabled={!isAdmin} className="primary-button py-2 px-3 text-xs">Save classification</button>
                        )}
                        {!selectedCompany.businessClassification && !businessClassificationDraft && <span className="text-[10px] text-amber-700 dark:text-amber-400">Set to activate GIS + SEC or DTI requirements.</span>}
                      </div>
                      {businessClassificationDraft && businessClassificationDraft !== selectedCompany.businessClassification && (() => {
                        const classDocs = businessClassificationDraft === 'CORP' ? ['GIS (Corp)', 'SEC (Corp)'] : ['DTI (Sole)'];
                        const missing = (selectedCompany.branches ?? []).flatMap((branch) => classDocs.flatMap((docName) => {
                          const current = branch.documents?.[docName];
                          return !current?.provided || (['GIS (Corp)', 'DTI (Sole)'].includes(docName) && !current.expiryDate)
                            ? [{ branch, docName, key: `${branch.id}:${docName}` }]
                            : [];
                        }));
                        return missing.length ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {missing.map(({ branch, docName, key }) => (
                              <label key={key} className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                {docName} · {branch.bpCode || 'Branch'} <span className="text-rose-600">Remarks required</span>
                                <input value={businessClassificationRemarks[key] ?? branch.documents?.[docName]?.remarks ?? ''} maxLength={2000}
                                  onChange={(event) => setBusinessClassificationRemarks((current) => ({ ...current, [key]: event.target.value }))}
                                  placeholder="Why is this document not provided?" className="field mt-1 text-xs py-1.5" />
                              </label>
                            ))}
                          </div>
                        ) : null;
                      })()}
                      <p className="mt-1 text-[10px] text-slate-400">Changing CORP/SOL updates active requirements and keeps documents from the previous classification in history.</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  {isAdmin
                    ? 'Determines which compliance documents apply to this partner (see Branches & Compliance Documents below). Classifying an Uncategorized partner also unarchives and accredits it.'
                    : 'Reclassifying is restricted to administrators.'}
                </p>
              </div>
            </div>

            {/* Core Details Grid */}
            <div className="admin-partner-core-details grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              
              {/* Left Column: Contact + Registration */}
              <div className="admin-partner-core-column space-y-4">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} />
                  <span>Contact &amp; Registration</span>
                </h4>

                <div className="admin-partner-core-panel space-y-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Target Company Primary Email
                    </label>
                    <input
                      type="email"
                      value={selectedCompany.email || ''}
                      disabled={!isAdmin}
                      onChange={(e) => {
                        const updated = { ...selectedCompany, email: e.target.value };
                        setSelectedCompany(updated);
                        onUpdateCompany(updated);
                      }}
                      placeholder="e.g. contact@partnercompany.com"
                      className="field text-xs py-1.5"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Used automatically when dispatching evaluation feedback reports to this partner.</p>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 font-medium">Registration Date:</span>
                    <strong className="text-slate-700 dark:text-slate-200">{formatDate(selectedCompany.registeredAt || selectedCompany.createdAt)}</strong>
                  </div>
                </div>

                {/* Document Compliance Status Banner */}
                <div>
                  {selectedCompany.isArchived ? (
                    <div className="bg-slate-100 border border-slate-200 text-slate-600 p-3 rounded-lg text-xs font-medium">
                      This partner is archived. Archived partners are suspended and excluded from surveys/modifications.
                    </div>
                  ) : selectedCompanyDocSummary.forUpdateCount > 0 && selectedCompanyDocSummary.expiredCount === 0 ? (
                    <div className="bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg text-xs font-medium dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-300">
                      <strong>{selectedCompanyDocSummary.forUpdateCount} AFS filing{selectedCompanyDocSummary.forUpdateCount === 1 ? ' needs' : 's need'} update.</strong> This company is disabled from evaluation forms until the filing is updated.
                    </div>
                  ) : selectedCompanyDocSummary.status === 'Expired' ? (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs font-medium dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-400">
                      ⚠️ <strong>{selectedCompanyDocSummary.expiredCount} required document{selectedCompanyDocSummary.expiredCount === 1 ? ' is' : 's are'} EXPIRED.</strong> This company has been automatically disabled from evaluation forms. Renew the expired document(s) below to reactivate.
                    </div>
                  ) : selectedCompanyDocSummary.status === 'Missing' ? (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs font-medium dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-400">
                      ⚠️ <strong>{selectedCompanyDocSummary.missingCount} required document{selectedCompanyDocSummary.missingCount === 1 ? ' was' : 's were'} never provided.</strong> Not yet fully compliant - still eligible for audits. Provide the missing document(s) below.
                    </div>
                  ) : selectedCompanyDocSummary.status === 'Expiring Soon' ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-lg text-xs font-medium dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400">
                      ⏳ <strong>{selectedCompanyDocSummary.expiringSoonCount} document{selectedCompanyDocSummary.expiringSoonCount === 1 ? '' : 's'} expiring within 30 days.</strong> Still eligible for audits - renew below before they lapse.
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-lg text-xs font-medium dark:bg-emerald-950/10 dark:text-emerald-400">
                      ✔ <strong>All required documents are current.</strong> Eligible for audits.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Document Compliance Summary */}
              <div className="admin-partner-core-column space-y-4">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardList size={14} />
                  <span>Document Compliance Summary</span>
                </h4>

                <div className="admin-partner-core-panel bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                      <span className="text-slate-400 font-medium block">Required Documents</span>
                      <strong className="text-slate-700 dark:text-slate-200 text-base">{selectedCompanyDocSummary.totalRequired}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                      <span className="text-slate-400 font-medium block">Expired</span>
                      <strong className={`text-base ${selectedCompanyDocSummary.expiredCount > 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>{selectedCompanyDocSummary.expiredCount}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                      <span className="text-slate-400 font-medium block">For Update</span>
                      <strong className={`text-base ${selectedCompanyDocSummary.forUpdateCount > 0 ? 'text-blue-600' : 'text-slate-700 dark:text-slate-200'}`}>{selectedCompanyDocSummary.forUpdateCount}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                      <span className="text-slate-400 font-medium block">Expiring Soon</span>
                      <strong className={`text-base ${selectedCompanyDocSummary.expiringSoonCount > 0 ? 'text-amber-600' : 'text-slate-700 dark:text-slate-200'}`}>{selectedCompanyDocSummary.expiringSoonCount}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                      <span className="text-slate-400 font-medium block">Missing</span>
                      <strong className="text-slate-700 dark:text-slate-200 text-base">{selectedCompanyDocSummary.missingCount}</strong>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    "Expiring Soon" uses the same 30-day window as the Master List. Renew individual documents from the Branches &amp; Compliance Documents section below{canRenew ? '' : ' (renewal requires the Document Renewal permission)'}.
                  </p>
                </div>
              </div>
            </div>

            </div>}

            {/* Audit Index & Performance Section */}
            {selectedCompanyView === 'performance' && <div className="admin-partner-performance">
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-lg text-xs space-y-1">
                <span className="text-slate-400 font-medium">Evaluation Audit volume:</span>
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  {getCompanyScoreDetails(selectedCompany.name, selectedCompany.type).count} audits successfully processed.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-lg text-xs space-y-1">
                <span className="text-slate-400 font-medium">Satisfaction Score Index:</span>
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  {getCompanyScoreDetails(selectedCompany.name, selectedCompany.type).rating} composite feedback satisfaction.
                </p>
              </div>
            </div>
            </div>}

            {/* Branches & Compliance Documents (from Master List import) */}
            {selectedCompanyView === 'branches' && (selectedCompany.branches ?? []).length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <ClipboardList size={14} />
                  <span>Branches &amp; Compliance Documents ({(selectedCompany.branches ?? []).length})</span>
                </h4>

                <div className="space-y-3">
                  {(selectedCompany.branches ?? []).map((branch) => (
                    <div key={branch.id} className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                            {branch.bpCode || 'No BP Code'}
                          </span>
                          {branch.rawCategory && (
                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">{branch.rawCategory}</span>
                          )}
                        </div>
                        {isAdmin ? (
                          <select
                            value={branch.status ?? ''}
                            onChange={(e) => updateBranchStatus(branch.id, e.target.value as BranchStatus)}
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border cursor-pointer ${
                              branch.status ? branchStatusBadgeClasses(branch.status) : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700'
                            }`}
                          >
                            <option value="" disabled>Set status</option>
                            {BRANCH_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          branch.status && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${branchStatusBadgeClasses(branch.status)}`}>
                              {branch.status}
                            </span>
                          )
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <div className="sm:col-span-2">
                          <label className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Address {!branch.address && <span className="text-amber-500 dark:text-amber-400 normal-case font-semibold">- missing</span>}
                          </label>
                          <input
                            type="text"
                            value={branch.address || ''}
                            disabled={!isAdmin}
                            onChange={(e) => updateBranchField(branch.id, 'address', e.target.value)}
                            placeholder="Add branch address"
                            className={`field text-xs py-1.5 ${!branch.address ? 'border-amber-300 dark:border-amber-800' : ''}`}
                          />
                        </div>
                        <div>
                          <label className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Contact Person {!branch.contactPerson && <span className="text-amber-500 dark:text-amber-400 normal-case font-semibold">- missing</span>}
                          </label>
                          <input
                            type="text"
                            value={branch.contactPerson || ''}
                            disabled={!isAdmin}
                            onChange={(e) => updateBranchField(branch.id, 'contactPerson', e.target.value)}
                            placeholder="Add contact person"
                            className={`field text-xs py-1.5 ${!branch.contactPerson ? 'border-amber-300 dark:border-amber-800' : ''}`}
                          />
                        </div>
                        <div>
                          <label className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Mobile Phone {!branch.mobilePhone && <span className="text-amber-500 dark:text-amber-400 normal-case font-semibold">- missing</span>}
                          </label>
                          <input
                            type="text"
                            value={branch.mobilePhone || ''}
                            disabled={!isAdmin}
                            onChange={(e) => updateBranchField(branch.id, 'mobilePhone', e.target.value)}
                            placeholder="Add mobile phone"
                            className={`field text-xs py-1.5 ${!branch.mobilePhone ? 'border-amber-300 dark:border-amber-800' : ''}`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Branch Email {!branch.email && <span className="text-amber-500 dark:text-amber-400 normal-case font-semibold">- missing</span>}
                          </label>
                          <input
                            type="email"
                            value={branch.email || ''}
                            disabled={!isAdmin}
                            onChange={(e) => updateBranchField(branch.id, 'email', e.target.value)}
                            placeholder="Add branch email"
                            className={`field text-xs py-1.5 ${!branch.email ? 'border-amber-300 dark:border-amber-800' : ''}`}
                          />
                        </div>
                        {branch.industry && <p className="sm:col-span-2 text-[11px] text-slate-500 dark:text-slate-400">Industry: {branch.industry}</p>}
                        {branch.dateAccredited && <p className="sm:col-span-2 text-[11px] text-slate-500 dark:text-slate-400">Accredited: {formatDate(branch.dateAccredited)}</p>}
                      </div>

                      {(() => {
                        // Show every document required for this company's category, plus
                        // any extra keys already on file (e.g. from a legacy import) - not
                        // just the ones that happen to have data, so admins can also fill
                        // in documents that are currently Missing.
                        const requiredKeys = getRequiredDocumentKeys(selectedCompany.type, selectedCompany.supplierOrigin, selectedCompany.businessClassification);
                        const extraKeys = Object.keys(branch.documents ?? {}).filter((k) => !requiredKeys.includes(k));
                        const allKeys = [...requiredKeys, ...extraKeys];
                        if (allKeys.length === 0) {
                          return (
                            <p className="text-[11px] text-slate-400 italic mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                              No compliance documents apply to this category.
                            </p>
                          );
                        }
                        return (
                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                            {allKeys.map((docName) => {
                              const doc = (branch.documents?.[docName] ?? {}) as ComplianceDocument;
                              const { status } = computeDocumentStatus(doc, effectiveNow, docName);
                              const expiryBased = isExpiryDocument(docName);
                              const inactiveClassificationDocument = ['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)'].includes(docName)
                                && ((docName === 'DTI (Sole)' && selectedCompany.businessClassification !== 'SOL')
                                  || (docName !== 'DTI (Sole)' && selectedCompany.businessClassification !== 'CORP'));
                              return (
                                <button
                                  key={docName}
                                  type="button"
                                  disabled={!canRenew || inactiveClassificationDocument}
                                  onClick={() => {
                                    if (!canRenew || inactiveClassificationDocument) return;
                                    if (expiryBased) {
                                      openDocumentRenewalPicker(branch.id, docName, doc.expiryDate);
                                    } else {
                                      requestFlagToggle(branch, docName);
                                    }
                                  }}
                                  title={
                                    inactiveClassificationDocument
                                      ? 'Historical document; inactive for the current classification'
                                      : doc.expiryDate
                                      ? `Expires ${formatDate(doc.expiryDate)}${canRenew ? ' — click to renew' : ''}`
                                      : canRenew
                                      ? (expiryBased ? 'Click to set an expiry date' : `Click to mark ${doc.provided ? 'not provided' : 'provided'}`)
                                      : docName
                                  }
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold border transition ${inactiveClassificationDocument ? 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-800' : DOCUMENT_STATUS_STYLES[status]} ${canRenew && !inactiveClassificationDocument ? 'cursor-pointer hover:ring-2 hover:ring-[#2187CD]/40' : 'cursor-default'}`}
                                >
                                  {canRenew && <RefreshCw size={9} />}
                                  {docName}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedCompanyView === 'branches' && (selectedCompany.branches ?? []).length === 0 && (
              <p className="admin-directory-no-branches">No branches are recorded for this partner.</p>
            )}
            </div>

            {/* Administrative Action Footer */}
            {isAdmin && (
              <div className="admin-partner-dialog-actions flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleArchive(selectedCompany)}
                    className="secondary-button text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                  >
                    <Archive size={14} />
                    <span>{selectedCompany.isArchived ? "Restore" : "Archive"}</span>
                  </button>
                  <button
                    onClick={() => startDelete(selectedCompany)}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-3 rounded-md flex items-center justify-center gap-1.5 transition duration-150 cursor-pointer"
                    type="button"
                  >
                    <Trash size={14} />
                    <span>Delete Partner</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* DOCUMENT RENEWAL DATE PICKER DIALOG (custom-made scrollable year, month blocks, accurate day blocks with wizard steps) */}
      {renewalTarget && selectedCompany && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150">

            <button
              onClick={() => setRenewalTarget(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              title="Close Calendar"
              type="button"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 text-emerald-600 mb-1">
              <Calendar size={22} />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Document Renewal Picker</h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Renew <strong className="text-slate-800 dark:text-slate-100">"{renewalTarget.docName}"</strong> for <strong className="text-slate-800 dark:text-slate-100">"{selectedCompany.name}"</strong>
            </p>

            {/* Step Progress Indicator */}
            <div className="flex items-center justify-between mb-6 px-1">
              {([1, 2, 3, 4] as const).map((step) => {
                let stepLabel = "";
                if (step === 1) stepLabel = "Year";
                if (step === 2) stepLabel = "Month";
                if (step === 3) stepLabel = "Day";
                if (step === 4) stepLabel = "Confirm";

                const isActive = renewalStep === step;
                const isCompleted = renewalStep > step;

                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-300 ${
                        isActive
                          ? 'bg-[#2187CD] text-white border-[#2187CD] ring-4 ring-[#2187CD]/15 scale-110'
                          : isCompleted
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-750 dark:text-slate-500'
                      }`}>
                        {isCompleted ? <Check size={14} /> : step}
                      </div>
                      <span className={`text-[10px] font-bold mt-1.5 ${
                        isActive ? 'text-[#2187CD] dark:text-blue-400' : isCompleted ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'
                      }`}>
                        {stepLabel}
                      </span>
                    </div>
                    {step < 4 && (
                      <div className={`h-0.5 flex-1 mx-2 rounded-full transition-all duration-300 ${
                        isCompleted ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 min-h-[160px] flex flex-col justify-center">
              {/* Step 1: Select Year */}
              {renewalStep === 1 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-3 duration-150">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Step 1: Choose New Expiry Year</span>
                  <div className="flex items-center justify-between gap-3 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50">
                    <button 
                      type="button" 
                      onClick={() => setRenewalYear(y => Math.max(2026, y - 1))}
                      className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-bold cursor-pointer transition text-xs shadow-xs"
                    >
                      &larr; Prev
                    </button>
                    <span className="font-mono text-base font-extrabold text-[#2187CD] dark:text-blue-400">{renewalYear}</span>
                    <button 
                      type="button" 
                      onClick={() => setRenewalYear(y => Math.min(2035, y + 1))}
                      className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-bold cursor-pointer transition text-xs shadow-xs"
                    >
                      Next &rarr;
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">Use the controls above to set the new expiry year.</p>
                </div>
              )}

              {/* Step 2: Select Month */}
              {renewalStep === 2 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-3 duration-150">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Step 2: Choose Month ({monthsList[renewalMonth]})</span>
                  <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-4">
                    {monthsList.map((mName, index) => (
                      <button
                        key={mName}
                        type="button"
                        onClick={() => {
                          setRenewalMonth(index);
                          // Make sure day remains inside bounds of selected month
                          const maxD = new Date(renewalYear, index + 1, 0).getDate();
                          if (renewalDay > maxD) setRenewalDay(maxD);
                        }}
                        className={`py-1.5 text-center text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          renewalMonth === index
                            ? 'bg-[#2187CD] text-white border-[#2187CD] shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
                        }`}
                      >
                        {mName.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Select Day */}
              {renewalStep === 3 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-3 duration-150">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Step 3: Choose Day ({renewalDay})</span>
                  <div className="grid grid-cols-7 gap-1 p-1 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setRenewalDay(day)}
                        className={`p-1 text-center text-[11px] font-mono font-bold rounded-md border transition-all cursor-pointer ${
                          renewalDay === day
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800/60'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Confirm selected renewal term expiry */}
              {renewalStep === 4 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-3 duration-150 text-center">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block text-left">Step 4: Confirm New Expiry Date</span>

                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-xl space-y-1">
                    <span className="text-emerald-800 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider block">New Expiry Date</span>
                    <p className="font-mono text-emerald-900 dark:text-emerald-300 text-base font-black">
                      {monthsList[renewalMonth]} {renewalDay}, {renewalYear}
                    </p>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-left">
                    ✔ Marks "{renewalTarget.docName}" as provided/current with this expiry date.<br />
                    ✔ If this was the company's last expired document, it becomes eligible for audits again.
                  </p>

                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-[#a16207] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400 text-left">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>This immediately updates the company's compliance record. Double-check the date before confirming.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Navigation Footer */}
            <div className="flex items-center justify-between gap-3 mt-8 border-t border-slate-100 pt-4 dark:border-slate-800">
              {/* Back / Cancel Button */}
              {renewalStep === 1 ? (
                <button
                  onClick={() => setRenewalTarget(null)}
                  className="secondary-button"
                  type="button"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => setRenewalStep((s) => (s - 1) as any)}
                  className="secondary-button"
                  type="button"
                >
                  &larr; Back
                </button>
              )}

              {/* Next / Confirm Button */}
              {renewalStep < 4 ? (
                <button
                  onClick={() => setRenewalStep((s) => (s + 1) as any)}
                  className="inline-flex items-center justify-center rounded-lg bg-[#2187CD] hover:bg-[#2187CD]/90 px-5 py-2 text-sm font-bold text-white transition cursor-pointer shadow-xs"
                  type="button"
                >
                  Next &rarr;
                </button>
              ) : (
                <button
                  onClick={handleConfirmDocumentRenewal}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-sm font-bold text-white transition cursor-pointer shadow-xs"
                  type="button"
                >
                  Confirm & Apply Renewal
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm before a flag doc's provided/not-provided status actually flips - mirrors
          the same confirm dialog on the Document Register page, so both entry points into
          editing a company's compliance documents behave the same way. */}
      {flagConfirmTarget && selectedCompany && (() => {
        const willBeProvided = !(flagConfirmTarget.branch.documents?.[flagConfirmTarget.docName]?.provided);
        const legalRemarkRequired = ['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)'].includes(flagConfirmTarget.docName)
          && !(selectedCompany.type === 'Supplier' && selectedCompany.supplierOrigin === 'Foreign')
          && ((flagConfirmTarget.docName === 'DTI (Sole)' && selectedCompany.businessClassification === 'SOL')
            || (flagConfirmTarget.docName !== 'DTI (Sole)' && selectedCompany.businessClassification === 'CORP'));
        return createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950 relative">
              <button
                onClick={() => setFlagConfirmTarget(null)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
                type="button"
              >
                <X size={16} />
              </button>

              <div className="flex flex-col items-center text-center gap-2.5">
                <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-amber-50 text-[#a16207] dark:bg-amber-950/40 dark:text-amber-400">
                  <AlertTriangle size={18} />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Confirm Status Change</h3>
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 divide-y divide-slate-100 dark:divide-slate-800">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{flagConfirmTarget.docName}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{branchAwareCompanyLabel(selectedCompany, flagConfirmTarget.branch)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New Status</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${willBeProvided ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50' : 'bg-rose-50 text-[#f43f5e] border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50'}`}>
                    {willBeProvided ? 'Provided' : 'Not Provided'}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-center text-[11px] text-slate-400">This updates the compliance record immediately.</p>
              {!willBeProvided && legalRemarkRequired && (
                <label className="mt-3 block text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Remarks <span className="text-rose-600">Required</span>
                  <textarea value={flagConfirmTarget.remarks} maxLength={2000}
                    onChange={(event) => setFlagConfirmTarget((current) => current ? { ...current, remarks: event.target.value } : current)}
                    rows={2} placeholder="Why is this document not provided?" className="field mt-1 resize-y py-1.5 text-xs" />
                </label>
              )}

              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setFlagConfirmTarget(null)} className="secondary-button flex-1 py-2 text-xs" type="button">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toggleFlagDocument(flagConfirmTarget.branch.id, flagConfirmTarget.docName, willBeProvided, flagConfirmTarget.remarks);
                    setFlagConfirmTarget(null);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#a16207] hover:bg-amber-800 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                  type="button"
                  disabled={!willBeProvided && legalRemarkRequired && !flagConfirmTarget.remarks.trim()}
                  title={!willBeProvided && legalRemarkRequired && !flagConfirmTarget.remarks.trim() ? 'Remarks are required' : undefined}
                >
                  <Check size={13} />
                  <span>Confirm</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* REGISTER PARTNER MODAL DIALOG */}
      {isRegisterOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 dark:border-transparent dark:bg-slate-950">
            {/* Close Button */}
            <button
              onClick={() => setIsRegisterOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              title="Close dialog"
              type="button"
            >
              <X size={18} />
            </button>

            <div className="flex shrink-0 items-center gap-3 px-6 pt-6 pr-14 text-[#2187CD]">
              <div className="rounded-lg bg-[#2187CD]/10 p-2 text-[#2187CD]">
                <Building size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Register Partner Company</h3>
                <p className="text-xs text-slate-500">Add a single company, or upload the Master List to refresh the whole registry</p>
              </div>
            </div>

            {/* Manual Entry / Upload Excel tabs */}
            <div className="mx-6 mt-5 flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setRegisterModalTab('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-all duration-150 cursor-pointer ${
                  registerModalTab === 'manual'
                    ? 'bg-white dark:bg-slate-950 text-[#2187CD] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Plus size={14} />
                <span>Manual Entry</span>
              </button>
              {onPreviewMasterListImport && (
                <button
                  type="button"
                  onClick={() => setRegisterModalTab('upload')}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-all duration-150 cursor-pointer ${
                    registerModalTab === 'upload'
                      ? 'bg-white dark:bg-slate-950 text-[#2187CD] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Upload size={14} />
                  <span>Upload Master List</span>
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            {registerModalTab === 'upload' && onPreviewMasterListImport ? (
              <div className="mt-6 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Upload the latest Master List Excel file to refresh the registry. Companies are matched to existing
                  records by name (fuzzy matching handles minor spelling/casing differences), so re-uploading a
                  refreshed file is safe: matches are merged as an extra branch/BP Code rather than duplicated, and
                  only genuinely new or newly-accredited companies are added.
                </div>

                <ActiveCompanyUploadCards userEmail={currentUserEmail} />

                <label
                  className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                    importReplace
                      ? 'border-rose-300 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={importReplace}
                    onChange={(e) => setImportReplace(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span className="text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Replace the entire registry with these files</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Clears every existing partner first, so the registry mirrors the selected files. Leave unchecked to merge into the current registry instead.
                    </span>
                  </span>
                </label>

                {importReplace && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-[#a16207] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>This permanently removes all current partner companies before importing. This cannot be undone.</span>
                  </div>
                )}

                {importError && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">{importError}</p>
                )}

                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={isImporting}
                  className="w-full bg-[#2187CD] hover:bg-[#2187CD]/90 text-white flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold rounded-lg shadow-xs transition duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  <span>{isImporting ? 'Reading files…' : importReplace ? 'Choose Excel Files & Replace Registry' : 'Choose Excel File(s) (.xlsx, .xls)'}</span>
                </button>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                  You can select multiple Excel files. Review each file and choose which companies to skip before applying the update.
                </p>

              </div>
            ) : (
            <form id="register-partner-company-form" onSubmit={handleAdd} className="mt-6 w-full space-y-4">
              <div>
                <label htmlFor="modal-reg-name" className="field-label">Company Name <span className="text-rose-600" aria-hidden="true">*</span></label>
                <input
                  id="modal-reg-name"
                  type="text"
                  className="field text-xs py-2.5"
                  placeholder="e.g. Peak Electrical Contractors Ltd."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-reg-type" className="field-label">Affiliation Category <span className="text-rose-600" aria-hidden="true">*</span></label>
                  <select
                    id="modal-reg-type"
                    className="field text-xs py-2.5"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as SurveyType)}
                  >
                    <option value="Courier">Courier (Courier, Logistics, etc.)</option>
                    <option value="Supplier">Supplier (Material, Assets, etc.)</option>
                    <option value="Subcontractor">Subcontractor (On-site Labor, MEP, etc.)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="modal-reg-aff" className="field-label">Specialization Scope</label>
                  <input
                    id="modal-reg-aff"
                    type="text"
                    className="field text-xs py-2.5"
                    placeholder="e.g. Structural Steel / MEP Services"
                    value={newAffiliation}
                    onChange={(e) => setNewAffiliation(e.target.value)}
                  />
                </div>
              </div>

              {/* Local/Foreign origin - only meaningful for Suppliers. Decides
                  which doc checklist applies (documentRequirements.ts) and
                  which Category Summary bucket this counts toward. */}
              {newType === 'Supplier' && (
                <div>
                  <span className="field-label">Supplier Origin <span className="text-rose-600" aria-hidden="true">*</span></span>
                  <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900/50">
                    {(['Local', 'Foreign'] as const).map((origin) => (
                      <button
                        key={origin}
                        type="button"
                        onClick={() => setNewSupplierOrigin(origin)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-all duration-150 cursor-pointer ${
                          newSupplierOrigin === origin
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {origin === 'Foreign' ? <Globe size={12} /> : <MapPin size={12} />}
                        <span>{origin}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-reg-bpcode" className="field-label">BP Code</label>
                  <input
                    id="modal-reg-bpcode"
                    type="text"
                    className="field text-xs py-2.5"
                    placeholder="e.g. ABC123"
                    value={newBpCode}
                    onChange={(e) => setNewBpCode(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 cursor-pointer hover:border-[#2187CD]/40 transition">
                    <input
                      type="checkbox"
                      checked={newHasNTBranch}
                      onChange={(e) => setNewHasNTBranch(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Also register a Non-Trade (NT) BP Code</span>
                  </label>
                </div>
              </div>

              {newHasNTBranch && (
                <div>
                  <label htmlFor="modal-reg-ntbpcode" className="field-label">Non-Trade (NT) BP Code</label>
                  <input
                    id="modal-reg-ntbpcode"
                    type="text"
                    className="field text-xs py-2.5"
                    placeholder={`${newBpCode.trim() || 'e.g. ABC123'}-NT`}
                    value={newNtBpCode}
                    onChange={(e) => setNewNtBpCode(e.target.value)}
                  />
                  <p className="mt-1 text-[10.5px] text-slate-400">Registered as a second branch — both BP Codes will show as their own row in the Document Tracker.</p>
                </div>
              )}

              {/* Date selection */}
              <div>
                <label htmlFor="modal-reg-date" className="field-label">Registration Date</label>
                <input
                  id="modal-reg-date"
                  type="date"
                  className="field text-xs py-2"
                  value={newRegDate}
                  onChange={(e) => setNewRegDate(e.target.value)}
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                Compliance documents (Business Permit, AFS, SIF, etc.) aren't uploaded here — each BP Code above starts out Missing in the Document Tracker until renewed there, or via a Master List upload.
              </p>

            </form>
            )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="secondary-button min-h-10 px-4 py-2 text-xs"
                type="button"
              >
                Cancel
              </button>
              {registerModalTab === 'manual' && (
                <button
                  type="submit"
                  form="register-partner-company-form"
                  className="flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#2187CD] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#2187CD]/90"
                >
                  <Plus size={14} />
                  <span>Register Company</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <ActiveCompaniesModal
        isOpen={isActiveCompaniesOpen}
        onClose={() => setIsActiveCompaniesOpen(false)}
      />

      {duplicateMasterListReview && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="duplicate-master-list-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"><AlertTriangle size={19} aria-hidden="true" /></span>
              <div>
                <h3 id="duplicate-master-list-title" className="text-base font-bold text-slate-900 dark:text-white">Duplicate Master List file selected</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">These workbooks repeat a filename or file content in this selection. The registry does not keep uploaded Master List files, so there is no prior workbook to replace.</p>
              </div>
            </div>
            <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              {duplicateMasterListReview.duplicates.map(({ originalIndex, duplicateIndex, reason }) => (
                <li key={`${originalIndex}-${duplicateIndex}`} className="break-words">
                  <strong>{duplicateMasterListReview.files[duplicateIndex].name}</strong> repeats <strong>{duplicateMasterListReview.files[originalIndex].name}</strong> ({reason === 'both' ? 'same name and content' : reason === 'matching-filename' ? 'same filename' : 'identical file content'}).
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Continue keeps the first copy and removes the repeated files from this import. You can cancel and choose a different set.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={cancelDuplicateMasterListReview} className="secondary-button text-xs">Cancel Upload</button>
              <button type="button" onClick={continueWithoutDuplicateMasterListFiles} className="primary-button text-xs">Continue Without Duplicates</button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {isReplaceConfirmationOpen && importPreview && createPortal(
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="alertdialog" aria-modal="true" aria-labelledby="replace-partner-registry-title" aria-describedby="replace-partner-registry-description" className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-5 shadow-2xl dark:border-rose-900/60 dark:bg-slate-950">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"><AlertTriangle size={19} aria-hidden="true" /></span>
              <div>
                <h3 id="replace-partner-registry-title" className="text-base font-bold text-slate-900 dark:text-white">Replace the entire partner registry?</h3>
                <p id="replace-partner-registry-description" className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">This replaces {partnerCompanies.length} current partner record{partnerCompanies.length === 1 ? '' : 's'} with {importPreview.result.companies.length} record{importPreview.result.companies.length === 1 ? '' : 's'} from the reviewed Master List. Partners missing from the selected files will be removed.</p>
              </div>
            </div>
            {importError && <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-300">{importError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={isApplyingImport} onClick={() => setIsReplaceConfirmationOpen(false)} className="secondary-button text-xs">Keep Reviewing</button>
              <button type="button" disabled={isApplyingImport} onClick={() => void commitImportPreview()} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-60">
                {isApplyingImport && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Replace Registry
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Master List Import Review Modal - shows what would change before
          anything is saved; nothing is written to the registry until the
          admin clicks "Apply Update" here. */}
      {importPreview && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={cancelImportPreview}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              title="Close"
              type="button"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-[#2187CD]">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2">
                <ClipboardList size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Review Master List Import</h3>
                <p className="text-xs text-slate-500">
                  {importPreview.files.reduce((total, file) => total + file.rows.length, 0)} companies found in {importPreview.files.length} file{importPreview.files.length === 1 ? '' : 's'} &bull; nothing has been saved yet
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900/60 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Companies to review</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Check a company to skip it. Files are grouped below so you can review each workbook separately.
                  {importPreview.excludedRowKeys.length > 0 && ` ${importPreview.excludedRowKeys.length} selected to skip.`}
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {importPreview.files.map((file) => (
                  <section key={file.id}>
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-100/95 dark:bg-slate-900/95 px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="min-w-0 truncate text-xs font-bold text-slate-700 dark:text-slate-200" title={file.fileName}>{file.fileName}</span>
                      <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{file.rows.length} compan{file.rows.length === 1 ? 'y' : 'ies'}</span>
                    </div>
                    {file.rows.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-500">No company rows found in this file.</p>
                    ) : file.rows.map((row) => {
                      const excluded = importPreview.excludedRowKeys.includes(masterListRowKey(file.id, row.sourceRow));
                      return (
                        <label key={masterListRowKey(file.id, row.sourceRow)} className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 ${excluded ? 'opacity-60' : ''}`}>
                          <input
                            type="checkbox"
                            checked={excluded}
                            onChange={(event) => toggleImportRow(file.id, row.sourceRow, event.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]"
                            aria-label={`Skip ${row.bpName}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs font-semibold ${excluded ? 'line-through text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{row.bpName}</span>
                            <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                              {row.bpCode ? `BP Code: ${row.bpCode}` : `Excel row ${row.sourceRow}`}
                              {row.category ? ` · ${row.category}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 pt-0.5 text-[10px] text-slate-500">{excluded ? 'Skipped' : 'Include'}</span>
                        </label>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>

            {/* Category breakdown of the imported file itself */}
            <div className="mt-5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Category Breakdown (Imported File)
              </h4>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(importPreview.result.stats.categoryBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, count]) => (
                        <tr key={cat}>
                          <td className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">{cat}</td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-800 dark:text-slate-100">{count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">New companies to create</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importPreview.result.stats.createdCompanies}</strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">New branches to merge</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importPreview.result.stats.mergedAsBranch}</strong>
              </div>
              {importPreview.result.stats.skipped > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900 col-span-2">
                  <span className="text-rose-600 font-medium block">Rows skipped</span>
                  <strong className="text-rose-700 dark:text-rose-300 text-lg">{importPreview.result.stats.skipped}</strong>
                </div>
              )}
            </div>

            {/* Existing companies whose category/documents would change -
                the "override" preview the admin can accept or cancel. */}
            {importPreview.result.changes.length > 0 && (
              <div className="mt-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Existing companies that will be updated ({importPreview.result.changes.length})
                </h4>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10 divide-y divide-amber-100 dark:divide-amber-900/30">
                  {importPreview.result.changes.map((c) => (
                    <div key={c.companyId} className="px-3 py-2 text-xs">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{c.companyName}</div>
                      <div className="mt-0.5 text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        {c.categoryChanged && (
                          <span>
                            Category: <span className="line-through text-slate-400">{c.previousCategory}</span>{' '}
                            &rarr; <span className="font-semibold text-emerald-600 dark:text-emerald-400">{c.newCategory}</span>
                          </span>
                        )}
                        {c.documentsChanged > 0 && (
                          <span>
                            {c.categoryChanged && <span className="mx-1 text-slate-300">&bull;</span>}
                            {c.documentsChanged} document field{c.documentsChanged === 1 ? '' : 's'} updated
                          </span>
                        )}
                        {c.branchesAdded > 0 && (
                          <span>
                            {(c.categoryChanged || c.documentsChanged > 0) && <span className="mx-1 text-slate-300">&bull;</span>}
                            {c.branchesAdded} new branch{c.branchesAdded === 1 ? '' : 'es'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Apply Update saves these changes to the registry. Cancel discards this import - the current registry stays untouched.
            </p>

            {importError && <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-300">{importError}</p>}

            <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                onClick={cancelImportPreview}
                className="secondary-button text-xs py-2 px-4"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={applyImportPreview}
                className="bg-[#2187CD] hover:bg-[#2187CD]/90 text-white text-xs font-bold py-2 px-4 rounded-lg transition cursor-pointer"
                type="button"
              >
                Apply Update
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Master List Import Result Modal */}
      {importResult && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setImportResult(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              title="Close"
              type="button"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-emerald-600">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Master List Import Complete</h3>
                <p className="text-xs text-slate-500">{importResult.stats.totalRows} rows processed</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">New companies created</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importResult.stats.createdCompanies}</strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">Merged as branch</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importResult.stats.mergedAsBranch}</strong>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium block">Accredited (active)</span>
                <strong className="text-emerald-800 dark:text-emerald-300 text-lg">{importResult.stats.accredited}</strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">Uncategorized (archived)</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importResult.stats.uncategorized}</strong>
              </div>
              {importResult.stats.updatedBranches > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-medium block">Branches updated (re-run)</span>
                  <strong className="text-slate-800 dark:text-slate-100 text-lg">{importResult.stats.updatedBranches}</strong>
                </div>
              )}
              {importResult.stats.skipped > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900">
                  <span className="text-rose-600 font-medium block">Rows skipped</span>
                  <strong className="text-rose-700 dark:text-rose-300 text-lg">{importResult.stats.skipped}</strong>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Uncategorized companies are archived and excluded from surveys until manually classified. Download the full merge log below to audit exactly which rows matched which existing company.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                onClick={downloadImportLog}
                className="secondary-button text-xs py-2 px-4 flex items-center gap-1.5"
                type="button"
              >
                <FileText size={14} />
                <span>Download Merge Log</span>
              </button>
              <button
                onClick={() => setImportResult(null)}
                className="bg-[#2187CD] hover:bg-[#2187CD]/90 text-white text-xs font-bold py-2 px-4 rounded-lg transition cursor-pointer"
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Archive confirmation modal. Supabase RLS remains the authorization boundary. */}
      {companyToArchive && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div
            className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-partner-title"
          >
            <div className="flex items-center gap-3 text-rose-500">
              <Archive size={24} className="shrink-0" />
              <h3 id="archive-partner-title" className="text-lg font-bold text-slate-900 dark:text-white">Archive Partner Company?</h3>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Are you sure you want to archive <strong className="text-slate-800 dark:text-slate-200">"{companyToArchive.name}"</strong>? The company will move to the Archived registry and can be restored later.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                onClick={() => setCompanyToArchive(null)}
                className="secondary-button"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={confirmArchive}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 cursor-pointer"
                type="button"
              >
                <Archive size={14} />
                Confirm Archive
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirmation modal. Supabase RLS remains the authorization boundary. */}
      {companyToDelete && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertTriangle size={24} className="shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Remove Partner?</h3>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              You are about to remove <strong className="text-slate-800 dark:text-slate-200">"{companyToDelete.name}"</strong> from the registry. This action is restricted to authenticated administrators and cannot be undone from this screen.
            </p>

            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
              Confirm only if this partner should be permanently removed from the shared registry.
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                onClick={() => setCompanyToDelete(null)}
                className="secondary-button"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="inline-flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition cursor-pointer"
                type="button"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
