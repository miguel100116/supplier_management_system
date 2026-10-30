const LEGAL_SUFFIXES = new Set([
  'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD',
  'LIMITED', 'LLC', 'OPC', 'PHILS', 'PHILIPPINES', 'PHIL',
]);

/** Existing import identity rule; never use fuzzy matches for assignments. */
export function normalizeCompanyName(name: string): string {
  return name.toUpperCase().replace(/[.,'"()&/\\-]/g, ' ').split(/\s+/)
    .filter(Boolean).filter(token => !LEGAL_SUFFIXES.has(token)).join(' ').trim();
}
