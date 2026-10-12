import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useModalEscape } from '../hooks/useModalEscape';
import { Search, Globe, MapPin, Truck, Package, Layers, RefreshCw, X, Check, Users, ShieldCheck, Clock, XCircle, Gauge, LayoutGrid, Settings2, RotateCcw, AlertTriangle, History, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, BellPlus, Plus, SlidersHorizontal, Trash2, Filter } from 'lucide-react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BranchRecord, BranchStatus, ComplianceDocument, DocumentStatus, PartnerCompany, PartnerCompanyType, SupplierOrigin } from '../types/survey';
import { branchAwareCompanyLabel, computeCompanyDocumentSummary, computeDocumentStatus, isNTBranch } from '../utils/compliance';
import { getRequiredDocumentKeys, isExpiryDocument } from '../utils/documentRequirements';
import { DocumentModificationEntry, getDocumentModifications, logDocumentModification } from '../utils/documentModificationLog';
import { ComplianceSnapshot, getComplianceHistory, saveComplianceHistory } from '../utils/complianceHistory';
import {
  DocNotificationRule,
  DEFAULT_NOTIFICATION_RULES,
  getNotificationSettings,
  saveNotificationSettings,
  restoreDefaultNotificationSettings,
} from '../utils/documentNotificationSettings';
import { ChartCard } from '../components/ChartCard';
import { PageDescription } from '../components/PageDescription';
import { useIsMobile } from '../hooks/useIsMobile';
import { BRANCH_STATUS_OPTIONS, branchStatusBadgeClasses } from './PartnerCompaniesPage';
import {
  countRowsByDocumentStatus,
  matchesDocumentFilter,
  type DocumentStatusFilter,
} from '../features/document-tracker/domain/filters';
import { scrollDocumentMatrixWithArrowKey } from '../features/document-tracker/components/documentMatrixKeyboard';

interface DocumentRegisterPageProps {
  partnerCompanies: PartnerCompany[];
  onUpdateCompany: (company: PartnerCompany) => void;
  onRenewDocument: (
    companyId: string,
    branchId: string,
    documentName: string,
    expectedDocument: ComplianceDocument,
    nextDocument: Pick<ComplianceDocument, 'provided' | 'expiryDate'>,
  ) => Promise<PartnerCompany>;
  canRenewDocuments?: boolean;
  currentUserEmail?: string;
  isAdmin?: boolean;
}

// ---------------------------------------------------------------------------
// Advanced custom filter rows - field + condition + value triples that are
// composed by the admin in the Customize Filters panel and applied on top of
// the quick-chip filter. None of these fields are invented: every key maps
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
    label: 'Branch Status',
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
    key: 'doc.status',
    label: 'Any Document Status',
    type: 'select',
    // Values from DocumentStatus
    options: ['Current', 'Expiring Soon', 'Expired', 'Missing', 'For Update'],
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
function newFilterRow(): FilterRow {
  const field = FILTERABLE_FIELDS[0];
  return {
    id: `fr-${++_filterRowSeq}`,
    field: field.key,
    condition: defaultConditionForField(field),
    value: '',
  };
}

const DOCUMENT_STATUS_FILTER_OPTIONS: Array<{ value: DocumentStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
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

// One category tab = one column set, mirroring the Master List's
// "LOCAL SUPPLIER" / "FOREIGN SUPPLIER" blocks: selecting a category filters
// both the rows (companies of that category) AND which document columns show,
// since Couriers/Subcontractors don't carry the Local/Foreign-specific docs.
const CATEGORIES: { key: string; label: string; type: PartnerCompanyType; origin?: SupplierOrigin; icon: typeof Truck }[] = [
  { key: 'supplier-local', label: 'Supplier (Local)', type: 'Supplier', origin: 'Local', icon: MapPin },
  { key: 'supplier-foreign', label: 'Supplier (Foreign)', type: 'Supplier', origin: 'Foreign', icon: Globe },
  { key: 'courier', label: 'Courier', type: 'Courier', icon: Truck },
  { key: 'subcontractor', label: 'Subcontractor', type: 'Subcontractor', icon: Layers },
];

// Pseudo-category: aggregates the Compliance Overview (KPIs/charts) across
// every category at once, same idea as the client's mockup's top summary
// strip. The detail matrix below still needs one category selected, since
// Local/Foreign/etc. carry different document columns.
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
  { id: 'chart-compliance', label: 'Status Breakdown (donut)', kind: 'chart' },
  { id: 'chart-attention', label: 'Documents Needing Attention (bar)', kind: 'chart' },
  { id: 'chart-trend', label: 'Compliance Rate Trend', kind: 'chart' },
  { id: 'table-doc-status', label: 'Document Status Summary', kind: 'table' },
  { id: 'table-aging', label: 'Expiry Aging Summary', kind: 'table' },
  { id: 'table-upcoming', label: 'Upcoming Expiries (Next 30 Days)', kind: 'table' },
  { id: 'table-risk', label: 'Documents with Highest Expiry Risk', kind: 'table' },
];
// Explicit ids (not kind-filtered) so adding new "Advanced-only" chart/kpi
// widgets later doesn't silently leak into Simple.
const SIMPLE_WIDGET_IDS = ['kpi-total', 'kpi-accreditation', 'kpi-expiring', 'kpi-expired', 'kpi-rate', 'chart-compliance', 'chart-attention'];
const ADVANCED_WIDGET_IDS = OVERVIEW_WIDGETS.map((w) => w.id);
// Defaults to everything on - a first-time visitor should see the full
// mockup-equivalent view, not have to discover the Customize dropdown to
// find the tables. Simple is still one click away via the preset button.
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

// Validated status trio for CHART MARKS (pie fills, bar fills, dynamic KPI
// accents) - run through the dataviz six-checks validator against this
// app's actual white/slate-950 panel surfaces and confirmed to pass every
// gate (lightness band, chroma floor, CVD separation, normal-vision floor,
// contrast) in BOTH light and dark with the same three hex values, so no
// separate dark-mode set is needed for these. Scoped to chart marks only -
// the existing pastel STATUS_STYLES pill badges used across the rest of
// the app are untouched.
const CHART_GOOD = '#059669';
const CHART_WARNING = '#a16207';
const CHART_CRITICAL = '#f43f5e';
const CHART_INK = '#172033'; // matches the app's `ink` design token

// Colors for the branch Status donut - one slice per BRANCH_STATUS_OPTIONS
// value (plus 'Not Set' for a branch with no status chosen yet), kept
// visually distinct from each other regardless of the pill badge colors
// used elsewhere on the page.
const STATUS_CHART_COLORS: Record<string, string> = {
  Pending: '#3b82f6',
  Updated: '#10b981',
  Outdated: '#a16207',
  Incomplete: '#f43f5e',
  Completed: '#059669',
  Accredited: '#0d9488',
  Inactive: '#94a3b8',
  'Not Set': '#cbd5e1',
};
// Compliance Rate = share of branches whose Status reflects a completed
// accreditation cycle - not a document-expiry rollup. Matches the request
// to count Completed/Updated/Accredited as "compliant" regardless of category.
const COMPLIANT_BRANCH_STATUSES = new Set(['Completed', 'Updated', 'Accredited']);

