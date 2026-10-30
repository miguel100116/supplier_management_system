import {
  loadApplicationRecords,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';
import {
  ActiveCompanySnapshot,
  parseActiveCompanySnapshot,
} from '../domain/activeCompanySnapshots';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabaseClient';

export async function loadActiveCompanySnapshots(client: SupabaseClient = supabase): Promise<ActiveCompanySnapshot[]> {
  const values = await loadApplicationRecords<unknown>('active_company_snapshot', undefined, client);
  return values.map(parseActiveCompanySnapshot);
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
