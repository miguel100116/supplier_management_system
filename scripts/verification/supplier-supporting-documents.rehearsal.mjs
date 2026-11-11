// Synthetic in-memory PostgreSQL; never connects to a hosted database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass an installed @electric-sql/pglite dist/index.js.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
    create function private.my_app_email() returns text language sql as $$select current_setting('test.email',true)$$;
    create function public.is_confirmed_mgenesis_user() returns boolean language sql as $$select coalesce(current_setting('test.confirmed',true),'')='yes'$$;
    create table public.app_profiles(email text primary key,role text,permission_pages text[]);
    create table public.application_records(record_type text,record_id text,payload jsonb,owner_id uuid,primary key(record_type,record_id));
    alter table public.application_records enable row level security;
    grant select on public.application_records to authenticated;
    create policy reference_read on public.application_records for select to authenticated using(record_type='partner_company');
    insert into public.app_profiles values ('admin@mgenesis.com','Admin','{}'),('employee@mgenesis.com','Employee','{}'),('reviewer@mgenesis.com','Employee','{renew-documents}');
  `);
  const migration = await readFile(new URL('../../supabase/migrations/202611090004_supplier_optional_supporting_documents.sql', import.meta.url),'utf8');
  await db.exec(migration);
  const supporting = {provided:true,remarks:'Synthetic supporting document'};
  const fixture = origin => ({id:origin,name:`Synthetic ${origin} Supplier`,type:'Supplier',supplierOrigin:origin,branches:[
    {id:'first',documents:{SIF:{provided:true},'Other: Synthetic':supporting,'Other: Retained':{provided:false}}},
    {id:'second',documents:{'Other: Synthetic':supporting}},
  ]});
  for (const origin of ['Local','Foreign']) await db.query(`insert into public.application_records values('partner_company',$1,$2::jsonb,null)`,[origin,JSON.stringify(fixture(origin))]);
  const call = (company='Local',branch='first',name='Other: Synthetic',expected=supporting) => db.query(
    `select public.remove_supplier_supporting_document($1,$2,$3,$4::jsonb) result`,[company,branch,name,JSON.stringify(expected)]);
  const readAll = () => db.query(`select * from public.application_records order by record_type,record_id`);
  await db.exec(`set role anon`);
  await assert.rejects(call(),/permission denied/);
  await db.exec(`reset role; set test.email='employee@mgenesis.com'; set test.confirmed='yes'; set role authenticated`);
  await assert.rejects(call(),/renewal permission/);
  await db.exec(`reset role; set test.email='admin@mgenesis.com'; set test.confirmed='no'; set role authenticated`);
  await assert.rejects(call(),/confirmed Microgenesis/);
  await db.exec(`reset role; set test.confirmed='yes'; set role authenticated`);
  await assert.rejects(call('Local','first','SIF',{provided:true}),/valid supporting document/);
  await assert.rejects(call('Local','first','Other: Synthetic',{provided:false}),/changed since/);
  await assert.rejects(call('Local','missing'),/missing or ambiguous/);
  await assert.rejects(call('missing'),/not found/);
  await db.exec('reset role');
  assert.equal((await readAll()).rows.length,2,'rejected calls must not change data or create audit entries');
  for (const [origin,email] of [['Local','admin@mgenesis.com'],['Foreign','reviewer@mgenesis.com']]) {
    await db.exec(`set test.email='${email}'; set role authenticated`);
    const saved = (await call(origin)).rows[0].result;
    const expected = fixture(origin); delete expected.branches[0].documents['Other: Synthetic'];
    assert.deepEqual(saved,expected,'remove only the selected optional document');
    await assert.rejects(call(origin),/not found/);
    await db.exec('reset role');
    const audits = (await db.query(`select payload,owner_id from public.application_records where record_type='document_modification' and payload->>'actorEmail'=$1`,[email])).rows;
    assert.equal(audits.length,1);
    assert.equal(audits[0].payload.change,'Removed optional supporting document');
    assert.equal(audits[0].owner_id,'00000000-0000-4000-8000-000000000001');
  }
  await db.query(`insert into public.application_records values('partner_company','ambiguous',$1::jsonb,null)`,[JSON.stringify({...fixture('Local'),branches:[fixture('Local').branches[0],fixture('Local').branches[0]]})]);
  await db.exec(`set role authenticated`);
  await assert.rejects(call('ambiguous'),/missing or ambiguous/);
  await db.exec('reset role');
  const before = await readAll();
  await db.exec(`create function public.synthetic_audit_failure() returns trigger language plpgsql as $$begin if new.record_type='document_modification' then raise exception 'Synthetic audit failure'; end if; return new; end$$;
    create trigger synthetic_audit_failure before insert on public.application_records for each row execute function public.synthetic_audit_failure(); set role authenticated;`);
  await assert.rejects(call('Local','second'),/Synthetic audit failure/);
  await db.exec('reset role');
  assert.deepEqual(await readAll(),before,'audit failure rolls back the removal');
  console.log('PASS: anonymous/unconfirmed/unauthorized denial, permitted Admin/reviewer removals, required-document protection, stale and ambiguous rejection, retained branches/documents, audit ownership, and transaction rollback.');
} finally { await db.close(); }
