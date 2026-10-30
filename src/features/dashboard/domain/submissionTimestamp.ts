/** Legacy evaluation exports use UTC+08:00 local time. Never let the viewing
 * browser's time zone reinterpret those source timestamps. Explicit ISO offsets
 * take precedence; unsupported or impossible dates remain unknown.
 */
export function parseSubmissionTimestamp(value: string): number | null {
  const match = /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1] ?? match[6]);
  const month = Number(match[2] ?? match[4]);
  const day = Number(match[3] ?? match[5]);
  const hour = Number(match[7] ?? 0), minute = Number(match[8] ?? 0), second = Number(match[9] ?? 0);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59) return null;
  const pad = (part: number) => String(part).padStart(2, '0');
  const timestamp = Date.parse(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${match[10] ?? ''}${match[11]?.toUpperCase() ?? '+08:00'}`);
  return Number.isFinite(timestamp) ? timestamp : null;
}
