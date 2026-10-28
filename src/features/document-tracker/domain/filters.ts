import type { DocumentStatus } from '../../../types/survey';

export type DocumentStatusFilter = 'all' | 'needs-attention' | DocumentStatus;

export interface DocumentFilterCell {
  docName: string;
  status: DocumentStatus;
}

const NEEDS_ATTENTION_STATUSES = new Set<DocumentStatus>([
  'Expiring Soon',
  'Expired',
  'Missing',
  'For Update',
]);

export function matchesDocumentFilter(
  cells: DocumentFilterCell[],
  documentName: string,
  status: DocumentStatusFilter,
): boolean {
  if (status === 'all') return true;
  const scopedCells = documentName === 'all'
    ? cells
    : cells.filter((cell) => cell.docName === documentName);

  if (status === 'needs-attention') {
    return scopedCells.some((cell) => NEEDS_ATTENTION_STATUSES.has(cell.status));
  }
  return scopedCells.some((cell) => cell.status === status);
}

/** Multiple selected statuses are combined as OR; the document and advanced filters still combine as AND. */
export function matchesDocumentFilters(
  cells: DocumentFilterCell[],
  documentName: string,
  statuses: DocumentStatusFilter[],
): boolean {
  return statuses.length === 0 || statuses.some((status) => matchesDocumentFilter(cells, documentName, status));
}

export function countRowsByDocumentStatus(
  rows: DocumentFilterCell[][],
  documentName: string,
): Record<DocumentStatusFilter, number> {
  const statuses: DocumentStatusFilter[] = [
    'all',
    'needs-attention',
    'Current',
    'Expiring Soon',
    'Expired',
    'Missing',
    'For Update',
  ];

  return Object.fromEntries(
    statuses.map((status) => [
      status,
      status === 'all'
        ? rows.length
        : rows.filter((cells) => matchesDocumentFilter(cells, documentName, status)).length,
    ]),
  ) as Record<DocumentStatusFilter, number>;
}
