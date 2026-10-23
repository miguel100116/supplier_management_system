import {
  loadApplicationRecords,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';
import {
  ActiveCompanySnapshot,
  parseActiveCompanySnapshot,
} from '../domain/activeCompanySnapshots';
import { REPOSITORY_ACTIVE_COMPANY_SEED } from '../data/repositoryActiveCompanySeed';

export async function loadActiveCompanySnapshots(): Promise<ActiveCompanySnapshot[]> {
  const values = await loadApplicationRecords<unknown>('active_company_snapshot');
  const stored = values.map(parseActiveCompanySnapshot);
  const storedIds = new Set(stored.map((snapshot) => snapshot.id));
  return [
    ...stored,
    ...REPOSITORY_ACTIVE_COMPANY_SEED.filter((snapshot) => !storedIds.has(snapshot.id)),
  ];
}

export async function saveActiveCompanySnapshot(snapshot: ActiveCompanySnapshot): Promise<void> {
  try {
    await upsertApplicationRecords('active_company_snapshot', [snapshot], (value) => value.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('application_records_record_type_check')) {
      throw new Error('Active-company uploads are not enabled in this Supabase environment yet. Apply migration 202609230001_active_company_snapshots.sql, then try again.');
    }
    throw error;
  }
}
