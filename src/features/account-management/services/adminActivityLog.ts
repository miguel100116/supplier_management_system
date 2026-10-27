// Lightweight client-side log of admin actions (database resets, account/
// permission changes) that don't already have a dedicated log of their own
// (exports are tracked separately in exportHistory.ts). Powers the Settings
// page's "Recent Activity" panel.

export interface AdminActivityEntry {
  id: string;
  action: string;
  details?: string;
  timestamp: string;
}

const STORAGE_KEY = 'survey_admin_activity_v1';
const MIGRATION_KEY = 'survey_admin_activity_supabase_migrated_v1';
const HISTORY_LIMIT = 100;

export function logAdminActivity(action: string, details?: string) {
  try {
    const existing = getAdminActivity();
    const next: AdminActivityEntry = {
      id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      details,
      timestamp: new Date().toISOString(),
    };
    const updated = [next, ...existing].slice(0, HISTORY_LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    persistApplicationRecordsInBackground(
      upsertApplicationRecords('admin_activity', [next], (entry) => entry.id),
    );
    window.dispatchEvent(new Event('admin-activity-updated'));
  } catch (e) {
    // Best-effort logging only.
  }
}

export async function hydrateAdminActivityFromSupabase(signal?: AbortSignal): Promise<void> {
  let entries = await loadApplicationRecords<AdminActivityEntry>('admin_activity', { signal });
  if (entries.length === 0 && localStorage.getItem(MIGRATION_KEY) !== 'true') {
    entries = getAdminActivity();
    if (entries.length > 0) {
      await upsertApplicationRecords('admin_activity', entries, (entry) => entry.id);
    }
  }
  signal?.throwIfAborted();
  const ordered = entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, HISTORY_LIMIT);
  localStorage.setItem(MIGRATION_KEY, 'true');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
  window.dispatchEvent(new Event('admin-activity-updated'));
}

export function getAdminActivity(): AdminActivityEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}
import {
  loadApplicationRecords,
  persistApplicationRecordsInBackground,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';
