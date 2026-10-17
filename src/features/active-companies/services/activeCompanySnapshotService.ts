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
  const storedTypes = new Set(stored.map((snapshot) => snapshot.surveyType));
  return [
    ...stored,
    ...REPOSITORY_ACTIVE_COMPANY_SEED.filter((snapshot) => !storedTypes.has(snapshot.surveyType)),
  ];
}

export async function saveActiveCompanySnapshot(snapshot: ActiveCompanySnapshot): Promise<void> {
  try {
    await upsertApplicationRecords('active_company_snapshot', [snapshot], (value) => value.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('application_records_record_type_check')) {
      throw new Error('Active-partner uploads are not enabled in this Supabase environment yet. Contact an administrator to enable this feature.');
    }
    throw error;
  }
}
