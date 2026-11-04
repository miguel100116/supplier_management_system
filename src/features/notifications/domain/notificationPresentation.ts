import type { ResponseNotification } from '../../../types/survey';
import { parseSubmissionTimestamp } from '../../../utils/submissionTimestamp';
import { formatRelativeTime } from '../../../utils/time';
import { isWithinDateRange } from '../../../utils/tableFilters';

export function isDocumentNotification(item: ResponseNotification): boolean {
  return item.designation === 'Document Alert' || item.designation === 'Document Expiry Reminder';
}

export function notificationDate(value: string): string {
  const timestamp = parseSubmissionTimestamp(value);
  return timestamp === null ? '' : new Date(timestamp).toISOString();
}

export function compareNotificationDates(left: string, right: string, order: 'asc' | 'desc' = 'desc'): number {
  const a = parseSubmissionTimestamp(left), b = parseSubmissionTimestamp(right);
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return order === 'asc' ? a - b : b - a;
}

export function notificationAge(item: ResponseNotification, now: Date): string {
  if (!item.submissionDate && isDocumentNotification(item)) return 'Current status';
  return formatRelativeTime(notificationDate(item.submissionDate), now) || 'Time unavailable';
}

export function notificationWithinDateRange(value: string, from: string, to: string): boolean {
  return isWithinDateRange(notificationDate(value), from, to);
}
