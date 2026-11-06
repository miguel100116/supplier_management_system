// Synthetic PostgreSQL only: node --import tsx <this file> <installed pglite/dist/index.js>.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseApplicationRecordPayload } from '../../src/services/applicationRecordSchemas.ts';

if (!process.argv[2]) throw new Error('Pass the path to an installed @electric-sql/pglite dist/index.js.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`
    create schema private; create schema auth;
    create function auth.jwt() returns jsonb language sql stable
      as $$select jsonb_build_object('email', current_setting('test.email', true))$$;
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('test.user_id', true), '')::uuid$$;
    create function private.my_app_email() returns text language sql stable
      as $$select lower(coalesce(auth.jwt()->>'email', ''))$$;
    create table public.application_records(record_type text, record_id text, payload jsonb, owner_id uuid,
      primary key(record_type, record_id));
    alter table public.application_records enable row level security;
    create policy synthetic_admin on public.application_records for all using (true) with check (true);
  `);
  const originalMigration = await readFile(new URL('../../supabase/migrations/202610280001_partner_document_compliance_rules.sql', import.meta.url), 'utf8');
  await db.exec(originalMigration.slice(originalMigration.indexOf('create or replace function public.audit_partner_document_configuration()'),
    originalMigration.indexOf('create or replace function public.run_document_expiry_reminders()')));
  await db.query(`insert into public.application_records values ('partner_company','partner',$1::jsonb,null)`,
    [JSON.stringify({ id: 'partner', name: 'Synthetic Partner', type: 'Supplier', businessClassification: 'CORP', documents: { retained: true } })]);
  await db.exec(`update public.application_records set payload=payload-'businessClassification' where record_id='partner'`);
  const historical = (await db.query(`select record_id, payload from public.application_records where record_type='document_modification'`)).rows[0];
  assert.equal(historical.payload.actorEmail, '', 'reproduce the SQL Editor empty-string fallback bug');
  assert.throws(() => parseApplicationRecordPayload('document_modification', historical.payload, historical.record_id), /actorEmail is required/);
  const ownedPayload = { ...historical.payload, id: 'owned-invalid' };
  await db.query(`insert into public.application_records values ('document_modification','owned-invalid',$1::jsonb,'00000000-0000-4000-8000-000000000001')`, [JSON.stringify(ownedPayload)]);
  const policiesBefore = await db.query(`select policyname, roles, cmd, qual, with_check from pg_policies order by policyname`);
  const permissionsBefore = await db.query(`select proowner, proacl, prosecdef, proconfig from pg_proc where oid='public.audit_partner_document_configuration()'::regprocedure`);
  const migration = await readFile(new URL('../../supabase/migrations/202611060002_document_audit_actor_fallback.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const repaired = (await db.query(`select payload from public.application_records where record_type='document_modification' and record_id=$1`, [historical.record_id])).rows[0].payload;
  assert.equal(repaired.actorEmail, 'system');
  assert.deepEqual({ ...repaired, actorEmail: '' }, historical.payload, 'retain original audit identity, event, and timestamp');
  parseApplicationRecordPayload('document_modification', repaired, historical.record_id);
  assert.deepEqual((await db.query(`select payload from public.application_records where record_id='owned-invalid'`)).rows[0].payload, ownedPayload,
    'do not guess the identity of an owned historical record');
  await db.exec(`delete from public.application_records where record_id='owned-invalid'`);
  assert.deepEqual(await db.query(`select policyname, roles, cmd, qual, with_check from pg_policies order by policyname`), policiesBefore);
  assert.deepEqual(await db.query(`select proowner, proacl, prosecdef, proconfig from pg_proc where oid='public.audit_partner_document_configuration()'::regprocedure`), permissionsBefore);
  const partnerBefore = (await db.query(`select payload from public.application_records where record_id='partner'`)).rows[0].payload;
  for (const [email, actor, userId] of [[null, 'system', ''], ['', 'system', ''], ['   ', 'system', ''],
    ['Synthetic.Admin@MGENESIS.COM', 'synthetic.admin@mgenesis.com', '00000000-0000-4000-8000-000000000001']]) {
    await db.query(`select set_config('test.email', $1, false), set_config('test.user_id', $2, false)`, [email ?? '', userId]);
    const beforeIds = new Set((await db.query(`select record_id from public.application_records where record_type='document_modification'`)).rows.map(row => row.record_id));
    await db.exec(`update public.application_records set payload=jsonb_set(payload,'{businessClassification}','"SOL"') where record_id='partner';
      update public.application_records set payload=payload-'businessClassification' where record_id='partner';
      insert into public.application_records values ('document_maintenance','default','{"id":"default"}',null)
        on conflict(record_type,record_id) do update set payload=excluded.payload;`);
    const logs = (await db.query(`select record_id,payload,owner_id from public.application_records where record_type='document_modification'`)).rows;
    assert.equal(logs.length, beforeIds.size + 3, 'both classification and maintenance paths retain their audit events');
    for (const log of logs) {
      parseApplicationRecordPayload('document_modification', log.payload, log.record_id);
      if (!beforeIds.has(log.record_id)) {
        assert.equal(log.payload.actorEmail, actor);
        assert.equal(log.owner_id, userId || null);
      }
    }
    assert.deepEqual((await db.query(`select payload from public.application_records where record_id='partner'`)).rows[0].payload, partnerBefore);
  }
  const allBeforeRepeat = await db.query(`select * from public.application_records order by record_type,record_id`);
  await db.exec(migration);
  assert.deepEqual(await db.query(`select * from public.application_records order by record_type,record_id`), allBeforeRepeat);
  console.log('PASS: reproduced empty actor quarantine, repaired unowned history only, kept strict validation, covered empty/whitespace/authenticated actors on both audit paths, unchanged policies/function grants/business data, and idempotence.');
} finally { await db.close(); }
