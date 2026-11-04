import { DOCUMENT_CATEGORIES, resolveDocumentCategory, companiesForDocumentCategory } from '../features/document-tracker/domain/documentCategories';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalEscape } from '../hooks/useModalEscape';
import { Pagination } from '../components/Pagination';
import { Search, Globe, MapPin, Truck, Package, Layers, RefreshCw, X, Check, Users, ShieldCheck, Clock, XCircle, Gauge, LayoutGrid, Settings2, RotateCcw, AlertTriangle, History, ChevronUp, ChevronDown, BellPlus, Plus, Filter, ChevronRight, MoreHorizontal, FilePlus2, ArrowDownUp, CalendarClock, CircleAlert, MessageSquareText } from 'lucide-react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BranchRecord, ComplianceDocument, DocumentStatus, PartnerCompany, PartnerCompanyType, SupplierOrigin, SurveyResponse } from '../types/survey';
import { getEvaluationLeaderboardTopTwenty } from '../features/evaluations/domain/leaderboardSelection';
import { branchAwareCompanyLabel, computeCompanyDocumentSummary, computeDocumentStatus, isBranchDocumentCompliant, isNTBranch, summarizeDocumentAttention } from '../features/document-tracker/domain/compliance';
import { COMMON_DOCUMENTS, getAvailableDocumentKeys, getRequiredDocumentKeys, isExpiryDocument } from '../features/document-tracker/domain/documentRequirements';
import { companyDocumentRemarksError } from '../features/document-tracker/domain/documentValidation';
import { RequiredDocumentAttention, type RequiredDocumentAttentionStatus } from '../features/document-tracker/components/RequiredDocumentAttention';
import { DocumentModificationEntry, getDocumentModifications, logDocumentModification } from '../features/document-tracker/services/documentModificationLog';
import { ComplianceSnapshot, getComplianceHistory, saveComplianceHistory } from '../features/document-tracker/services/complianceHistory';
import {
  DocNotificationRule,
  DEFAULT_NOTIFICATION_RULES,
  getNotificationSettings,
  saveNotificationSettings,
} from '../features/notifications/services/documentNotificationSettings';
import { DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS, DocumentMaintenanceSettings, loadDocumentMaintenanceSettings, MAINTENANCE_DOCUMENTS, saveDocumentMaintenanceSettings, validateDocumentMaintenanceSettings } from '../features/notifications/services/documentMaintenanceSettings';
import { ChartCard } from '../components/ChartCard';
import { PageDescription } from '../components/PageDescription';
import { useIsMobile } from '../hooks/useIsMobile';
import { BRANCH_STATUS_OPTIONS, branchStatusBadgeClasses } from './PartnerCompaniesPage';
import {
  countRowsByDocumentStatus,
  matchesDocumentFilters,
  type DocumentStatusFilter,
} from '../features/document-tracker/domain/filters';

interface DocumentRegisterPageProps {
  partnerCompanies: PartnerCompany[];
  responses?: SurveyResponse[];
  categoryFromUrl?: string | null;
  onCategoryChange?: (category: string) => void;
  onUpdateCompany: (company: PartnerCompany) => void;
  onRenewDocument: (
    companyId: string,
    branchId: string,
    documentName: string,
    expectedDocument: ComplianceDocument,
    nextDocument: Pick<ComplianceDocument, 'provided'> & Partial<Pick<ComplianceDocument, 'expiryDate' | 'remarks' | 'description'>>,
  ) => Promise<PartnerCompany>;
  onUpdateDocumentRemarks?: (
    companyId: string,
    branchId: string,
    documentName: string,
    expectedDocument: ComplianceDocument,
    remarks: string,
  ) => Promise<PartnerCompany>;
  canRenewDocuments?: boolean;
  currentUserEmail?: string;
  isAdmin?: boolean;
}

// ---------------------------------------------------------------------------
// Advanced custom filter rows - field + condition + value triples that are
// composed by the admin in the filter popover and applied alongside quick
// filters. None of these fields are invented: every key maps
// directly to a verified property of DisplayRow / PartnerCompany / BranchRecord
// or to the matrixCellData computed values.
// ---------------------------------------------------------------------------

type FilterFieldType = 'text' | 'select' | 'number';

interface FilterableField {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: string[];       // only for 'select' type
  placeholder?: string;    // only for 'text' / 'number' type
  unit?: string;            // suffix shown next to number input (e.g. "days")
}

// Verified fields — every option value comes from types/survey.ts or
// documentRequirements.ts; nothing is invented.
const FILTERABLE_FIELDS: FilterableField[] = [
  {
    key: 'company.name',
    label: 'Company Name',
    type: 'text',
    placeholder: 'Enter company name…',
  },
  {
    key: 'branch.bpCode',
    label: 'BP Code',
    type: 'text',
    placeholder: 'Enter BP code…',
  },
  {
    key: 'branch.status',
    label: 'Registry Status',
    type: 'select',
    // Values from BranchStatus: 'Pending'|'Updated'|'Outdated'|'Incomplete'|'Completed'|'Accredited'|'Inactive'
    options: ['Pending', 'Updated', 'Outdated', 'Incomplete', 'Completed', 'Accredited', 'Inactive'],
  },
  {
    key: 'branch.supplierRank',
    label: 'Supplier Rank',
    type: 'select',
    options: ['Major', 'Regular'],
  },
  {
    key: 'isNT',
    label: 'Trade Type',
    type: 'select',
    options: ['Trade', 'Non-Trade'],
  },
  {
    key: 'accreditationStatus',
    label: 'Accreditation',
    type: 'select',
    // Values from AccreditationStatus
    options: ['Accredited', 'Unaccredited'],
  },
  {
    key: 'doc.daysLeft',
    label: 'Days Left (expiry docs)',
    type: 'number',
    placeholder: '30',
    unit: 'days',
  },
];

type TextCondition = 'contains' | 'equals';
type SelectCondition = 'equals';
type NumberCondition = 'equals' | 'lt' | 'lte' | 'gt' | 'gte';
type FilterCondition = TextCondition | SelectCondition | NumberCondition;

const TEXT_CONDITIONS: { value: TextCondition; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals',   label: 'Equals' },
];
const SELECT_CONDITIONS: { value: SelectCondition; label: string }[] = [
  { value: 'equals', label: 'Equals' },
];
const NUMBER_CONDITIONS: { value: NumberCondition; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'lt',     label: 'Less than' },
  { value: 'lte',    label: 'Less than or equal' },
  { value: 'gt',     label: 'Greater than' },
  { value: 'gte',    label: 'Greater than or equal' },
];

function getConditionsForField(field: FilterableField) {
  if (field.type === 'text')   return TEXT_CONDITIONS;
  if (field.type === 'number') return NUMBER_CONDITIONS;
  return SELECT_CONDITIONS;
}

function defaultConditionForField(field: FilterableField): FilterCondition {
  if (field.type === 'text')   return 'contains';
  if (field.type === 'number') return 'lte';
  return 'equals';
}

interface FilterRow {
  id: string;
  field: string;       // key from FILTERABLE_FIELDS
  condition: FilterCondition;
  value: string;       // always string; parsed to number when needed
}

let _filterRowSeq = 0;
function newFilterRow(field = FILTERABLE_FIELDS[0]): FilterRow {
  return {
    id: `fr-${++_filterRowSeq}`,
    field: field.key,
    condition: defaultConditionForField(field),
    value: '',
  };
}

const DOCUMENT_STATUS_FILTER_OPTIONS: Array<{ value: DocumentStatusFilter; label: string }> = [
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'Current', label: 'Current' },
  { value: 'Expiring Soon', label: 'Expiring soon' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Missing', label: 'Missing' },
  { value: 'For Update', label: 'For update' },
];

function describeFilterRow(row: FilterRow): string {
  const field = FILTERABLE_FIELDS.find((candidate) => candidate.key === row.field);
  const condition = field
    ? getConditionsForField(field).find((candidate) => candidate.value === row.condition)
    : undefined;
  return `${field?.label ?? row.field} ${condition?.label.toLowerCase() ?? row.condition} ${row.value}`;
}

function describeDocumentSort(sortKey: DocumentSortKey): string {
  if (sortKey.startsWith('doc:')) return sortKey.slice(4);
  switch (sortKey) {
    case 'company': return 'Company';
    case 'compliance': return 'Compliance';
    case 'bpCode': return 'BP Code';
    case 'ntType': return 'Trade/Non-Trade';
    case 'branchStatus': return 'Registry status';
    case 'supplierRank': return 'Supplier rank';
    default: return sortKey;
  }
}

// Category selection filters partners and selects each category's required
// document checklist from the Master List definitions.
const CATEGORY_ICONS = { 'supplier-local': MapPin, 'supplier-foreign': Globe, courier: Truck, subcontractor: Layers };
const CATEGORIES = DOCUMENT_CATEGORIES.map(category => ({ ...category, icon: CATEGORY_ICONS[category.key as keyof typeof CATEGORY_ICONS] }));

// Pseudo-category: aggregates the Compliance Overview (KPIs/charts) across
// every category at once, same idea as the client's mockup's top summary
// strip. Detailed document requirements are shown for the selected category.
const ALL_KEY = 'all';

// Compliance Overview widgets a user can show/hide - toggled per category
// (keyed by categoryKey, including 'all'), not globally, since what's
// useful for Supplier (Local) isn't necessarily useful for Courier.
// "Simple" = the original 5 KPIs + 2 charts. "Advanced" adds the extra
// breakdown tables from the client's mockup. There's no separate mode
// concept - Advanced just means more of these same widgets are turned on,
// so a user can still hand-pick any mix via Customize.
const OVERVIEW_WIDGETS: { id: string; label: string; kind: 'kpi' | 'chart' | 'table' }[] = [
  { id: 'kpi-total', label: 'Total Partners', kind: 'kpi' },
  { id: 'kpi-accreditation', label: 'Active Accreditation', kind: 'kpi' },
  { id: 'kpi-expiring', label: 'Expiring ≤ 30 Days', kind: 'kpi' },
  { id: 'kpi-expired', label: 'Expired / For Update', kind: 'kpi' },
  { id: 'kpi-rate', label: 'Compliance Rate', kind: 'kpi' },
  { id: 'chart-compliance', label: 'Branch Registry Status (donut)', kind: 'chart' },
  { id: 'chart-attention', label: 'Documents Needing Attention (bar)', kind: 'chart' },
  { id: 'chart-trend', label: 'Document Compliance Trend', kind: 'chart' },
  { id: 'table-doc-status', label: 'Document Status Summary', kind: 'table' },
  { id: 'table-aging', label: 'Expiry Aging Summary', kind: 'table' },
  { id: 'table-upcoming', label: 'Upcoming Expiries (Next 30 Days)', kind: 'table' },
  { id: 'table-risk', label: 'Documents with Highest Expiry Risk', kind: 'table' },
];
const ADVANCED_WIDGET_IDS = OVERVIEW_WIDGETS.map((w) => w.id);
// Defaults to everything on - a first-time visitor should see the full
// mockup-equivalent view, not have to discover the Customize dropdown to
// find the tables.
const DEFAULT_WIDGET_IDS = ADVANCED_WIDGET_IDS;
const WIDGET_VISIBILITY_STORAGE_KEY = 'document_register_widget_visibility_v1';

// One snapshot per category per calendar day. Revisiting the same day
// overwrites that day's entry instead of duplicating it.
const COMPLIANCE_HISTORY_LIMIT = 180;
const DOCUMENT_ROWS_PER_PAGE = 15;

const AGING_BUCKETS = [
  { key: 'expired', label: '≤ 0 Days', status: 'Expired', match: (d: number) => d <= 0 },
  { key: 'expiring', label: '1 - 30 Days', status: 'Expiring Soon', match: (d: number) => d >= 1 && d <= 30 },
  { key: 'renewal-60', label: '31 - 60 Days', status: 'For Renewal', match: (d: number) => d >= 31 && d <= 60 },
  { key: 'renewal-90', label: '61 - 90 Days', status: 'For Renewal', match: (d: number) => d >= 61 && d <= 90 },
  { key: 'current', label: '> 90 Days', status: 'Current', match: (d: number) => d > 90 },
] as const;

// Shared Compliance Overview palette: quiet brand blue, teal greens, amber,
// and coral. Text uses darker semantic tones below so small labels stay clear.
const CHART_BRAND = '#397da5';
const CHART_BRAND_TINT = '#eaf2f7';
const CHART_GOOD = '#4b8f79';
const CHART_EXPIRING = '#c3a76e';
const CHART_WARNING = '#ad8443';
const CHART_CRITICAL = '#c86e77';
const CHART_INK = '#172033'; // matches the app's `ink` design token

// Colors for the branch Status donut - one slice per BRANCH_STATUS_OPTIONS
// value (plus 'Not Set' for a branch with no status chosen yet), kept
// visually distinct from each other regardless of the pill badge colors
// used elsewhere on the page.
const STATUS_CHART_COLORS: Record<string, string> = {
  Pending: CHART_BRAND,
  Updated: '#548f9a',
  Outdated: CHART_WARNING,
  Incomplete: CHART_CRITICAL,
  Completed: CHART_GOOD,
  Accredited: '#398b84',
  Inactive: '#8999aa',
  'Not Set': '#cbd5df',
};
// These persisted lifecycle states imply full compliance, so keep them
// unavailable until the branch's applicable document checklist is current.
const STATUS_STYLES: Record<string, string> = {
  Current: 'bg-[#edf5f1] text-[#397661] border-[#d7e8df] dark:bg-[#20312b] dark:text-[#a6c9b8] dark:border-[#365246]',
  'Expiring Soon': 'bg-[#f8f3e8] text-[#896a35] border-[#eadfc8] dark:bg-[#342d21] dark:text-[#d5bd8a] dark:border-[#5b4d31]',
  Expired: 'bg-[#f8eeee] text-[#a45655] border-[#ecd9d7] dark:bg-[#352322] dark:text-[#dda09a] dark:border-[#69403e]',
  'For Update': 'bg-[#f8f3e8] text-[#896a35] border-[#eadfc8] dark:bg-[#342d21] dark:text-[#d5bd8a] dark:border-[#5b4d31]',
  'For Renewal': 'bg-[#f8f3e8] text-[#896a35] border-[#eadfc8] dark:bg-[#342d21] dark:text-[#d5bd8a] dark:border-[#5b4d31]',
  Missing: 'bg-[#f8eeee] text-rose-700 border-[#ecd9d7] dark:bg-[#352322] dark:text-rose-300 dark:border-[#69403e]',
  'Needs classification': 'bg-[#f8f3e8] text-[#896a35] border-[#eadfc8] dark:bg-[#342d21] dark:text-[#d5bd8a] dark:border-[#5b4d31]',
  'No branch': 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700',
};

const DOCUMENT_STATUS_ICONS: Record<string, typeof Check> = {
  Current: Check,
  'Expiring Soon': Clock,
  Expired: AlertTriangle,
  'For Update': RefreshCw,
  Missing: XCircle,
  'Needs classification': CircleAlert,
  'No branch': CircleAlert,
};

const DOCUMENT_STATUS_DOTS: Record<string, string> = {
  'needs-attention': 'bg-[#c86e77]',
  Current: 'bg-[#4b8f79]',
  'Expiring Soon': 'bg-[#c3a76e]',
  Expired: 'bg-[#c86e77]',
  Missing: 'bg-[#c86e77]',
  'For Update': 'bg-[#ad8443]',
};

// Ordering used by the document-status sort control.
const DOC_STATUS_SORT_RANK: Record<DocumentStatus, number> = {
  Current: 0,
  Missing: 1,
  'Expiring Soon': 2,
  Expired: 3,
  'For Update': 3,
};

// Document sorts use `doc:${docName}` to keep document status sorting available.
type DocumentSortKey = 'company' | 'compliance' | 'ntType' | 'bpCode' | string;

// Matches the Master List's own "Supplier Rank" column values exactly, so an
// edit here round-trips cleanly through a future re-import.
const SUPPLIER_RANK_OPTIONS = ['Major', 'Regular'];
const DOCUMENT_LIST_GRID_COLUMNS = 'xl:grid-cols-[minmax(170px,1fr)_88px_104px_minmax(120px,1fr)_88px_minmax(220px,0.5fr)_32px] xl:gap-x-3 2xl:grid-cols-[minmax(240px,1fr)_88px_104px_minmax(210px,1fr)_88px_minmax(300px,0.5fr)_32px] 2xl:gap-x-5';
const DOCUMENT_ROW_BADGE_CLASS = 'inline-flex h-8 max-w-full items-center rounded-md border px-2.5 text-[10px] font-semibold';

function documentPartnerTypeBadgeClasses(type: PartnerCompanyType, isNT: boolean): string {
  if (type !== 'Supplier') return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
  return isNT
    ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-300'
    : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-300';
}

function supplierRankTextClasses(rank?: string): string {
  if (/major/i.test(rank ?? '')) return 'text-amber-600 dark:text-amber-400';
  if (/regular/i.test(rank ?? '')) return 'text-[#346f91] dark:text-sky-300';
  return 'text-slate-300 dark:text-slate-600';
}

