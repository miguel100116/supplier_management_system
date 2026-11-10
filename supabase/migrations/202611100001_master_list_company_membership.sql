-- Keep Master List membership separate from the active-only upload history.
-- Existing snapshots remain valid but need one Master List re-upload to add
-- complete membership; no registry or history rows are inferred or rewritten.
-- Rollback: deploy the prior application, then restore the prior projection
-- and import functions from 202611060001_master_list_active_companies.sql.

drop function if exists public.get_active_evaluation_lists();
create function public.get_active_evaluation_lists()
returns table (survey_type text, companies jsonb, membership_complete boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_confirmed_mgenesis_user() then
    raise exception 'A confirmed Microgenesis account is required.' using errcode = '42501';
  end if;
  return query
    select distinct on (ar.payload ->> 'surveyType')
      ar.payload ->> 'surveyType',
      case when jsonb_typeof(ar.payload -> 'masterListCompanies') = 'array'
        then ar.payload -> 'masterListCompanies' else ar.payload -> 'companies' end,
      coalesce(jsonb_typeof(ar.payload -> 'masterListCompanies') = 'array', false)
    from public.application_records ar
    where ar.record_type = 'active_company_snapshot'
      and ar.payload ->> 'surveyType' in ('Supplier', 'Courier', 'Subcontractor')
    order by ar.payload ->> 'surveyType',
      (ar.payload ->> 'uploadedAt')::timestamptz desc, ar.record_id desc;
end;
$$;
revoke all on function public.get_active_evaluation_lists() from public, anon;
grant execute on function public.get_active_evaluation_lists() to authenticated;

create or replace function public.import_partner_master_list(p_companies jsonb, p_source_file_name text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_companies jsonb;
  v_snapshots jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_names jsonb;
  v_master_list_names jsonb;
  v_type text;
  v_id text;
  v_uploaded_at timestamptz := clock_timestamp();
begin
  if not coalesce(public.is_confirmed_mgenesis_user() and private.is_app_admin(), false) then
    raise exception 'A confirmed Admin account is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_companies) is distinct from 'array' then
    raise exception 'The reviewed registry must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_companies) not between 1 and 10000
    or p_source_file_name is null or length(btrim(p_source_file_name)) not between 1 and 2000 then
    raise exception 'A non-empty bounded registry and source filename are required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_companies) c
    where jsonb_typeof(c) is distinct from 'object'
      or jsonb_typeof(c->'id') is distinct from 'string' or length(btrim(c->>'id')) not between 1 and 500
      or jsonb_typeof(c->'name') is distinct from 'string' or length(btrim(c->>'name')) not between 1 and 500
      or coalesce(c->>'type', '') not in ('Courier', 'Supplier', 'Subcontractor', 'Uncategorized')
      or jsonb_typeof(c->'createdAt') is distinct from 'string'
      or (c ? 'isArchived' and jsonb_typeof(c->'isArchived') <> 'boolean')
      or jsonb_typeof(c->'branches') is distinct from 'array'
  ) or (select count(distinct c->>'id') from jsonb_array_elements(p_companies) c) <> jsonb_array_length(p_companies) then
    raise exception 'Invalid or duplicate partner company records.' using errcode = '22023';
  end if;
  perform (c->>'createdAt')::timestamptz from jsonb_array_elements(p_companies) c;
  if exists (select 1 from jsonb_array_elements(p_companies) c where jsonb_array_length(c->'branches') > 500) then
    raise exception 'Too many partner branches.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_companies) c, jsonb_array_elements(c->'branches') b
    where jsonb_typeof(b) is distinct from 'object'
      or jsonb_typeof(b->'id') is distinct from 'string'
      or (b ? 'status' and coalesce(b->>'status', '') not in ('Pending', 'Updated', 'Outdated', 'Incomplete', 'Completed', 'Accredited', 'Inactive'))
  ) then
    raise exception 'Invalid partner branch records.' using errcode = '22023';
  end if;

  insert into public.application_records(record_type, record_id, payload)
    select 'partner_company', c->>'id', c from jsonb_array_elements(p_companies) c
    on conflict (record_type, record_id) do update set payload = excluded.payload;
  delete from public.application_records ar
    where ar.record_type = 'partner_company'
      and not exists (select 1 from jsonb_array_elements(p_companies) c where c->>'id' = ar.record_id);

  -- Read back after existing document/completion triggers have normalized payloads.
  select jsonb_agg(ar.payload order by ar.record_id) into v_companies
    from public.application_records ar where ar.record_type = 'partner_company';
  foreach v_type in array array['Courier', 'Supplier', 'Subcontractor'] loop
    select coalesce(jsonb_agg(n.name order by n.name), '[]'::jsonb) into v_names from (
      select distinct c->>'name' as name from jsonb_array_elements(v_companies) c
      where c->>'type' = v_type and coalesce(c->>'isArchived', 'false') <> 'true'
        and (jsonb_array_length(c->'branches') = 0 or exists (
          select 1 from jsonb_array_elements(c->'branches') b where b->>'status' is distinct from 'Inactive'
            and not (coalesce(b->>'status', '') = 'Completed' and coalesce(b->>'manualStatus', '') = 'Inactive')
        ))
    ) n;
    select coalesce(jsonb_agg(n.name order by n.name), '[]'::jsonb) into v_master_list_names from (
      select distinct c->>'name' as name from jsonb_array_elements(v_companies) c
      where c->>'type' = v_type and coalesce(c->>'isArchived', 'false') <> 'true'
    ) n;
    v_id := lower(v_type) || '-master-list-' || gen_random_uuid()::text;
    v_snapshot := jsonb_build_object('id', v_id, 'surveyType', v_type,
      'uploadedAt', v_uploaded_at, 'uploadedBy', private.my_app_email(),
      'sourceFileName', p_source_file_name, 'companies', v_names,
      'masterListCompanies', v_master_list_names);
    insert into public.application_records(record_type, record_id, payload)
      values ('active_company_snapshot', v_id, v_snapshot);
    v_snapshots := v_snapshots || jsonb_build_array(v_snapshot);
  end loop;
  return jsonb_build_object('companies', v_companies, 'snapshots', v_snapshots);
end;
$$;
revoke all on function public.import_partner_master_list(jsonb, text) from public, anon;
grant execute on function public.import_partner_master_list(jsonb, text) to authenticated;
