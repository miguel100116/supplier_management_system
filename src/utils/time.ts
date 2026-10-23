export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate).getTime();
  const diffMs = now.getTime() - then;

  if (!Number.isFinite(diffMs)) return '';
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatLogDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatLogTime(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatLogDateTime(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '\u2014';
  return parsed.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Strictly validates a date string in dd/mm/yyyy format.
 * Rejects anything that isn't exactly two digits, a slash, two digits, a slash,
 * four digits (so letters, extra characters, or partial input all fail), and
 * also rejects dates that don't exist on the calendar (e.g. 31/02/2026, 32/01/2026,
 * 00/00/0000), including correctly accounting for leap years.
 */
export function isValidDDMMYYYY(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return false;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12) return false;
  if (year < 1000 || year > 9999) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

/** Returns an error message if the dd/mm/yyyy string is invalid, otherwise ''. */
export function getDDMMYYYYError(value: string): string {
  if (!value || !value.trim()) return 'This date is required.';
  if (!isValidDDMMYYYY(value)) return 'Enter a valid date in dd/mm/yyyy format.';
  return '';
}

/**
 * Parses a dd/mm/yyyy string (the format CustomForm.deadlineDate is stored in)
 * into a real Date at local midnight. Returns null for anything empty or not
 * in that exact format - callers should treat null as "no deadline" rather
 * than falling back to the native Date constructor, which misreads
 * dd/mm/yyyy as mm/dd/yyyy (or returns Invalid Date outright).
 */
export function parseDDMMYYYY(value?: string | null): Date | null {
  if (!value) return null;
  if (!isValidDDMMYYYY(value)) return null;
  const [day, month, year] = value.trim().split('/').map((part) => parseInt(part, 10));
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}