function SupplierRankSelect({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [keyboardOpened, setKeyboardOpened] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const cancelTimers = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    hoverTimer.current = null;
    closeTimer.current = null;
  };
  useEffect(() => () => cancelTimers(), []);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setKeyboardOpened(false);
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);
  useEffect(() => {
    if (open && keyboardOpened) optionsRef.current[SUPPLIER_RANK_OPTIONS.indexOf(value)]?.focus();
  }, [open, keyboardOpened, value]);

  const choose = (rank: string) => {
    onChange(rank);
    setOpen(false);
    setKeyboardOpened(false);
    cancelTimers();
    triggerRef.current?.focus();
  };
  const openFromKeyboard = () => {
    cancelTimers();
    setKeyboardOpened(true);
    setOpen(true);
  };
  return <div ref={rootRef} className="relative" onPointerEnter={(event) => {
    if (event.pointerType === 'touch') return;
    cancelTimers();
    hoverTimer.current = window.setTimeout(() => { setKeyboardOpened(false); setOpen(true); }, 2000);
  }} onPointerLeave={(event) => {
    if (event.pointerType === 'touch') return;
    cancelTimers();
    closeTimer.current = window.setTimeout(() => { setOpen(false); setKeyboardOpened(false); }, 180);
  }}>
    <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
      onClick={() => { cancelTimers(); setKeyboardOpened(false); setOpen((current) => !current); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openFromKeyboard(); }
      }}
      className={'inline-flex h-8 w-24 items-center justify-between rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:border-slate-700 dark:bg-slate-950 ' + supplierRankTextClasses(value)}>
      <span>{value}</span><ChevronDown size={13} className="shrink-0 text-slate-600 dark:text-slate-300" aria-hidden="true" />
    </button>
    {open && <div role="listbox" aria-label={label} className="absolute left-0 top-full z-30 mt-1 min-w-full overflow-hidden rounded-md border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"
      onPointerEnter={cancelTimers} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setKeyboardOpened(false); triggerRef.current?.focus(); }
        const current = optionsRef.current.findIndex((option) => option === document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          optionsRef.current[(current + delta + SUPPLIER_RANK_OPTIONS.length) % SUPPLIER_RANK_OPTIONS.length]?.focus();
        }
      }}>
      {SUPPLIER_RANK_OPTIONS.map((rank, index) => <button key={rank} ref={(node) => { optionsRef.current[index] = node; }} type="button" role="option" aria-selected={value === rank}
        onClick={() => choose(rank)} className={`flex min-h-8 w-full items-center rounded px-2 text-left text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:hover:bg-slate-800 ${supplierRankTextClasses(rank)} ${value === rank ? 'font-semibold' : 'font-medium'}`}>
        {rank}
      </button>)}
    </div>}
  </div>;
}