const STATUS_STYLES: Record<string, string> = {
  Current: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40',
  'Expiring Soon': 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40',
  Expired: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40',
  'For Update': 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40',
  'For Renewal': 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-900/40',
  Missing: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700',
};

// Heatmap treatment for the big detail matrix below: status lives in the
// CELL FILL (background + border + text color), not a small dot, so a
// fully-compliant row and a problem row are distinguishable at a glance
// without reading any text.
const CELL_FILL: Record<string, string> = {
  Current: 'bg-emerald-600 border-emerald-700 text-white dark:bg-emerald-600 dark:border-emerald-500 dark:text-white',
  'Expiring Soon': 'bg-[#a16207] border-amber-800 text-white dark:bg-[#a16207] dark:border-amber-600 dark:text-white',
  Expired: 'bg-[#f43f5e] border-rose-600 text-white dark:bg-[#f43f5e] dark:border-rose-400 dark:text-white',
  'For Update': 'bg-[#f43f5e] border-rose-600 text-white dark:bg-[#f43f5e] dark:border-rose-400 dark:text-white',
  Missing: 'border-dashed border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600',
};

const CELL_ICON: Record<string, typeof Check | undefined> = {
  Current: Check,
  'Expiring Soon': Clock,
  Expired: XCircle,
  'For Update': XCircle,
};

// Ordering used when a document column header is clicked to sort the matrix
// by that column - ascending brings compliant rows to the top, descending
// surfaces the rows needing attention first (Expired/For Update highest).
const DOC_STATUS_SORT_RANK: Record<DocumentStatus, number> = {
  Current: 0,
  Missing: 1,
  'Expiring Soon': 2,
  Expired: 3,
  'For Update': 3,
};

// Every column in the detail matrix can be sorted by clicking its header.
// 'company'/'compliance'/'ntType'/'bpCode' are fixed keys; a document column
// uses `doc:${docName}` so it can't collide with those.
type MatrixSortKey = 'company' | 'compliance' | 'ntType' | 'bpCode' | string;

// Matches the Master List's own "Supplier Rank" column values exactly, so an
// edit here round-trips cleanly through a future re-import.
const SUPPLIER_RANK_OPTIONS = ['Major', 'Regular'];

function supplierRankTextClasses(rank?: string): string {
  if (/major/i.test(rank ?? '')) return 'text-amber-600 dark:text-amber-400';
  if (/regular/i.test(rank ?? '')) return 'text-slate-600 dark:text-slate-300';
  return 'text-slate-300 dark:text-slate-600';
}

