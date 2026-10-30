-- Assignment source: the latest admin-uploaded list, without exposing upload
-- filenames, uploader identities or historical snapshots to employees.
-- Rollback: revert dependent application code, drop this trigger and functions.
-- No business records, answers, lists or survey selections are deleted/rewritten.
create or replace function public.get_active_evaluation_lists()
returns table (survey_type text, companies jsonb)
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
      ar.payload ->> 'surveyType', ar.payload -> 'companies'
    from public.application_records ar
    where ar.record_type = 'active_company_snapshot'
      and ar.payload ->> 'surveyType' in ('Supplier', 'Courier', 'Subcontractor')
    order by ar.payload ->> 'surveyType',
      (ar.payload ->> 'uploadedAt')::timestamptz desc, ar.record_id desc;
end;
$$;
revoke all on function public.get_active_evaluation_lists() from public, anon;
grant execute on function public.get_active_evaluation_lists() to authenticated;

-- Existing survey SELECT policies already allow employees to receive these
-- invalidations. Snapshot rows themselves remain Admin-only under existing RLS.
create or replace function public.notify_active_evaluation_list_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_types text[] := array[]::text[];
begin
  if tg_op <> 'DELETE' and new.record_type = 'active_company_snapshot' then
    v_types := array_append(v_types, new.payload ->> 'surveyType');
  end if;
  if tg_op <> 'INSERT' and old.record_type = 'active_company_snapshot' then
    v_types := array_append(v_types, old.payload ->> 'surveyType');
  end if;
  if cardinality(v_types) > 0 then
    update public.application_records
    set updated_at = clock_timestamp()
    where record_type = 'survey' and payload ->> 'surveyType' = any(v_types);
  end if;
  return null;
end;
$$;
revoke all on function public.notify_active_evaluation_list_change() from public, anon, authenticated;
create trigger application_records_active_evaluation_list_change
after insert or update or delete on public.application_records
for each row execute function public.notify_active_evaluation_list_change();
