create or replace function public.remove_foreign_supplier_supporting_document(
  p_company_id text,
  p_branch_id text,
  p_document_name text,
  p_expected_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_next_payload jsonb;
  v_next_documents jsonb;
  v_current_document jsonb;
  v_branch_index integer;
  v_match_count integer;
  v_actor text := private.my_app_email();
  v_can_renew boolean;
  v_audit_id text := 'DOC-MOD-' || gen_random_uuid()::text;
begin
  if not public.is_confirmed_mgenesis_user() then
    raise exception 'A confirmed Microgenesis account is required.' using errcode = '42501';
  end if;

  select coalesce(role = 'Admin' or 'renew-documents' = any(coalesce(permission_pages, array[]::text[])), false)
    into v_can_renew
    from public.app_profiles
    where email = v_actor
    limit 1;
  if not coalesce(v_can_renew, false) then
    raise exception 'Document renewal permission is required.' using errcode = '42501';
  end if;

  if p_company_id is null or length(p_company_id) not between 1 and 500
    or p_branch_id is null or length(p_branch_id) not between 1 and 500
    or p_document_name is null or length(p_document_name) not between 8 and 127
    or p_document_name not like 'Other: %'
    or length(btrim(substr(p_document_name, 8))) not between 1 and 120
    or jsonb_typeof(coalesce(p_expected_document, '{}'::jsonb)) <> 'object' then
    raise exception 'A valid supporting document is required.' using errcode = '22023';
  end if;

  select payload into v_payload
    from public.application_records
    where record_type = 'partner_company' and record_id = p_company_id
    for update;
  if v_payload is null then
    raise exception 'Partner company was not found.' using errcode = 'P0002';
  end if;
  if coalesce(v_payload ->> 'type', '') <> 'Supplier' or coalesce(v_payload ->> 'supplierOrigin', '') <> 'Foreign' then
    raise exception 'Only Foreign Supplier supporting documents can be removed.' using errcode = '22023';
  end if;

  select count(*), min(ordinality::integer - 1)
    into v_match_count, v_branch_index
    from jsonb_array_elements(coalesce(v_payload -> 'branches', '[]'::jsonb)) with ordinality as branch(value, ordinality)
    where branch.value ->> 'id' = p_branch_id;
  if v_match_count <> 1 then
    raise exception 'The branch identifier is missing or ambiguous.' using errcode = '22023';
  end if;

  v_current_document := v_payload #> array['branches', v_branch_index::text, 'documents', p_document_name];
  if v_current_document is null then
    raise exception 'The supporting document was not found.' using errcode = 'P0002';
  end if;
  if v_current_document is distinct from coalesce(p_expected_document, '{}'::jsonb) then
    raise exception 'The document changed since it was opened. Refresh and retry.' using errcode = '40001';
  end if;

  v_next_documents := coalesce(v_payload #> array['branches', v_branch_index::text, 'documents'], '{}'::jsonb) - p_document_name;
  v_next_payload := jsonb_set(v_payload, array['branches', v_branch_index::text, 'documents'], v_next_documents, true);
  update public.application_records
    set payload = v_next_payload
    where record_type = 'partner_company' and record_id = p_company_id;

  insert into public.application_records(record_type, record_id, payload, owner_id) values (
    'document_modification', v_audit_id,
    jsonb_build_object(
      'id', v_audit_id,
      'actorEmail', v_actor,
      'category', 'Supplier',
      'companyName', coalesce(v_payload ->> 'name', p_company_id),
      'docName', p_document_name,
      'change', 'Removed optional supporting document',
      'timestamp', now()
    ), auth.uid()
  );

  return v_next_payload;
end;
$$;

revoke all on function public.remove_foreign_supplier_supporting_document(text, text, text, jsonb) from public, anon;
grant execute on function public.remove_foreign_supplier_supporting_document(text, text, text, jsonb) to authenticated;