function formatDaysLabel(daysLeft?: number): string | undefined {
  if (typeof daysLeft !== 'number') return undefined;
  return daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d`;
}

// Label shown next to the icon - only the states that actually need action
// (Expiring/Expired/For Update) spell anything out; Current and Missing stay
// icon/fill only so the eye reads color first, not a wall of repeated words.
function getCellLabel(status: string, daysLeft?: number): string | undefined {
  switch (status) {
    case 'Expiring Soon':
      return formatDaysLabel(daysLeft);
    case 'Expired': {
      const days = formatDaysLabel(daysLeft);
      return days ? `Expired · ${days}` : 'Expired';
    }
    case 'For Update':
      return 'For Update';
    default:
      return undefined;
  }
}

// Second line, expiry-bearing cells only: short date (+ days, for Current -
// Expiring/Expired/For Update already show days in the label line above).
function getCellDateLine(status: string, expiryDate: string | undefined, daysLeft: number | undefined): string | undefined {
  if (!expiryDate) return undefined;
  const shortDate = formatShortDate(expiryDate);
  if (status === 'Current') {
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

export function DocumentRegisterPage({ partnerCompanies, onUpdateCompany, onRenewDocument, canRenewDocuments, currentUserEmail = '', isAdmin = false }: DocumentRegisterPageProps) {
  const isMobile = useIsMobile();
  const [categoryKey, setCategoryKey] = useState<string>('supplier-local');
  const [searchQuery, setSearchQuery] = useState('');
  const [documentFilter, setDocumentFilter] = useState('all');
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentStatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
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
  } | null>(null);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, string[]>>({});
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);
  // Customizable filter chips - admin-editable list of which chips are
  // Applied custom filter rows (used by the `rows` useMemo).
  const [customFilterRows, setCustomFilterRows] = useState<FilterRow[]>([]);
  // Draft rows - working copy while the filter panel is open.
  // Committed on Apply; discarded on Cancel.
  const [draftFilterRows, setDraftFilterRows] = useState<FilterRow[]>([]);
  // Whether the full inline Customize Filters panel is expanded.
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [complianceHistory, setComplianceHistory] = useState<Record<string, ComplianceSnapshot[]>>({});
  const [modificationLog, setModificationLog] = useState<DocumentModificationEntry[]>([]);
  const [sortKey, setSortKey] = useState<MatrixSortKey>('company');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Frozen header overlay for the detail matrix: position:sticky can't reach
  // the viewport here because the matrix needs its own horizontal scroll
  // (overflow-x-auto), and per the CSS spec that forces the element to also
  // become a vertical scroll container - which caps any sticky descendant's
  // range to that container instead of the page, regardless of whether it
  // ever actually scrolls vertically. So instead, a second, fixed-position
  // copy of the header row is rendered via portal only while the matrix
  // panel spans the navbar, with its own horizontal scroll mirrored from the
  // real table so columns stay aligned - see updateStickyHeader below.
  const matrixPanelRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const realTheadRef = useRef<HTMLTableSectionElement>(null);
  const overlayScrollRef = useRef<HTMLDivElement>(null);
  const handleMatrixKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(
      'input, select, textarea, [contenteditable="true"], [role="slider"], [role="listbox"], [role="combobox"], [role="spinbutton"]',
    )) {
      return;
    }

    const scrollSurface = tableScrollRef.current;
    if (scrollSurface && scrollDocumentMatrixWithArrowKey(scrollSurface, event.key)) {
      event.preventDefault();
    }
  }, []);
  const isHeaderStuckRef = useRef(false);
  const [stickyHeader, setStickyHeader] = useState<{ left: number; width: number; colWidths: number[] } | null>(null);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
  useModalEscape(isNotificationSettingsOpen, () => setIsNotificationSettingsOpen(false), 50);
  useModalEscape(Boolean(renewalTarget), () => setRenewalTarget(null), 50);
  useModalEscape(Boolean(flagFlow), () => setFlagFlow(null), 50);
  useModalEscape(Boolean(expiryStatusTarget), () => setExpiryStatusTarget(null), 50);
  const [notificationRules, setNotificationRules] = useState<DocNotificationRule[]>(DEFAULT_NOTIFICATION_RULES);
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
    setNotificationRules(getNotificationSettings());
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(event.target as Node)) {
        setIsCustomizeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A lingering document-column sort key is reset because Local/Foreign/
  // Courier/Subcontractor each carry a different set of document columns.
  useEffect(() => {
    setSortKey('company');
    setSortDirection('asc');
    setDocumentFilter('all');
    setDocumentStatusFilter('all');
  }, [categoryKey]);

  const handleSortClick = (key: MatrixSortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

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
  const docColumns = useMemo(() => getRequiredDocumentKeys(category.type, category.origin), [category]);

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

  const applyPreset = (ids: string[]) => {
    const updated = { ...widgetVisibility, [categoryKey]: ids };
    setWidgetVisibility(updated);
    localStorage.setItem(WIDGET_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  // --- Custom filter panel helpers ---

  // Open the panel: populate draft from last applied rows so editing
  // feels like continuing from the previous state.
  const openFilterPanel = () => {
    setDraftFilterRows(customFilterRows.map((r) => ({ ...r })));
    setIsFilterPanelOpen(true);
  };

  const closeFilterPanel = () => {
    setIsFilterPanelOpen(false);
  };

  const applyFilters = () => {
    setCustomFilterRows(draftFilterRows.filter((r) => r.value.trim() !== ''));
    closeFilterPanel();
  };

  const cancelFilters = () => {
    // Discard drafts; don't touch applied rows.
    closeFilterPanel();
  };

  const addDraftRow = () => {
    setDraftFilterRows((prev) => [...prev, newFilterRow()]);
  };

  const removeDraftRow = (id: string) => {
    setDraftFilterRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateDraftRow = (id: string, patch: Partial<FilterRow>) => {
    setDraftFilterRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // When field changes, reset condition to the new field's default
        // and clear value so stale text/number doesn't pass wrong type.
        if (patch.field !== undefined && patch.field !== r.field) {
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

  const clearDraftRows = () => setDraftFilterRows([]);

  const clearAppliedFilters = () => {
    setSearchQuery('');
    setDocumentFilter('all');
    setDocumentStatusFilter('all');
    setCustomFilterRows([]);
    setDraftFilterRows([]);
  };

  const hasAppliedFilters = Boolean(
    searchQuery.trim() || documentStatusFilter !== 'all' || customFilterRows.length > 0,
  );

  // Every non-archived company in the selected category, unfiltered by
  // search - this is what the Compliance Overview summarizes, so switching
  // categories updates the KPIs/charts but typing in the search box doesn't.
  // "All Categories" skips the type/origin filter entirely.
  const categoryCompanies = useMemo(() => {
    return partnerCompanies.filter((c) => {
      if (c.isArchived) return false;
      if (isAllView) return true;
      if (c.type !== category.type) return false;
      if (category.type === 'Supplier' && (c.supplierOrigin ?? 'Local') !== category.origin) return false;
      return true;
    });
  }, [partnerCompanies, category, isAllView]);

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
          list.push({ key: `${c.id}::${b.id}`, company: c, branch: b, isNT: isNTBranch(b), isSplit: true });
        });
      } else {
        list.push({ key: c.id, company: c, branch: branches[0], isNT: branches[0] ? isNTBranch(branches[0]) : false, isSplit: false });
      }
    });
    return list;
  }, [categoryCompanies]);

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
  }
  const matrixCellData = useMemo(() => {
    const map = new Map<string, MatrixCell[]>();
    displayRows.forEach((row) => {
      map.set(
        row.key,
        docColumns.map((docName) => {
          const branch = row.branch;
          const doc: ComplianceDocument = (branch?.documents?.[docName] ?? {}) as ComplianceDocument;
          const { status, daysLeft } = computeDocumentStatus(doc, effectiveNow, docName);
          return { docName, status, daysLeft, doc, branch, expiryBased: isExpiryDocument(docName) };
        })
      );
    });
    return map;
  }, [displayRows, docColumns, effectiveNow]);

  const documentStatusCounts = useMemo(
    () => countRowsByDocumentStatus(
      displayRows.map((row) => matrixCellData.get(row.key) ?? []),
      documentFilter,
    ),
    [displayRows, matrixCellData, documentFilter],
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
    if (documentStatusFilter !== 'all') {
      list = list.filter((row) => matchesDocumentFilter(
        matrixCellData.get(row.key) ?? [],
        documentFilter,
        documentStatusFilter,
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
            if (fr.field === 'doc.status') {
              const cells = matrixCellData.get(row.key) ?? [];
              return cells.some((cell) => cell.status === rawValue);
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
    // Every column header is clickable to sort (see handleSortClick) - the
    // comparator below dispatches on which key is active, always falling
    // back to company name (then NT/non-NT) so ties stay stable and a
    // company's split branches stay adjacent regardless of sort key.
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
  }, [displayRows, searchQuery, documentFilter, documentStatusFilter, customFilterRows, matrixCellData, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(rows.length / DOCUMENT_ROWS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * DOCUMENT_ROWS_PER_PAGE;
    return rows.slice(start, start + DOCUMENT_ROWS_PER_PAGE);
  }, [rows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryKey, searchQuery, documentFilter, documentStatusFilter, customFilterRows, sortKey, sortDirection]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
    const end = Math.min(pageCount, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, pageCount]);

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

    // Status Breakdown is per BRANCH (one row per BP Code, same as the
    // matrix table below) rather than per company, since branch.status is
    // what's actually being tallied.
    const statusCounts: Record<string, number> = {};
    let brandedBranchTotal = 0;
    let compliantBranchTotal = 0;
    displayRows.forEach((row) => {
      if (!row.branch) return;
      brandedBranchTotal++;
      const status = row.branch.status ?? 'Not Set';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      if (COMPLIANT_BRANCH_STATUSES.has(status)) compliantBranchTotal++;
    });

    const perDocAttention: Record<string, { expiringSoon: number; expired: number }> = {};
    // Advanced-view breakdowns - only populated for expiry-bearing docs.
    const perDocStatus: Record<string, { current: number; expiringSoon: number; expiredOrForUpdate: number; total: number }> = {};
    const agingCounts: Record<string, number> = {};
    const upcoming: { company: string; doc: string; expiryDate: string; daysLeft: number }[] = [];

    categoryCompanies.forEach((c) => {
      const summary = computeCompanyDocumentSummary(c, effectiveNow);
      if (c.accreditationStatus === 'Accredited') activeAccreditation++;
      expiringSoonDocs += summary.expiringSoonCount;
      expiredDocs += summary.expiredCount + summary.forUpdateCount;

      getRequiredDocumentKeys(c.type, c.supplierOrigin).filter(isExpiryDocument).forEach((docName) => {
        const branches = c.branches?.length ? c.branches : [undefined];
        branches.forEach((branch) => {
          const doc: ComplianceDocument = (branch?.documents?.[docName] ?? {}) as ComplianceDocument;
          const { status, daysLeft } = computeDocumentStatus(doc, effectiveNow, docName);

          if (status === 'Expiring Soon' || status === 'Expired' || status === 'For Update') {
            if (!perDocAttention[docName]) perDocAttention[docName] = { expiringSoon: 0, expired: 0 };
            if (status === 'Expiring Soon') perDocAttention[docName].expiringSoon++;
            else perDocAttention[docName].expired++;
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

    const total = categoryCompanies.length;
    const complianceRate = brandedBranchTotal > 0 ? Math.round((compliantBranchTotal / brandedBranchTotal) * 100) : 0;

    const donutData = [...BRANCH_STATUS_OPTIONS, 'Not Set']
      .map((status) => ({ name: status, value: statusCounts[status] ?? 0, color: STATUS_CHART_COLORS[status] }))
      .filter((d) => d.value > 0);

    const barData = Object.entries(perDocAttention)
      .map(([docName, counts]) => ({
        doc: docName,
        'Expiring Soon': counts.expiringSoon,
        Expired: counts.expired,
      }))
      .sort((a, b) => (b['Expiring Soon'] + b.Expired) - (a['Expiring Soon'] + a.Expired));

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
      total, activeAccreditation, expiringSoonDocs, expiredDocs, complianceRate, statusTotal: brandedBranchTotal,
      donutData, barData, docStatusTable, agingTable, upcomingTable,
    };
  }, [categoryCompanies, displayRows, effectiveNow]);

  // Records today's compliance rate for whichever category is currently
  // being viewed - this is what actually builds the trend chart's history
  // over time. Revisiting the same day just overwrites that day's entry
  // (keeps it live if the underlying data changes) instead of duplicating.
  useEffect(() => {
    if (overview.total === 0) return;
    setComplianceHistory((prev) => {
      const existing = prev[categoryKey] ?? [];
      const last = existing[existing.length - 1];
      let nextList: ComplianceSnapshot[];
      if (last && last.date === currentDateStr) {
        if (last.rate === overview.complianceRate && last.total === overview.total) return prev;
        nextList = [...existing.slice(0, -1), { date: currentDateStr, rate: overview.complianceRate, total: overview.total }];
      } else {
        nextList = [...existing, { date: currentDateStr, rate: overview.complianceRate, total: overview.total }].slice(-COMPLIANCE_HISTORY_LIMIT);
      }
      const updated = { ...prev, [categoryKey]: nextList };
      saveComplianceHistory(updated, categoryKey);
      return updated;
    });
  }, [categoryKey, currentDateStr, overview.total, overview.complianceRate]);

  // Opens the renewal date picker directly - called either from a fresh
  // click on an expiry-doc cell's "Renew Document" button in the status
  // popup, or as a normal continuation once that popup is dismissed.
  const openRenewal = (company: PartnerCompany, branch: BranchRecord, docName: string) => {
    if (!canRenewDocuments) return;
    const doc = branch.documents?.[docName];
    setRenewalDate(doc?.expiryDate || currentDateStr);
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
    setExpiryStatusTarget({ company, branch, docName, confirmingMissing: false });
  };

  // Clears a document back to Missing (no expiry, not provided) - called
  // only from the expiry-doc status popup's "Mark as Missing" warning step,
  // once its own Confirm button is clicked.
  const markDocumentMissing = async (company: PartnerCompany, branch: BranchRecord, docName: string) => {
    if (!canRenewDocuments) return;
    setMutationError('');
    try {
      await onRenewDocument(company.id, branch.id, docName, branch.documents?.[docName] ?? {}, { provided: false });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to mark the document as missing.');
    }
  };

  const updateBranchStatus = (company: PartnerCompany, branchId: string, status: BranchStatus) => {
    if (!isAdmin) return;
    const updatedBranches = (company.branches ?? []).map((b) =>
      b.id === branchId ? { ...b, status } : b
    );
    onUpdateCompany({ ...company, branches: updatedBranches });
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

  // Every edit here saves immediately (same convention as the Compliance
  // Overview's Customize panel above) - no separate Save/Cancel step, since
  // this only ever touches the EXTRA early-milestone alert for one document,
  // never the standard 30-day/expired alert that's always on regardless.
  const updateNotificationRule = (docName: string, updater: (rule: DocNotificationRule) => DocNotificationRule) => {
    setNotificationRules((prev) => {
      const next = prev.map((r) => (r.docName === docName ? updater(r) : r));
      saveNotificationSettings(next);
      return next;
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
    setNotificationRules(restoreDefaultNotificationSettings());
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

  // Recomputes whether the frozen header overlay should be showing. Column
  // widths/position are only re-measured on a stuck-state transition (or
  // when forced) - not on every scroll tick, since they only actually change
  // on resize or when the matrix's shape changes, not on ordinary scrolling.
  const NAV_HEIGHT = 80; // matches Shell's h-20 top header
  const updateStickyHeader = useCallback((forceMeasure = false) => {
    const panel = matrixPanelRef.current;
    const wrapper = tableScrollRef.current;
    const thead = realTheadRef.current;
    if (!panel || !wrapper || !thead) return;

    const panelRect = panel.getBoundingClientRect();
    const theadHeight = thead.getBoundingClientRect().height;
    const shouldStick = panelRect.top <= NAV_HEIGHT && panelRect.bottom > NAV_HEIGHT + theadHeight;

    if (!shouldStick) {
      if (isHeaderStuckRef.current) {
        isHeaderStuckRef.current = false;
        setStickyHeader(null);
      }
      return;
    }

    if (!isHeaderStuckRef.current || forceMeasure) {
      isHeaderStuckRef.current = true;
      const wrapperRect = wrapper.getBoundingClientRect();
      const colWidths = Array.from(thead.querySelectorAll('th')).map((th) => th.getBoundingClientRect().width);
      setStickyHeader({ left: wrapperRect.left, width: wrapperRect.width, colWidths });
      if (overlayScrollRef.current) overlayScrollRef.current.scrollLeft = wrapper.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => updateStickyHeader(false);
    const handleResize = () => updateStickyHeader(true);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    updateStickyHeader(true);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateStickyHeader]);

  // The matrix's shape (columns, rows) can change with no scroll/resize
  // event at all (switching category, filtering, sorting) - force a
  // re-measure so a currently-frozen header doesn't show stale column widths.
  useEffect(() => {
    updateStickyHeader(true);
  }, [updateStickyHeader, docColumns, rows.length]);

  // Mirrors the real table's horizontal scroll position onto the frozen
  // overlay in real time (direct DOM write, bypassing React state) so
  // columns stay aligned while scrolling sideways.
  useEffect(() => {
    const wrapper = tableScrollRef.current;
    if (!wrapper) return;
    const handleHorizontalScroll = () => {
      if (overlayScrollRef.current) overlayScrollRef.current.scrollLeft = wrapper.scrollLeft;
    };
    wrapper.addEventListener('scroll', handleHorizontalScroll, { passive: true });
    return () => wrapper.removeEventListener('scroll', handleHorizontalScroll);
  }, []);

  // Shared between the real (in-flow) header row and the frozen overlay copy,
  // so the two can never drift apart - `widths` is only passed for the
  // overlay, pinning each cell to the real column's measured pixel width.
  const renderHeaderCells = (widths?: number[]) => {
    const fixedCols: { key: string; label: string; sortKeyValue: MatrixSortKey; extraTh?: string }[] = [
      { key: 'company', label: 'Company', sortKeyValue: 'company', extraTh: 'sticky left-0 z-10' },
      { key: 'compliance', label: 'Compliance', sortKeyValue: 'compliance', extraTh: 'min-w-[110px]' },
      { key: 'bpCode', label: 'BP Code', sortKeyValue: 'bpCode' },
      { key: 'ntType', label: 'Trade/Non-Trade', sortKeyValue: 'ntType', extraTh: 'min-w-[130px]' },
      { key: 'branchStatus', label: 'Status', sortKeyValue: 'branchStatus', extraTh: 'min-w-[120px]' },
      { key: 'supplierRank', label: 'Supplier Rank', sortKeyValue: 'supplierRank', extraTh: 'min-w-[110px]' },
    ];
    const widthStyle = (i: number) => (widths ? { width: widths[i], minWidth: widths[i], maxWidth: widths[i] } : undefined);

    return [
      ...fixedCols.map((col, i) => (
        <th
          key={col.key}
          className={`px-3 py-2.5 bg-slate-50 dark:bg-slate-950/60 ${col.extraTh ?? ''}`}
          style={widthStyle(i)}
        >
          <SortHeaderButton label={col.label} sortKeyValue={col.sortKeyValue} activeKey={sortKey} direction={sortDirection} onClick={handleSortClick} />
        </th>
      )),
      ...docColumns.map((docName, i) => (
        <th
          key={docName}
          className="px-3 py-2.5 min-w-[120px] max-w-[150px] align-bottom bg-slate-50 dark:bg-slate-950/60"
          style={widthStyle(fixedCols.length + i)}
          title={docName}
        >
          <SortHeaderButton
            label={docName}
            sortKeyValue={`doc:${docName}`}
            activeKey={sortKey}
            direction={sortDirection}
            onClick={handleSortClick}
            labelClassName="line-clamp-2 normal-case font-semibold tracking-normal text-slate-500 dark:text-slate-400"
          />
        </th>
      )),
    ];
  };

  return (
    <div className="space-y-6">
      <PageDescription>Monitor partner compliance documents, track expiring or expired items, and send notifications to partners.</PageDescription>
      {mutationError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
          {mutationError}
        </div>
      )}
      {headerPortalTarget && createPortal(
        <button
          type="button"
          onClick={() => setIsNotificationSettingsOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white transition cursor-pointer shadow-sm"
        >
          <BellPlus size={14} />
          <span>Add Notification</span>
        </button>,
        headerPortalTarget
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-nowrap overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 dark:border-transparent dark:bg-slate-950 w-full sm:w-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setCategoryKey(ALL_KEY)}
            className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md py-2 px-4 text-xs font-bold transition-all duration-150 cursor-pointer ${
              isAllView
                ? 'bg-[#0063a9] text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                onClick={() => setCategoryKey(cat.key)}
                className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md py-2 px-4 text-xs font-bold transition-all duration-150 cursor-pointer ${
                  categoryKey === cat.key
                    ? 'bg-[#0063a9] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-5 dark:border-slate-800/60 dark:bg-slate-900/20 space-y-5">
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
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick preset:</span>
                      <button
                        type="button"
                        onClick={() => applyPreset(SIMPLE_WIDGET_IDS)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900/60 cursor-pointer"
                      >
                        Simple
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset(ADVANCED_WIDGET_IDS)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900/60 cursor-pointer"
                      >
                        Advanced
                      </button>
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

            {(isWidgetVisible('kpi-total') || isWidgetVisible('kpi-accreditation') || isWidgetVisible('kpi-expiring') || isWidgetVisible('kpi-expired') || isWidgetVisible('kpi-rate')) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {isWidgetVisible('kpi-total') && <KpiCard icon={Users} label="Total Partners" value={overview.total} caption={viewLabel} accent="text-[#0063a9]" />}
                {isWidgetVisible('kpi-accreditation') && <KpiCard icon={ShieldCheck} label="Active Accreditation" value={overview.activeAccreditation} caption="Accredited status" accent="text-[#0063a9]" />}
                {isWidgetVisible('kpi-expiring') && <KpiCard icon={Clock} label="Expiring ≤ 30 Days" value={overview.expiringSoonDocs} caption="Documents" accent="text-[#a16207]" />}
                {isWidgetVisible('kpi-expired') && <KpiCard icon={XCircle} label="Expired / For Update" value={overview.expiredDocs} caption="Documents" accent="text-[#f43f5e]" />}
                {isWidgetVisible('kpi-rate') && (
                  <KpiCard
                    icon={Gauge}
                    label="Compliance Rate"
                    value={`${overview.complianceRate}%`}
                    caption="Completed, Updated & Accredited"
                    accent={overview.complianceRate >= 90 ? 'text-[#059669]' : overview.complianceRate >= 70 ? 'text-[#a16207]' : 'text-[#f43f5e]'}
                  />
                )}
              </div>
            )}

            {chartsToShow.length > 0 && (
              <div className={chartsGridClass}>
                {isWidgetVisible('chart-compliance') && (
                  <div className={chartsToShow.length === 2 ? 'lg:col-span-2' : ''}>
                    <ChartCard title="Status Breakdown" subtitle={viewLabel} contentClassName="min-h-[27rem] sm:h-80 sm:min-h-0">
                      {overview.donutData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          No companies in this view yet.
                        </div>
                      ) : (
                        <div
                          className="flex min-h-[27rem] min-w-0 flex-col items-center justify-center gap-4 sm:h-80 sm:min-h-0 sm:gap-3"
                          role="group"
                          aria-label={`${viewLabel} branch status breakdown`}
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
                          Nothing expiring or overdue in this view.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={overview.barData} layout="vertical" margin={{ left: isMobile ? 0 : 8, right: isMobile ? 24 : 36 }} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-100 dark:stroke-slate-800" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                            <YAxis type="category" dataKey="doc" width={isMobile ? 76 : 110} tickFormatter={(value: string) => isMobile && value.length > 12 ? `${value.slice(0, 11)}…` : value} tick={{ fontSize: isMobile ? 9 : 11, fill: CHART_INK, fontWeight: 600 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: 10, border: '1px solid #e2e8f0' }} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                            <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" iconSize={8} />
                            <Bar dataKey="Expiring Soon" stackId="a" fill={CHART_WARNING} radius={[0, 0, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                              <LabelList dataKey="Expiring Soon" position="right" formatter={(v) => (typeof v === 'number' && v > 0 ? v : '')} style={{ fontSize: 12, fill: CHART_INK, fontWeight: 700 }} />
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
              const history = complianceHistory[categoryKey] ?? [];
              return (
                <ChartCard title="Compliance Rate Trend" subtitle={viewLabel} contentClassName="h-56">
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
                        <defs>
                          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0063a9" stopOpacity={0.16} />
                            <stop offset="100%" stopColor="#0063a9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-100 dark:stroke-slate-800" />
                        <XAxis dataKey="date" minTickGap={isMobile ? 24 : 8} tick={{ fontSize: isMobile ? 9 : 10, fill: '#94a3b8' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickFormatter={(d: string) => formatDate(d)} />
                        <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: isMobile ? 9 : 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={isMobile ? 34 : 40} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: 10, border: '1px solid #e2e8f0' }} labelFormatter={(d) => formatDate(String(d ?? ''))} formatter={(v) => [`${typeof v === 'number' ? v : 0}%`, 'Compliance Rate']} />
                        <Area type="monotone" dataKey="rate" stroke="none" fill="url(#trendFill)" isAnimationActive={false} />
                        <Line type="monotone" dataKey="rate" stroke="#0063a9" strokeWidth={2} dot={{ r: 4, fill: '#0063a9', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
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
                            <th className="py-2 px-2 text-right text-[#a16207]">Expiring</th>
                            <th className="py-2 px-2 text-right text-[#f43f5e]">Expired</th>
                            <th className="py-2 pl-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {overview.docStatusTable.map((row) => (
                            <tr key={row.doc} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="py-2 pr-2 font-semibold text-slate-700 dark:text-slate-200">{row.doc}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#059669]">{row.current}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#a16207]">{row.expiringSoon}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#f43f5e]">{row.expiredOrForUpdate}</td>
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
                              <td className="py-2 pl-2 text-right tabular-nums font-bold text-[#a16207]">{row.daysLeft}</td>
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
                            <th className="py-2 px-2 text-right text-[#f43f5e]">Expired</th>
                            <th className="py-2 px-2 text-right text-[#a16207]">Expiring &lt; 30d</th>
                            <th className="py-2 pl-2 text-right">Total Risk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {overview.barData.map((row) => (
                            <tr key={row.doc} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="py-2 pr-2 font-semibold text-slate-700 dark:text-slate-200">{row.doc}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#f43f5e]">{row.Expired}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-[#a16207]">{row['Expiring Soon']}</td>
                              <td className="py-2 pl-2 text-right tabular-nums font-bold text-slate-700 dark:text-slate-200">{row.Expired + row['Expiring Soon']}</td>
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
        );
      })()}

      {!isAllView && categoryCompanies.length > 0 && (
        <div className="space-y-0">
          {/* Search and document filters; advanced filters remain Admin-only */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid w-full flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_minmax(170px,0.55fr)_minmax(180px,0.55fr)]">
              <label className="relative min-w-0">
                <span className="sr-only">Search document tracker</span>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search company or BP code..."
                  className="field !mt-0 w-full py-2.5 !pl-9 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Clear document search"
                  >
                    <X size={14} />
                  </button>
                )}
              </label>

              <label className="min-w-0">
                <span className="sr-only">Filter by document</span>
                <select
                  value={documentFilter}
                  onChange={(event) => setDocumentFilter(event.target.value)}
                  className="field !mt-0 w-full py-2.5 text-sm"
                >
                  <option value="all">Any document</option>
                  {docColumns.map((docName) => (
                    <option key={docName} value={docName}>{docName}</option>
                  ))}
                </select>
              </label>

              <label className="min-w-0">
                <span className="sr-only">Filter by document status</span>
                <select
                  value={documentStatusFilter}
                  onChange={(event) => setDocumentStatusFilter(event.target.value as DocumentStatusFilter)}
                  className="field !mt-0 w-full py-2.5 text-sm"
                >
                  {DOCUMENT_STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({documentStatusCounts[option.value]})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="whitespace-nowrap text-xs font-semibold text-slate-400">
                {rows.length} result{rows.length === 1 ? '' : 's'}
              </span>
              {/* Customize Filters button (right, admin-only) */}
              {isAdmin && (
              <button
                type="button"
                onClick={() => (isFilterPanelOpen ? cancelFilters() : openFilterPanel())}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  isFilterPanelOpen
                    ? 'border-[#0063a9] bg-[#0063a9]/5 text-[#0063a9] dark:bg-[#0063a9]/20 dark:text-sky-400'
                    : customFilterRows.length > 0
                    ? 'border-[#0063a9]/40 bg-[#0063a9]/5 text-[#0063a9] dark:bg-[#0063a9]/10 dark:border-sky-700 dark:text-sky-400'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <SlidersHorizontal size={12} />
                <span>Customize Filters</span>
                {customFilterRows.length > 0 && !isFilterPanelOpen && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#0063a9] text-white text-[10px] font-bold leading-none px-1">
                    {customFilterRows.length}
                  </span>
                )}
                {isFilterPanelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              )}
            </div>
          </div>

          {hasAppliedFilters && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Applied</span>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  title="Remove search filter"
                >
                  <span className="truncate">Search: {searchQuery.trim()}</span>
                  <X size={11} className="shrink-0" />
                </button>
              )}
              {documentStatusFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setDocumentStatusFilter('all')}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#0063a9] hover:border-blue-300 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                  title="Remove document status filter"
                >
                  <span className="truncate">
                    {documentFilter === 'all' ? 'Any document' : documentFilter}: {DOCUMENT_STATUS_FILTER_OPTIONS.find((option) => option.value === documentStatusFilter)?.label}
                  </span>
                  <X size={11} className="shrink-0" />
                </button>
              )}
              {customFilterRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setCustomFilterRows((current) => current.filter((candidate) => candidate.id !== row.id))}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:border-violet-300 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"
                  title="Remove advanced filter"
                >
                  <span className="truncate">{describeFilterRow(row)}</span>
                  <X size={11} className="shrink-0" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAppliedFilters}
                className="ml-auto text-xs font-bold text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              >
                Clear all
              </button>
            </div>
          )}

          {/* ── Inline Customize Filters panel ───────────────────────────── */}
          {isAdmin && isFilterPanelOpen && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-[#0063a9]" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">Customize Filters</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Advanced partner and document conditions use AND logic</p>
                  </div>
                </div>
                {draftFilterRows.length > 0 && (
                  <button
                    type="button"
                    onClick={clearDraftRows}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Divider + filter rows section */}
              {draftFilterRows.length > 0 && (
                <div className="px-5 pb-1 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Advanced Filters</p>
                  <div className="space-y-2">
                    {draftFilterRows.map((fr) => {
                      const fieldDef = FILTERABLE_FIELDS.find((f) => f.key === fr.field) ?? FILTERABLE_FIELDS[0];
                      const conditions = getConditionsForField(fieldDef);
                      return (
                        <div key={fr.id} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          {/* Field selector */}
                          <select
                            value={fr.field}
                            onChange={(e) => updateDraftRow(fr.id, { field: e.target.value })}
                            className="field text-xs py-1.5 sm:w-44 shrink-0"
                            aria-label="Filter field"
                          >
                            {FILTERABLE_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>

                          {/* Condition selector */}
                          <select
                            value={fr.condition}
                            onChange={(e) => updateDraftRow(fr.id, { condition: e.target.value as FilterCondition })}
                            className="field text-xs py-1.5 sm:w-44 shrink-0"
                            aria-label="Filter condition"
                          >
                            {conditions.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>

                          {/* Value input — adapts to field type */}
                          <div className="flex-1 flex items-center gap-1.5 min-w-0">
                            {fieldDef.type === 'select' ? (
                              <select
                                value={fr.value}
                                onChange={(e) => updateDraftRow(fr.id, { value: e.target.value })}
                                className="field text-xs py-1.5 flex-1"
                                aria-label="Filter value"
                              >
                                <option value="">— Select value —</option>
                                {(fieldDef.options ?? []).map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : fieldDef.type === 'number' ? (
                              <>
                                <input
                                  type="number"
                                  value={fr.value}
                                  onChange={(e) => updateDraftRow(fr.id, { value: e.target.value })}
                                  placeholder={fieldDef.placeholder ?? '0'}
                                  className="field text-xs py-1.5 flex-1 min-w-0"
                                  aria-label="Filter value"
                                />
                                {fieldDef.unit && (
                                  <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{fieldDef.unit}</span>
                                )}
                              </>
                            ) : (
                              <input
                                type="text"
                                value={fr.value}
                                onChange={(e) => updateDraftRow(fr.id, { value: e.target.value })}
                                placeholder={fieldDef.placeholder ?? 'Enter value…'}
                                className="field text-xs py-1.5 flex-1 min-w-0"
                                aria-label="Filter value"
                              />
                            )}
                          </div>

                          {/* Delete row */}
                          <button
                            type="button"
                            onClick={() => removeDraftRow(fr.id)}
                            title="Remove this filter"
                            className="shrink-0 self-end sm:self-auto inline-flex items-center justify-center h-8 w-8 rounded-lg border border-rose-100 bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* + Add Filter */}
              <div className="px-5 py-3">
                <button
                  type="button"
                  onClick={addDraftRow}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-[#0063a9]/50 hover:bg-[#0063a9]/5 hover:text-[#0063a9] dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-sky-700 dark:hover:text-sky-400 transition cursor-pointer"
                >
                  <Plus size={13} />
                  Add Filter
                </button>
              </div>

              {/* Footer: Cancel + Apply */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={cancelFilters}
                  className="secondary-button text-xs py-1.5 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  className="primary-button text-xs py-1.5 px-4"
                >
                  Apply Filters
                  {draftFilterRows.filter((r) => r.value.trim() !== '').length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white/25 text-white text-[10px] font-bold leading-none px-1">
                      {draftFilterRows.filter((r) => r.value.trim() !== '').length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAllView ? (
        <div className="panel py-20 text-center text-slate-400">
          <LayoutGrid size={48} className="mx-auto mb-3 opacity-30 text-slate-300" />
          <p className="text-sm font-semibold">Pick a specific category above to view its detailed document matrix.</p>
          <p className="text-xs mt-1">Local, Foreign, Courier, and Subcontractor each carry different document columns.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="panel py-20 text-center text-slate-400">
          <Package size={48} className="mx-auto mb-3 opacity-30 text-slate-300" />
          <p className="text-sm font-semibold">
            {hasAppliedFilters ? 'No records match the current filters.' : `No ${category.label} companies found.`}
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
        <div className="panel p-0 overflow-hidden" ref={matrixPanelRef}>
          <div className="flex justify-end border-b border-slate-100 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800">
            Focus the table and use ← / → arrow keys to scroll sideways.
          </div>
          <div
            className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0063a9]"
            ref={tableScrollRef}
            role="region"
            aria-label="Partner compliance document matrix. Focus this region and use left and right arrow keys to scroll horizontally."
            tabIndex={0}
            onKeyDown={handleMatrixKeyDown}
          >
            <table className="w-full border-collapse text-sm">
              <thead ref={realTheadRef}>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
                  {renderHeaderCells()}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedRows.map((row) => {
                  const c = row.company;
                  const cells = matrixCellData.get(row.key) ?? [];
                  const compliant = cells.filter((cell) => cell.status === 'Current').length;
                  const total = cells.length;
                  const hasExpired = cells.some((cell) => cell.status === 'Expired' || cell.status === 'For Update');
                  const hasExpiring = cells.some((cell) => cell.status === 'Expiring Soon');
                  const rollup = hasExpired
                    ? { text: 'text-[#f43f5e]', bar: 'bg-[#f43f5e]' }
                    : hasExpiring
                    ? { text: 'text-[#a16207]', bar: 'bg-[#a16207]' }
                    : { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' };

                  return (
                    <tr key={row.key} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/20 transition-colors">
                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-950 z-10">
                        <span>{c.name}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-col gap-1 min-w-[64px]">
                          <span className={`text-xs font-bold tabular-nums ${rollup.text}`}>{compliant}/{total}</span>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`h-full rounded-full ${rollup.bar}`} style={{ width: `${total > 0 ? (compliant / total) * 100 : 0}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {row.branch?.bpCode || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {row.isNT ? 'Non-Trade' : 'Trade'}
                        </span>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {row.branch ? (
                          <select
                            value={row.branch.status ?? ''}
                            onChange={(e) => updateBranchStatus(row.company, row.branch!.id, e.target.value as BranchStatus)}
                            disabled={!isAdmin}
                            className={`rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider border ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${
                              row.branch.status ? branchStatusBadgeClasses(row.branch.status) : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-700'
                            }`}
                          >
                            <option value="" disabled>Set status</option>
                            {BRANCH_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {row.branch ? (
                          isAdmin ? (
                            <div className="relative inline-flex items-center">
                              <select
                                value={row.branch.supplierRank ?? ''}
                                onChange={(e) => updateSupplierRank(row.company, row.branch!, e.target.value)}
                                className={`appearance-none bg-transparent pr-3.5 text-xs font-bold cursor-pointer focus:outline-none ${supplierRankTextClasses(row.branch.supplierRank)}`}
                              >
                                <option value="" disabled>Set rank</option>
                                {SUPPLIER_RANK_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                              <ChevronDown size={11} className={`pointer-events-none absolute right-0 opacity-60 ${supplierRankTextClasses(row.branch.supplierRank)}`} />
                            </div>
                          ) : (
                            <span className={`text-xs font-bold ${supplierRankTextClasses(row.branch.supplierRank)}`}>
                              {row.branch.supplierRank || '—'}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      {cells.map(({ docName, status, daysLeft, doc, branch, expiryBased }) => {
                        const interactive = canRenewDocuments && !!branch;
                        const Icon = CELL_ICON[status];
                        const label = getCellLabel(status, daysLeft);
                        const dateLine = getCellDateLine(status, doc.expiryDate, daysLeft);
                        return (
                          <td key={docName} className="p-1">
                            <button
                              type="button"
                              disabled={!interactive}
                              onClick={() => {
                                if (!branch) return;
                                if (expiryBased) openExpiryStatus(c, branch, docName);
                                else openFlagFlow(c, branch, docName);
                              }}
                              title={
                                doc.expiryDate
                                  ? `Expires ${formatDate(doc.expiryDate)}${canRenewDocuments ? ' — click to renew' : ''}`
                                  : canRenewDocuments
                                  ? (expiryBased ? 'Click to set an expiry date' : `Click to mark ${doc.provided ? 'not provided' : 'provided'}`)
                                  : docName
                              }
                              className={`group relative w-full min-h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1.5 text-center transition ${CELL_FILL[status]} ${
                                interactive ? 'cursor-pointer hover:brightness-110' : 'cursor-default'
                              }`}
                            >
                              {status === 'Missing' ? (
                                <span className="text-sm leading-none">—</span>
                              ) : (
                                <>
                                  <span className="flex items-center gap-1">
                                    {Icon && <Icon size={13} strokeWidth={2.5} />}
                                    {label && <span className="text-[10px] font-bold leading-none whitespace-nowrap">{label}</span>}
                                  </span>
                                  {dateLine && (
                                    <span className="text-[9px] leading-none opacity-70 font-medium whitespace-nowrap">{dateLine}</span>
                                  )}
                                </>
                              )}
                              {interactive && (
                                <RefreshCw size={10} className="absolute top-1 right-1 shrink-0 opacity-0 group-hover:opacity-100 transition" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between" aria-label="Document tracker pagination">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{(currentPage - 1) * DOCUMENT_ROWS_PER_PAGE + 1}</span>–<span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(currentPage * DOCUMENT_ROWS_PER_PAGE, rows.length)}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{rows.length}</span> rows
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              {visiblePageNumbers.map((page) => (
                <button
                  type="button"
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  aria-current={currentPage === page ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold transition ${currentPage === page ? 'bg-[#0063a9] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={currentPage === pageCount}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </nav>

          <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Legend:</span>
            <LegendSwatch swatchClass="bg-emerald-600 border-emerald-700 dark:bg-emerald-600 dark:border-emerald-500" label="Current" />
            <LegendSwatch swatchClass="bg-[#a16207] border-amber-800 dark:bg-[#a16207] dark:border-amber-600" label="Expiring ≤ 30d" />
            <LegendSwatch swatchClass="bg-[#f43f5e] border-rose-600 dark:bg-[#f43f5e] dark:border-rose-400" label="Expired / For Update" />
            <LegendSwatch swatchClass="border-dashed border-slate-300 dark:border-slate-700" label="Missing" />
          </div>
        </div>
      )}

      {/* Frozen header overlay - see updateStickyHeader/renderHeaderCells above for why
          this can't just be position:sticky on the real thead. Fully interactive (sort
          buttons work normally) so freezing the header doesn't cost you the ability to
          re-sort while scrolled into the middle of the table. */}
      {stickyHeader && createPortal(
        <div
          style={{ position: 'fixed', top: NAV_HEIGHT, left: stickyHeader.left, width: stickyHeader.width, zIndex: 45 }}
          className="shadow-md"
        >
          <div ref={overlayScrollRef} className="overflow-hidden" onKeyDown={handleMatrixKeyDown}>
            <table className="border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
                  {renderHeaderCells(stickyHeader.colWidths)}
                </tr>
              </thead>
            </table>
          </div>
        </div>,
        document.body
      )}

      <ChartCard
        title="Modification History"
        subtitle="Every flag toggle and renewal made from this matrix, most recent first"
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0063a9] hover:bg-[#00548c] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
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
        const statusText = isMissing ? 'Missing' : isActive ? `Active till ${formatShortDate(doc.expiryDate)}` : 'Expired';
        const statusStyle = isMissing ? STATUS_STYLES.Missing : isActive ? STATUS_STYLES.Current : STATUS_STYLES.Expired;

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
                      disabled={isMissing}
                      onClick={() => setExpiryStatusTarget((prev) => (prev ? { ...prev, confirmingMissing: true } : prev))}
                      title={isMissing ? 'Already marked as missing' : undefined}
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

                  <p className="mt-3 text-center text-[11px] text-slate-400">This clears the recorded expiry and updates the compliance record immediately.</p>

                  <div className="flex items-center gap-2 mt-5">
                    <button onClick={() => setExpiryStatusTarget(null)} className="secondary-button flex-1 py-2 text-xs" type="button">
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        markDocumentMissing(expiryStatusTarget.company, expiryStatusTarget.branch, expiryStatusTarget.docName);
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

      {/* "Add Notification" settings - configures EXTRA early heads-up alerts
          on top of the standard 30-day/expired alert (always on, not
          editable here). Every edit auto-saves, same convention as the
          Compliance Overview's Customize panel above. */}
      {isNotificationSettingsOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#0063a9]/10 text-[#0063a9] shrink-0">
                  <BellPlus size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Document Expiry Notifications</h3>
                  <p className="text-[11px] text-slate-400">Extra early alerts, on top of the standard 30-day/expired alert</p>
                </div>
              </div>
              <button
                onClick={() => setIsNotificationSettingsOpen(false)}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Local Supplier</p>
                <div className="space-y-2.5">
                  {notificationRules.filter((r) => r.origin === 'Local' || r.origin === 'Both').map((rule) => (
                    <NotificationRuleRow
                      key={`local-${rule.docName}`}
                      rule={rule}
                      onToggle={toggleNotificationRuleEnabled}
                      onAdd={addNotificationMilestone}
                      onRemove={removeNotificationMilestone}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Foreign Supplier</p>
                <div className="space-y-2.5">
                  {notificationRules.filter((r) => r.origin === 'Foreign' || r.origin === 'Both').map((rule) => (
                    <NotificationRuleRow
                      key={`foreign-${rule.docName}`}
                      rule={rule}
                      onToggle={toggleNotificationRuleEnabled}
                      onAdd={addNotificationMilestone}
                      onRemove={removeNotificationMilestone}
                    />
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                The standard 30-day "Expiring Soon" alert and the Expired alert always apply to every document above and can't be turned off here - these settings only add an earlier heads-up alert.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={handleRestoreDefaultNotifications}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-azure hover:underline cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Restore to Default</span>
              </button>
              <button
                type="button"
                onClick={() => setIsNotificationSettingsOpen(false)}
                className="secondary-button py-2 px-4 text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
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

// One row per document type in the "Add Notification" settings modal.
// AFS renews on a fiscal-year basis (mode 'fiscal-year') so it just shows an
// informational badge - everything else can have its early-alert toggled and
// its milestone-day chips edited.
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
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{rule.label}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{rule.note}</p>
        </div>
        {rule.mode === 'day-milestones' && (
          <label className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer select-none">
            <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule.docName)} className="rounded border-slate-300" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Early alert</span>
          </label>
        )}
      </div>

      {rule.mode === 'fiscal-year' ? (
        <span className="mt-2.5 inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
          Fiscal-year based - no day milestone
        </span>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {rule.enabled &&
            rule.earlyMilestoneDays.map((days) => (
              <span
                key={days}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-[#a16207] dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400"
              >
                {days}d before
                <button type="button" onClick={() => onRemove(rule.docName, days)} className="hover:text-rose-600 cursor-pointer">
                  <X size={10} />
                </button>
              </span>
            ))}
          <span className="inline-flex rounded-full border border-dashed border-slate-300 dark:border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
            30d / Expired (standard, always on)
          </span>
          {rule.enabled && <MilestoneAdder onAdd={(days) => onAdd(rule.docName, days)} />}
        </div>
      )}
    </div>
  );
}

function MilestoneAdder({ onAdd }: { onAdd: (days: number) => void }) {
  const [value, setValue] = useState('');
  const submit = () => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n > 30) {
      onAdd(n);
      setValue('');
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={31}
        placeholder="days"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
      />
      <button
        type="button"
        onClick={submit}
        className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
      >
        <Plus size={10} />
        <span>Add</span>
      </button>
    </span>
  );
}
