-- Classification-aware document compliance, maintenance configuration, and
-- idempotent in-app expiry reminders. Additive: existing partner payloads and
-- historical document values are never rewritten by this migration.

alter table public.application_records drop constraint if exists application_records_record_type_check;
alter table public.application_records add constraint application_records_record_type_check check (record_type in (
  'partner_company', 'survey', 'survey_response', 'archive_series',
  'department_permission', 'category_labels', 'feedback_contact',
  'feedback_report', 'feedback_settings', 'document_notification_rule',
  'notification_read_state', 'admin_activity', 'document_modification',
  'export_history', 'supplier_ranking_history', 'employee_notification_state',
  'reminder_settings', 'compliance_snapshot', 'active_company_snapshot',
  'evaluation_import_archive', 'document_maintenance', 'document_reminder_delivery'
));

create or replace function public.validate_partner_document_compliance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_class text := new.payload ->> 'businessClassification';
  v_branch jsonb;
  v_documents jsonb;
  v_doc_name text;
  v_doc jsonb;
begin
  if new.record_type <> 'partner_company' then return new; end if;
  if v_class is not null and v_class not in ('CORP', 'SOL') then
    raise exception 'Business classification must be CORP or SOL.' using errcode = '22023';
  end if;
  if coalesce(new.payload ->> 'type', '') <> 'Uncategorized'
    and not (new.payload ->> 'type' = 'Supplier' and coalesce(new.payload ->> 'supplierOrigin', 'Local') = 'Foreign')
    and v_class in ('CORP', 'SOL') then
    for v_branch in select value from jsonb_array_elements(coalesce(new.payload -> 'branches', '[]'::jsonb)) loop
      v_documents := coalesce(v_branch -> 'documents', '{}'::jsonb);
      foreach v_doc_name in array (case when v_class = 'CORP' then array['GIS (Corp)', 'SEC (Corp)'] else array['DTI (Sole)'] end) loop
        v_doc := v_documents -> v_doc_name;
        if v_doc is null or coalesce((v_doc ->> 'provided')::boolean, false) = false
          or (v_doc_name in ('GIS (Corp)', 'DTI (Sole)') and nullif(btrim(v_doc ->> 'expiryDate'), '') is null) then
          if nullif(btrim(v_doc ->> 'remarks'), '') is null then
            raise exception '% requires remarks while it is missing or not provided.', v_doc_name using errcode = '22023';
          end if;
        end if;
      end loop;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists application_records_validate_partner_documents on public.application_records;
create trigger application_records_validate_partner_documents
before insert or update of payload on public.application_records
for each row execute function public.validate_partner_document_compliance();

