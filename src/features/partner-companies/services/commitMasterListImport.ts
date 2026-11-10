import type { SupabaseClient } from '@supabase/supabase-js';
import type { PartnerCompany } from '../../../types/survey';
import { supabase } from '../../../services/supabaseClient';
import { APPLICATION_RECORD_CHANGED_EVENT, type ApplicationRecordType } from '../../../services/applicationRepository';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';
import { parseActiveCompanySnapshot, type ActiveCompanySnapshot } from '../../active-companies/domain/activeCompanySnapshots';

export async function saveMasterListImport(companies: PartnerCompany[], sourceFileName: string, client: SupabaseClient = supabase) {
  if (!companies.length || companies.length > 10_000) throw new Error('The reviewed Master List must contain between 1 and 10,000 companies.');
  if (!sourceFileName.trim() || sourceFileName.length > 2_000) throw new Error('Master List source filenames must contain between 1 and 2,000 characters.');
  const validated = companies.map(company => parseApplicationRecordPayload('partner_company', company, company.id, { operation: 'write' }));
  const { data, error } = await client.rpc('import_partner_master_list', { p_companies: validated, p_source_file_name: sourceFileName });
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Master List active-company updates require database migration 202611060001. No import was applied.'
    : `Unable to apply the Master List import: ${error.message}`);
  const parseConfirmation = () => {
    if (!data || !Array.isArray(data.companies) || data.companies.length !== companies.length
      || !Array.isArray(data.snapshots) || data.snapshots.length !== 3) throw new Error('Invalid confirmation.');
    const savedCompanies: PartnerCompany[] = data.companies.map((company: unknown) => {
      if (!company || typeof company !== 'object' || !('id' in company) || typeof company.id !== 'string') throw new Error('Invalid company.');
      return parseApplicationRecordPayload('partner_company', company, company.id) as unknown as PartnerCompany;
    });
    const ids = new Set(savedCompanies.map((company: PartnerCompany) => company.id));
    const snapshots: ActiveCompanySnapshot[] = data.snapshots.map((snapshot: unknown) => parseActiveCompanySnapshot(snapshot));
    if (ids.size !== companies.length || companies.some(company => !ids.has(company.id))
      || new Set(snapshots.map(snapshot => snapshot.surveyType)).size !== 3) throw new Error('Incomplete confirmation.');
    return { companies: savedCompanies, lists: snapshots.map(snapshot => ({ surveyType: snapshot.surveyType,
      companies: snapshot.masterListCompanies ?? snapshot.companies,
      membershipComplete: Array.isArray(snapshot.masterListCompanies) })) };
  };
  let saved: ReturnType<typeof parseConfirmation>;
  try { saved = parseConfirmation(); }
  catch { throw new Error('The Master List was saved, but its confirmation is invalid. Refresh before retrying.'); }
  if (typeof window !== 'undefined') {
    for (const recordType of ['partner_company', 'active_company_snapshot'] satisfies ApplicationRecordType[]) {
      window.dispatchEvent(new CustomEvent(APPLICATION_RECORD_CHANGED_EVENT, { detail: { recordType } }));
    }
  }
  return saved;
}
