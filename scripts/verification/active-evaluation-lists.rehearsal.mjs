// Run with the path to an installed PGlite dist/index.js. Uses only in-memory
// synthetic records; never connects to Supabase or reads local credentials.
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
    create table public.application_records (record_type text, record_id text, payload jsonb,
      updated_at timestamptz default now(), primary key(record_type, record_id));
    alter table public.application_records enable row level security;
    grant select on public.application_records to authenticated;
    create policy synthetic_read on public.application_records for select to authenticated
      using (record_type = 'survey' or current_setting('test.admin', true) = 'yes');
    create function public.is_confirmed_mgenesis_user() returns boolean language sql
      as $$select coalesce(current_setting('test.confirmed', true), '') = 'yes'$$;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/202610300001_active_evaluation_lists.sql', import.meta.url), 'utf8'));
  await db.query(`insert into public.application_records values
    ('survey','supplier', $1::jsonb, '2000-01-01'),
    ('survey','courier', $2::jsonb, '2000-01-01')`,
    [JSON.stringify({ surveyType: 'Supplier', questions: [], evaluationCompanyIds: ['retained-selection'] }), JSON.stringify({ surveyType: 'Courier' })]);
  const upload = async (id, type, timestamp, companies) => db.query(`insert into public.application_records(record_type, record_id, payload)
    values ('active_company_snapshot',$1,$2::jsonb)`, [id, JSON.stringify({ surveyType: type, uploadedAt: timestamp, companies,
      uploadedBy: 'private.synthetic@mgenesis.com', sourceFileName: 'private-upload.xlsx' })]);
  await upload('older', 'Supplier', '2026-01-01T00:00:00Z', ['Old Supplier']);
  await upload('latest', 'Supplier', '2026-10-30T01:00:00Z', ['Selected Supplier']);
  await upload('equal-time-a', 'Courier', '2026-10-30T01:00:00Z', ['Earlier tie']);
  await upload('equal-time-z', 'Courier', '2026-10-30T01:00:00Z', ['Deterministic tie']);
  const baseline = await db.query(`select payload from public.application_records where record_type='survey' and record_id='supplier'`);
  assert.deepEqual(baseline.rows[0].payload.evaluationCompanyIds, ['retained-selection']);
  await db.exec(`set role anon`);
  await assert.rejects(db.query(`select * from public.get_active_evaluation_lists()`), /permission denied/);
  await db.exec(`reset role; set role authenticated; set test.confirmed='no'`);
  await assert.rejects(db.query(`select * from public.get_active_evaluation_lists()`), /confirmed Microgenesis/);
  await db.exec(`set test.confirmed='yes'; set test.admin='no'`);
  assert.equal((await db.query(`select * from public.application_records where record_type='active_company_snapshot'`)).rows.length, 0);
  const projection = await db.query(`select * from public.get_active_evaluation_lists()`);
  assert.deepEqual(projection.rows, [
    { survey_type: 'Courier', companies: ['Deterministic tie'] },
    { survey_type: 'Supplier', companies: ['Selected Supplier'] },
  ]);
  assert.doesNotMatch(JSON.stringify(projection.rows), /private-upload|private.synthetic/);
  await assert.rejects(db.query(`select public.notify_active_evaluation_list_change()`), /permission denied/);
  await db.exec(`reset role`);
  const previousTimestamp = (await db.query(`select updated_at from public.application_records where record_type='survey' and record_id='supplier'`)).rows[0].updated_at;
  await db.query(`update public.application_records set payload=jsonb_set(payload,'{companies}','["Replacement Supplier"]') where record_type='active_company_snapshot' and record_id='latest'`);
  const refreshed = await db.query(`select payload,updated_at from public.application_records where record_type='survey' and record_id='supplier'`);
  assert.deepEqual(refreshed.rows[0].payload, baseline.rows[0].payload);
  assert.ok(new Date(refreshed.rows[0].updated_at) >= new Date(previousTimestamp));
  assert.deepEqual((await db.query(`select companies from public.get_active_evaluation_lists() where survey_type='Supplier'`)).rows[0].companies, ['Replacement Supplier']);
  await db.query(`delete from public.application_records where record_type='active_company_snapshot' and record_id='latest'`);
  assert.deepEqual((await db.query(`select companies from public.get_active_evaluation_lists() where survey_type='Supplier'`)).rows[0].companies, ['Old Supplier']);
  await db.query(`delete from public.application_records where record_type='active_company_snapshot' and record_id='older'`);
  assert.equal((await db.query(`select * from public.get_active_evaluation_lists() where survey_type='Supplier'`)).rows.length, 0);
  console.log('PASS: latest/tie selection, anonymous and unconfirmed denial, employee privacy, insert/update/delete invalidation, preserved survey payloads, and missing-list behavior.');
} finally { await db.close(); }
