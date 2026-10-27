// Admin-configurable expiry-notification rules for the Document Register's
// "Add Notification" settings screen. This only controls EXTRA early
// heads-up alerts fired ahead of the standard, already-hardcoded 30-day
// "Expiring Soon" / Expired alerts (see EXPIRING_SOON_DAYS in compliance.ts,
// which drives cell color across the whole matrix and stays untouched here)
// - so changing a rule can never silently change what a document's status
// badge/cell color means elsewhere in the app, only whether an extra advance
// notification fires for it.
import {
  loadApplicationRecords,
  persistApplicationRecordsInBackground,
  replaceApplicationRecords,
} from '../../../services/applicationRepository';
//
// Defaults encode the client's per-document requirements as given:
//   - AFS: fiscal-year based (see computeAfsFiscalYearStatus in compliance.ts)
//     - not a day countdown, so no milestone is configurable for it.
//   - GIS (Corp), Business Permit, Import Permit, Business Permit/License:
//     annual renewals - the standard 30-day alert already covers them, no
//     extra early milestone by default.
//   - DTI (Sole): client-requested extra 60-day heads-up on top of the
//     standard 30-day alert, so it never quietly drops under 30 days left.

export type NotificationMode = 'fiscal-year' | 'day-milestones';

export interface DocNotificationRule {
  docName: string;
  label: string;
  origin: 'Local' | 'Foreign' | 'Both';
  mode: NotificationMode;
  enabled: boolean;
  // Extra advance-warning day-thresholds ABOVE the standard 30-day alert
  // (e.g. DTI's 60). Sorted descending for display. Empty = the standard
  // 30-day/Expired alert is the only one that applies.
  earlyMilestoneDays: number[];
  note: string;
}

export const DEFAULT_NOTIFICATION_RULES: DocNotificationRule[] = [
  {
    docName: 'AFS',
    label: 'AFS',
    origin: 'Both',
    mode: 'fiscal-year',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Latest available fiscal year (2025). Renews on a fiscal-year basis - notifies once the filed year falls out of range and flips to "For Update", not on a day countdown.',
  },
  {
    docName: 'GIS (Corp)',
    label: 'GIS',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Valid for Calendar Year 2027. Standard 30-day "Expiring Soon" alert.',
  },
  {
    docName: 'DTI (Sole)',
    label: 'DTI Registration',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [60],
    note: 'Validity is 5 years from registration date. Must maintain at least 30 days of validity remaining - client requested an extra heads-up at the 60-day mark, on top of the standard 30-day alert, for follow-ups.',
  },
  {
    docName: 'Business Permit',
    label: 'Business Permit',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Annual renewal. Standard 30-day "Expiring Soon" alert.',
  },
  {
    docName: 'Import Permit',
    label: 'Import Permit',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Annual renewal. Standard 30-day "Expiring Soon" alert.',
  },
  {
    docName: 'Business Permit/License',
    label: 'Business Permit/License',
    origin: 'Foreign',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Annual renewal (Foreign supplier). Standard 30-day "Expiring Soon" alert.',
  },
];

const STORAGE_KEY = 'document_register_notification_settings_v1';
const MIGRATION_STORAGE_KEY = 'document_register_notification_settings_supabase_migrated_v1';
const SETTINGS_CHANGED_EVENT = 'document-notification-settings-changed';

export function getNotificationSettings(): DocNotificationRule[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_NOTIFICATION_RULES;
    const parsed: DocNotificationRule[] = JSON.parse(saved);
    // Merge over the defaults (keyed by docName) rather than trusting the
    // saved list verbatim, so a future new default rule isn't silently
    // dropped just because it didn't exist yet in an older saved blob.
    return DEFAULT_NOTIFICATION_RULES.map((def) => parsed.find((p) => p.docName === def.docName) ?? def);
  } catch {
    return DEFAULT_NOTIFICATION_RULES;
  }
}

export function saveNotificationSettings(rules: DocNotificationRule[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    persistApplicationRecordsInBackground(
      replaceApplicationRecords('document_notification_rule', rules, (rule) => rule.docName),
    );
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  } catch {
    // Best-effort only.
  }
}

export function restoreDefaultNotificationSettings(): DocNotificationRule[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_NOTIFICATION_RULES));
    persistApplicationRecordsInBackground(
      replaceApplicationRecords('document_notification_rule', DEFAULT_NOTIFICATION_RULES, (rule) => rule.docName),
    );
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  } catch {
    // Best-effort only.
  }
  return DEFAULT_NOTIFICATION_RULES;
}

export async function hydrateNotificationSettingsFromSupabase(canMigrate = false, signal?: AbortSignal): Promise<void> {
  let rules = await loadApplicationRecords<DocNotificationRule>('document_notification_rule', { signal });
  if (rules.length === 0 && canMigrate && localStorage.getItem(MIGRATION_STORAGE_KEY) !== 'true') {
    rules = getNotificationSettings();
    await replaceApplicationRecords('document_notification_rule', rules, (rule) => rule.docName);
  }
  signal?.throwIfAborted();
  if (rules.length > 0 || canMigrate) localStorage.setItem(MIGRATION_STORAGE_KEY, 'true');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules.length > 0 ? rules : DEFAULT_NOTIFICATION_RULES));
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

export { SETTINGS_CHANGED_EVENT as NOTIFICATION_SETTINGS_CHANGED_EVENT };