function formatDaysLabel(daysLeft?: number): string | undefined {
  if (typeof daysLeft !== 'number') return undefined;
  return daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d`;
}

// Second line, expiry-bearing cells only: short date (+ days, for Current -
// Expiring/Expired/For Update already show days in the label line above).
function getCellDateLine(status: string, expiryDate: string | undefined, daysLeft: number | undefined): string | undefined {
  if (!expiryDate) return undefined;
  const shortDate = formatShortDate(expiryDate);
  if (status === 'Current' || status === 'Expiring Soon' || status === 'Expired') {
    const days = formatDaysLabel(daysLeft);
    return days ? `${shortDate} · ${days}` : shortDate;
  }
  return shortDate;
}

function formatShortDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export function DocumentRegisterPage({ categoryFromUrl = null, onCategoryChange, partnerCompanies, responses = [], onUpdateCompany, onRenewDocument, onUpdateDocumentRemarks, canRenewDocuments, currentUserEmail = '', isAdmin = false }: DocumentRegisterPageProps) {
  const isMobile = useIsMobile();
  const [categoryKey, setCategoryKey] = useState(() => resolveDocumentCategory(categoryFromUrl));
  useEffect(() => { setCategoryKey(resolveDocumentCategory(categoryFromUrl)); }, [categoryFromUrl]);
  const selectCategory = (key: string) => { setCategoryKey(key); onCategoryChange?.(key); };
  const [searchQuery, setSearchQuery] = useState('');
  const [includeInactiveCompanies, setIncludeInactiveCompanies] = useState(false);
  const [withinTop20, setWithinTop20] = useState(false);
  const [documentStatusFilters, setDocumentStatusFilters] = useState<DocumentStatusFilter[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DOCUMENT_ROWS_PER_PAGE);
  const [renewalTarget, setRenewalTarget] = useState<{ company: PartnerCompany; branchId: string; docName: string } | null>(null);
  const [renewalDate, setRenewalDate] = useState('');
  const [mutationError, setMutationError] = useState('');
  // Flag docs (plain provided/not-provided checklist items, no expiry date):
  // clicking a cell opens a two-step flow. Step 'choose' lets the user pick
  // Missing/Complete explicitly (pre-selected to the current value) instead
  // of assuming "the opposite" - step 'confirm' is the actual warning, and
  // only its Confirm button applies the change + logs it.
  const [flagFlow, setFlagFlow] = useState<{
    company: PartnerCompany;
    branch: BranchRecord;
    docName: string;
    step: 'choose' | 'confirm';
    currentProvided: boolean;
    selectedProvided: boolean;
  } | null>(null);
  // Expiry docs (AFS, GIS, etc.): clicking a cell opens a status readout
  // (Active till.../Expired/Missing) with Renew Document / Mark as Missing
  // actions. confirmingMissing toggles this same popup into its own warning
  // step before Mark as Missing actually clears the document.
  const [expiryStatusTarget, setExpiryStatusTarget] = useState<{
    company: PartnerCompany;
    branch: BranchRecord;
    docName: string;
    confirmingMissing: boolean;
    missingRemarks: string;
  } | null>(null);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, string[]>>({});
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);
  // Customizable filter chips - admin-editable list of which chips are
  // Applied custom filter rows (used by the `rows` useMemo).
  const [customFilterRows, setCustomFilterRows] = useState<FilterRow[]>([]);
  // Draft rows - working copy while the filter panel is open.
  // Committed on Apply; discarded on Cancel.
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const moreFiltersCloseTimerRef = useRef<number | null>(null);
  const sortPopoverRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const sortCloseTimerRef = useRef<number | null>(null);
  const [complianceHistory, setComplianceHistory] = useState<Record<string, ComplianceSnapshot[]>>({});
  const [modificationLog, setModificationLog] = useState<DocumentModificationEntry[]>([]);
  const [sortKey, setSortKey] = useState<DocumentSortKey>('company');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isSortPopoverOpen, setIsSortPopoverOpen] = useState(false);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [requiredDocumentStatus, setRequiredDocumentStatus] = useState<RequiredDocumentAttentionStatus | null>(null);
  const [openDocumentPopoverKey, setOpenDocumentPopoverKey] = useState<string | null>(null);
  const rowExpandHoverTimerRef = useRef<number | null>(null);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
  const maintenanceDialogRef = useRef<HTMLDivElement>(null);
  useModalEscape(Boolean(renewalTarget), () => setRenewalTarget(null), 50);
  useModalEscape(Boolean(flagFlow), () => setFlagFlow(null), 50);
  useModalEscape(Boolean(expiryStatusTarget), () => setExpiryStatusTarget(null), 50);
  const [notificationRules, setNotificationRules] = useState<DocNotificationRule[]>(DEFAULT_NOTIFICATION_RULES);
  const [savedNotificationRules, setSavedNotificationRules] = useState<DocNotificationRule[]>(DEFAULT_NOTIFICATION_RULES);
  const [maintenanceSettings, setMaintenanceSettings] = useState<DocumentMaintenanceSettings>(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS);
  const [savedMaintenanceSettings, setSavedMaintenanceSettings] = useState<DocumentMaintenanceSettings>(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceLoadState, setMaintenanceLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [maintenanceReloadKey, setMaintenanceReloadKey] = useState(0);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [maintenanceTab, setMaintenanceTab] = useState<'schedule' | 'validity' | 'category'>('schedule');
  const [reminderIntervalDraft, setReminderIntervalDraft] = useState('');
  const [showDiscardMaintenance, setShowDiscardMaintenance] = useState(false);
  const [showRestoreMaintenance, setShowRestoreMaintenance] = useState(false);
  // Portals "Add Notification" into Shell's page-heading row (same slot
  // DashboardPage's header actions use) so it sits on the title line instead
  // of taking up its own row and pushing the category tabs/search further
  // down the page.
  const [headerPortalTarget, setHeaderPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setHeaderPortalTarget(document.getElementById('shell-header-action'));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIDGET_VISIBILITY_STORAGE_KEY);
      if (saved) setWidgetVisibility(JSON.parse(saved));
    } catch {
      // Best-effort only - falls back to the default widget set.
    }
  }, []);

  useEffect(() => {
    setComplianceHistory(getComplianceHistory());
    const refresh = () => setComplianceHistory(getComplianceHistory());
    window.addEventListener('compliance-history-updated', refresh);
    return () => window.removeEventListener('compliance-history-updated', refresh);
  }, []);

  // Loaded once up front, then kept live off the same event
  // logDocumentModification fires - so a renewal/flag change made just now
  // shows up in the History panel below without a page refresh.
  useEffect(() => {
    setModificationLog(getDocumentModifications());
    const handler = () => setModificationLog(getDocumentModifications());
    window.addEventListener('document-modification-logged', handler);
    return () => window.removeEventListener('document-modification-logged', handler);
  }, []);

  useEffect(() => {
    const savedRules = getNotificationSettings();
    setNotificationRules(savedRules);
    setSavedNotificationRules(savedRules);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    setMaintenanceLoadState('loading');
    void loadDocumentMaintenanceSettings(controller.signal).then((settings) => {
      if (controller.signal.aborted) return;
      setMaintenanceSettings(settings);
      setSavedMaintenanceSettings(settings);
      setMaintenanceMessage('');
      setMaintenanceLoadState('ready');
    }).catch(() => {
      // Supabase can reject an aborted fetch with a generic Error. Ignore only
      // requests canceled by this effect; surface all current-request failures.
      if (controller.signal.aborted) return;
      setMaintenanceMessage('Could not load maintenance settings. Retry to try again.');
      setMaintenanceLoadState('error');
    });
    return () => controller.abort();
  }, [isAdmin, maintenanceReloadKey]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(event.target as Node)) {
        setIsCustomizeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A selected document sort/filter is reset when switching to another
  // category's requirements.
  useEffect(() => {
    setSortKey('company');
    setSortDirection('asc');
    setDocumentStatusFilters([]);
  }, [categoryKey]);

  // Keep the clock stable between meaningful time updates. This prevents
  // every search/filter/modal state change from invalidating the expensive
  // document-status matrix and compliance overview calculations.
  const [effectiveNow, setEffectiveNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setEffectiveNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentDateStr = effectiveNow.toISOString().slice(0, 10);

  const isAllView = categoryKey === ALL_KEY;
  const category = CATEGORIES.find((c) => c.key === categoryKey) ?? CATEGORIES[0];
  const viewLabel = isAllView ? 'All Categories' : category.label;
  const docColumns = useMemo(() => getAvailableDocumentKeys(category.type, category.origin), [category]);

  const visibleWidgetIds = widgetVisibility[categoryKey] ?? DEFAULT_WIDGET_IDS;
  const isWidgetVisible = (id: string) => visibleWidgetIds.includes(id);

  const toggleWidget = (id: string) => {
    const next = visibleWidgetIds.includes(id)
      ? visibleWidgetIds.filter((w) => w !== id)
      : [...visibleWidgetIds, id];
    const updated = { ...widgetVisibility, [categoryKey]: next };
    setWidgetVisibility(updated);
    localStorage.setItem(WIDGET_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  const restoreDefaultWidgets = () => {
    const updated = { ...widgetVisibility };
    delete updated[categoryKey];
    setWidgetVisibility(updated);
    localStorage.setItem(WIDGET_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  // Filter edits apply immediately; blank advanced conditions are ignored.
  const addFilterRow = (fieldKey = FILTERABLE_FIELDS[0].key) => {
    const field = FILTERABLE_FIELDS.find((candidate) => candidate.key === fieldKey) ?? FILTERABLE_FIELDS[0];
    setCustomFilterRows((current) => [...current, newFilterRow(field)]);
  };

  const removeFilterRow = (id: string) => {
    setCustomFilterRows((current) => current.filter((row) => row.id !== id));
  };

  const updateFilterRow = (id: string, patch: Partial<FilterRow>) => {
    setCustomFilterRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        // When field changes, reset condition to the new field's default
        // and clear value so stale text/number doesn't pass wrong type.
        if (patch.field !== undefined && patch.field !== row.field) {
          const newField = FILTERABLE_FIELDS.find((f) => f.key === patch.field);
          if (newField) {
            next.condition = defaultConditionForField(newField);
            next.value = '';
          }
        }
        return next;
      })
    );
  };

  const clearAppliedFilters = () => {
    setSearchQuery('');
    if (includeInactiveCompanies) setExpandedRowKey(null);
    setIncludeInactiveCompanies(false);
    setWithinTop20(false);
    setDocumentStatusFilters([]);
    setCustomFilterRows([]);
  };

  const hasAppliedFilters = Boolean(
    searchQuery.trim() || includeInactiveCompanies || withinTop20 || documentStatusFilters.length > 0 || customFilterRows.some((row) => row.value.trim()),
  );
  const hasActiveTableState = hasAppliedFilters || sortKey !== 'company' || sortDirection !== 'asc';

  const resetFiltersAndSort = () => {
    clearAppliedFilters();
    setSortKey('company');
    setSortDirection('asc');
    setIsFilterPopoverOpen(false);
    setIsMoreFiltersOpen(false);
    cancelMoreFiltersClose();
    setIsSortPopoverOpen(false);
  };

  const cancelSortMenuClose = () => {
    if (sortCloseTimerRef.current !== null) {
      window.clearTimeout(sortCloseTimerRef.current);
      sortCloseTimerRef.current = null;
    }
  };

  const scheduleSortMenuClose = () => {
    cancelSortMenuClose();
    sortCloseTimerRef.current = window.setTimeout(() => {
      setIsSortPopoverOpen(false);
      sortCloseTimerRef.current = null;
    }, 180);
  };

  useEffect(() => () => cancelSortMenuClose(), []);

  const cancelMoreFiltersClose = () => {
    if (moreFiltersCloseTimerRef.current !== null) {
      window.clearTimeout(moreFiltersCloseTimerRef.current);
      moreFiltersCloseTimerRef.current = null;
    }
  };

  const scheduleMoreFiltersClose = () => {
    cancelMoreFiltersClose();
    moreFiltersCloseTimerRef.current = window.setTimeout(() => {
      setIsMoreFiltersOpen(false);
      moreFiltersCloseTimerRef.current = null;
    }, 180);
  };

  useEffect(() => () => cancelMoreFiltersClose(), []);

  const cancelRowExpandHover = () => {
    if (rowExpandHoverTimerRef.current !== null) {
      window.clearTimeout(rowExpandHoverTimerRef.current);
      rowExpandHoverTimerRef.current = null;
    }
  };
  useEffect(() => () => cancelRowExpandHover(), []);
  useEffect(() => { setOpenDocumentPopoverKey(null); }, [expandedRowKey]);
  useEffect(() => { setRequiredDocumentStatus(null); }, [categoryKey, expandedRowKey]);

  const toggleDocumentStatusFilter = (status: DocumentStatusFilter) => {
    const next = documentStatusFilters.includes(status)
      ? documentStatusFilters.filter((item) => item !== status)
      : [...documentStatusFilters, status];
    setDocumentStatusFilters(next);
  };

  useEffect(() => {
    if (!isFilterPopoverOpen && !isSortPopoverOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(target)) {
        setIsFilterPopoverOpen(false);
        setIsMoreFiltersOpen(false);
        cancelMoreFiltersClose();
      }
      if (sortPopoverRef.current && !sortPopoverRef.current.contains(target)) setIsSortPopoverOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsFilterPopoverOpen(false);
      setIsMoreFiltersOpen(false);
      cancelMoreFiltersClose();
      setIsSortPopoverOpen(false);
      if (isSortPopoverOpen) sortTriggerRef.current?.focus();
      else filterTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isFilterPopoverOpen, isSortPopoverOpen]);

  // Companies in the selected category. Archived companies and registry
  // branches explicitly marked Inactive stay excluded unless an admin opts
  // to include inactive records.
  // Search stays limited to the detailed rows and doesn't change overview KPIs.
  // "All Categories" skips the type/origin filter entirely.
  // Archived companies are excluded from the default registry view. When the
  // admin opts into inactive records, include archived companies as well; the
  // filter is read-only and does not restore or mutate archived records.
  const registryCategoryCompanies = useMemo(
    () => companiesForDocumentCategory(partnerCompanies, categoryKey, includeInactiveCompanies),
    [partnerCompanies, categoryKey, includeInactiveCompanies],
  );
  const topTwentyCompanyIds = useMemo(
    () => new Set(category.type === 'Uncategorized' ? [] : getEvaluationLeaderboardTopTwenty(partnerCompanies, responses, category.type).map((company) => company.id)),
    [partnerCompanies, responses, category.type],
  );
  const categoryCompanies = useMemo(
    () => registryCategoryCompanies.filter((company) => {
      const branches = company.branches ?? [];
      const includesInactive = includeInactiveCompanies || branches.length === 0 || branches.some((branch) => branch.status !== 'Inactive');
      return includesInactive && (!withinTop20 || topTwentyCompanyIds.has(company.id));
    }),
    [registryCategoryCompanies, includeInactiveCompanies, withinTop20, topTwentyCompanyIds],
  );

  // Companies with a normal + "-NT" BP Code merge into one PartnerCompany
  // (see masterListImport.ts), which is correct for Partner Companies'
  // company-level views. But this matrix shows one row of document columns
  // per row, and the two branches can carry entirely different documents
  // (different BP Code = different filing) - showing them as one row means
  // picking one branch's data per cell and silently hiding the other's, so a
  // company with 2+ branches is instead split into one row per branch here.
  interface DisplayRow {
    key: string;
    company: PartnerCompany;
    branch?: BranchRecord;
    isNT: boolean;
    isSplit: boolean;
  }
  const displayRows = useMemo(() => {
    const list: DisplayRow[] = [];
    categoryCompanies.forEach((c) => {
      const branches = c.branches ?? [];
      if (branches.length > 1) {
        branches.forEach((b) => {
          if (!includeInactiveCompanies && b.status === 'Inactive') return;
          list.push({ key: `${c.id}::${b.id}`, company: c, branch: b, isNT: isNTBranch(b), isSplit: true });
        });
      } else {
        const branch = branches[0];
        if (includeInactiveCompanies || branch?.status !== 'Inactive') {
          list.push({ key: c.id, company: c, branch, isNT: branch ? isNTBranch(branch) : false, isSplit: false });
        }
      }
    });
    return list;
  }, [categoryCompanies, includeInactiveCompanies]);

  // Every doc cell's computed status for every row in this category
  // (unfiltered by search/chip) - the single source of truth the heatmap
  // cells, the per-row compliance rollup column, and the filter chip counts
  // all read from, so cell color and chip counts can never drift. Each row
  // is pinned to its own branch's documents - no cross-branch picking.
  interface MatrixCell {
    docName: string;
    status: DocumentStatus;
    daysLeft?: number;
    doc: ComplianceDocument;
    branch?: BranchRecord;
    expiryBased: boolean;
    inactiveClassification?: boolean;
  }
  const matrixCellData = useMemo(() => {
    const map = new Map<string, MatrixCell[]>();
    displayRows.forEach((row) => {
      map.set(
        row.key,
        getRequiredDocumentKeys(row.company.type, row.company.supplierOrigin, row.company.businessClassification).map((docName) => {
          const branch = row.branch;
          const doc: ComplianceDocument = (branch?.documents?.[docName] ?? {}) as ComplianceDocument;
          const { status, daysLeft } = computeDocumentStatus(doc, effectiveNow, docName);
          return { docName, status, daysLeft, doc, branch, expiryBased: isExpiryDocument(docName), inactiveClassification: false };
        })
      );
    });
    return map;
  }, [displayRows, effectiveNow]);

  const documentStatusCounts = useMemo(
    () => countRowsByDocumentStatus(
      displayRows.map((row) => matrixCellData.get(row.key) ?? []),
      'all',
    ),
    [displayRows, matrixCellData],
  );

  const rows = useMemo(() => {
    let list = displayRows;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((row) =>
        row.company.name.toLowerCase().includes(q) ||
        row.branch?.bpCode?.toLowerCase().includes(q)
      );
    }
    if (documentStatusFilters.length > 0) {
      list = list.filter((row) => matchesDocumentFilters(
        matrixCellData.get(row.key) ?? [],
        'all',
        documentStatusFilters,
      ));
    }
    // Apply every custom filter row that has a non-empty value.
    // All rows must match (AND logic) - if one row doesn't match, the
    // supplier row is excluded. Incomplete rows (empty value) are skipped.
    const activeCustomRows = customFilterRows.filter((r) => r.value.trim() !== '');
    if (activeCustomRows.length > 0) {
      list = list.filter((row) =>
        activeCustomRows.every((fr) => {
          const fieldDef = FILTERABLE_FIELDS.find((f) => f.key === fr.field);
          if (!fieldDef) return true; // unknown field — don't filter

          const condition = fr.condition;
          const rawValue = fr.value.trim();

          // ----- text fields -----
          if (fieldDef.type === 'text') {
            let actual = '';
            if (fr.field === 'company.name') actual = row.company.name ?? '';
            else if (fr.field === 'branch.bpCode') actual = row.branch?.bpCode ?? '';
            const a = actual.toLowerCase();
            const v = rawValue.toLowerCase();
            if (condition === 'contains') return a.includes(v);
            if (condition === 'equals')   return a === v;
            return true;
          }

          // ----- select fields -----
          if (fieldDef.type === 'select') {
            if (fr.field === 'branch.status') {
              return (row.branch?.status ?? '') === rawValue;
            }
            if (fr.field === 'branch.supplierRank') {
              return (row.branch?.supplierRank ?? '') === rawValue;
            }
            if (fr.field === 'isNT') {
              const tradeLabel = row.isNT ? 'Non-Trade' : 'Trade';
              return tradeLabel === rawValue;
            }
            if (fr.field === 'accreditationStatus') {
              return (row.company.accreditationStatus ?? '') === rawValue;
            }
            return true;
          }

          // ----- number fields -----
          if (fieldDef.type === 'number') {
            const numValue = parseFloat(rawValue);
            if (!Number.isFinite(numValue)) return true; // unparseable — skip
            if (fr.field === 'doc.daysLeft') {
              const cells = matrixCellData.get(row.key) ?? [];
              // The row passes if ANY expiry document cell satisfies the condition.
              return cells.some((cell) => {
                if (!cell.expiryBased || typeof cell.daysLeft !== 'number') return false;
                const d = cell.daysLeft;
                if (condition === 'equals') return d === numValue;
                if (condition === 'lt')     return d < numValue;
                if (condition === 'lte')    return d <= numValue;
                if (condition === 'gt')     return d > numValue;
                if (condition === 'gte')    return d >= numValue;
                return true;
              });
            }
            return true;
          }

          return true;
        })
      );
    }
    // Sort by the selected company, branch or document field, then use a
    // stable company/branch fallback to keep split branches together.
    const compareBySortKey = (a: DisplayRow, b: DisplayRow): number => {
      if (sortKey === 'compliance') {
        const aCells = matrixCellData.get(a.key) ?? [];
        const bCells = matrixCellData.get(b.key) ?? [];
        const aRatio = aCells.length ? aCells.filter((cell) => cell.status === 'Current').length / aCells.length : 0;
        const bRatio = bCells.length ? bCells.filter((cell) => cell.status === 'Current').length / bCells.length : 0;
        return aRatio - bRatio;
      }
      if (sortKey === 'ntType') {
        return Number(a.isNT) - Number(b.isNT);
      }
      if (sortKey === 'branchStatus') {
        return (a.branch?.status ?? '').localeCompare(b.branch?.status ?? '');
      }
      if (sortKey === 'supplierRank') {
        return (a.branch?.supplierRank ?? '').localeCompare(b.branch?.supplierRank ?? '');
      }
      if (sortKey === 'bpCode') {
        return (a.branch?.bpCode ?? '').localeCompare(b.branch?.bpCode ?? '');
      }
      if (typeof sortKey === 'string' && sortKey.startsWith('doc:')) {
        const docName = sortKey.slice(4);
        const aCell = (matrixCellData.get(a.key) ?? []).find((cell) => cell.docName === docName);
        const bCell = (matrixCellData.get(b.key) ?? []).find((cell) => cell.docName === docName);
        const aRank = aCell ? DOC_STATUS_SORT_RANK[aCell.status] : -1;
        const bRank = bCell ? DOC_STATUS_SORT_RANK[bCell.status] : -1;
        return aRank - bRank;
      }
      return 0;
    };
    const fallback = (a: DisplayRow, b: DisplayRow) => a.company.name.localeCompare(b.company.name) || Number(a.isNT) - Number(b.isNT);
    return [...list].sort((a, b) => {
      const primary = compareBySortKey(a, b);
      const cmp = primary !== 0 ? primary : fallback(a, b);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [displayRows, searchQuery, documentStatusFilters, customFilterRows, matrixCellData, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryKey, searchQuery, documentStatusFilters, customFilterRows, sortKey, sortDirection, includeInactiveCompanies, withinTop20]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);


  // Compliance Overview: one KPI/chart summary per selected view, computed
  // once per company (not per document cell) so it stays cheap even at
  // ~1000+ companies. Reuses computeCompanyDocumentSummary's Current/
  // Expiring Soon/Expired rollup as the compliance bucket, same source of
  // truth the table below and the notification bell already use.
  // Per-doc attention is keyed off each company's own required document
  // list (not the page-level docColumns) so this stays correct in "All
  // Categories" view, where companies carry different document sets
  // (e.g. Foreign suppliers don't have GIS/DTI/Import Permit).
  const overview = useMemo(() => {
    let activeAccreditation = 0;
    let expiringSoonDocs = 0;
    let expiredDocs = 0;

    // Registry status reflects the persisted branch lifecycle label. The
    // compliance KPI below is calculated independently from required docs.
    const statusCounts: Record<string, number> = {};
    let brandedBranchTotal = 0;
    let compliantBranchTotal = 0;
    displayRows.forEach((row) => {
      if (!row.branch) return;
      brandedBranchTotal++;
      const status = row.branch.status ?? 'Not Set';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      if (isBranchDocumentCompliant(row.company, row.branch, effectiveNow)) compliantBranchTotal++;
    });

    const attentionStatuses: { documentName: string; status: DocumentStatus }[] = [];
    // Advanced-view breakdowns - only populated for expiry-bearing docs.
    const perDocStatus: Record<string, { current: number; expiringSoon: number; expiredOrForUpdate: number; total: number }> = {};
    const agingCounts: Record<string, number> = {};
    const upcoming: { company: string; doc: string; expiryDate: string; daysLeft: number }[] = [];

    categoryCompanies.forEach((c) => {
      const visibleBranches = (c.branches ?? []).filter((branch) => includeInactiveCompanies || branch.status !== 'Inactive');
      const summaryCompany = c.branches?.length ? { ...c, branches: visibleBranches } : c;
      const summary = computeCompanyDocumentSummary(summaryCompany, effectiveNow);
      if (c.accreditationStatus === 'Accredited') activeAccreditation++;
      expiringSoonDocs += summary.expiringSoonCount;
      expiredDocs += summary.expiredCount + summary.forUpdateCount;

      getRequiredDocumentKeys(c.type, c.supplierOrigin, c.businessClassification).filter(isExpiryDocument).forEach((docName) => {
        const branches = visibleBranches.length ? visibleBranches : [undefined];
        branches.forEach((branch) => {
          const doc: ComplianceDocument = (branch?.documents?.[docName] ?? {}) as ComplianceDocument;
          const { status, daysLeft } = computeDocumentStatus(doc, effectiveNow, docName);

          if (status === 'Expiring Soon' || status === 'Expired' || status === 'For Update') {
            attentionStatuses.push({ documentName: docName, status });
          }

          if (!perDocStatus[docName]) perDocStatus[docName] = { current: 0, expiringSoon: 0, expiredOrForUpdate: 0, total: 0 };
          perDocStatus[docName].total++;
          if (status === 'Current') perDocStatus[docName].current++;
          else if (status === 'Expiring Soon') perDocStatus[docName].expiringSoon++;
          else if (status === 'Expired' || status === 'For Update') perDocStatus[docName].expiredOrForUpdate++;

          if (typeof daysLeft === 'number') {
            const bucket = AGING_BUCKETS.find((b) => b.match(daysLeft));
            if (bucket) agingCounts[bucket.key] = (agingCounts[bucket.key] ?? 0) + 1;
          }

          if (status === 'Expiring Soon' && doc.expiryDate && typeof daysLeft === 'number') {
            upcoming.push({
              company: branch?.bpCode ? `${c.name} (${branch.bpCode})` : c.name,
              doc: docName,
              expiryDate: doc.expiryDate,
              daysLeft,
            });
          }
        });
      });
    });

    const complianceRate = brandedBranchTotal > 0 ? Math.round((compliantBranchTotal / brandedBranchTotal) * 100) : 0;

    const donutData = [...BRANCH_STATUS_OPTIONS, 'Not Set']
      .map((status) => ({ name: status, value: statusCounts[status] ?? 0, color: STATUS_CHART_COLORS[status] }))
      .filter((d) => d.value > 0);

    const barData = summarizeDocumentAttention(attentionStatuses)
      .map(({ documentName, expiringSoon, outdated, expired }) => ({
        doc: documentName,
        'Expiring Soon': expiringSoon,
        Outdated: outdated,
        Expired: expired,
      }));

    const docStatusTable = Object.entries(perDocStatus)
      .map(([docName, counts]) => ({ doc: docName, ...counts }))
      .sort((a, b) => a.doc.localeCompare(b.doc));

    const agingDocTotal = AGING_BUCKETS.reduce((sum, b) => sum + (agingCounts[b.key] ?? 0), 0);
    const agingTable = AGING_BUCKETS.map((b) => {
      const count = agingCounts[b.key] ?? 0;
      return { ...b, count, percent: agingDocTotal > 0 ? Math.round((count / agingDocTotal) * 100) : 0 };
    });

    const upcomingTable = upcoming.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10);

    return {
      total: categoryCompanies.length, activeAccreditation, expiringSoonDocs, expiredDocs, complianceRate, compliantBranchTotal, statusTotal: brandedBranchTotal,
      donutData, barData, docStatusTable, agingTable, upcomingTable,
    };
  }, [categoryCompanies, displayRows, effectiveNow, includeInactiveCompanies]);

  // Records today's compliance rate for whichever category is currently
  // being viewed - this is what actually builds the trend chart's history
  // over time. Revisiting the same day just overwrites that day's entry
  // (keeps it live if the underlying data changes) instead of duplicating.
  useEffect(() => {
    if (overview.statusTotal === 0) return;
    const historyKey = `document-compliance-v2:${categoryKey}`;
    setComplianceHistory((prev) => {
      const existing = prev[historyKey] ?? [];
      const last = existing[existing.length - 1];
      let nextList: ComplianceSnapshot[];
      if (last && last.date === currentDateStr) {
        if (last.rate === overview.complianceRate && last.total === overview.statusTotal) return prev;
        nextList = [...existing.slice(0, -1), { date: currentDateStr, rate: overview.complianceRate, total: overview.statusTotal }];
      } else {
        nextList = [...existing, { date: currentDateStr, rate: overview.complianceRate, total: overview.statusTotal }].slice(-COMPLIANCE_HISTORY_LIMIT);
      }
      const updated = { ...prev, [historyKey]: nextList };
      saveComplianceHistory(updated, historyKey);
      return updated;
    });
  }, [categoryKey, currentDateStr, overview.statusTotal, overview.complianceRate]);

  // Opens the renewal date picker directly - called either from a fresh
  // click on an expiry-doc cell's "Renew Document" button in the status
  // popup, or as a normal continuation once that popup is dismissed.
  const openRenewal = (company: PartnerCompany, branch: BranchRecord, docName: string) => {
    if (!canRenewDocuments) return;
    const doc = branch.documents?.[docName];
    const validityYears = maintenanceSettings.validityYears[docName as keyof DocumentMaintenanceSettings['validityYears']];
    const suggested = new Date(effectiveNow);
    if (!doc?.expiryDate && typeof validityYears === 'number') suggested.setFullYear(suggested.getFullYear() + validityYears);
    setRenewalDate(doc?.expiryDate || (Number.isFinite(suggested.getTime()) ? suggested.toISOString().slice(0, 10) : currentDateStr));
    setRenewalTarget({ company, branchId: branch.id, docName });
  };

  // Applies an explicit provided/not-provided value (never a blind flip) -
  // called only from the flag flow's step 2 Confirm button, once the user
  // has both picked a value in step 1 and confirmed the warning in step 2.
  const applyFlagChange = async (company: PartnerCompany, branch: BranchRecord, docName: string, provided: boolean) => {
    if (!canRenewDocuments) return;
    setMutationError('');
    try {
      await onRenewDocument(company.id, branch.id, docName, branch.documents?.[docName] ?? {}, { provided });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to update the compliance document.');
    }
  };

  // Opens step 1 of the flag flow (see flagFlow state above), pre-selecting
  // whichever value is already on record.
  const openFlagFlow = (company: PartnerCompany, branch: BranchRecord, docName: string) => {
    if (!canRenewDocuments) return;
    const currentProvided = !!branch.documents?.[docName]?.provided;
    setFlagFlow({ company, branch, docName, step: 'choose', currentProvided, selectedProvided: currentProvided });
  };

  // Opens the expiry-doc status popup (Active till.../Expired/Missing +
  // Renew Document/Mark as Missing) instead of jumping straight to the date
  // picker, so a click first shows what's on record before acting on it.
  const openExpiryStatus = (company: PartnerCompany, branch: BranchRecord, docName: string) => {
    if (!canRenewDocuments) return;
    setExpiryStatusTarget({ company, branch, docName, confirmingMissing: false, missingRemarks: branch.documents?.[docName]?.remarks ?? '' });
  };

  const updateDocumentRemarks = async (company: PartnerCompany, branch: BranchRecord, docName: string, remarks: string): Promise<string | void> => {
    if (!canRenewDocuments) return 'You do not have permission to update documents.';
    if (!onUpdateDocumentRemarks) return 'Document remarks are unavailable. Refresh and retry.';
    const currentDocument = branch.documents?.[docName] ?? {};
    const nextRemarks = remarks.trim();
    const validationError = companyDocumentRemarksError(company, docName, { provided: currentDocument.provided, remarks: nextRemarks, expiryDate: currentDocument.expiryDate });
    if (validationError) {
      setMutationError(validationError);
      return validationError;
    }
    setMutationError('');
    try {
      await onUpdateDocumentRemarks(company.id, branch.id, docName, currentDocument, nextRemarks);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save document remarks.';
      setMutationError(message);
      return message;
    }
  };

  const updateDocumentStatus = async (company: PartnerCompany, branch: BranchRecord, docName: string, provided: boolean, remarks = ''): Promise<string | void> => {
    if (!canRenewDocuments) return 'You do not have permission to update documents.';
    const currentDocument = branch.documents?.[docName] ?? {};
    // Persist a changed remark in its own narrowly scoped request first. This
    // keeps renewal/status RPCs limited to their existing allowed fields.
    const remarksToKeep = remarks.trim() || currentDocument.remarks || '';
    const validationError = companyDocumentRemarksError(company, docName, { provided, expiryDate: currentDocument.expiryDate, remarks: remarksToKeep });
    if (validationError) {
      setMutationError(validationError);
      return validationError;
    }
    setMutationError('');
    try {
      let expectedDocument = currentDocument;
      if (remarksToKeep !== (currentDocument.remarks ?? '')) {
        if (!onUpdateDocumentRemarks) return 'Document remarks are unavailable. Refresh and retry.';
        const updatedCompany = await onUpdateDocumentRemarks(company.id, branch.id, docName, currentDocument, remarksToKeep);
        expectedDocument = updatedCompany.branches?.find((candidate) => candidate.id === branch.id)?.documents?.[docName] ?? currentDocument;
      }
      await onRenewDocument(company.id, branch.id, docName, expectedDocument, {
        provided,
        ...(expectedDocument.expiryDate ? { expiryDate: expectedDocument.expiryDate } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update the compliance document.';
      setMutationError(message);
      return message;
    }
  };

  // Clears a document back to Missing (no expiry, not provided) - called
  // only from the expiry-doc status popup's "Mark as Missing" warning step,
  // once its own Confirm button is clicked.
  const markDocumentMissing = async (company: PartnerCompany, branch: BranchRecord, docName: string, remarks: string) => {
    if (!canRenewDocuments) return;
    await updateDocumentStatus(company, branch, docName, false, remarks);
  };

  const updateSupplierRank = (company: PartnerCompany, branch: BranchRecord, supplierRank: string) => {
    if (!isAdmin) return;
    const previousRank = branch.supplierRank || 'unset';
    const updatedBranches = (company.branches ?? []).map((b) =>
      b.id === branch.id ? { ...b, supplierRank } : b
    );
    onUpdateCompany({ ...company, branches: updatedBranches });
    logDocumentModification({
      actorEmail: currentUserEmail || 'unknown',
      category: viewLabel,
      companyName: branchAwareCompanyLabel(company, branch),
      docName: 'Supplier Rank',
      change: `Changed from ${previousRank} to ${supplierRank}`,
    });
  };

  const confirmRenewal = async () => {
    if (!renewalTarget || !renewalDate) return;
    const { company, branchId, docName } = renewalTarget;
    const branch = (company.branches ?? []).find((b) => b.id === branchId);
    if (!branch) {
      setMutationError('The selected branch no longer exists. Refresh and retry.');
      return;
    }
    setMutationError('');
    try {
      await onRenewDocument(
        company.id,
        branchId,
        docName,
        branch.documents?.[docName] ?? {},
        { provided: true, expiryDate: renewalDate },
      );
      // The server RPC writes the audit entry atomically with the document change.
      setRenewalTarget(null);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to renew the compliance document.');
    }
  };

  // Category-alert edits remain a draft until the maintenance workspace's
  // single Save action persists them with the global schedule and validity.
  const updateNotificationRule = (docName: string, updater: (rule: DocNotificationRule) => DocNotificationRule) => {
    setMaintenanceMessage('');
    setNotificationRules((prev) => {
      return prev.map((r) => (r.docName === docName ? updater(r) : r));
    });
  };

  const toggleNotificationRuleEnabled = (docName: string) =>
    updateNotificationRule(docName, (r) => ({ ...r, enabled: !r.enabled }));

  const addNotificationMilestone = (docName: string, days: number) =>
    updateNotificationRule(docName, (r) => ({
      ...r,
      earlyMilestoneDays: [...new Set([...r.earlyMilestoneDays, days])].sort((a, b) => b - a),
    }));

  const removeNotificationMilestone = (docName: string, days: number) =>
    updateNotificationRule(docName, (r) => ({
      ...r,
      earlyMilestoneDays: r.earlyMilestoneDays.filter((d) => d !== days),
    }));

  const handleRestoreDefaultNotifications = () => {
    setNotificationRules(DEFAULT_NOTIFICATION_RULES);
    setMaintenanceSettings(DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS);
    setShowRestoreMaintenance(false);
    setMaintenanceMessage('Defaults are staged. Save changes to apply them; existing expiry dates and reminder history are preserved.');
  };

  const addReminderInterval = () => {
    const days = Number(reminderIntervalDraft);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setMaintenanceMessage('Enter a whole number from 1 to 365 days.');
      return;
    }
    if (maintenanceSettings.reminderDays.includes(days)) {
      setMaintenanceMessage(`${days} days is already in the reminder schedule.`);
      return;
    }
    if (maintenanceSettings.reminderDays.length >= 20) {
      setMaintenanceMessage('The schedule can contain up to 20 reminder intervals.');
      return;
    }
    setMaintenanceSettings((settings) => ({ ...settings, reminderDays: [...settings.reminderDays, days].sort((a, b) => b - a) }));
    setReminderIntervalDraft('');
    setMaintenanceMessage('');
  };

  const hasUnsavedMaintenanceChanges = JSON.stringify(maintenanceSettings) !== JSON.stringify(savedMaintenanceSettings)
    || JSON.stringify(notificationRules) !== JSON.stringify(savedNotificationRules);

  const discardMaintenanceChanges = () => {
    setMaintenanceSettings(savedMaintenanceSettings);
    setNotificationRules(savedNotificationRules);
    setMaintenanceMessage('');
    setShowDiscardMaintenance(false);
    setIsNotificationSettingsOpen(false);
  };

  const requestCloseMaintenance = () => {
    if (isSavingMaintenance) return;
    if (showDiscardMaintenance || showRestoreMaintenance) {
      setShowDiscardMaintenance(false);
      setShowRestoreMaintenance(false);
      return;
    }
    if (hasUnsavedMaintenanceChanges) {
      setShowDiscardMaintenance(true);
      return;
    }
    setIsNotificationSettingsOpen(false);
  };

  useModalEscape(isNotificationSettingsOpen, requestCloseMaintenance, 50);

  useEffect(() => {
    if (!isNotificationSettingsOpen) return;
    const dialog = maintenanceDialogRef.current;
    if (!dialog) return;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    getFocusable()[0]?.focus({ preventScroll: true });
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = window.document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener('keydown', keepFocusInside);
    return () => dialog.removeEventListener('keydown', keepFocusInside);
  }, [isNotificationSettingsOpen]);

  const handleSaveMaintenanceSettings = async () => {
    const validationError = validateDocumentMaintenanceSettings(maintenanceSettings);
    if (validationError) {
      setMaintenanceMessage(validationError);
      return;
    }
    setIsSavingMaintenance(true);
    setMaintenanceMessage('');
    setShowDiscardMaintenance(false);
    const savedSettings = { ...maintenanceSettings, updatedBy: currentUserEmail || undefined };
    const maintenanceChanged = JSON.stringify(maintenanceSettings) !== JSON.stringify(savedMaintenanceSettings);
    const alertsChanged = JSON.stringify(notificationRules) !== JSON.stringify(savedNotificationRules);
    if (maintenanceChanged) {
      try {
        await saveDocumentMaintenanceSettings(savedSettings);
      } catch {
        setMaintenanceMessage('We couldn’t save the maintenance settings. Your edits are still here; check your connection and retry.');
        setIsSavingMaintenance(false);
        return;
      }
      setMaintenanceSettings(savedSettings);
      setSavedMaintenanceSettings(savedSettings);
    }
    if (alertsChanged) {
      try {
        await saveNotificationSettings(notificationRules);
      } catch {
        setMaintenanceMessage(maintenanceChanged
          ? 'Validity and reminder settings were saved, but category alerts were not. Your alert edits are still here; retry Save changes.'
          : 'We couldn’t save category alerts. Your edits are still here; check your connection and retry.');
        setIsSavingMaintenance(false);
        return;
      }
      setSavedNotificationRules(notificationRules);
    }
    setMaintenanceMessage('Changes saved. Existing expiry dates and reminder history were not changed.');
    setIsSavingMaintenance(false);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="admin-documents-page grid-cols-1 space-y-5">
      <PageDescription>Monitor partner compliance documents, track expiring or expired items, and send notifications to partners.</PageDescription>
      {mutationError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
          {mutationError}
        </div>
      )}
      {isAdmin && headerPortalTarget && createPortal(
        <button
          type="button"
          onClick={() => { setMaintenanceTab('schedule'); setMaintenanceMessage(''); setShowDiscardMaintenance(false); setShowRestoreMaintenance(false); setIsNotificationSettingsOpen(true); }}
          disabled={!isAdmin}
          title={!isAdmin ? 'Administrator access is required' : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white transition cursor-pointer shadow-sm"
        >
          <BellPlus size={14} />
          <span>Document Maintenance</span>
        </button>,
        headerPortalTarget
      )}

      <div className="document-category-filter sticky top-20 z-20 bg-white dark:bg-slate-950">
        <div role="group" aria-label="Filter document register by category" className="admin-tab-strip overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            aria-pressed={isAllView}
            onClick={() => selectCategory(ALL_KEY)}
            className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md py-2 px-4 text-xs font-bold transition-all duration-150 cursor-pointer ${
              isAllView
                ? 'bg-[#edf4f8] text-[#397da5] dark:bg-slate-800 dark:text-sky-300'
                : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <LayoutGrid size={12} />
            <span>All Categories</span>
          </button>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                aria-pressed={categoryKey === cat.key}
                onClick={() => selectCategory(cat.key)}
                className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md py-2 px-4 text-xs font-bold transition-all duration-150 cursor-pointer ${
                  categoryKey === cat.key
                    ? 'bg-[#edf4f8] text-[#397da5] dark:bg-slate-800 dark:text-sky-300'
                    : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={12} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {overview.total > 0 && (() => {
        const chartsToShow: ('compliance' | 'attention')[] = [];
        if (isWidgetVisible('chart-compliance')) chartsToShow.push('compliance');
        if (isWidgetVisible('chart-attention')) chartsToShow.push('attention');
        const chartsGridClass = chartsToShow.length === 2 ? 'grid grid-cols-1 lg:grid-cols-5 gap-4' : 'grid grid-cols-1 gap-4';

        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Compliance Overview</h3>
              </div>
              <div className="relative" ref={customizeRef}>
                <button
                  type="button"
                  onClick={() => setIsCustomizeOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white transition cursor-pointer shadow-sm"
                >
                  <Settings2 size={12} />
                  <span>Customize</span>
                </button>

                {isCustomizeOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-[calc(100vw-2rem)] max-w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Customize Overview</p>
                      <span className="text-[10px] text-slate-400">{viewLabel}</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-2">
                      <p className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">KPI Cards</p>
                      {OVERVIEW_WIDGETS.filter((w) => w.kind === 'kpi').map((w) => (
                        <label key={w.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/60 cursor-pointer text-xs text-slate-700 dark:text-slate-200">
                          <input type="checkbox" checked={isWidgetVisible(w.id)} onChange={() => toggleWidget(w.id)} className="rounded border-slate-300" />
                          <span>{w.label}</span>
                        </label>
                      ))}
                      <p className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Charts</p>
                      {OVERVIEW_WIDGETS.filter((w) => w.kind === 'chart').map((w) => (
                        <label key={w.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/60 cursor-pointer text-xs text-slate-700 dark:text-slate-200">
                          <input type="checkbox" checked={isWidgetVisible(w.id)} onChange={() => toggleWidget(w.id)} className="rounded border-slate-300" />
                          <span>{w.label}</span>
                        </label>
                      ))}
                      <p className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tables (Advanced)</p>
                      {OVERVIEW_WIDGETS.filter((w) => w.kind === 'table').map((w) => (
                        <label key={w.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/60 cursor-pointer text-xs text-slate-700 dark:text-slate-200">
                          <input type="checkbox" checked={isWidgetVisible(w.id)} onChange={() => toggleWidget(w.id)} className="rounded border-slate-300" />
                          <span>{w.label}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={restoreDefaultWidgets}
                      className="w-full flex items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-azure transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                    >
                      <RotateCcw size={12} />
                      <span>Restore Default for {viewLabel}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <details open={isAllView} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-600 marker:hidden hover:text-[#397da5] dark:border-slate-800 dark:text-slate-300 dark:hover:text-sky-300 [&::-webkit-details-marker]:hidden">
                <span>Overview metrics and compliance analysis</span>
                <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-5 pt-4">
            {(isWidgetVisible('kpi-total') || isWidgetVisible('kpi-accreditation') || isWidgetVisible('kpi-expiring') || isWidgetVisible('kpi-expired') || isWidgetVisible('kpi-rate')) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {isWidgetVisible('kpi-total') && <KpiCard icon={Users} label="Total Partners" value={overview.total} caption={viewLabel} accent="text-[#346f91]" />}
                {isWidgetVisible('kpi-accreditation') && <KpiCard icon={ShieldCheck} label="Active Accreditation" value={overview.activeAccreditation} caption="Accredited status" accent="text-[#397661]" />}
                {isWidgetVisible('kpi-expiring') && <KpiCard icon={Clock} label="Expiring ≤ 30 Days" value={overview.expiringSoonDocs} caption="Documents" accent="text-[#896a35]" />}
                {isWidgetVisible('kpi-expired') && <KpiCard icon={XCircle} label="Expired / For Update" value={overview.expiredDocs} caption="Documents" accent="text-[#a45655]" />}
                {isWidgetVisible('kpi-rate') && (
                  <KpiCard
                    icon={Gauge}
                    label="Document compliance"
                    value={`${overview.complianceRate}%`}
                    caption={`${overview.compliantBranchTotal} of ${overview.statusTotal} branches have all required documents current`}
                    accent={overview.complianceRate >= 90 ? 'text-[#397661]' : overview.complianceRate >= 70 ? 'text-[#896a35]' : 'text-[#a45655]'}
                  />
                )}
              </div>
            )}

            {chartsToShow.length > 0 && (
              <div className={chartsGridClass}>
                {isWidgetVisible('chart-compliance') && (
                  <div className={chartsToShow.length === 2 ? 'lg:col-span-2' : ''}>
                    <ChartCard title="Branch registry status" subtitle={viewLabel} contentClassName="min-h-[27rem] sm:h-80 sm:min-h-0">
                      {overview.donutData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          No companies in this view yet.
                        </div>
                      ) : (
                        <div
                          className="flex min-h-[27rem] min-w-0 flex-col items-center justify-center gap-4 sm:h-80 sm:min-h-0 sm:gap-3"
                          role="group"
                          aria-label={`${viewLabel} branch registry status breakdown`}
                        >
                          <div className="relative h-52 w-full min-w-0 max-w-sm shrink-0 -translate-y-2 sm:h-44 sm:-translate-y-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={overview.donutData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={isMobile ? 42 : 48}
                                  outerRadius={isMobile ? 78 : 88}
                                  paddingAngle={2}
                                  dataKey="value"
                                  nameKey="name"
                                  isAnimationActive={false}
                                  stroke="transparent"
                                >
                                  {overview.donutData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  position={{ x: isMobile ? 128 : 220, y: 4 }}
                                  contentStyle={{ fontSize: '11px', borderRadius: 10, border: '1px solid #e2e8f0' }}
                                  wrapperStyle={{ zIndex: 10, outline: 'none' }}
                                  formatter={(value, name) => {
                                    const count = typeof value === 'number' ? value : Number(value ?? 0);
                                    const percent = overview.statusTotal > 0 ? Math.round((count / overview.statusTotal) * 100) : 0;
                                    return [`${count} (${percent}%)`, String(name)];
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                              <span className="text-2xl font-semibold leading-none tabular-nums text-slate-900 dark:text-white">{overview.statusTotal}</span>
                              <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Branches</span>
                            </div>
                          </div>

                          <ul className="grid w-full min-w-0 max-w-2xl grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 sm:gap-y-1.5" aria-label="Status counts and percentages">
                            {overview.donutData.map((entry) => {
                              const percent = overview.statusTotal > 0 ? Math.round((entry.value / overview.statusTotal) * 100) : 0;
                              return (
                                <li key={entry.name} className="flex min-w-0 items-center gap-2 text-xs">
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                                  <span className="min-w-0 flex-1 truncate font-medium text-slate-600 dark:text-slate-300" title={entry.name}>{entry.name}</span>
                                  <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">
                                    {entry.value} <span className="font-medium text-slate-400">({percent}%)</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </ChartCard>
                  </div>
                )}
                {isWidgetVisible('chart-attention') && (
                  <div className={chartsToShow.length === 2 ? 'lg:col-span-3' : ''}>
                    <ChartCard title="Documents Needing Attention" subtitle="By document type" contentClassName="h-72 sm:h-80">
                      {overview.barData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          No documents need attention in this view.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={overview.barData} layout="vertical" margin={{ left: isMobile ? 0 : 8, right: isMobile ? 24 : 36 }} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-100 dark:stroke-slate-800" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                            <YAxis type="category" dataKey="doc" width={isMobile ? 76 : 110} tickFormatter={(value: string) => isMobile && value.length > 12 ? `${value.slice(0, 11)}…` : value} tick={{ fontSize: isMobile ? 9 : 11, fill: CHART_INK, fontWeight: 600 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: 10, border: '1px solid #e2e8f0' }} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                            <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" iconSize={8} />
                            <Bar dataKey="Expiring Soon" stackId="a" fill={CHART_EXPIRING} radius={[0, 0, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                              <LabelList dataKey="Expiring Soon" position="insideLeft" offset={4} formatter={(v) => (typeof v === 'number' && v > 0 ? v : '')} style={{ fontSize: isMobile ? 9 : 11, fill: CHART_INK, fontWeight: 700 }} />
                            </Bar>
                            <Bar dataKey="Outdated" stackId="a" fill={CHART_WARNING} radius={[0, 0, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                              <LabelList dataKey="Outdated" position="insideLeft" offset={4} formatter={(v) => (typeof v === 'number' && v > 0 ? v : '')} style={{ fontSize: isMobile ? 9 : 11, fill: CHART_INK, fontWeight: 700 }} />
                            </Bar>
                            <Bar dataKey="Expired" stackId="a" fill={CHART_CRITICAL} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                              <LabelList dataKey="Expired" position="right" formatter={(v) => (typeof v === 'number' && v > 0 ? v : '')} style={{ fontSize: 12, fill: CHART_INK, fontWeight: 700 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </ChartCard>
                  </div>
                )}
              </div>
            )}

            {isWidgetVisible('chart-trend') && (() => {
              const history = complianceHistory[`document-compliance-v2:${categoryKey}`] ?? [];
              return (
                <ChartCard title="Document compliance trend" subtitle={viewLabel} contentClassName="h-56">
                  {history.length < 2 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1">
                      <p className="text-xs text-slate-400">
                        {history.length === 0 ? 'No history recorded yet.' : `Only ${history.length} day of history recorded so far.`}
                      </p>
                      <p className="text-[10px] text-slate-400 max-w-xs">
                        This records a real snapshot of the compliance rate once per day you visit this category - it builds up from here, no invented numbers.
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={history} margin={{ top: 20, right: isMobile ? 4 : 16, left: isMobile ? -12 : 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-100 dark:stroke-slate-800" />
                        <XAxis dataKey="date" minTickGap={isMobile ? 24 : 8} tick={{ fontSize: isMobile ? 9 : 10, fill: '#94a3b8' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickFormatter={(d: string) => formatDate(d)} />
                        <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: isMobile ? 9 : 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={isMobile ? 34 : 40} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: 10, border: '1px solid #e2e8f0' }} labelFormatter={(d) => formatDate(String(d ?? ''))} formatter={(v) => [`${typeof v === 'number' ? v : 0}%`, 'Required documents current']} />
                        <Area type="monotone" dataKey="rate" stroke="none" fill={CHART_BRAND_TINT} fillOpacity={0.75} isAnimationActive={false} />
                        <Line type="monotone" dataKey="rate" stroke={CHART_BRAND} strokeWidth={2} dot={{ r: 4, fill: CHART_BRAND, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                          <LabelList dataKey="rate" position="top" formatter={(v) => `${typeof v === 'number' ? v : 0}%`} style={{ fontSize: 11, fontWeight: 700, fill: CHART_INK }} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              );
            })()}

            {(isWidgetVisible('table-doc-status') || isWidgetVisible('table-aging') || isWidgetVisible('table-upcoming') || isWidgetVisible('table-risk')) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isWidgetVisible('table-doc-status') && (
                  <ChartCard title="Document Status Summary" subtitle={viewLabel} contentClassName="max-h-64 overflow-y-auto">
                    {overview.docStatusTable.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">No expiry-bearing documents in this view.</p>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 pr-2">Document</th>
                            <th className="py-2 px-2 text-right">Current</th>
                            <th className="py-2 px-2 text-right text-[#896a35]">Expiring Soon</th>
                            <th className="py-2 px-2 text-right text-[#a45655]">Expired / For Update</th>
                            <th className="py-2 pl-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {overview.docStatusTable.map((row) => (
                            <tr key={row.doc} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="py-2 pr-2 font-semibold text-slate-700 dark:text-slate-200">{row.doc}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#397661]">{row.current}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#896a35]">{row.expiringSoon}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#a45655]">{row.expiredOrForUpdate}</td>
                              <td className="py-2 pl-2 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{row.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </ChartCard>
                )}

                {isWidgetVisible('table-aging') && (
                  <ChartCard title="Expiry Aging Summary" subtitle={viewLabel} contentClassName="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                          <th className="py-2 pr-2">Aging</th>
                          <th className="py-2 px-2">Status</th>
                          <th className="py-2 px-2 text-right">Count</th>
                          <th className="py-2 pl-2 text-right">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {overview.agingTable.map((row) => (
                          <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                            <td className="py-2 pr-2 font-semibold text-slate-700 dark:text-slate-200">{row.label}</td>
                            <td className="py-2 px-2">
                              <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold border ${STATUS_STYLES[row.status] ?? STATUS_STYLES.Current}`}>{row.status}</span>
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.count}</td>
                            <td className="py-2 pl-2 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{row.percent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ChartCard>
                )}

                {isWidgetVisible('table-upcoming') && (
                  <ChartCard title="Upcoming Expiries" subtitle="Next 30 days" contentClassName="max-h-64 overflow-y-auto">
                    {overview.upcomingTable.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">Nothing expiring in the next 30 days.</p>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 pr-2">Expiry Date</th>
                            <th className="py-2 px-2">Company</th>
                            <th className="py-2 px-2">Document</th>
                            <th className="py-2 pl-2 text-right">Days Left</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {overview.upcomingTable.map((row, i) => (
                            <tr key={`${row.company}-${row.doc}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="py-2 pr-2 text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatDate(row.expiryDate)}</td>
                              <td className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px]">{row.company}</td>
                              <td className="py-2 px-2 text-slate-600 dark:text-slate-300">{row.doc}</td>
                              <td className="py-2 pl-2 text-right tabular-nums font-bold text-[#896a35]">{row.daysLeft}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </ChartCard>
                )}

                {isWidgetVisible('table-risk') && (
                  <ChartCard title="Documents with Highest Expiry Risk" subtitle={viewLabel} contentClassName="max-h-64 overflow-y-auto">
                    {overview.barData.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">Nothing expiring or overdue in this view.</p>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 pr-2">Document</th>
                            <th className="py-2 px-2 text-right text-[#896a35]">Expiring Soon</th>
                            <th className="py-2 px-2 text-right text-[#896a35]">Outdated</th>
                            <th className="py-2 px-2 text-right text-[#a45655]">Expired</th>
                            <th className="py-2 pl-2 text-right">Total Risk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {overview.barData.map((row) => (
                            <tr key={row.doc} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="py-2 pr-2 font-semibold text-slate-700 dark:text-slate-200">{row.doc}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#896a35]">{row['Expiring Soon']}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#896a35]">{row.Outdated}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#a45655]">{row.Expired}</td>
                              <td className="py-2 pl-2 text-right tabular-nums font-bold text-slate-700 dark:text-slate-200">{row.Expired + row.Outdated + row['Expiring Soon']}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </ChartCard>
                )}
              </div>
            )}
              </div>
            </details>
          </div>
        );
      })()}

      <section className="space-y-4" aria-label="Document compliance workbench">
      {!isAllView && (
        <header className="flex flex-col gap-1 border-b border-slate-200 pb-3 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[#1c2f4b] dark:text-slate-100">{category.label} documents</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Review compliance and update document status for each partner.</p>
          </div>
        </header>
      )}
      {!isAllView && registryCategoryCompanies.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Search document tracker</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search company or BP code..." className="field !mt-0 w-full py-2.5 !pl-9 text-sm" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear document search"><X size={14} /></button>}</label>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
              <span className="whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">{rows.length} result{rows.length === 1 ? '' : 's'}</span>
              <div className="relative" ref={sortPopoverRef}
                onPointerEnter={(event) => { if (event.pointerType !== 'touch') { cancelSortMenuClose(); setIsSortPopoverOpen(true); } }}
                onPointerLeave={(event) => { if (event.pointerType !== 'touch') scheduleSortMenuClose(); }}>
                <button ref={sortTriggerRef} type="button" aria-label="Sort companies" title={`Sort by ${describeDocumentSort(sortKey)}, ${sortDirection === 'asc' ? 'ascending' : 'descending'}`} aria-haspopup="menu" aria-expanded={isSortPopoverOpen} aria-controls="document-sort-popover" onClick={() => { setIsFilterPopoverOpen(false); cancelSortMenuClose(); setIsSortPopoverOpen((open) => !open); }} onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setIsFilterPopoverOpen(false);
                    setIsSortPopoverOpen(true);
                    requestAnimationFrame(() => sortPopoverRef.current?.querySelector<HTMLButtonElement>('[data-sort-selected="true"]')?.focus());
                  }
                }} className={`inline-flex h-9 w-9 items-center justify-center rounded-md border focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] ${isSortPopoverOpen ? 'border-[#8bbbd7] bg-[#eff6fa] text-[#155f8b]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}`}>
                  <ArrowDownUp size={16} aria-hidden="true" />
                </button>
                {isSortPopoverOpen && <div id="document-sort-popover" role="menu" aria-label="Sort document register" onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
                  const currentIndex = items.indexOf(event.target as HTMLButtonElement);
                  if (currentIndex < 0 || items.length === 0) return;
                  event.preventDefault();
                  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[nextIndex].focus();
                }} className="absolute right-0 top-full z-50 mt-1 max-h-[min(70vh,32rem)] w-max min-w-48 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900">
                  <div role="group" aria-label="Sort field">
                  {[
                    { value: 'company', label: 'Company' },
                    { value: 'compliance', label: 'Compliance' },
                    { value: 'bpCode', label: 'BP Code' },
                    { value: 'ntType', label: 'Trade/Non-Trade' },
                    { value: 'branchStatus', label: 'Branch Status' },
                    { value: 'supplierRank', label: 'Supplier Rank' },
                    ...docColumns.map((docName) => ({ value: `doc:${docName}`, label: docName })),
                  ].map((option) => {
                    const selected = sortKey === option.value;
                    return <button key={option.value} type="button" role="menuitemradio" aria-checked={selected} data-sort-selected={selected || undefined} onClick={() => { setSortKey(option.value); setIsSortPopoverOpen(false); }} className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] ${selected ? 'font-semibold text-[#155f8b] dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{selected && <Check size={13} aria-hidden="true" />}</span><span className="truncate">{option.label}</span>
                    </button>;
                  })}
                  </div>
                  <div role="separator" className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
                  <div role="group" aria-label="Sort direction">
                  {(['asc', 'desc'] as const).map((direction) => {
                    const selected = sortDirection === direction;
                    return <button key={direction} type="button" role="menuitemradio" aria-checked={selected} data-sort-selected={selected || undefined} onClick={() => { setSortDirection(direction); setIsSortPopoverOpen(false); }} className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] ${selected ? 'font-semibold text-[#155f8b] dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{selected && <Check size={13} aria-hidden="true" />}</span>{direction === 'asc' ? 'Ascending' : 'Descending'}
                    </button>;
                  })}
                  </div>
                </div>}
              </div>
              <div className="relative" ref={filterPopoverRef}>
                <button ref={filterTriggerRef} type="button" aria-label="Filter documents" title="Filter documents" aria-haspopup="dialog" aria-expanded={isFilterPopoverOpen} aria-controls="document-filter-popover" onClick={() => { if (isFilterPopoverOpen) { setIsMoreFiltersOpen(false); cancelMoreFiltersClose(); } setIsSortPopoverOpen(false); setIsFilterPopoverOpen(!isFilterPopoverOpen); }} className="admin-directory-icon-trigger">
                  <Filter size={16} aria-hidden="true" />
                  {hasAppliedFilters && <span className="admin-directory-active-dot" aria-hidden="true" />}
                </button>
                {isFilterPopoverOpen && <div id="document-filter-popover" role="dialog" aria-label="Document filters" className="absolute right-0 top-full z-40 mt-2 max-h-[min(75vh,40rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-slate-800"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Filter documents</h3>{hasAppliedFilters && <button type="button" onClick={clearAppliedFilters} className="text-xs font-medium text-[#176b9a] hover:underline dark:text-sky-300">Clear all</button>}</div>
                  <div className="space-y-3 p-3">
                    {isAdmin && <label className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs ${withinTop20 ? 'bg-[#eff6fa] text-[#155f8b] dark:bg-sky-950/30 dark:text-sky-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                      <input type="checkbox" checked={withinTop20} onChange={(event) => { setWithinTop20(event.target.checked); setExpandedRowKey(null); }} className="rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]" />
                      <span>Within Top 20</span>
                    </label>}
                    {isAdmin && <label className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs ${includeInactiveCompanies ? 'bg-[#eff6fa] text-[#155f8b] dark:bg-sky-950/30 dark:text-sky-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                      <input type="checkbox" checked={includeInactiveCompanies} onChange={(event) => { setIncludeInactiveCompanies(event.target.checked); setExpandedRowKey(null); }} className="rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]" />
                      <span>Include inactive companies</span>
                    </label>}
                    <fieldset><legend className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Document status</legend><div className="grid grid-cols-2 gap-1.5">
                      {DOCUMENT_STATUS_FILTER_OPTIONS.map((option) => <label key={option.value} className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs ${documentStatusFilters.includes(option.value) ? 'bg-[#eff6fa] text-[#155f8b] dark:bg-sky-950/30 dark:text-sky-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                        <input type="checkbox" checked={documentStatusFilters.includes(option.value)} onChange={() => toggleDocumentStatusFilter(option.value)} className="rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]" />
                        <span className={`h-2 w-2 shrink-0 rounded-full ${DOCUMENT_STATUS_DOTS[option.value]}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">{option.label}</span><span className="tabular-nums text-slate-500">{documentStatusCounts[option.value]}</span>
                      </label>)}
                    </div></fieldset>
                    {isAdmin && <div className="border-t border-slate-100 pt-2.5 dark:border-slate-800"
                      onPointerEnter={(event) => { if (event.pointerType !== 'touch') { cancelMoreFiltersClose(); setIsMoreFiltersOpen(true); } }}
                      onPointerLeave={(event) => { if (event.pointerType !== 'touch') scheduleMoreFiltersClose(); }}>
                      <button type="button" aria-expanded={isMoreFiltersOpen} aria-controls="document-more-filters" onClick={() => { cancelMoreFiltersClose(); setIsMoreFiltersOpen((open) => !open); }} className="flex min-h-7 w-full items-center gap-1.5 text-left text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:text-slate-200">
                        <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform duration-150 ${isMoreFiltersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                        <span>More filters{customFilterRows.some((row) => row.value.trim()) ? ` (${customFilterRows.filter((row) => row.value.trim()).length} active)` : ''}</span>
                      </button>
                      <div className={`grid transition-[grid-template-rows,opacity] duration-150 motion-reduce:transition-none ${isMoreFiltersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div id="document-more-filters" ref={(node) => {
                        if (!node) return;
                        if (isMoreFiltersOpen) node.removeAttribute('inert');
                        else node.setAttribute('inert', '');
                      }} aria-hidden={!isMoreFiltersOpen} className="min-h-0 overflow-hidden">
                      <div className="mt-2.5">
                      {customFilterRows.length > 0 && <div className="mb-2 flex items-center justify-end"><button type="button" onClick={() => setCustomFilterRows([])} className="text-xs text-[#176b9a] dark:text-sky-300">Clear advanced</button></div>}
                      {customFilterRows.map((row) => { const field = FILTERABLE_FIELDS.find((candidate) => candidate.key === row.field) ?? FILTERABLE_FIELDS[0]; return <div key={row.id} className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><div className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate text-xs font-medium text-slate-700">{field.label}</span><select value={row.condition} onChange={(event) => updateFilterRow(row.id, { condition: event.target.value as FilterCondition })} className="field !mt-0 min-w-0 flex-1 py-2 text-xs" aria-label="Filter condition">{getConditionsForField(field).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="button" onClick={() => removeFilterRow(row.id)} aria-label="Remove condition" className="h-9 w-9 rounded text-slate-500 hover:bg-slate-100"><X size={15} /></button></div><div className="col-span-2 flex gap-2">{field.type === 'select' ? <select value={row.value} onChange={(event) => updateFilterRow(row.id, { value: event.target.value })} className="field !mt-0 min-w-0 flex-1 py-2 text-xs" aria-label="Filter value"><option value="">Select value</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type === 'number' ? 'number' : 'text'} value={row.value} onChange={(event) => updateFilterRow(row.id, { value: event.target.value })} placeholder={field.placeholder ?? 'Enter value…'} className="field !mt-0 min-w-0 flex-1 py-2 text-xs" aria-label="Filter value" />}{field.unit && <span className="self-center text-xs text-slate-500">{field.unit}</span>}</div></div>; })}
                      <div className="flex flex-wrap gap-1.5">{FILTERABLE_FIELDS.map((field) => <button key={field.key} type="button" onClick={() => addFilterRow(field.key)} className="inline-flex min-h-7 items-center gap-1 rounded border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Plus size={12} />{field.label}</button>)}</div>
                      </div>
                      </div>
                      </div>
                    </div>}
                  </div></div>}
              </div>
            </div>
          </div>
          {hasActiveTableState && <div className="admin-directory-active-filters" aria-label="Active filters">
            {searchQuery.trim() && <button type="button" onClick={() => setSearchQuery('')} aria-label="Remove search filter" title={`Search: ${searchQuery.trim()}`} className="admin-directory-filter-chip"><span className="break-words">Search: {searchQuery.trim()}</span><X size={12} aria-hidden="true" /></button>}
            {withinTop20 && <button type="button" onClick={() => { setWithinTop20(false); setExpandedRowKey(null); }} aria-label="Remove Within Top 20 filter" className="admin-directory-filter-chip"><span>Within Top 20</span><X size={12} aria-hidden="true" /></button>}
            {includeInactiveCompanies && <button type="button" onClick={() => { setIncludeInactiveCompanies(false); setExpandedRowKey(null); }} aria-label="Stop including inactive companies" className="admin-directory-filter-chip"><span>Including inactive</span><X size={12} aria-hidden="true" /></button>}
            {documentStatusFilters.map((status) => {
              const label = DOCUMENT_STATUS_FILTER_OPTIONS.find((option) => option.value === status)?.label ?? status;
              return <button key={status} type="button" onClick={() => setDocumentStatusFilters((current) => current.filter((item) => item !== status))} aria-label={`Remove document status filter: ${label}`} className="admin-directory-filter-chip"><span>Document status: {label}</span><X size={12} aria-hidden="true" /></button>;
            })}
            {customFilterRows.filter((row) => row.value.trim()).map((row) => <button key={row.id} type="button" onClick={() => removeFilterRow(row.id)} aria-label={`Remove filter: ${describeFilterRow(row)}`} title={describeFilterRow(row)} className="admin-directory-filter-chip"><span className="break-words">{describeFilterRow(row)}</span><X size={12} aria-hidden="true" /></button>)}
            {(sortKey !== 'company' || sortDirection !== 'asc') && <button type="button" onClick={() => { setSortKey('company'); setSortDirection('asc'); }} aria-label="Remove sort" className="admin-directory-filter-chip"><span>Sort: {describeDocumentSort(sortKey)} ({sortDirection === 'asc' ? 'Ascending' : 'Descending'})</span><X size={12} aria-hidden="true" /></button>}
            <button type="button" onClick={resetFiltersAndSort} className="admin-directory-reset-button ml-auto">Reset</button>
          </div>}
        </div>
      )}

      {isAllView ? (
        <div className="panel py-20 text-center text-slate-400">
          <LayoutGrid size={48} className="mx-auto mb-3 opacity-30 text-slate-300" />
          <p className="text-sm font-semibold">Choose a partner category above to review its company compliance list.</p>
          <p className="text-xs mt-1">Local, Foreign, Courier, and Subcontractor each have different document requirements.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="panel py-20 text-center text-slate-400">
          <Package size={48} className="mx-auto mb-3 opacity-30 text-slate-300" />
          <p className="text-sm font-semibold">
            {!includeInactiveCompanies && registryCategoryCompanies.length > 0 && !searchQuery.trim() && documentStatusFilters.length === 0 && !customFilterRows.some((row) => row.value.trim())
              ? `No active ${category.label} companies found.`
              : hasAppliedFilters ? 'No records match the current filters.' : `No ${category.label} companies found.`}
          </p>
          {hasAppliedFilters && (
            <button
              type="button"
              onClick={clearAppliedFilters}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white"
            >
              <RotateCcw size={12} />
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2" aria-label="Partner compliance list">
          <div role="group" aria-label="Partner compliance column headings" className={`hidden items-center px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 xl:grid ${DOCUMENT_LIST_GRID_COLUMNS}`}>
            <div className="xl:col-start-1">Company</div>
            <div className="xl:col-start-2">Type</div>
            <div className="xl:col-start-3">Supplier rank</div>
            <div className="xl:col-start-4">Compliance</div>
            <div className="xl:col-start-5">Branch status</div>
            <div className="xl:col-start-6">Attention</div>
          </div>
          {paginatedRows.map((row) => {
            const cells = matrixCellData.get(row.key) ?? [];
            const currentCount = cells.filter((cell) => cell.status === 'Current').length;
            const expiredCount = cells.filter((cell) => cell.status === 'Expired').length;
            const expiringCount = cells.filter((cell) => cell.status === 'Expiring Soon').length;
            const updateCount = cells.filter((cell) => cell.status === 'For Update').length;
            const missingCount = cells.filter((cell) => cell.status === 'Missing').length;
            const requiredAttention = { missing: missingCount, expired: expiredCount, forUpdate: updateCount };
            const classificationRequired = row.company.type !== 'Uncategorized' && !(row.company.type === 'Supplier' && row.company.supplierOrigin === 'Foreign') && !row.company.businessClassification;
            const needsAttention = expiredCount + expiringCount + updateCount + missingCount + Number(classificationRequired);
            const isExpanded = expandedRowKey === row.key;
            const canFilterRequiredDocuments = isAdmin && categoryKey === 'supplier-local';
            const requiredStatusFilter = canFilterRequiredDocuments ? requiredDocumentStatus : null;
            const typeLabel = row.company.type === 'Supplier'
              ? (row.isNT ? 'Non-Trade' : 'Trade')
              : row.company.type;
            const groups = [
              { label: 'Required documents', isRequired: true, documents: requiredStatusFilter ? cells.filter(cell => cell.status === requiredStatusFilter) : cells },
              { label: 'Historical & additional', isRequired: false, documents: Object.entries(row.branch?.documents ?? {})
                .filter(([name]) => !cells.some((cell) => cell.docName === name))
                .map(([docName, doc]) => ({ docName, doc, branch: row.branch, expiryBased: isExpiryDocument(docName),
                  inactiveClassification: ['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)'].includes(docName)
                    && ((docName === 'DTI (Sole)' && row.company.businessClassification !== 'SOL')
                      || (docName !== 'DTI (Sole)' && row.company.businessClassification !== 'CORP')),
                  ...computeDocumentStatus(doc, effectiveNow, docName) })) },
            ].filter((group) => group.isRequired || (!requiredStatusFilter && group.documents.length > 0));
            return (
              <article key={row.key} className="rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.025] dark:border-slate-800 dark:bg-slate-950">
                  <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-2 sm:px-4 sm:py-3 xl:min-h-[72px] xl:gap-y-0 ${DOCUMENT_LIST_GRID_COLUMNS}`}>
                  <div className="col-start-1 row-start-1 min-w-0 xl:col-auto xl:row-auto">
                    <button type="button" title={row.company.name} aria-label={`${isExpanded ? 'Hide' : 'Review'} documents for ${row.company.name}${row.branch?.bpCode ? ` (${row.branch.bpCode})` : ''}`} aria-expanded={isExpanded} aria-controls={isExpanded ? 'documents-' + row.key : undefined}
                      onClick={() => { cancelRowExpandHover(); setExpandedRowKey(isExpanded ? null : row.key); }}
                      className="block w-full cursor-pointer break-words rounded-sm text-left text-sm !font-bold leading-5 text-[#1c2f4b] hover:text-[#176fae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:text-slate-100 dark:hover:text-sky-300 xl:truncate">{row.company.name}</button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 xl:flex-nowrap">
                      <span className="whitespace-nowrap font-mono">{row.branch?.bpCode || 'No BP Code'}</span>
                      {row.isSplit && <span className="whitespace-nowrap">{row.isNT ? 'Non-Trade branch' : 'Trade branch'}</span>}
                    </div>
                  </div>
                  <div className="col-start-1 row-start-2 flex min-w-0 items-center xl:col-start-2 xl:row-auto">
                    <span className={`${DOCUMENT_ROW_BADGE_CLASS} whitespace-nowrap ${documentPartnerTypeBadgeClasses(row.company.type, row.isNT)}`}>{typeLabel}</span>
                  </div>
                  <div className="col-start-2 row-start-2 flex min-w-0 items-center xl:col-start-3 xl:row-auto">
                    {row.branch && (isAdmin ? (
                      <SupplierRankSelect label={`Supplier rank for ${row.branch.bpCode || row.company.name}`} value={row.branch.supplierRank || SUPPLIER_RANK_OPTIONS[0]} onChange={(rank) => updateSupplierRank(row.company, row.branch!, rank)} />
                    ) : <span className={'inline-flex h-8 items-center text-xs font-semibold ' + supplierRankTextClasses(row.branch.supplierRank)}>{row.branch.supplierRank || 'Not set'}</span>)}
                  </div>
                  <div className="col-start-1 row-start-3 min-w-0 xl:col-start-4 xl:row-auto">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{currentCount}/{cells.length} current</span>
                      <span className="text-slate-400">{cells.length ? Math.round(currentCount / cells.length * 100) : 0}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cells.length ? Math.round(currentCount / cells.length * 100) : 0} aria-label={currentCount + ' of ' + cells.length + ' required documents current'}>
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: (cells.length ? currentCount / cells.length * 100 : 0) + '%' }} />
                    </div>
                  </div>
                  <div className="col-start-2 row-start-3 min-w-0 xl:col-start-5 xl:row-auto">
                    {row.branch?.status ? (
                      <span aria-label={`Branch status: ${row.branch.status}`} className={`${DOCUMENT_ROW_BADGE_CLASS} ${branchStatusBadgeClasses(row.branch.status)}`}>
                        {row.branch.status}
                      </span>
                    ) : (
                      <span className={`${DOCUMENT_ROW_BADGE_CLASS} border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400`}>
                        Not set
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 row-start-4 flex min-h-12 min-w-0 flex-col items-start justify-center gap-y-1 text-xs xl:col-span-1 xl:col-start-6 xl:row-auto" aria-label={needsAttention + ' compliance items need attention'}>
                    {needsAttention === 0 ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-emerald-700 dark:text-emerald-400"><Check size={14} /> All current</span>
                    ) : (
                      <>
                        {classificationRequired && (
                          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium text-[#536b80] dark:text-slate-300">
                            <CircleAlert size={12} strokeWidth={1.8} aria-hidden="true" />
                            Classification needed
                          </span>
                        )}
                        {(expiredCount > 0 || expiringCount > 0 || updateCount > 0 || missingCount > 0) && (
                          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                            {expiredCount > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-rose-700 dark:text-rose-300">
                                <AlertTriangle size={12} strokeWidth={1.8} aria-hidden="true" />
                                <strong className="font-semibold tabular-nums">{expiredCount}</strong>
                                <span className="font-normal">expired</span>
                              </span>
                            )}
                            {expiringCount > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-amber-700 dark:text-amber-300">
                                <Clock size={12} strokeWidth={1.8} aria-hidden="true" />
                                <strong className="font-semibold tabular-nums">{expiringCount}</strong>
                                <span className="font-normal">expiring</span>
                              </span>
                            )}
                            {updateCount > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-amber-700 dark:text-amber-300">
                                <RefreshCw size={12} strokeWidth={1.8} aria-hidden="true" />
                                <strong className="font-semibold tabular-nums">{updateCount}</strong>
                                <span className="font-normal">for update</span>
                              </span>
                            )}
                            {missingCount > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-rose-600 dark:text-rose-300">
                                <XCircle size={12} strokeWidth={1.8} aria-hidden="true" />
                                <strong className="font-semibold tabular-nums">{missingCount}</strong>
                                <span className="font-normal">missing</span>
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <button type="button" aria-label={`${isExpanded ? 'Hide' : 'Review'} documents for ${row.company.name}${row.branch?.bpCode ? ` (${row.branch.bpCode})` : ''}`} title={isExpanded ? 'Hide documents' : 'Review documents'} aria-expanded={isExpanded} aria-controls={isExpanded ? 'documents-' + row.key : undefined}
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'touch' || isExpanded) return;
                      cancelRowExpandHover();
                      rowExpandHoverTimerRef.current = window.setTimeout(() => {
                        setExpandedRowKey(row.key);
                        rowExpandHoverTimerRef.current = null;
                      }, 1000);
                    }}
                    onPointerLeave={cancelRowExpandHover}
                    onClick={() => { cancelRowExpandHover(); setExpandedRowKey(isExpanded ? null : row.key); }}
                    className="col-start-2 row-start-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-[#346f91] hover:bg-[#346f91]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#346f91] dark:text-sky-300 dark:hover:bg-sky-400/10 xl:col-start-7 xl:row-auto">
                    <ChevronRight size={17} className={'transition-transform duration-150 ' + (isExpanded ? 'rotate-90' : '')} aria-hidden="true" />
                  </button>
                </div>
                {isExpanded && (
                  <div id={'documents-' + row.key} className="rounded-b-lg border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
                    {classificationRequired && (
                      <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                        CORP/SOL is not set. GIS, SEC, and DTI history remains available below; set classification in Partner details to activate the applicable requirements.
                      </p>
                    )}
                    <RequiredDocumentAttention counts={requiredAttention} value={requiredStatusFilter}
                      onChange={canFilterRequiredDocuments ? (status) => { setRequiredDocumentStatus(status); setOpenDocumentPopoverKey(null); } : undefined} />
                    <div className="grid gap-x-8 gap-y-5 xl:grid-cols-2">
                      {groups.map((group) => (
                        <section key={group.label} aria-label={group.label} className="min-w-0">
                          <h3 className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{group.label}<span className="ml-1.5 font-normal text-slate-400">{group.documents.length}{group.isRequired && requiredStatusFilter ? ` / ${cells.length}` : ''}</span></h3>
                          {group.documents.length === 0 && <p role="status" className="py-3 text-xs text-slate-500 dark:text-slate-400">No {requiredStatusFilter?.toLowerCase()} required documents.</p>}
                          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                            {group.documents.map(({ docName, status, daysLeft, doc, branch, expiryBased, inactiveClassification }) => {
                              const Icon = DOCUMENT_STATUS_ICONS[status];
                              const dateLine = getCellDateLine(status, doc.expiryDate, daysLeft);
                              const interactive = canRenewDocuments && !!branch;
                              const statusColor = status === 'Missing' ? 'text-rose-700 dark:text-rose-300' : status === 'Expired' ? 'text-rose-800 dark:text-rose-200' : status === 'For Update' || status === 'Expiring Soon' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300';
                              const statusAccent = status === 'Missing' ? 'border-l-2 border-l-rose-300 dark:border-l-rose-800' : status === 'Expired' ? 'border-l-2 border-l-rose-500 dark:border-l-rose-700' : status === 'For Update' ? 'border-l-2 border-l-amber-300 dark:border-l-amber-800' : '';
                              const canDeleteRemarks = !companyDocumentRemarksError(row.company, docName, { provided: doc.provided, expiryDate: doc.expiryDate, remarks: '' });
                              return (
                                <li key={docName} className={`flex min-h-[76px] min-w-0 items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950 ${statusAccent}`}>
                                  <div className="min-w-0 flex-1">
                                    <div className="break-words text-xs font-medium text-slate-800 dark:text-slate-200">{docName}</div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                                      <span className={`inline-flex items-center gap-1 font-medium ${statusColor}`}><Icon size={11} strokeWidth={2.3} aria-hidden="true" />{status}</span>
                                      {dateLine && <span className="text-slate-500 dark:text-slate-400">{dateLine}</span>}
                                      {inactiveClassification && <span className="text-slate-500 dark:text-slate-400">Historical · classification inactive</span>}
                                    </div>
                                  </div>
                                  <DocumentQuickActions docName={docName} document={doc} status={status} disabled={!interactive || Boolean(inactiveClassification)} canDeleteRemarks={canDeleteRemarks} expiryBased={expiryBased}
                                    remarksAtBottom={categoryKey === 'supplier-local'}
                                    popoverKey={`${row.key}::${docName}`} openPopoverKey={openDocumentPopoverKey} onOpenPopover={setOpenDocumentPopoverKey}
                                    requireRemarks={['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)'].includes(docName)}
                                    onRenew={() => { if (branch) openExpiryStatus(row.company, branch, docName); }}
                                    onStatus={(provided, remarks) => branch ? updateDocumentStatus(row.company, branch, docName, provided, remarks) : Promise.resolve('Branch no longer exists. Refresh and retry.')}
                                    onRemarks={(remarks) => branch ? updateDocumentRemarks(row.company, branch, docName, remarks) : Promise.resolve('Branch no longer exists. Refresh and retry.')}
                                    onClearRemarks={() => branch ? updateDocumentRemarks(row.company, branch, docName, '') : Promise.resolve('Branch no longer exists. Refresh and retry.')} />
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          <Pagination page={currentPage} pageSize={pageSize} totalItems={rows.length}
            onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            ariaLabel="Document tracker pagination" className="bg-white px-4 dark:bg-slate-950" />
        </div>
      )}

      </section>

      <ChartCard
        title="Modification History"
        subtitle="Every flag toggle and renewal made from this register, most recent first"
        contentClassName="max-h-80 overflow-y-auto"
        action={<History size={16} className="text-slate-300 dark:text-slate-600" />}
      >
        {modificationLog.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No modifications recorded yet.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-950">
                <th className="py-2 pr-2">Date &amp; Time</th>
                <th className="py-2 px-2">User</th>
                <th className="py-2 px-2">Category</th>
                <th className="py-2 px-2">Company</th>
                <th className="py-2 px-2">Document</th>
                <th className="py-2 pl-2">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {modificationLog.slice(0, 50).map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                  <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{formatTimestamp(entry.timestamp)}</td>
                  <td className="py-2 px-2 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{entry.actorEmail}</td>
                  <td className="py-2 px-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{entry.category}</td>
                  <td className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">{entry.companyName}</td>
                  <td className="py-2 px-2 text-slate-600 dark:text-slate-300">{entry.docName}</td>
                  <td className="py-2 pl-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{entry.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>

      {/* Flag docs (no expiry) - step 1: explicit Missing/Complete chooser, pre-selected
          to whatever's currently on record. Confirm here is disabled until the selection
          actually differs from the current value, then advances to step 2 below. */}
      {flagFlow && flagFlow.step === 'choose' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950 relative">
            <button
              onClick={() => setFlagFlow(null)}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              type="button"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Set Document Status</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-100">"{flagFlow.docName}"</strong> for{' '}
                <strong className="text-slate-800 dark:text-slate-100">"{branchAwareCompanyLabel(flagFlow.company, flagFlow.branch)}"</strong>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFlagFlow((prev) => (prev ? { ...prev, selectedProvided: false } : prev))}
                className={`rounded-xl border-2 px-3 py-3 text-center transition cursor-pointer ${
                  !flagFlow.selectedProvided
                    ? 'border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
                }`}
              >
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">Missing</span>
              </button>
              <button
                type="button"
                onClick={() => setFlagFlow((prev) => (prev ? { ...prev, selectedProvided: true } : prev))}
                className={`rounded-xl border-2 px-3 py-3 text-center transition cursor-pointer ${
                  flagFlow.selectedProvided
                    ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
                }`}
              >
                <span className={`block text-xs font-bold ${flagFlow.selectedProvided ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>Complete</span>
              </button>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => setFlagFlow(null)} className="secondary-button flex-1 py-2 text-xs" type="button">
                Cancel
              </button>
              <button
                onClick={() => setFlagFlow((prev) => (prev ? { ...prev, step: 'confirm' } : prev))}
                disabled={flagFlow.selectedProvided === flagFlow.currentProvided}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2187CD] hover:bg-[#2187CD]/90 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                type="button"
              >
                <span>Confirm</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Flag docs - step 2: the actual warning, unchanged from before except it now
          reflects the explicit value picked in step 1. Only this Confirm button applies
          the change and logs it to Modification History. */}
      {flagFlow && flagFlow.step === 'confirm' && (() => {
        const willBeProvided = flagFlow.selectedProvided;
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950 relative">
              <button
                onClick={() => setFlagFlow(null)}
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
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{flagFlow.docName}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{branchAwareCompanyLabel(flagFlow.company, flagFlow.branch)}</span>
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
                <button onClick={() => setFlagFlow(null)} className="secondary-button flex-1 py-2 text-xs" type="button">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    applyFlagChange(flagFlow.company, flagFlow.branch, flagFlow.docName, flagFlow.selectedProvided);
                    setFlagFlow(null);
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

      {/* Expiry docs (AFS, GIS, etc.) - status readout (Active till.../Expired/Missing,
          same status logic as the matrix cells) with Renew Document (always available)
          and Mark as Missing (only when there's something on record to clear). Mark as
          Missing flips this same popup into its own warning step before it applies. */}
      {expiryStatusTarget && (() => {
        const doc: ComplianceDocument = (expiryStatusTarget.branch.documents?.[expiryStatusTarget.docName] ?? {}) as ComplianceDocument;
        const { status } = computeDocumentStatus(doc, effectiveNow, expiryStatusTarget.docName);
        const isMissing = status === 'Missing';
        const isActive = status === 'Current' || status === 'Expiring Soon';
        const missingRemarkRequired = Boolean(companyDocumentRemarksError(expiryStatusTarget.company, expiryStatusTarget.docName, { provided: false, expiryDate: doc.expiryDate, remarks: expiryStatusTarget.missingRemarks }));
        const statusText = isMissing ? 'Missing' : isActive ? `Active till ${formatShortDate(doc.expiryDate)}` : status === 'For Update' ? 'For Update' : 'Expired';
        const statusStyle = isMissing ? STATUS_STYLES.Missing : status === 'For Update' ? STATUS_STYLES['For Update'] : isActive ? STATUS_STYLES.Current : STATUS_STYLES.Expired;

        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950 relative">
              <button
                onClick={() => setExpiryStatusTarget(null)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
                type="button"
              >
                <X size={16} />
              </button>

              {!expiryStatusTarget.confirmingMissing ? (
                <>
                  <div className="flex flex-col items-center text-center gap-1.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{expiryStatusTarget.docName}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {branchAwareCompanyLabel(expiryStatusTarget.company, expiryStatusTarget.branch)}
                    </p>
                  </div>

                  <div className="mt-4 flex justify-center">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${statusStyle}`}>
                      {statusText}
                    </span>
                  </div>

                  {['DTI (Sole)', 'GIS (Corp)', 'SEC (Corp)'].includes(expiryStatusTarget.docName)
                    && !(expiryStatusTarget.company.type === 'Supplier' && expiryStatusTarget.company.supplierOrigin === 'Foreign')
                    && ((expiryStatusTarget.docName === 'DTI (Sole)' && expiryStatusTarget.company.businessClassification === 'SOL')
                      || (expiryStatusTarget.docName !== 'DTI (Sole)' && expiryStatusTarget.company.businessClassification === 'CORP')) && !isMissing && (
                    <label className="mt-4 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      Remarks <span className="text-rose-600">Required if marked missing</span>
                      <textarea value={expiryStatusTarget.missingRemarks} maxLength={2000}
                        onChange={(event) => setExpiryStatusTarget((current) => current ? { ...current, missingRemarks: event.target.value } : current)}
                        rows={2} placeholder="Why is this document not provided?" className="field mt-1 resize-y py-1.5 text-xs" />
                    </label>
                  )}

                  <div className="flex flex-col gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        openRenewal(expiryStatusTarget.company, expiryStatusTarget.branch, expiryStatusTarget.docName);
                        setExpiryStatusTarget(null);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>Renew Document</span>
                    </button>
                    <button
                      type="button"
                      disabled={isMissing || missingRemarkRequired}
                      onClick={() => {
                        if (missingRemarkRequired) return;
                        void markDocumentMissing(expiryStatusTarget.company, expiryStatusTarget.branch, expiryStatusTarget.docName, expiryStatusTarget.missingRemarks);
                        setExpiryStatusTarget(null);
                      }}
                      title={isMissing ? 'Already marked as missing' : missingRemarkRequired ? 'Add required remarks first' : undefined}
                      aria-label={`Mark ${expiryStatusTarget.docName} as missing`}
                      aria-disabled={missingRemarkRequired}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent px-4 py-2.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900 transition cursor-pointer"
                    >
                      <XCircle size={13} />
                      <span>Mark as Missing</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center gap-2.5">
                    <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-amber-50 text-[#a16207] dark:bg-amber-950/40 dark:text-amber-400">
                      <AlertTriangle size={18} />
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Confirm Mark as Missing</h3>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document</span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{expiryStatusTarget.docName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right truncate">{branchAwareCompanyLabel(expiryStatusTarget.company, expiryStatusTarget.branch)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New Status</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${STATUS_STYLES.Missing}`}>
                        Missing
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-center text-[11px] text-slate-400">This marks the document as missing and retains its recorded expiry for history.</p>

                  <div className="flex items-center gap-2 mt-5">
                    <button onClick={() => setExpiryStatusTarget(null)} className="secondary-button flex-1 py-2 text-xs" type="button">
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        markDocumentMissing(expiryStatusTarget.company, expiryStatusTarget.branch, expiryStatusTarget.docName, expiryStatusTarget.missingRemarks);
                        setExpiryStatusTarget(null);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#a16207] hover:bg-amber-800 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                      type="button"
                    >
                      <Check size={13} />
                      <span>Confirm</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Simple renewal date picker */}
      {renewalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-transparent dark:bg-slate-950 relative">
            <button
              onClick={() => setRenewalTarget(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              type="button"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-2.5 text-emerald-600 mb-1">
              <RefreshCw size={20} />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Renew Document</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              <strong className="text-slate-800 dark:text-slate-100">"{renewalTarget.docName}"</strong> for{' '}
              <strong className="text-slate-800 dark:text-slate-100">
                "{branchAwareCompanyLabel(renewalTarget.company, (renewalTarget.company.branches ?? []).find((b) => b.id === renewalTarget.branchId))}"
              </strong>
            </p>
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-[#a16207] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>This immediately updates the company's compliance record. Double-check the date before confirming.</span>
            </div>
            <label htmlFor="doc-register-renewal-date" className="field-label text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              New Expiry Date
            </label>
            {(() => {
              const branch = (renewalTarget.company.branches ?? []).find((item) => item.id === renewalTarget.branchId);
              const currentExpiry = branch?.documents?.[renewalTarget.docName]?.expiryDate;
              const years = maintenanceSettings.validityYears[renewalTarget.docName as keyof DocumentMaintenanceSettings['validityYears']];
              return !currentExpiry && typeof years === 'number' ? (
                <p className="mb-1 text-[10px] text-slate-400">Suggested from the configured {years}-year period. You can adjust this date.</p>
              ) : null;
            })()}
            <input
              id="doc-register-renewal-date"
              type="date"
              className="field text-sm py-2"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
              autoFocus
            />
            <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button onClick={() => setRenewalTarget(null)} className="secondary-button py-2 px-4 text-xs" type="button">
                Cancel
              </button>
              <button
                onClick={confirmRenewal}
                disabled={!renewalDate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                type="button"
              >
                <Check size={14} />
                <span>Confirm Renewal</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Content-sized maintenance dialog; the validity list gets a bounded
          scroll area only when the viewport cannot show the full table. */}
      {isNotificationSettingsOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 backdrop-blur-[2px] sm:p-4">
          <div ref={maintenanceDialogRef} role="dialog" aria-modal="true" aria-labelledby="document-maintenance-title" tabIndex={-1}
            className="flex max-h-[calc(100dvh-16px)] w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:max-h-[min(760px,calc(100dvh-32px))]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2187CD]/10 text-[#176fae] dark:text-sky-300"><CalendarClock size={17} /></span>
                <div className="min-w-0">
                  <h2 id="document-maintenance-title" className="text-base font-bold text-slate-900 dark:text-white">Document maintenance</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Validity rules and expiry reminders</p>
                </div>
                {hasUnsavedMaintenanceChanges && <span className="hidden rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 sm:inline-flex dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">Unsaved changes</span>}
              </div>
              <button type="button" onClick={requestCloseMaintenance} disabled={isSavingMaintenance}
                aria-label="Close document maintenance" title="Close"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:opacity-50 sm:h-9 sm:w-9 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                <X size={18} />
              </button>
            </header>

            <nav aria-label="Document maintenance settings" className="flex shrink-0 flex-wrap gap-1 border-b border-slate-200 px-3 dark:border-slate-800 sm:px-5">
              {([
                ['schedule', 'Reminder schedule'],
                ['validity', 'Validity periods'],
                ['category', 'Category alerts'],
              ] as const).map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setMaintenanceTab(tab)} disabled={isSavingMaintenance} aria-current={maintenanceTab === tab ? 'page' : undefined}
                  className={'min-h-11 shrink-0 border-b-2 px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:cursor-wait disabled:opacity-60 ' + (maintenanceTab === tab ? 'border-[#2187CD] text-[#176fae] dark:text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')}>
                  {label}
                </button>
              ))}
            </nav>

            <main aria-busy={isSavingMaintenance} className={'min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 ' + (maintenanceTab === 'validity' ? 'max-h-[min(56dvh,540px)]' : '')}>
              <fieldset disabled={isSavingMaintenance} className="contents">
              {maintenanceLoadState === 'loading' && (
                <div aria-busy="true" className="mx-auto max-w-4xl space-y-3">
                  <div className="h-5 w-52 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  <div className="h-28 animate-pulse rounded-md bg-slate-50 dark:bg-slate-900" />
                  <div className="h-44 animate-pulse rounded-md bg-slate-50 dark:bg-slate-900" />
                  <p className="text-xs text-slate-500">Loading saved maintenance settings…</p>
                </div>
              )}
              {maintenanceLoadState === 'error' && (
                <div role="alert" className="mx-auto flex max-w-xl items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-300">
                  <CircleAlert size={17} className="mt-0.5 shrink-0" />
                  <div className="flex-1"><p className="font-semibold">Maintenance settings could not be loaded.</p><p className="mt-1 text-xs">Your saved settings are unchanged. Retry to load them before editing.</p></div>
                  <button type="button" onClick={() => setMaintenanceReloadKey((key) => key + 1)} className="rounded px-2 py-1 text-xs font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">Retry</button>
                </div>
              )}
              {maintenanceLoadState === 'ready' && maintenanceTab === 'schedule' && (
                <section className="mx-auto max-w-4xl" aria-labelledby="global-reminders-heading">
                  <div className="mb-4">
                    <h3 id="global-reminders-heading" className="text-lg font-semibold text-slate-900 dark:text-white">Global reminder schedule</h3>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Applies to renewable documents with a saved expiry date. Delivery is recorded once per document, expiry date, and interval.</p>
                  </div>
                  <div className="grid gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">One-time reminders</h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose the days before expiry for an additional reminder.</p>
                      <div className="mt-4 flex flex-wrap gap-2" aria-label="Reminder interval presets">
                        {[90, 60, 30, 14, 7].map((days) => {
                          const selected = maintenanceSettings.reminderDays.includes(days);
                          return <button key={days} type="button" aria-pressed={selected}
                            onClick={() => setMaintenanceSettings((settings) => {
                              if (!selected && settings.reminderDays.length >= 20) { setMaintenanceMessage('The schedule can contain up to 20 reminder intervals.'); return settings; }
                              setMaintenanceMessage('');
                              return { ...settings, reminderDays: selected ? settings.reminderDays.filter((day) => day !== days) : [...settings.reminderDays, days].sort((a, b) => b - a) };
                            })}
                            className={'min-h-11 rounded-md border px-3 text-xs font-semibold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] sm:min-h-9 ' + (selected ? 'border-[#2187CD]/40 bg-[#2187CD]/10 text-[#176fae] dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900')}>
                            {days} days{selected ? ' · on' : ''}
                          </button>;
                        })}
                      </div>
                      <div className="mt-4 flex max-w-sm items-end gap-2">
                        <label htmlFor="custom-reminder-interval" className="min-w-0 flex-1 text-xs font-medium text-slate-700 dark:text-slate-300">Add another interval <span className="font-normal text-slate-500">(1–365 days)</span>
                          <input id="custom-reminder-interval" type="number" min={1} max={365} step={1} inputMode="numeric" value={reminderIntervalDraft}
                            onChange={(event) => { setReminderIntervalDraft(event.target.value); setMaintenanceMessage(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addReminderInterval(); } }}
                            className="field mt-1.5 h-11 text-base sm:h-10 sm:text-sm" placeholder="Days before expiry" />
                        </label>
                        <button type="button" onClick={addReminderInterval} className="secondary-button h-11 shrink-0 px-3 text-xs sm:h-10">Add interval</button>
                      </div>
                      {maintenanceSettings.reminderDays.filter((days) => ![90, 60, 30, 14, 7].includes(days)).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label="Custom reminder intervals">
                          {maintenanceSettings.reminderDays.filter((days) => ![90, 60, 30, 14, 7].includes(days)).map((days) => (
                            <span key={days} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              {days} days
                              <button type="button" aria-label={`Remove ${days}-day reminder`} onClick={() => setMaintenanceSettings((settings) => ({ ...settings, reminderDays: settings.reminderDays.filter((day) => day !== days) }))} className="ml-1 rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:hover:bg-slate-800 dark:hover:text-rose-300"><X size={12} /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="border-t border-slate-200 pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0 dark:border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Daily reminders near expiry</h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Send a reminder every day during the final part of the expiry window.</p>
                      <label htmlFor="daily-reminder-window" className="mt-4 block text-xs font-medium text-slate-700 dark:text-slate-300">Start daily reminders
                        <span className="mt-1.5 flex max-w-xs items-center gap-2">
                          <input id="daily-reminder-window" type="number" min={1} max={90} step={1} inputMode="numeric" value={maintenanceSettings.dailyFinalDays}
                            onChange={(event) => { setMaintenanceMessage(''); setMaintenanceSettings((settings) => ({ ...settings, dailyFinalDays: Number(event.target.value) })); }}
                            className="field h-11 w-24 text-base tabular-nums sm:h-10 sm:text-sm" />
                          <span className="text-xs text-slate-500">days before expiry</span>
                        </span>
                      </label>
                      <p className="mt-4 rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300">If a one-time reminder lands within this daily window, it is delivered once that day.</p>
                    </div>
                  </div>
                </section>
              )}
              {maintenanceLoadState === 'ready' && maintenanceTab === 'validity' && (
                <section className="mx-auto max-w-4xl" aria-labelledby="validity-periods-heading">
                  <div className="mb-4">
                    <h3 id="validity-periods-heading" className="text-lg font-semibold text-slate-900 dark:text-white">Document validity periods</h3>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Configure the default duration used when a new expiry date is entered. Existing partner expiry dates are unchanged.</p>
                  </div>
                  <div className="mb-2 grid grid-cols-[minmax(0,1fr)_10rem] gap-3 border-b border-slate-200 pb-2 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <span>Document</span><span>Validity period</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MAINTENANCE_DOCUMENTS.map((docName) => {
                      const years = maintenanceSettings.validityYears[docName];
                      return <div key={docName} className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-3 py-2.5">
                        <label htmlFor={`validity-${docName}`} className="min-w-0 text-sm font-medium text-slate-800 dark:text-slate-200">{docName}</label>
                        <span className="flex items-center gap-2">
                          <input id={`validity-${docName}`} type="number" min={1} max={50} step={1} inputMode="numeric" placeholder="Not set"
                            aria-label={`${docName} validity in years`} value={years ?? ''}
                            onChange={(event) => { setMaintenanceMessage(''); setMaintenanceSettings((settings) => ({ ...settings, validityYears: { ...settings.validityYears, [docName]: event.target.value ? Number(event.target.value) : null } })); }}
                            className="field h-9 w-24 text-sm tabular-nums" />
                          <span className="text-xs text-slate-500">years</span>
                        </span>
                      </div>;
                    })}
                  </div>
                </section>
              )}
              {maintenanceLoadState === 'ready' && maintenanceTab === 'category' && (
                <section className="mx-auto max-w-5xl" aria-labelledby="category-alerts-heading">
                  <div className="mb-5">
                    <h3 id="category-alerts-heading" className="text-lg font-semibold text-slate-900 dark:text-white">Category-specific early alerts</h3>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">These optional alerts run in addition to the global schedule. The standard 30-day, daily-window, and expired reminders remain active.</p>
                  </div>
                  <div className="grid gap-x-8 md:grid-cols-2">
                    <div>
                      <h4 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">Local suppliers</h4>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {notificationRules.filter((rule) => rule.origin === 'Local').map((rule) => <NotificationRuleRow key={rule.docName} rule={rule} onToggle={toggleNotificationRuleEnabled} onAdd={addNotificationMilestone} onRemove={removeNotificationMilestone} />)}
                      </div>
                    </div>
                    <div>
                      <h4 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">Foreign suppliers</h4>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {notificationRules.filter((rule) => rule.origin === 'Foreign').map((rule) => <NotificationRuleRow key={rule.docName} rule={rule} onToggle={toggleNotificationRuleEnabled} onAdd={addNotificationMilestone} onRemove={removeNotificationMilestone} />)}
                      </div>
                    </div>
                    {notificationRules.some((rule) => rule.origin === 'Both') && (
                      <div className="mt-6 md:col-span-2">
                        <h4 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">Both supplier types</h4>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {notificationRules.filter((rule) => rule.origin === 'Both').map((rule) => <NotificationRuleRow key={rule.docName} rule={rule} onToggle={toggleNotificationRuleEnabled} onAdd={addNotificationMilestone} onRemove={removeNotificationMilestone} />)}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {maintenanceLoadState === 'ready' && maintenanceMessage && (
                <p role={maintenanceMessage.startsWith('Changes saved') ? 'status' : 'alert'} aria-live="polite" className={'mx-auto mt-6 max-w-4xl text-xs ' + (maintenanceMessage.startsWith('Changes saved') || maintenanceMessage.startsWith('Defaults are staged') ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-300')}>
                  {maintenanceMessage}
                </p>
              )}
              </fieldset>
            </main>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
              {showDiscardMaintenance ? (
                <div role="alertdialog" aria-label="Discard unsaved maintenance changes" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Discard unsaved changes? They have not been applied.</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowDiscardMaintenance(false)} className="secondary-button px-3 py-2 text-xs">Keep editing</button>
                    <button type="button" onClick={discardMaintenanceChanges} className="rounded-md bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">Discard changes</button>
                  </div>
                </div>
              ) : showRestoreMaintenance ? (
                <div role="alertdialog" aria-label="Restore maintenance defaults" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-2xl text-xs leading-relaxed text-slate-700 dark:text-slate-300">Restore 60- and 30-day reminders, daily reminders for the final 30 days, unset validity periods, and default category alerts? Save changes to apply. Existing expiry dates and reminder history stay intact.</p>
                  <div className="flex shrink-0 justify-end gap-2">
                    <button type="button" onClick={() => setShowRestoreMaintenance(false)} className="secondary-button px-3 py-2 text-xs">Cancel</button>
                    <button type="button" onClick={handleRestoreDefaultNotifications} className="rounded-md bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">Restore defaults</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={() => setShowRestoreMaintenance(true)} disabled={maintenanceLoadState !== 'ready' || isSavingMaintenance}
                    className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:opacity-50 sm:min-h-9 dark:text-slate-300 dark:hover:bg-slate-800">
                    <RotateCcw size={13} /> Restore defaults
                  </button>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={requestCloseMaintenance} disabled={isSavingMaintenance} className="secondary-button min-h-11 px-4 text-xs sm:min-h-9">Close</button>
                    <button type="button" onClick={() => void handleSaveMaintenanceSettings()} disabled={maintenanceLoadState !== 'ready' || !hasUnsavedMaintenanceChanges || isSavingMaintenance}
                      className="primary-button inline-flex min-h-11 min-w-32 items-center justify-center gap-2 px-4 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9">
                      {isSavingMaintenance && <RefreshCw size={13} className="animate-spin" />}
                      {isSavingMaintenance ? 'Saving changes…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              )}
            </footer>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function DocumentQuickActions({
  docName,
  document,
  status,
  popoverKey,
  openPopoverKey,
  onOpenPopover,
  disabled,
  canDeleteRemarks,
  expiryBased,
  requireRemarks,
  remarksAtBottom = false,
  onRenew,
  onStatus,
  onRemarks,
  onClearRemarks,
}: {
  docName: string;
  document: ComplianceDocument;
  status: DocumentStatus;
  popoverKey: string;
  openPopoverKey: string | null;
  onOpenPopover: (key: string | null) => void;
  disabled: boolean;
  canDeleteRemarks: boolean;
  expiryBased: boolean;
  requireRemarks: boolean;
  remarksAtBottom?: boolean;
  onRenew: () => void;
  onStatus: (provided: boolean, remarks: string) => Promise<string | void>;
  onRemarks: (remarks: string) => Promise<string | void>;
  onClearRemarks: () => Promise<string | void>;
}) {
  const [remarks, setRemarks] = useState(document.remarks ?? '');
  const [isRemarksOpen, setIsRemarksOpen] = useState(false);
  const [isViewingRemarks, setIsViewingRemarks] = useState(false);
  const [confirmingRemarkDelete, setConfirmingRemarkDelete] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const isOpen = openPopoverKey === popoverKey;
  const setIsOpen = (open: boolean) => onOpenPopover(open ? popoverKey : openPopoverKey === popoverKey ? null : openPopoverKey);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const remarkTriggerRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const remarkContentRef = useRef<HTMLParagraphElement>(null);
  const canEditRemark = !disabled;
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoverClose = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  };
  const scheduleHoverClose = () => {
    clearHoverClose();
    hoverCloseTimer.current = setTimeout(() => { setIsOpen(false); setIsRemarksOpen(false); setIsViewingRemarks(false); setConfirmingRemarkDelete(false); }, 180);
  };
  useEffect(() => {
    if (!isRemarksOpen) setRemarks(document.remarks ?? '');
  }, [document.remarks, isRemarksOpen]);

  useEffect(() => {
    if (isOpen && isViewingRemarks) remarkContentRef.current?.focus();
  }, [isOpen, isViewingRemarks]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const positionPanel = () => {
      const trigger = anchorRef.current ?? triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const left = Math.max(12, Math.min(window.innerWidth - panelRect.width - 12, triggerRect.right - panelRect.width));
      const below = triggerRect.bottom + 8;
      const top = below + panelRect.height <= window.innerHeight - 12
        ? below
        : Math.max(12, triggerRect.top - panelRect.height - 8);
      setPosition({ top, left });
    };
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [isOpen, isRemarksOpen, isViewingRemarks, error, feedback, saving]);

  useEffect(() => {
    if (!isOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !remarkTriggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
        setIsRemarksOpen(false);
        setIsViewingRemarks(false);
        setConfirmingRemarkDelete(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      setIsRemarksOpen(false);
      setIsViewingRemarks(false);
      setConfirmingRemarkDelete(false);
      (anchorRef.current ?? triggerRef.current)?.focus();
    };
    window.document.addEventListener('pointerdown', dismissOutside);
    window.document.addEventListener('keydown', dismissOnEscape);
    return () => {
      clearHoverClose();
      window.document.removeEventListener('pointerdown', dismissOutside);
      window.document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [isOpen]);

  useEffect(() => () => clearHoverClose(), []);

  const submit = async (provided: boolean) => {
    if (!provided && requireRemarks && !remarks.trim()) {
      setIsRemarksOpen(true);
      setError('Remarks are required when this document is not provided.');
      return false;
    }
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const failure = await onStatus(provided, remarks);
      if (typeof failure === 'string') {
        setError(failure);
        return false;
      }
      setFeedback('Saved');
      return true;
    } finally {
      setSaving(false);
    }
  };

  const saveRemarks = async () => {
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const failure = await onRemarks(remarks);
      if (typeof failure === 'string') {
        setError(failure);
        return;
      }
      setFeedback('Saved');
    } finally {
      setSaving(false);
    }
  };

  const deleteRemark = async () => {
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const failure = await onClearRemarks();
      if (typeof failure === 'string') {
        setError(failure);
        setConfirmingRemarkDelete(false);
        return;
      }
      setIsOpen(false);
      setIsViewingRemarks(false);
      setConfirmingRemarkDelete(false);
      triggerRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <button ref={triggerRef} type="button" disabled={disabled} onMouseEnter={() => { clearHoverClose(); anchorRef.current = triggerRef.current; setIsViewingRemarks(false); setIsRemarksOpen(false); setIsOpen(true); }} onClick={() => { anchorRef.current = triggerRef.current; setIsViewingRemarks(false); setIsRemarksOpen(false); setIsOpen(true); setPosition(null); }} aria-haspopup="menu" aria-expanded={isOpen && !isViewingRemarks && !isRemarksOpen} aria-label={`Actions for ${docName}`} title={`Actions for ${docName}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#176fae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800">
      <MoreHorizontal size={17} aria-hidden="true" />
    </button>
  );
  return (
    <div className={remarksAtBottom ? 'flex shrink-0 flex-col items-end justify-between gap-1 self-stretch' : 'flex max-w-[min(18rem,55vw)] shrink-0 items-start gap-0.5'} onMouseEnter={clearHoverClose} onMouseLeave={scheduleHoverClose}>
      {remarksAtBottom && trigger}
      {document.remarks?.trim() && <button ref={remarkTriggerRef} type="button" onClick={() => { anchorRef.current = remarkTriggerRef.current; setRemarks(document.remarks ?? ''); setIsRemarksOpen(false); setIsViewingRemarks(true); setConfirmingRemarkDelete(false); setError(''); setFeedback(''); setIsOpen(true); setPosition(null); }} aria-label={`View admin remarks for ${docName}`} title="View remarks" aria-haspopup="dialog" aria-expanded={isOpen && isViewingRemarks} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#536b80] hover:bg-slate-100 hover:text-[#176fae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:text-slate-400 dark:hover:bg-slate-800"><MessageSquareText size={15} aria-hidden="true" /></button>}
      {!remarksAtBottom && trigger}
      {isOpen && createPortal(
        <div ref={panelRef} role={isViewingRemarks ? 'dialog' : isRemarksOpen ? 'group' : 'menu'} aria-label={isViewingRemarks ? 'Saved document remark' : isRemarksOpen ? 'Edit document remarks' : 'Document actions'} onMouseEnter={clearHoverClose} onMouseLeave={scheduleHoverClose} className="fixed z-[180] max-h-[calc(100vh-24px)] w-[min(16rem,calc(100vw-24px))] overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-950" style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}>
          {isViewingRemarks ? <div className="p-2">
            <div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-800 dark:text-slate-100">Admin Remarks</span><button type="button" onClick={() => { setIsOpen(false); setIsViewingRemarks(false); (anchorRef.current ?? triggerRef.current)?.focus(); }} className="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:hover:bg-slate-800">Close</button></div>
            <p ref={remarkContentRef} tabIndex={-1} className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700 [overflow-wrap:anywhere] focus:outline-none dark:text-slate-200">{document.remarks}</p>
            {error && <p role="alert" className="mt-2 text-[11px] text-rose-700 dark:text-rose-300">{error}</p>}
            {confirmingRemarkDelete ? <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Delete this saved remark?</p>
              <div className="mt-1.5 flex justify-end gap-1.5">
                <button type="button" disabled={saving} onClick={() => setConfirmingRemarkDelete(false)} className="rounded px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                <button type="button" disabled={saving} onClick={() => void deleteRemark()} className="rounded px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30">{saving ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div> : <div className="mt-2 flex justify-end gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              {canEditRemark && <button type="button" onClick={() => { setRemarks(document.remarks ?? ''); setIsViewingRemarks(false); setIsRemarksOpen(true); setError(''); setFeedback(''); }} className="rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Edit</button>}
              {canEditRemark && <button type="button" disabled={!canDeleteRemarks || saving} title={!canDeleteRemarks ? 'Remarks are required while this document is missing.' : undefined} onClick={() => setConfirmingRemarkDelete(true)} className="rounded px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45 dark:text-rose-300 dark:hover:bg-rose-950/30">Delete</button>}
            </div>}
          </div> : isRemarksOpen ? <div className="p-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Admin Remarks{requireRemarks && <span className="ml-1 text-rose-600">Required when missing</span>}
              <textarea autoFocus value={remarks} maxLength={2000} onChange={(event) => { setRemarks(event.target.value); setFeedback(''); setError(''); }} rows={4} placeholder={requireRemarks ? 'Reason this document is missing' : 'Add an admin remark'} className="field mt-1.5 resize-y py-2 text-xs leading-5" />
            </label>
            {error && <p role="alert" className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-300">{error}</p>}
            {feedback && <p role="status" className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">{feedback}</p>}
            <div className="mt-2 flex justify-end gap-1.5">
              <button type="button" disabled={saving} onClick={() => { setRemarks(document.remarks ?? ''); setIsRemarksOpen(false); setError(''); setFeedback(''); }} className="rounded px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
              <button type="button" disabled={saving || remarks === (document.remarks ?? '')} onClick={() => void saveRemarks()} className="rounded bg-[#2187CD] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#176fae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2187CD] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div> : <>
            {document.provided === true && status !== 'Missing' && <button role="menuitem" type="button" disabled={saving} onClick={() => void submit(false)} className="flex min-h-9 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30"><XCircle size={15} aria-hidden="true" />Mark missing</button>}
            {!expiryBased && document.provided !== true && <button role="menuitem" type="button" disabled={saving} onClick={() => void submit(true)} className="flex min-h-9 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"><Check size={15} aria-hidden="true" />Mark provided</button>}
            <button role="menuitem" type="button" onClick={() => { setIsRemarksOpen(true); setError(''); setFeedback(''); }} className="flex min-h-9 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:text-slate-200 dark:hover:bg-slate-800"><FilePlus2 size={15} aria-hidden="true" />{document.remarks ? 'Edit remarks' : 'Add remarks'}</button>
            {expiryBased && <>
              <div role="separator" className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button role="menuitem" type="button" disabled={saving} onClick={() => { setIsOpen(false); onRenew(); }} className="flex min-h-9 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw size={15} aria-hidden="true" />{status === 'Missing' ? 'Add document or expiry' : status === 'Expired' || status === 'For Update' ? 'Renew or update expiry' : 'Renew / set expiry'}</button>
            </>}
            {error && <p role="alert" className="px-2.5 py-1 text-[11px] text-rose-700 dark:text-rose-300">{error}</p>}
            {feedback && <p role="status" className="px-2.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">{feedback}</p>}
          </>}
        </div>,
        window.document.body,
      )}
    </div>
  );
}

// Every column header in the detail matrix uses this - clicking sorts the
// rows by that column (see handleSortClick/rows' comparator), with a chevron
// marking the active key and its direction.
function SortHeaderButton({
  label,
  sortKeyValue,
  activeKey,
  direction,
  onClick,
  labelClassName,
}: {
  label: string;
  sortKeyValue: string;
  activeKey: string;
  direction: 'asc' | 'desc';
  onClick: (key: string) => void;
  labelClassName?: string;
}) {
  const active = activeKey === sortKeyValue;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKeyValue)}
      title={`Sort by ${label}`}
      className={`group flex w-full items-center gap-1 cursor-pointer text-left transition ${
        active ? 'text-slate-700 dark:text-slate-200' : 'hover:text-slate-600 dark:hover:text-slate-300'
      }`}
    >
      <span className={labelClassName ?? 'truncate'}>{label}</span>
      {active ? (
        direction === 'asc' ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />
      ) : (
        <ChevronUp size={11} className="shrink-0 opacity-0 group-hover:opacity-40" />
      )}
    </button>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  caption,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  caption: string;
  accent: string;
}) {
  return (
    <section className="panel !shadow-none border-slate-100 dark:border-slate-800/80">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</h3>
        <span className={`inline-flex items-center justify-center rounded-lg bg-current/10 p-1.5 ${accent}`}>
          <Icon size={14} />
        </span>
      </div>
      <span className="mt-2 block break-words text-2xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums dark:text-white sm:text-[28px]">{value}</span>
      <span className={`mt-2 block text-[11px] font-medium ${accent}`}>{caption}</span>
    </section>
  );
}

function LegendSwatch({ swatchClass, label }: { swatchClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
      <span className={`h-3 w-3 rounded border ${swatchClass}`} />
      <span>{label}</span>
    </span>
  );
}

// Compact per-document controls for optional category-level early alerts.
function NotificationRuleRow({
  rule,
  onToggle,
  onAdd,
  onRemove,
}: {
  rule: DocNotificationRule;
  onToggle: (docName: string) => void;
  onAdd: (docName: string, days: number) => void;
  onRemove: (docName: string, days: number) => void;
}) {
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{rule.label}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{rule.note}</p>
        </div>
        {rule.mode === 'day-milestones' && (
          <label className="inline-flex min-h-9 shrink-0 cursor-pointer select-none items-center gap-2 rounded px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-within:outline focus-within:outline-2 focus-within:outline-[#2187CD] dark:text-slate-300 dark:hover:bg-slate-900">
            <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule.docName)} aria-label={`Enable extra early alerts for ${rule.label}`} className="rounded border-slate-300 text-[#2187CD] focus:ring-[#2187CD]" />
            Extra early alerts
          </label>
        )}
      </div>
      {rule.mode === 'fiscal-year' ? (
        <span className="mt-2 inline-flex text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Fiscal-year based - no day milestone
        </span>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {rule.enabled &&
            rule.earlyMilestoneDays.map((days) => (
              <span
                key={days}
                className="inline-flex min-h-7 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold tabular-nums text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {days}d before
                <button type="button" aria-label={`Remove ${days}-day early alert for ${rule.label}`} onClick={() => onRemove(rule.docName, days)} className="rounded p-1 text-slate-500 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:hover:text-rose-300">
                  <X size={10} />
                </button>
              </span>
            ))}
          {rule.enabled && <MilestoneAdder onAdd={(days) => onAdd(rule.docName, days)} />}
        </div>
      )}
    </div>
  );
}

function MilestoneAdder({ onAdd }: { onAdd: (days: number) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const submit = () => {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n <= 30 || n > 365) { setError('Use 31–365 days.'); return; }
    onAdd(n);
    setValue('');
    setError('');
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        type="number"
        min={31}
        max={365}
        aria-label="Additional early alert interval in days"
        placeholder="Days"
        value={value}
        onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:border-slate-700 dark:bg-slate-950"
      />
      <button
        type="button"
        onClick={submit}
        className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <Plus size={12} />
        <span>Add</span>
      </button>
      {error && <span role="alert" className="w-full text-[10px] text-rose-700 dark:text-rose-300">{error}</span>}
    </span>
  );
}
