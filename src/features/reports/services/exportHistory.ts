// Lightweight client-side log of every file export triggered across the app
// (Reports & Exports > Generate Report, Company/Question/Summary/Executive
// builders, raw data export). There's no export API on the server - exports
// are generated entirely in-browser - so this just records what happened,
// for the Export History page.

export interface ExportHistoryEntry {
  id: string;
  title: string;
  format: 'pdf' | 'csv' | 'excel' | 'docx';
  filename: string;
  exportedAt: string;
  exportedBy?: string;
}

const STORAGE_KEY = 'survey_export_history_v1';
const MIGRATION_KEY = 'survey_export_history_supabase_migrated_v1';
const HISTORY_LIMIT = 200;

export function logExport(entry: Omit<ExportHistoryEntry, 'id' | 'exportedAt'>) {
  try {
    const existing = getExportHistory();
    const next: ExportHistoryEntry = {
      ...entry,
      id: `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      exportedAt: new Date().toISOString(),
    };
    const updated = [next, ...existing].slice(0, HISTORY_LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    persistApplicationRecordsInBackground(
      upsertApplicationRecords('export_history', [next], (item) => item.id, { ownRecords: true }),
    );
    window.dispatchEvent(new Event('export-history-updated'));
  } catch (e) {
    // Best-effort logging only - never block the actual export/download.
  }
}

export function getExportHistory(): ExportHistoryEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function clearExportHistory() {
  const recordIds = getExportHistory().map((entry) => entry.id);
  localStorage.removeItem(STORAGE_KEY);
  persistApplicationRecordsInBackground(deleteApplicationRecords('export_history', recordIds));
  window.dispatchEvent(new Event('export-history-updated'));
}

export async function hydrateExportHistoryFromSupabase(): Promise<void> {
  let entries = await loadApplicationRecords<ExportHistoryEntry>('export_history');
  if (entries.length === 0 && localStorage.getItem(MIGRATION_KEY) !== 'true') {
    entries = getExportHistory();
    if (entries.length > 0) {
      await upsertApplicationRecords('export_history', entries, (entry) => entry.id, { ownRecords: true });
    }
  }
  const ordered = entries.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt)).slice(0, HISTORY_LIMIT);
  localStorage.setItem(MIGRATION_KEY, 'true');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
  window.dispatchEvent(new Event('export-history-updated'));
}
import {
  deleteApplicationRecords,
  loadApplicationRecords,
  persistApplicationRecordsInBackground,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';
