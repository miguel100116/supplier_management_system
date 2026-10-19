import { BranchRecord, PartnerCompany } from '../../../types/survey';

// Mirrors the Master List's own "Category Summary" / "Supplier Rank Summary"
// legend blocks. The crucial difference from the rest of this app: everything
// here is counted per BRANCH (one row per BP Code), and NT is treated as a
// fully separate category from its non-NT counterpart - whereas the registry
// UI merges a company's NT and non-NT BP Codes onto a single PartnerCompany.
// This is why a per-company "Active Partners" count (e.g. 33) is far lower
// than the Master List's per-BP-Code total (e.g. 60): one merged company can
// hold several accredited BP Codes.
export const CATEGORY_BUCKET_KEYS = [
  'Supplier-Local',
  'Supplier-Foreign',
  'Courier',
  'Subcontractor',
  'Supplier-Local-NT',
  'Supplier-Foreign-NT',
  'Courier-NT',
  'Subcontractor-NT',
] as const;

export interface CategoryRankSummary {
  buckets: Record<string, number>;
  total: number;
  major: number;
  regular: number;
}

// A branch's own rawCategory (its original sheet value, e.g. "Supplier-Local"
// or "Courier-NT") decides whether IT counts toward the Category Summary -
// not the merged company's type. A blank-category row can still get merged
// as an extra branch onto an already-accredited company (name-matched), and
// that branch must stay out of the total the same way the Master List's own
// legend excludes it.
function resolveBranchCategoryKey(rawCategory: string | undefined): string | undefined {
  const cleaned = (rawCategory ?? '').trim().replace(/subcontructor/i, 'Subcontractor');
  if (!cleaned) return undefined;
  const isNT = /-\s*NT$/i.test(cleaned);
  const stripped = cleaned.replace(/-\s*NT$/i, '').trim();
  let base: string | undefined;
  if (/^courier$/i.test(stripped)) base = 'Courier';
  else if (/^subcontractor$/i.test(stripped)) base = 'Subcontractor';
  else if (/^supplier-local$/i.test(stripped)) base = 'Supplier-Local';
  else if (/^supplier-foreign$/i.test(stripped)) base = 'Supplier-Foreign';
  if (!base) return undefined;
  return isNT ? `${base}-NT` : base;
}

// The Supplier Rank Summary in the Master List is a global tally across every
// row in the sheet (most of which are otherwise "Uncategorized") - it is not
// scoped to accredited/categorized branches or to Supplier-type companies.
export function computeCategoryRankSummary(companies: PartnerCompany[]): CategoryRankSummary {
  const buckets: Record<string, number> = {};
  CATEGORY_BUCKET_KEYS.forEach((key) => {
    buckets[key] = 0;
  });
  let major = 0;
  let regular = 0;

  const allBranches: BranchRecord[] = companies.flatMap((c) => c.branches ?? []);
  allBranches.forEach((b) => {
    if (/major/i.test(b.supplierRank ?? '')) major++;
    else if (/regular/i.test(b.supplierRank ?? '')) regular++;

    const key = resolveBranchCategoryKey(b.rawCategory);
    if (key) buckets[key] = (buckets[key] ?? 0) + 1;
  });

  const total = Object.values(buckets).reduce((sum, n) => sum + n, 0);
  return { buckets, total, major, regular };
}
