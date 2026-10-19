// Dedicated audit trail for compliance-document edits made from the
// Document Register's detail matrix (flag toggles + expiry renewals) -
// separate from the generic adminActivityLog because this one needs
// structured fields (category/company/document) to render as a table,
// not just a free-text description.

export interface DocumentModificationEntry {
  id: string;
  actorEmail: string;
  category: string;
  companyName: string;
  docName: string;
  change: string;
  timestamp: string;
}

const STORAGE_KEY = 'document_register_modification_log_v1';
const MIGRATION_KEY = 'document_register_modification_log_supabase_migrated_v1';
const HISTORY_LIMIT = 300;

export function logDocumentModification(entry: Omit<DocumentModificationEntry, 'id' | 'timestamp'>) {
  try {
    const existing = getDocumentModifications();
    const next: DocumentModificationEntry = {
      id: `DOC-MOD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const updated = [next, ...existing].slice(0, HISTORY_LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    persistApplicationRecordsInBackground(
      upsertApplicationRecords('document_modification', [next], (item) => item.id, { ownRecords: true }),
    );
    window.dispatchEvent(new Event('document-modification-logged'));
  } catch (e) {
    // Best-effort logging only.
  }
}

export async function hydrateDocumentModificationsFromSupabase(canMigrate = false): Promise<void> {
  let entries = await loadApplicationRecords<DocumentModificationEntry>('document_modification');
  if (entries.length === 0 && canMigrate && localStorage.getItem(MIGRATION_KEY) !== 'true') {
    entries = getDocumentModifications();
    if (entries.length > 0) {
      await upsertApplicationRecords('document_modification', entries, (entry) => entry.id, { ownRecords: true });
    }
  }
  const ordered = entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, HISTORY_LIMIT);
  if (entries.length > 0 || canMigrate) localStorage.setItem(MIGRATION_KEY, 'true');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
  window.dispatchEvent(new Event('document-modification-logged'));
}

export function getDocumentModifications(): DocumentModificationEntry[] {
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
