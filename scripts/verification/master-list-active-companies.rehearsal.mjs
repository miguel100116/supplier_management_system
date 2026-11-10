// Run with an installed @electric-sql/pglite dist/index.js; synthetic in-memory data only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass the path to a local @electric-sql/pglite dist/index.js.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema private;
    revoke all on schema private from public, anon;
    grant usage on schema private to authenticated;
    create table public.application_records(record_type text, record_id text, payload jsonb,
      updated_at timestamptz default now(), primary key(record_type, record_id));
    alter table public.application_records enable row level security;
    grant select, insert, update, delete on public.application_records to authenticated;
    create function public.is_confirmed_mgenesis_user() returns boolean language sql
      as $$select coalesce(current_setting('test.confirmed', true), '') = 'yes'$$;
    create function private.is_app_admin() returns boolean language sql
      as $$select coalesce(current_setting('test.admin', true), '') = 'yes'$$;
    create function private.my_app_email() returns text language sql as $$select 'synthetic.admin@mgenesis.com'::text$$;
    revoke all on function private.is_app_admin(), private.my_app_email() from public, anon;
    grant execute on function private.is_app_admin(), private.my_app_email() to authenticated;
    create policy admin_write on public.application_records for all to authenticated
      using (private.is_app_admin()) with check (private.is_app_admin());
    create policy reference_read on public.application_records for select to authenticated
      using (public.is_confirmed_mgenesis_user() and record_type in ('partner_company','survey'));
    create function public.synthetic_normalization() returns trigger language plpgsql as $$begin
      if new.record_type='partner_company' and new.record_id='normalized' then
        new.payload := jsonb_set(jsonb_set(new.payload, '{branches,0,status}', '"Completed"'::jsonb), '{branches,0,manualStatus}', '"Inactive"'::jsonb);
      end if;
      if new.record_type='active_company_snapshot' and current_setting('test.fail_snapshot', true)='yes' then
        raise exception 'Synthetic snapshot failure';
      end if;
      return new;
    end$$;
    create trigger synthetic_normalization before insert or update on public.application_records
      for each row execute function public.synthetic_normalization();
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/202610300001_active_evaluation_lists.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/202611060001_master_list_active_companies.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/202611100001_master_list_company_membership.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into public.application_records values
    ('partner_company','old','{"id":"old"}',now()),
    ('survey','survey','{"surveyType":"Supplier","evaluationCompanyIds":["retained"]}',now()),
    ('survey_response','response','{"answer":"retained"}',now()),
    ('active_company_snapshot','old-list','{"surveyType":"Supplier","companies":["Old Partner"],"uploadedAt":"2020-01-01"}',now());`);
  const company = (id, type, statuses = [], isArchived = false) => ({ id, name: `Partner ${id}`, type, isArchived,
    createdAt: '2026-01-01', branches: statuses.map((status, i) => ({ id: `${id}-${i}`, bpCode: id, ...(status ? { status } : {}) })) });
  const companies = [company('pending','Supplier',['Pending']), company('inactive','Supplier',['Inactive']),
    company('mixed','Supplier',['Inactive','Incomplete']), company('legacy','Courier',[null]),
    company('archived','Courier',['Accredited'],true), company('unknown','Uncategorized',['Accredited']),
    company('empty-branches','Supplier'), company('normalized','Courier',['Inactive'])];
  const call = rows => db.query(`select public.import_partner_master_list($1::jsonb, 'synthetic-master.csv') as result`, [JSON.stringify(rows)]);
  const readAll = () => db.query(`select record_type, record_id, payload from public.application_records order by record_type, record_id`);
  await db.exec('set role anon');
  await assert.rejects(call(companies), /permission denied/);
  await db.exec(`reset role; set role authenticated; set test.confirmed='yes'; set test.admin='no'`);
  await assert.rejects(call(companies), /confirmed Admin/);
  assert.equal((await db.query(`select * from public.application_records where record_type='active_company_snapshot'`)).rows.length, 0);
  await db.exec(`set test.admin='yes'; set test.confirmed='no'`);
  await assert.rejects(call(companies), /confirmed Admin/);
  await db.exec(`set test.confirmed='yes'`);
  const before = await readAll();
  for (const invalid of [null, [], {}, [null], [{ ...companies[0], branches: {} }],
    [{ ...companies[0], branches: [{ id: 'bad', status: 'Wrong' }] }], [companies[0], companies[0]]]) {
    await assert.rejects(call(invalid));
    assert.deepEqual(await readAll(), before);
  }
  await db.exec(`set test.fail_snapshot='yes'`);
  await assert.rejects(call(companies), /Synthetic snapshot failure/);
  assert.deepEqual(await readAll(), before, 'snapshot failure rolls back registry upserts and deletions');
  await db.exec(`set test.fail_snapshot='no'`);
  const saved = (await call(companies)).rows[0].result;
  assert.deepEqual(saved.snapshots.map(({ surveyType, companies, masterListCompanies }) => ({ surveyType, companies, masterListCompanies })), [
    { surveyType: 'Courier', companies: ['Partner legacy'], masterListCompanies: ['Partner legacy', 'Partner normalized'] },
    { surveyType: 'Supplier', companies: ['Partner empty-branches', 'Partner mixed', 'Partner pending'], masterListCompanies: ['Partner empty-branches', 'Partner inactive', 'Partner mixed', 'Partner pending'] },
    { surveyType: 'Subcontractor', companies: [], masterListCompanies: [] },
  ]);
  assert.equal(saved.companies.find(c => c.id === 'normalized').branches[0].status, 'Completed');
  assert.equal((await db.query(`select * from public.application_records where record_type='partner_company' and record_id='old'`)).rows.length, 0);
  assert.equal((await db.query(`select * from public.application_records where record_type='active_company_snapshot'`)).rows.length, 4);
  assert.deepEqual((await db.query(`select payload from public.application_records where record_type='survey_response'`)).rows[0].payload, { answer: 'retained' });
  assert.deepEqual((await db.query(`select payload from public.application_records where record_type='survey'`)).rows[0].payload.evaluationCompanyIds, ['retained']);
  await db.query(`insert into public.application_records(record_type, record_id, payload) values
    ('active_company_snapshot','manual-override', jsonb_build_object('surveyType','Supplier','companies','["Manual Supplier"]'::jsonb,'uploadedAt',clock_timestamp()))`);
  assert.deepEqual((await db.query(`select companies, membership_complete from public.get_active_evaluation_lists() where survey_type='Supplier'`)).rows[0],
    { companies: ['Manual Supplier'], membership_complete: false });
  await call([company('all-inactive','Supplier',['Inactive'])]);
  assert.deepEqual((await db.query(`select survey_type, companies, membership_complete from public.get_active_evaluation_lists()`)).rows, [
    { survey_type: 'Courier', companies: [], membership_complete: true },
    { survey_type: 'Subcontractor', companies: [], membership_complete: true },
    { survey_type: 'Supplier', companies: ['Partner all-inactive'], membership_complete: true },
  ]);
  await db.exec(`set test.admin='no'`);
  assert.equal((await db.query(`select * from public.get_active_evaluation_lists()`)).rows.length, 3);
  assert.equal((await db.query(`select * from public.application_records where record_type='active_company_snapshot'`)).rows.length, 0);
  console.log('PASS: Admin/confirmed-account checks, unchanged RLS privacy, malformed-input rejection, transactional rollback, post-trigger status, all categories/empty replacement, and retained history/answers/selections.');
} finally { await db.close(); }
