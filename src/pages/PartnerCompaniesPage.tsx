import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalEscape } from '../hooks/useModalEscape';
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
  ChevronLeft,
  Clock,
  Settings,
  Archive,
  RefreshCw,
  FileText,
  Check,
  ChevronRight,
  Upload,
  Loader2,
  Search,
  Globe,
  MapPin,
  Tag,
  Mail,
  User,
  Phone,
  AlertTriangle
} from 'lucide-react';
import { AccreditationStatus, BranchRecord, BranchStatus, ComplianceDocument, DocumentStatus, PartnerCompany, PartnerCompanyType, SupplierOrigin, SurveyResponse, SurveyType } from '../types/survey';
import { getMaxRatingForResponses } from '../utils/analytics';
import { computeCompanyComposite } from '../utils/scoring';
import { formatCompositeScore } from '../data/questionWeights';
import { branchAwareCompanyLabel, computeDocumentStatus, computeCompanyDocumentSummary, CompanyDocumentSummary, isNTBranch } from '../utils/compliance';
import { CATEGORY_BUCKET_KEYS, computeCategoryRankSummary } from '../utils/categorySummary';
import { getRequiredDocumentKeys, isExpiryDocument } from '../utils/documentRequirements';
import { findMissingProfileFields, MISSING_FIELD_LABELS, MissingProfileField } from '../utils/dataCompleteness';
import { ImportResult } from '../utils/masterListImport';
import { isWithinDateRange } from '../utils/tableFilters';
import { ActiveCompaniesModal } from '../features/active-companies/components/ActiveCompaniesModal';
import { ActiveCompanyUploadCards } from '../features/active-companies/components/ActiveCompanyUploadCards';
import { PartnerCompaniesFilterToolbar } from '../features/partner-companies/components/PartnerCompaniesFilterToolbar';

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
  Missing: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700',
};

