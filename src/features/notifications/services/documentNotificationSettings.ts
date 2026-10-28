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
// Legacy optional early-warning rules. The standard 60/30/daily reminder
// schedule now lives in database-backed document maintenance settings.

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
    note: 'AFS status retains its existing fiscal-year classification. Expiry reminders use an explicitly stored expiry date.',
  },
  {
    docName: 'GIS (Corp)',
    label: 'GIS',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Reminder timing is managed in Document Maintenance settings.',
  },
  {
    docName: 'DTI (Sole)',
    label: 'DTI Registration',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Reminder timing is managed in Document Maintenance settings.',
  },
  {
    docName: 'Business Permit',
    label: 'Business Permit',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Reminder timing is managed in Document Maintenance settings.',
  },
  {
    docName: 'Import Permit',
    label: 'Import Permit',
    origin: 'Local',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Reminder timing is managed in Document Maintenance settings.',
  },
  {
    docName: 'Business Permit/License',
    label: 'Business Permit/License',
    origin: 'Foreign',
    mode: 'day-milestones',
    enabled: true,
    earlyMilestoneDays: [],
    note: 'Reminder timing is managed in Document Maintenance settings.',
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
    return DEFAULT_NOTIFICATION_RULES.map((def) => {
      const savedRule = parsed.find((p) => p.docName === def.docName);
      // Older browser/DB settings may retain obsolete DTI note text. Preserve
      // the alert controls while using the current reminder-settings copy.
      return def.docName === 'DTI (Sole)' && savedRule
        ? { ...savedRule, note: def.note }
        : savedRule ?? def;
    });
  } catch {
    return DEFAULT_NOTIFICATION_RULES;
  }
}

export async function saveNotificationSettings(rules: DocNotificationRule[]): Promise<void> {
  await replaceApplicationRecords('document_notification_rule', rules, (rule) => rule.docName);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  } catch {
    // The database is authoritative; browser cache failure does not undo a saved rule.
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