create or replace function public.renew_partner_document(
  p_company_id text,
  p_branch_id text,
  p_document_name text,
  p_expected_document jsonb,
  p_next_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_branch_index integer;
  v_match_count integer;
  v_current_document jsonb;
  v_next_document jsonb;
  v_next_payload jsonb;
  v_actor text := private.my_app_email();
  v_can_renew boolean;
  v_class text;
  v_audit_id text := 'DOC-MOD-' || gen_random_uuid()::text;
  v_change text;
  v_is_other boolean;
begin
  if not public.is_confirmed_mgenesis_user() then raise exception 'A confirmed Microgenesis account is required.' using errcode = '42501'; end if;
  select coalesce(role = 'Admin' or 'renew-documents' = any(coalesce(permission_pages, array[]::text[])), false)
  into v_can_renew from public.app_profiles where email = v_actor limit 1;
  if not coalesce(v_can_renew, false) then raise exception 'Document renewal permission is required.' using errcode = '42501'; end if;
  if p_company_id is null or length(p_company_id) not between 1 and 500
    or p_branch_id is null or length(p_branch_id) not between 1 and 500
    or p_document_name is null or length(p_document_name) not between 1 and 500 then
    raise exception 'Company, branch, and document identifiers are required.' using errcode = '22023';
  end if;
  v_is_other := p_document_name like 'Other: %' and length(btrim(substr(p_document_name, 8))) between 1 and 120;
  if not v_is_other and p_document_name <> all(array[
    'Confidentiality and Non-Disclosure Agreement', 'Letter of Accreditation',
    'Supplier Code of Business Conduct and Ethics', 'SIF', 'BIR2303', 'SEC (Corp)',
    'Articles of Incorporation', 'AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit',
    'Import Permit', 'Product Profile', 'Proof of Present Address',
    'Sole Proprietorship (Owner''s ID)', 'Other Documents', 'Certificate of Incorporation',
    'Business Permit/License', 'Owner''s ID'
  ]::text[]) then raise exception 'Unsupported compliance document.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_expected_document, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(p_next_document) <> 'object'
    or not (p_next_document ? 'provided')
    or jsonb_typeof(p_next_document -> 'provided') <> 'boolean'
    or exists (select 1 from jsonb_object_keys(p_next_document) as key where key not in ('provided', 'expiryDate', 'remarks', 'description')) then
    raise exception 'Only provided, expiryDate, remarks, and description may be changed.' using errcode = '22023';
  end if;
  if p_next_document ? 'remarks' and (jsonb_typeof(p_next_document -> 'remarks') <> 'string' or length(p_next_document ->> 'remarks') > 2000) then
    raise exception 'Remarks must be text up to 2000 characters.' using errcode = '22023';
  end if;
  if p_next_document ? 'description' and (jsonb_typeof(p_next_document -> 'description') <> 'string' or length(p_next_document ->> 'description') > 500) then
    raise exception 'Description must be text up to 500 characters.' using errcode = '22023';
  end if;
  if p_next_document ? 'expiryDate' then
    if jsonb_typeof(p_next_document -> 'expiryDate') <> 'string' or (p_next_document ->> 'expiryDate') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'expiryDate must use YYYY-MM-DD.' using errcode = '22023';
    end if;
    perform (p_next_document ->> 'expiryDate')::date;
  end if;
  if p_document_name = any(array['AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit', 'Business Permit/License']::text[])
    and coalesce((p_next_document ->> 'provided')::boolean, false)
    and not (p_next_document ? 'expiryDate') then
    raise exception 'This document requires an expiryDate.' using errcode = '22023';
  end if;
  select payload into v_payload from public.application_records where record_type = 'partner_company' and record_id = p_company_id for update;
  if v_payload is null then raise exception 'Partner company was not found.' using errcode = 'P0002'; end if;
  v_class := v_payload ->> 'businessClassification';
  if coalesce(v_payload ->> 'type', '') <> 'Uncategorized' and not (v_payload ->> 'type' = 'Supplier' and coalesce(v_payload ->> 'supplierOrigin', 'Local') = 'Foreign') then
    if p_document_name = 'DTI (Sole)' and v_class = 'CORP' or p_document_name in ('GIS (Corp)', 'SEC (Corp)') and v_class = 'SOL' then
      raise exception 'This document is not applicable to the current CORP/SOL classification.' using errcode = '22023';
    end if;
  end if;
  select count(*), min(ordinality::integer - 1) into v_match_count, v_branch_index
  from jsonb_array_elements(coalesce(v_payload -> 'branches', '[]'::jsonb)) with ordinality as branch(value, ordinality)
  where branch.value ->> 'id' = p_branch_id;
  if v_match_count <> 1 then raise exception 'The branch identifier is missing or ambiguous.' using errcode = '22023'; end if;
  v_current_document := coalesce(v_payload #> array['branches', v_branch_index::text, 'documents', p_document_name], '{}'::jsonb);
  if v_current_document is distinct from coalesce(p_expected_document, '{}'::jsonb) then raise exception 'The document changed since it was opened. Refresh and retry.' using errcode = '40001'; end if;
  v_next_document := v_current_document || p_next_document;
  if (v_payload ->> 'type' <> 'Uncategorized' and not (v_payload ->> 'type' = 'Supplier' and coalesce(v_payload ->> 'supplierOrigin', 'Local') = 'Foreign')
      and ((v_class = 'CORP' and p_document_name in ('GIS (Corp)', 'SEC (Corp)')) or (v_class = 'SOL' and p_document_name = 'DTI (Sole)')))
    and (not coalesce((v_next_document ->> 'provided')::boolean, false) or (p_document_name in ('GIS (Corp)', 'DTI (Sole)') and not (v_next_document ? 'expiryDate')))
    and nullif(btrim(v_next_document ->> 'remarks'), '') is null then
    raise exception '% requires remarks while it is missing or not provided.', p_document_name using errcode = '22023';
  end if;
  v_next_payload := jsonb_set(v_payload, array['branches', v_branch_index::text, 'documents'],
    coalesce(v_payload #> array['branches', v_branch_index::text, 'documents'], '{}'::jsonb), true);
  v_next_payload := jsonb_set(v_next_payload, array['branches', v_branch_index::text, 'documents', p_document_name], v_next_document, true);
  update public.application_records set payload = v_next_payload where record_type = 'partner_company' and record_id = p_company_id;
  v_change := case
    when p_next_document ? 'expiryDate' then 'Renewed - expiry ' || coalesce(v_current_document ->> 'expiryDate', 'not previously set') || ' to ' || (p_next_document ->> 'expiryDate')
    when (p_next_document ->> 'provided')::boolean then 'Marked provided'
    else 'Marked not provided' || case when v_current_document ? 'expiryDate' then '; prior expiry retained: ' || (v_current_document ->> 'expiryDate') else '' end
  end;
  if p_next_document ? 'remarks' then v_change := v_change || '; remarks updated'; end if;
  insert into public.application_records(record_type, record_id, payload, owner_id) values (
    'document_modification', v_audit_id,
    jsonb_build_object('id', v_audit_id, 'actorEmail', v_actor, 'category', coalesce(v_payload ->> 'type', 'Unknown'),
      'companyName', coalesce(v_payload ->> 'name', p_company_id), 'docName', p_document_name,
      'change', v_change, 'timestamp', now()), auth.uid());
  return v_next_payload;
end;
$$;
revoke all on function public.renew_partner_document(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.renew_partner_document(text, text, text, jsonb, jsonb) to authenticated;

create policy "application_records_document_maintenance_select_admin"
  on public.application_records for select to authenticated
  using (record_type in ('document_maintenance', 'document_reminder_delivery') and private.is_app_admin());

create or replace function public.validate_document_maintenance_payload()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entry record;
  v_allowed text[] := array['AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit', 'Business Permit/License'];
begin
  if new.record_type <> 'document_maintenance' then return new; end if;
  if new.record_id <> 'default'
    or jsonb_typeof(new.payload -> 'validityYears') is distinct from 'object'
    or jsonb_typeof(new.payload -> 'reminderDays') is distinct from 'array'
    or jsonb_typeof(new.payload -> 'dailyFinalDays') is distinct from 'number' then
    raise exception 'Document maintenance settings have an invalid shape.' using errcode = '22023';
  end if;
  if (new.payload ->> 'dailyFinalDays') !~ '^\d+$' then raise exception 'Daily reminder window must be a whole number.' using errcode = '22023'; end if;
  if (new.payload ->> 'dailyFinalDays')::integer not between 1 and 90 then
    raise exception 'Daily reminder window must be between 1 and 90 days.' using errcode = '22023';
  end if;
  if jsonb_array_length(new.payload -> 'reminderDays') > 20 then raise exception 'At most 20 reminder intervals are allowed.' using errcode = '22023'; end if;
  for v_entry in select value from jsonb_array_elements(new.payload -> 'reminderDays') loop
    if jsonb_typeof(v_entry.value) is distinct from 'number' or (v_entry.value #>> '{}') !~ '^\d+$' then
      raise exception 'Reminder intervals must be whole days from 1 to 365.' using errcode = '22023';
    end if;
    if (v_entry.value #>> '{}')::integer not between 1 and 365 then raise exception 'Reminder intervals must be whole days from 1 to 365.' using errcode = '22023'; end if;
  end loop;
  if (select count(*) <> count(distinct value #>> '{}') from jsonb_array_elements(new.payload -> 'reminderDays')) then
    raise exception 'Reminder intervals must be unique.' using errcode = '22023';
  end if;
  for v_entry in select key, value from jsonb_each(new.payload -> 'validityYears') loop
    if not (v_entry.key = any(v_allowed)) then raise exception 'Unsupported document validity key.' using errcode = '22023'; end if;
    if jsonb_typeof(v_entry.value) <> 'null' then
      if jsonb_typeof(v_entry.value) is distinct from 'number' or (v_entry.value #>> '{}') !~ '^\d+$' then
        raise exception 'Validity periods must be whole years from 1 to 50 or unset.' using errcode = '22023';
      end if;
      if (v_entry.value #>> '{}')::integer not between 1 and 50 then raise exception 'Validity periods must be whole years from 1 to 50 or unset.' using errcode = '22023'; end if;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists application_records_validate_document_maintenance on public.application_records;
create trigger application_records_validate_document_maintenance
before insert or update of payload on public.application_records
for each row when (new.record_type = 'document_maintenance')
execute function public.validate_document_maintenance_payload();

insert into public.application_records(record_type, record_id, payload)
values (
  'document_maintenance', 'default',
  '{"id":"default","validityYears":{"AFS":null,"GIS (Corp)":null,"DTI (Sole)":null,"Business Permit":null,"Import Permit":null,"Business Permit/License":null},"reminderDays":[60,30],"dailyFinalDays":30}'::jsonb
)
on conflict (record_type, record_id) do nothing;

create or replace function public.audit_partner_document_configuration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := 'DOC-MOD-' || gen_random_uuid()::text;
  v_change text;
  v_company text;
begin
  if new.record_type = 'partner_company' then
    if tg_op = 'UPDATE' and old.payload ->> 'businessClassification' is distinct from new.payload ->> 'businessClassification' then
      v_company := coalesce(new.payload ->> 'name', new.record_id);
      v_change := 'Business classification changed from ' || coalesce(old.payload ->> 'businessClassification', 'unclassified') || ' to ' || coalesce(new.payload ->> 'businessClassification', 'unclassified');
      insert into public.application_records(record_type, record_id, payload, owner_id) values (
        'document_modification', v_id,
        jsonb_build_object('id', v_id, 'actorEmail', coalesce(private.my_app_email(), 'system'), 'category', coalesce(new.payload ->> 'type', 'Unknown'),
          'companyName', v_company, 'docName', 'Business Classification', 'change', v_change, 'timestamp', now()), auth.uid());
    end if;
  elsif new.record_type = 'document_maintenance' then
    v_change := case when tg_op = 'INSERT' then 'Created document maintenance settings' else 'Updated validity periods and reminder schedule' end;
    insert into public.application_records(record_type, record_id, payload, owner_id) values (
      'document_modification', v_id,
      jsonb_build_object('id', v_id, 'actorEmail', coalesce(private.my_app_email(), 'system'), 'category', 'Admin Settings',
        'companyName', 'Document Maintenance', 'docName', 'Validity and Reminder Configuration', 'change', v_change, 'timestamp', now()), auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists application_records_audit_document_configuration on public.application_records;
create trigger application_records_audit_document_configuration
after insert or update of payload on public.application_records
for each row when (new.record_type in ('partner_company', 'document_maintenance'))
execute function public.audit_partner_document_configuration();

create or replace function public.run_document_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_company record;
  v_branch jsonb;
  v_doc record;
  v_days integer;
  v_milestone text;
  v_inserted integer := 0;
  v_id text;
  v_expiry date;
begin
  select payload into v_settings from public.application_records
  where record_type = 'document_maintenance' and record_id = 'default';
  v_settings := coalesce(v_settings, '{"reminderDays":[60,30],"dailyFinalDays":30}'::jsonb);
  for v_company in select record_id, payload from public.application_records where record_type = 'partner_company'
    and payload ->> 'type' in ('Supplier', 'Courier', 'Subcontractor')
    and coalesce((payload ->> 'isArchived')::boolean, false) = false loop
    for v_branch in select value from jsonb_array_elements(coalesce(v_company.payload -> 'branches', '[]'::jsonb)) loop
      for v_doc in select key as doc_name, value as doc from jsonb_each(coalesce(v_branch -> 'documents', '{}'::jsonb)) loop
        if v_doc.doc_name not in ('AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit', 'Business Permit/License')
          or coalesce((v_doc.doc ->> 'provided')::boolean, false) is false
          or nullif(v_doc.doc ->> 'expiryDate', '') is null then continue; end if;
        if (v_doc.doc_name = 'DTI (Sole)' and coalesce(v_company.payload ->> 'businessClassification', '') <> 'SOL')
          or (v_doc.doc_name in ('GIS (Corp)', 'SEC (Corp)') and coalesce(v_company.payload ->> 'businessClassification', '') <> 'CORP') then continue; end if;
        if v_doc.doc_name = 'Business Permit/License' and coalesce(v_company.payload ->> 'supplierOrigin', 'Local') <> 'Foreign' then continue; end if;
        if v_doc.doc_name in ('GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit')
          and coalesce(v_company.payload ->> 'supplierOrigin', 'Local') = 'Foreign' then continue; end if;
        begin v_expiry := (v_doc.doc ->> 'expiryDate')::date; exception when others then continue; end;
        v_days := v_expiry - current_date;
        v_milestone := null;
        if v_days = any(array(select jsonb_array_elements_text(coalesce(v_settings -> 'reminderDays', '[60,30]'::jsonb))::integer)) then
          v_milestone := 'day-' || v_days::text;
        elsif v_days between 0 and coalesce((v_settings ->> 'dailyFinalDays')::integer, 30) then
          v_milestone := 'daily-' || v_days::text;
        end if;
        if v_milestone is null then continue; end if;
        v_id := md5(v_company.record_id || '|' || coalesce(v_branch ->> 'id', '') || '|' || v_doc.doc_name || '|' || v_expiry::text || '|' || v_milestone);
        insert into public.application_records(record_type, record_id, payload)
        values ('document_reminder_delivery', v_id,
          jsonb_build_object('id', v_id, 'companyId', v_company.record_id, 'company', v_company.payload ->> 'name',
            'surveyType', v_company.payload ->> 'type', 'branchId', v_branch ->> 'id', 'branchCode', v_branch ->> 'bpCode',
            'documentName', v_doc.doc_name, 'expiryDate', v_expiry::text, 'daysLeft', v_days,
            'milestone', v_milestone, 'deliveredAt', now()))
        on conflict (record_type, record_id) do nothing;
        if found then v_inserted := v_inserted + 1; end if;
      end loop;
    end loop;
  end loop;
  return v_inserted;
end;
$$;
revoke all on function public.run_document_expiry_reminders() from public, anon, authenticated;
grant execute on function public.run_document_expiry_reminders() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'partner-document-expiry-reminders' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;
select cron.schedule('partner-document-expiry-reminders', '5 0 * * *', $$select public.run_document_expiry_reminders();$$);