const STATUS_TAB_LABELS: Record<'Active' | 'Expired' | 'Incomplete' | 'Archived', string> = {
  Active: 'Active',
  Expired: 'Expired',
  Incomplete: 'Incomplete Profile',
  Archived: 'Archived',
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
    nextDocument: Pick<ComplianceDocument, 'provided' | 'expiryDate'>,
  ) => Promise<PartnerCompany>;
  onPreviewMasterListImport?: (file: File, options?: { replace?: boolean }) => Promise<ImportResult>;
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
  onCommitMasterListImport,
  isAdmin,
  canRenewDocuments,
  initialFocusCompanyId,
  onFocusConsumed,
  currentUserEmail = '',
}: PartnerCompaniesPageProps) {
  const canRenew = isAdmin || canRenewDocuments;
  // Tabs: Active, Expired, Archived
  const [statusTab, setStatusTab] = useState<'Active' | 'Expired' | 'Incomplete' | 'Archived'>('Active');
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
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [isCategorySummaryOpen, setIsCategorySummaryOpen] = useState(true);
  const [importReplace, setImportReplace] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerModalTab, setRegisterModalTab] = useState<'manual' | 'upload'>('manual');
  const [isActiveCompaniesOpen, setIsActiveCompaniesOpen] = useState(false);

  // Detail Modal State
  const [selectedCompany, setSelectedCompany] = useState<PartnerCompany | null>(null);
  
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
  const [flagConfirmTarget, setFlagConfirmTarget] = useState<{ branch: BranchRecord; docName: string } | null>(null);

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
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  useModalEscape(Boolean(flagConfirmTarget), () => setFlagConfirmTarget(null), 60);
  useModalEscape(Boolean(renewalTarget && selectedCompany), () => setRenewalTarget(null), 60);
  useModalEscape(Boolean(companyToDelete), () => setCompanyToDelete(null), 60);
  useModalEscape(Boolean(companyToArchive), () => setCompanyToArchive(null), 60);
  useModalEscape(Boolean(importPreview), () => setImportPreview(null), 50);
  useModalEscape(Boolean(importResult), () => setImportResult(null), 50);
  useModalEscape(isRegisterOpen, () => setIsRegisterOpen(false), 50);
  useModalEscape(Boolean(selectedCompany), () => setSelectedCompany(null), 50);

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
  const incompleteCompanies = useMemo(
    () =>
      [...classifiedCompanies.active, ...classifiedCompanies.expired].filter(
        (c) => findMissingProfileFields(c).length > 0
      ),
    [classifiedCompanies]
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newName.trim()) {
      setErrorMessage('Partner name cannot be blank.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add the partner.');
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

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file || !onPreviewMasterListImport) return;

    setIsImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      // Parse + merge only - nothing is saved until the admin reviews the
      // changes and confirms via applyImportPreview.
      const result = await onPreviewMasterListImport(file, { replace: importReplace });
      setImportPreview(result);
      setIsRegisterOpen(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import the Master List file.');
    } finally {
      setIsImporting(false);
    }
  };

  const applyImportPreview = async () => {
    if (!importPreview || !onCommitMasterListImport) return;
    setImportError('');
    try {
      await onCommitMasterListImport(importPreview);
      setImportResult(importPreview);
      setImportPreview(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to apply the Master List import.');
    }
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
        setErrorMessage(error instanceof Error ? error.message : 'Unable to remove the partner.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the partner.');
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

  // Filter and sort companies based on tabs
  const filteredCompanies = useMemo(() => {
    let baseList: PartnerCompany[] = [];
    if (statusTab === 'Active') {
      baseList = classifiedCompanies.active;
    } else if (statusTab === 'Expired') {
      baseList = classifiedCompanies.expired;
    } else if (statusTab === 'Incomplete') {
      baseList = incompleteCompanies;
    } else {
      baseList = classifiedCompanies.archived;
    }

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
  }, [classifiedCompanies, incompleteCompanies, statusTab, activeTab, originFilter, debouncedSearchQuery, sortConfig, effectiveNow, registeredFrom, registeredTo, documentFilter]);

  // Jump back to page 1 whenever a filter/search/sort narrows or reshuffles
  // the result set - otherwise the user can land on a now-empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [statusTab, activeTab, originFilter, debouncedSearchQuery, sortConfig, registeredFrom, registeredTo, documentFilter]);

  const advancedFilterCount = [
    sortConfig !== null,
    registeredFrom,
    registeredTo,
    documentFilter !== 'all',
  ].filter(Boolean).length;

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / COMPANIES_PAGE_SIZE));
  // Clamp defensively (e.g. the list shrinks from a delete while on a later
  // page) so pagination stays correct without waiting for the effect above.
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCompanies = useMemo(
    () => filteredCompanies.slice((safePage - 1) * COMPANIES_PAGE_SIZE, safePage * COMPANIES_PAGE_SIZE),
    [filteredCompanies, safePage]
  );

  // Click handler to open company details modal
  const handleCompanyClick = (company: PartnerCompany) => {
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
    const defaultDate = currentExpiry ? new Date(currentExpiry) : effectiveNow;
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
  const toggleFlagDocument = async (branchId: string, docName: string, provided: boolean) => {
    if (!selectedCompany) return;
    const expectedDocument = (selectedCompany.branches ?? []).find((branch) => branch.id === branchId)?.documents?.[docName] ?? {};
    setErrorMessage('');
    try {
      const updated = await onRenewDocument(selectedCompany.id, branchId, docName, expectedDocument, { provided });
      setSelectedCompany(updated);
      setSuccessMessage(`"${docName}" was marked ${provided ? 'provided' : 'not provided'} for "${selectedCompany.name}".`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the compliance document.');
    }
  };

  const requestFlagToggle = (branch: BranchRecord, docName: string) => {
    if (!canRenew) return;
    setFlagConfirmTarget({ branch, docName });
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
      setErrorMessage(error instanceof Error ? error.message : 'Unable to classify the partner.');
      return;
    }
    setSelectedCompany(updated);
    setSuccessMessage(
      `"${selectedCompany.name}" classified as ${newType}${newType === 'Supplier' ? ` (${updated.supplierOrigin})` : ''}.`
    );
    setTimeout(() => setSuccessMessage(''), 4000);
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
    <div className="space-y-6" id="partner-companies-page">
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

      {/* Category & Supplier Rank Breakdown - mirrors the Master List's own
          legend blocks (Category Summary / Supplier Rank Summary), counted
          per branch/BP Code with NT as a fully separate category. */}
      <div className="panel p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsCategorySummaryOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left cursor-pointer"
        >
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Category &amp; Supplier Rank Breakdown</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Every accredited branch (BP Code) — NT counted as its own category, same as the Master List</p>
          </div>
          {isCategorySummaryOpen ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
        </button>

        {isCategorySummaryOpen && (
          <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 p-4">
            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2 sm:px-4">Category</th>
                    <th className="w-20 px-3 py-2 text-right sm:w-24 sm:px-4">Branches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {CATEGORY_BUCKET_KEYS.map((key) => (
                    <tr key={key}>
                      <td className="break-words px-3 py-2 font-medium text-slate-600 dark:text-slate-300 sm:px-4">{key}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:px-4">{categoryRankSummary.buckets[key] ?? 0}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 dark:bg-slate-900/40">
                    <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200 sm:px-4">Total</td>
                    <td className="px-3 py-2 text-right font-black tabular-nums text-[#0866B1] sm:px-4">{categoryRankSummary.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="min-w-0 self-start overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2 sm:px-4">Supplier Rank</th>
                    <th className="w-20 px-3 py-2 text-right sm:w-24 sm:px-4">Branches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300 sm:px-4">Major</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:px-4">{categoryRankSummary.major}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300 sm:px-4">Regular</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:px-4">{categoryRankSummary.regular}</td>
                  </tr>
                </tbody>
              </table>
              <p className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">Every branch's Supplier Rank field, organization-wide.</p>
            </div>
          </div>
        )}
      </div>

      <PartnerCompaniesFilterToolbar
        statusTab={statusTab}
        statusLabels={STATUS_TAB_LABELS}
        onStatusChange={setStatusTab}
        categoryTab={activeTab}
        onCategoryChange={(value) => { setActiveTab(value); if (value !== 'Supplier') setOriginFilter('All'); }}
        originFilter={originFilter}
        onOriginChange={setOriginFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
        isAdmin={isAdmin}
        importFileInputRef={importFileInputRef}
        onImportFileSelected={handleImportFileSelected}
        onOpenActiveCompanies={() => setIsActiveCompaniesOpen(true)}
        onOpenRegister={() => {
          setErrorMessage('');
          setRegisterModalTab('manual');
          setIsRegisterOpen(true);
        }}
        isAdvancedFiltersOpen={isAdvancedFiltersOpen}
        onToggleAdvancedFilters={() => setIsAdvancedFiltersOpen((open) => !open)}
        advancedFilterCount={advancedFilterCount}
        sortOptions={[
          { value: 'default', label: 'Default order' },
          { value: 'name-asc', label: 'Partner: A–Z' },
          { value: 'name-desc', label: 'Partner: Z–A' },
          { value: 'type-asc', label: 'Category: A-Z' },
          { value: 'type-desc', label: 'Category: Z-A' },
          { value: 'registeredAt-desc', label: 'Registered: newest first' },
          { value: 'registeredAt-asc', label: 'Registered: oldest first' },
          { value: 'docStatus-desc', label: 'Documents: most urgent first' },
          { value: 'docStatus-asc', label: 'Documents: least urgent first' },
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
          setStatusTab('Active');
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

      {importError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-xs font-semibold flex items-center gap-2 dark:bg-rose-950/20 dark:border-rose-900">
          <AlertCircle size={16} />
          <span>{importError}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold">
          {filteredCompanies.length.toLocaleString()} {statusTab === 'Incomplete' ? 'incomplete profiles' : statusTab.toLowerCase() + ' partners'}
        </span>
        <span>Click row to edit or renew</span>
      </div>

      {/*
      <TableFilterBar
        sortOptions={[
          { value: 'name-asc', label: 'Partner: A–Z' },
          { value: 'name-desc', label: 'Partner: Z–A' },
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
        resultCount={filteredCompanies.length}
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
        <div className="panel py-20 text-center text-slate-400">
          <Building size={48} className="mx-auto mb-3 opacity-30 text-slate-300" />
          <p className="text-sm font-semibold">No partners found under this tab selection.</p>
          <p className="text-xs mt-1 text-slate-400">
            {statusTab === 'Active' && 'There are no active partners.'}
            {statusTab === 'Expired' && 'No partners currently have an expired document.'}
            {statusTab === 'Incomplete' && 'Every partner profile is fully filled in.'}
            {statusTab === 'Archived' && 'The archive is currently empty.'}
          </p>
        </div>
      ) : (
        <div className="panel p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
                  <th 
                    className="px-5 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Partner Name
                      {sortConfig?.key === 'name' && (
                        sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-5 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => handleSort('type')}
                  >
                    <div className="flex items-center gap-1">
                      Category
                      {sortConfig?.key === 'type' && (
                        sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </div>
                  </th>
                  <th className="px-5 py-3">Registration Date</th>
                  {statusTab === 'Archived' && <th className="px-5 py-3">Archived Date &amp; Time</th>}
                  <th
                    className="px-5 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => handleSort('docStatus')}
                  >
                    <div className="flex items-center gap-1">
                      Document Status
                      {sortConfig?.key === 'docStatus' && (
                        sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </div>
                  </th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedCompanies.map((c) => {
                  const docSummary = computeCompanyDocumentSummary(c, effectiveNow);
                  const missingProfileFields = findMissingProfileFields(c);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleCompanyClick(c)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/20 cursor-pointer group transition-colors"
                    >
                      <td className="px-5 py-3.5 align-top font-semibold text-slate-800 dark:text-slate-100 group-hover:text-[#0866B1] dark:group-hover:text-blue-400 max-w-[280px]">
                        <div className="flex min-w-0 items-center gap-2">
                          <Building size={14} className="shrink-0 text-slate-400 group-hover:text-[#0866B1]" />
                          <span className="truncate" title={c.name}>{c.name}</span>
                        </div>
                        {missingProfileFields.length > 0 && (
                          <span
                            title={`Missing ${missingProfileFields.map((f) => MISSING_FIELD_LABELS[f]).join(', ')}`}
                            className="mt-1.5 inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 text-[9px] font-bold"
                          >
                            {missingProfileFields.length} missing
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${typeBadgeClasses(c.type)}`}>
                            {c.type}
                          </span>
                          {c.type === 'Supplier' && c.supplierOrigin && (
                            <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700">
                              {c.supplierOrigin}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                        {formatDate(c.registeredAt || c.createdAt)}
                      </td>
                      {statusTab === 'Archived' && (
                        <td
                          className="px-5 py-3.5 align-top whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs"
                          title={c.archivedAt ?? undefined}
                        >
                          {formatDateTime(c.archivedAt)}
                        </td>
                      )}
                      <td className="px-5 py-3.5 align-top whitespace-nowrap text-xs font-medium">
                        {c.isArchived ? (
                          <span className="text-slate-400 italic">Archived</span>
                        ) : primaryBranch(c)?.status ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${branchStatusBadgeClasses(primaryBranch(c)!.status!)}`}>
                            {primaryBranch(c)!.status}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {(docSummary.status === 'Expired' || docSummary.status === 'Missing') && canRenew && (
                            <button
                              onClick={() => handleCompanyClick(c)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 text-xs cursor-pointer transition"
                            >
                              <RefreshCw size={12} />
                              <span>Review</span>
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={(e) => toggleArchive(c, e)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-1 px-2.5 text-xs cursor-pointer transition"
                              title={c.isArchived ? "Restore to registry" : "Archive Partner"}
                            >
                              <Archive size={12} />
                              <span>{c.isArchived ? "Restore" : "Archive"}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="panel px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {(safePage - 1) * COMPANIES_PAGE_SIZE + 1}
            &ndash;{Math.min(safePage * COMPANIES_PAGE_SIZE, filteredCompanies.length)} of {filteredCompanies.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Prev</span>
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums px-1">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* PARTNER DETAILS & CONTRACT CONFIGURATION DRAWER/MODAL */}
      {selectedCompany && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setSelectedCompany(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              title="Close panel"
              type="button"
            >
              <X size={18} />
            </button>

            {/* Modal Header */}
            <div className="flex items-start gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="rounded-xl bg-[#0866B1]/10 p-3 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-400 shrink-0 mt-1">
                <Building size={24} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate">{selectedCompany.name}</h3>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${typeBadgeClasses(selectedCompany.type)}`}>
                    {selectedCompany.type}
                  </span>
                  {selectedCompany.type === 'Supplier' && selectedCompany.supplierOrigin && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700">
                      {selectedCompany.supplierOrigin === 'Foreign' ? <Globe size={10} /> : <MapPin size={10} />}
                      {selectedCompany.supplierOrigin}
                    </span>
                  )}
                  {selectedCompany.accreditationStatus && (
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                      selectedCompany.accreditationStatus === 'Accredited'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400'
                    }`}>
                      {selectedCompany.accreditationStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">ID: {selectedCompany.id} &bull; Scope: {selectedCompany.affiliation || 'General partnership'}</p>
              </div>
            </div>

            {/* Partner Classification - which document set applies (Courier/Supplier-Local/
                Supplier-Foreign/Subcontractor) is driven entirely by this, so it's editable
                by the same role that can renew documents. Master-List rows that imported with
                no recognizable category land here as Uncategorized/archived until classified. */}
            <div className="mt-6">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Tag size={14} />
                <span>Partner Classification</span>
              </h4>
              <div className="mt-2 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
                {selectedCompany.type === 'Uncategorized' && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    <span>Uncategorized partners are archived and excluded from evaluations until classified.</span>
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
                </div>
                <p className="text-[10px] text-slate-400">
                  {isAdmin
                    ? 'Determines which compliance documents apply to this partner (see Branches & Compliance Documents below). Classifying an Uncategorized partner also unarchives and accredits it.'
                    : 'Reclassifying is restricted to administrators.'}
                </p>
              </div>
            </div>

            {/* Core Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              
              {/* Left Column: Contact + Registration */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} />
                  <span>Contact &amp; Registration</span>
                </h4>

                <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Target Partner Primary Email
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
                      placeholder="e.g. contact@partnerpartner.com"
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
                      This partner is archived. Archived partners are suspended and excluded from evaluations/modifications.
                    </div>
                  ) : selectedCompanyDocSummary.status === 'Expired' ? (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-xs font-medium dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-400">
                      ⚠️ <strong>{selectedCompanyDocSummary.expiredCount} required document{selectedCompanyDocSummary.expiredCount === 1 ? ' is' : 's are'} EXPIRED.</strong> This partner has been automatically disabled from evaluation forms. Renew the expired document(s) below to reactivate.
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
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardList size={14} />
                  <span>Document Compliance Summary</span>
                </h4>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
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

            {/* Audit Index & Performance Section */}
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

            {/* Branches & Compliance Documents (from Master List import) */}
            {(selectedCompany.branches ?? []).length > 0 && (
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
                        const requiredKeys = getRequiredDocumentKeys(selectedCompany.type, selectedCompany.supplierOrigin);
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
                              return (
                                <button
                                  key={docName}
                                  type="button"
                                  disabled={!canRenew}
                                  onClick={() => {
                                    if (!canRenew) return;
                                    if (expiryBased) {
                                      openDocumentRenewalPicker(branch.id, docName, doc.expiryDate);
                                    } else {
                                      requestFlagToggle(branch, docName);
                                    }
                                  }}
                                  title={
                                    doc.expiryDate
                                      ? `Expires ${formatDate(doc.expiryDate)}${canRenew ? ' — click to renew' : ''}`
                                      : canRenew
                                      ? (expiryBased ? 'Click to set an expiry date' : `Click to mark ${doc.provided ? 'not provided' : 'provided'}`)
                                      : docName
                                  }
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold border transition ${DOCUMENT_STATUS_STYLES[status]} ${canRenew ? 'cursor-pointer hover:ring-2 hover:ring-[#0866B1]/40' : 'cursor-default'}`}
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

            {/* Administrative Action Footer */}
            {isAdmin && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => toggleArchive(selectedCompany)}
                  className="secondary-button text-xs py-2 w-full sm:w-auto flex items-center justify-center gap-1.5"
                >
                  <Archive size={14} />
                  <span>{selectedCompany.isArchived ? "Restore to Active Registry" : "Archive Partner"}</span>
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setSelectedCompany(null)}
                    className="secondary-button text-xs py-2 flex-1 sm:flex-none"
                    type="button"
                  >
                    Close Dialog
                  </button>
                  <button
                    onClick={() => startDelete(selectedCompany)}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 flex-1 sm:flex-none transition duration-150 cursor-pointer"
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
                          ? 'bg-[#0866B1] text-white border-[#0866B1] ring-4 ring-[#0866B1]/15 scale-110'
                          : isCompleted
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-750 dark:text-slate-500'
                      }`}>
                        {isCompleted ? <Check size={14} /> : step}
                      </div>
                      <span className={`text-[10px] font-bold mt-1.5 ${
                        isActive ? 'text-[#0866B1] dark:text-blue-400' : isCompleted ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'
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
                    <span className="font-mono text-base font-extrabold text-[#0866B1] dark:text-blue-400">{renewalYear}</span>
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
                            ? 'bg-[#0866B1] text-white border-[#0866B1] shadow-xs'
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
                    ✔ If this was the partner's last expired document, it becomes eligible for audits again.
                  </p>

                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-[#a16207] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400 text-left">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>This immediately updates the partner's compliance record. Double-check the date before confirming.</span>
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
                  className="inline-flex items-center justify-center rounded-lg bg-[#0866B1] hover:bg-[#07528E] px-5 py-2 text-sm font-bold text-white transition cursor-pointer shadow-xs"
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partner</span>
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

              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setFlagConfirmTarget(null)} className="secondary-button flex-1 py-2 text-xs" type="button">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toggleFlagDocument(flagConfirmTarget.branch.id, flagConfirmTarget.docName, willBeProvided);
                    setFlagConfirmTarget(null);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#a16207] hover:bg-amber-800 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                  type="button"
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
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setIsRegisterOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              title="Close dialog"
              type="button"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 text-[#0866B1]">
              <div className="rounded-lg bg-[#0866B1]/10 p-2 text-[#0866B1]">
                <Building size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Register Partner</h3>
                <p className="text-xs text-slate-500">Add a single partner, or upload the Master List to refresh the whole registry</p>
              </div>
            </div>

            {/* Manual Entry / Upload Excel tabs */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/50 mt-5">
              <button
                type="button"
                onClick={() => setRegisterModalTab('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-all duration-150 cursor-pointer ${
                  registerModalTab === 'manual'
                    ? 'bg-white dark:bg-slate-950 text-[#0866B1] shadow-xs'
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
                      ? 'bg-white dark:bg-slate-950 text-[#0866B1] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Upload size={14} />
                  <span>Upload Master List</span>
                </button>
              )}
            </div>

            {registerModalTab === 'upload' && onPreviewMasterListImport ? (
              <div className="mt-6 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Upload the latest Master List Excel file to refresh the registry. Partners are matched to existing
                  records by name (fuzzy matching handles minor spelling/casing differences), so re-uploading a
                  refreshed file is safe: matches are merged as an extra branch/BP Code rather than duplicated, and
                  only genuinely new or newly-accredited partners are added.
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
                    <span className="font-bold text-slate-700 dark:text-slate-200">Replace the entire registry with this file</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Clears every existing partner first, so the registry mirrors this file exactly (its category and rank
                      totals will match the sheet). Leave unchecked to merge into the current registry instead.
                    </span>
                  </span>
                </label>

                {importReplace && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-[#a16207] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>This permanently removes all current partners before importing. This cannot be undone.</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={isImporting}
                  className="w-full bg-[#0866B1] hover:bg-[#07528E] text-white flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold rounded-lg shadow-xs transition duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  <span>{isImporting ? 'Importing…' : importReplace ? 'Choose File & Replace Registry' : 'Choose Excel File (.xlsx)'}</span>
                </button>

                <div className="flex items-center justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
                  <button
                    onClick={() => setIsRegisterOpen(false)}
                    className="secondary-button py-2 px-4 text-xs"
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleAdd} className="space-y-4 mt-6">
              <div>
                <label htmlFor="modal-reg-name" className="field-label">Partner Name *</label>
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
                  <label htmlFor="modal-reg-type" className="field-label">Affiliation Category *</label>
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
                  <span className="field-label">Supplier Origin *</span>
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
                  <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 cursor-pointer hover:border-[#0866B1]/40 transition">
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
                  <p className="mt-1 text-[10.5px] text-slate-400">Registered as a second branch — both BP Codes will show as their own row in Compliance Documents.</p>
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
                Compliance documents (Business Permit, AFS, SIF, etc.) aren't uploaded here — each BP Code above starts out Missing in Compliance Documents until renewed there, or via a Master List upload.
              </p>

              <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  onClick={() => setIsRegisterOpen(false)}
                  className="secondary-button py-2 px-4 text-xs"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#0866B1] hover:bg-[#07528E] text-white flex items-center justify-center gap-1.5 py-2.5 px-5 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Register Partner</span>
                </button>
              </div>
            </form>
            )}
          </div>
        </div>,
        document.body
      )}

      <ActiveCompaniesModal
        isOpen={isActiveCompaniesOpen}
        onClose={() => setIsActiveCompaniesOpen(false)}
      />

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

            <div className="flex items-center gap-3 text-[#0866B1]">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2">
                <ClipboardList size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Review Master List Import</h3>
                <p className="text-xs text-slate-500">
                  {importPreview.stats.totalRows} rows parsed &bull; nothing has been saved yet
                </p>
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
                    {Object.entries(importPreview.stats.categoryBreakdown)
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
                <span className="text-slate-400 font-medium block">New partners to create</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importPreview.stats.createdCompanies}</strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block">New branches to merge</span>
                <strong className="text-slate-800 dark:text-slate-100 text-lg">{importPreview.stats.mergedAsBranch}</strong>
              </div>
              {importPreview.stats.skipped > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900 col-span-2">
                  <span className="text-rose-600 font-medium block">Rows skipped</span>
                  <strong className="text-rose-700 dark:text-rose-300 text-lg">{importPreview.stats.skipped}</strong>
                </div>
              )}
            </div>

            {/* Existing companies whose category/documents would change -
                the "override" preview the admin can accept or cancel. */}
            {importPreview.changes.length > 0 && (
              <div className="mt-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Existing partners that will be updated ({importPreview.changes.length})
                </h4>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10 divide-y divide-amber-100 dark:divide-amber-900/30">
                  {importPreview.changes.map((c) => (
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
                className="bg-[#0866B1] hover:bg-[#07528E] text-white text-xs font-bold py-2 px-4 rounded-lg transition cursor-pointer"
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
                <span className="text-slate-400 font-medium block">New partners created</span>
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
              Uncategorized partners are archived and excluded from evaluations until manually classified. Download the full merge log below to audit exactly which rows matched which existing partner.
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
                className="bg-[#0866B1] hover:bg-[#07528E] text-white text-xs font-bold py-2 px-4 rounded-lg transition cursor-pointer"
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
              <h3 id="archive-partner-title" className="text-lg font-bold text-slate-900 dark:text-white">Archive Partner?</h3>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Are you sure you want to archive <strong className="text-slate-800 dark:text-slate-200">"{companyToArchive.name}"</strong>? The partner will move to the Archived registry and can be restored later.
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
