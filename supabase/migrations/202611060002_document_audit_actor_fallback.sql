-- SQL Editor/maintenance operations have no app JWT; the helper returns ''.
-- Rollback: restore the prior audit function, retaining the repaired history.
begin;

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
  v_actor text := coalesce(nullif(btrim(private.my_app_email()), ''), 'system');
begin
  if new.record_type = 'partner_company' then
    if tg_op = 'UPDATE' and old.payload ->> 'businessClassification' is distinct from new.payload ->> 'businessClassification' then
      v_company := coalesce(new.payload ->> 'name', new.record_id);
      v_change := 'Business classification changed from ' || coalesce(old.payload ->> 'businessClassification', 'unclassified') || ' to ' || coalesce(new.payload ->> 'businessClassification', 'unclassified');
      insert into public.application_records(record_type, record_id, payload, owner_id) values (
        'document_modification', v_id,
        jsonb_build_object('id', v_id, 'actorEmail', v_actor, 'category', coalesce(new.payload ->> 'type', 'Unknown'),
          'companyName', v_company, 'docName', 'Business Classification', 'change', v_change, 'timestamp', now()), auth.uid());
    end if;
  elsif new.record_type = 'document_maintenance' then
    v_change := case when tg_op = 'INSERT' then 'Created document maintenance settings' else 'Updated validity periods and reminder schedule' end;
    insert into public.application_records(record_type, record_id, payload, owner_id) values (
      'document_modification', v_id,
      jsonb_build_object('id', v_id, 'actorEmail', v_actor, 'category', 'Admin Settings',
        'companyName', 'Document Maintenance', 'docName', 'Validity and Reminder Configuration', 'change', v_change, 'timestamp', now()), auth.uid());
  end if;
  return new;
end;
$$;

-- An unowned entry has no user identity to recover; preserve it as a system action.
update public.application_records
set payload = jsonb_set(payload, '{actorEmail}', '"system"'::jsonb, true)
where record_type = 'document_modification'
  and owner_id is null
  and coalesce(btrim(payload ->> 'actorEmail'), '') = '';

commit;
