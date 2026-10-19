import {
  loadApplicationRecords,
  persistApplicationRecordsInBackground,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';

export interface ComplianceSnapshot {
  date: string;
  rate: number;
  total: number;
}

interface PersistedComplianceHistory {
  id: string;
  snapshots: ComplianceSnapshot[];
}

const STORAGE_KEY = 'document_register_compliance_history_v1';
const MIGRATION_KEY = 'document_register_compliance_history_supabase_migrated_v1';

export function getComplianceHistory(): Record<string, ComplianceSnapshot[]> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveComplianceHistory(history: Record<string, ComplianceSnapshot[]>, categoryKey: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  const record: PersistedComplianceHistory = { id: categoryKey, snapshots: history[categoryKey] ?? [] };
  persistApplicationRecordsInBackground(
    upsertApplicationRecords('compliance_snapshot', [record], (item) => item.id),
  );
  queueMicrotask(() => window.dispatchEvent(new Event('compliance-history-updated')));
}

export async function hydrateComplianceHistoryFromSupabase(canMigrate = false): Promise<void> {
  let records = await loadApplicationRecords<PersistedComplianceHistory>('compliance_snapshot');
  if (records.length === 0 && canMigrate && localStorage.getItem(MIGRATION_KEY) !== 'true') {
    const local = getComplianceHistory();
    records = Object.entries(local).map(([id, snapshots]) => ({ id, snapshots }));
    if (records.length > 0) {
      await upsertApplicationRecords('compliance_snapshot', records, (item) => item.id);
    }
  }
  const history = Object.fromEntries(records.map((record) => [record.id, record.snapshots]));
  if (records.length > 0 || canMigrate) localStorage.setItem(MIGRATION_KEY, 'true');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event('compliance-history-updated'));
}
