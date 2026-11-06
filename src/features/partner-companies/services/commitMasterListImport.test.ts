import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type { PartnerCompany } from '../../../types/survey';
import { createActiveCompanySnapshot } from '../../active-companies/domain/activeCompanySnapshots';
import { saveMasterListImport } from './commitMasterListImport';

const company: PartnerCompany = { id: 'synthetic', name: 'Synthetic Partner', type: 'Supplier', createdAt: '2026-01-01', branches: [{ id: 'b1', bpCode: 'SYN', status: 'Pending' }] };

test('commits registry and all category lists through one RPC and returns the authoritative saved state', async () => {
  let requests = 0;
  const snapshots = (['Courier', 'Supplier', 'Subcontractor'] as const).map(type =>
    createActiveCompanySnapshot(type, 'master.xlsx', type === 'Supplier' ? [company.name] : [], 'admin@mgenesis.com'));
  let payload: unknown = { companies: [company], snapshots };
  let status = 200;
  const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests++;
      assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/import_partner_master_list');
      assert.deepEqual(JSON.parse(String(init?.body)), { p_companies: [company], p_source_file_name: 'master.xlsx' });
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  assert.deepEqual(await saveMasterListImport([company], 'master.xlsx', client), {
    companies: [company], lists: snapshots.map(snapshot => ({ surveyType: snapshot.surveyType, companies: snapshot.companies })),
  });
  assert.equal(requests, 1);
  for (const invalid of [null, {}, { companies: [null], snapshots }, { companies: [], snapshots },
    { companies: [{ ...company, id: 'wrong' }], snapshots }, { companies: [company], snapshots: [snapshots[0], snapshots[0], snapshots[2]] }]) {
    payload = invalid;
    await assert.rejects(saveMasterListImport([company], 'master.xlsx', client), /was saved.*Refresh before retrying/);
  }
  status = 403; payload = { message: 'Admin required' };
  await assert.rejects(saveMasterListImport([company], 'master.xlsx', client), /Admin required/);
  status = 404; payload = { code: 'PGRST202', message: 'Missing function' };
  await assert.rejects(saveMasterListImport([company], 'master.xlsx', client), /migration 202611060001.*No import was applied/);
  const before = requests;
  await assert.rejects(saveMasterListImport([], 'master.xlsx', client), /between 1 and 10,000/);
  await assert.rejects(saveMasterListImport([company], '', client), /source filenames/);
  await assert.rejects(saveMasterListImport([{ ...company, type: 'Invalid' } as unknown as PartnerCompany], 'master.xlsx', client), /type/);
  assert.equal(requests, before, 'invalid inputs never reach the persistence boundary');
});
