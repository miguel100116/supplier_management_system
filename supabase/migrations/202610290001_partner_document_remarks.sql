-- Save admin document remarks independently from the narrowly scoped renewal
-- RPC. This does not broaden the fields accepted by renew_partner_document.
create or replace function public.update_partner_document_remarks(
  p_company_id text,
  p_branch_id text,
  p_document_name text,
  p_expected_document jsonb,
  p_remarks text
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
  v_is_other boolean;
  v_audit_id text := 'DOC-MOD-' || gen_random_uuid()::text;
  v_change text;
begin
  if not public.is_confirmed_mgenesis_user() then
    raise exception 'A confirmed Microgenesis account is required.' using errcode = '42501';
  end if;

  select coalesce(role = 'Admin' or 'renew-documents' = any(coalesce(permission_pages, array[]::text[])), false)
  into v_can_renew
  from public.app_profiles where email = v_actor limit 1;
  if not coalesce(v_can_renew, false) then
    raise exception 'Document renewal permission is required.' using errcode = '42501';
  end if;

  if p_company_id is null or length(p_company_id) not between 1 and 500
    or p_branch_id is null or length(p_branch_id) not between 1 and 500
    or p_document_name is null or length(p_document_name) not between 1 and 500
    or p_remarks is null or length(p_remarks) > 2000
    or jsonb_typeof(p_expected_document) is distinct from 'object' then
    raise exception 'Company, branch, document, expected record, and remarks are required; remarks must be at most 2000 characters.' using errcode = '22023';
  end if;

  v_is_other := p_document_name like 'Other: %' and length(btrim(substr(p_document_name, 8))) between 1 and 120;
  if not v_is_other and p_document_name <> all(array[
    'Confidentiality and Non-Disclosure Agreement', 'Letter of Accreditation',
    'Supplier Code of Business Conduct and Ethics', 'SIF', 'BIR2303', 'SEC (Corp)',
    'Articles of Incorporation', 'AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit',
    'Import Permit', 'Product Profile', 'Proof of Present Address',
    'Sole Proprietorship (Owner''s ID)', 'Other Documents', 'Certificate of Incorporation',
    'Business Permit/License', 'Owner''s ID'
  ]::text[]) then
    raise exception 'Unsupported compliance document.' using errcode = '22023';
  end if;

  select payload into v_payload
  from public.application_records
  where record_type = 'partner_company' and record_id = p_company_id
  for update;
  if v_payload is null then raise exception 'Partner company was not found.' using errcode = 'P0002'; end if;

  v_class := v_payload ->> 'businessClassification';
  if coalesce(v_payload ->> 'type', '') <> 'Uncategorized'
    and not (v_payload ->> 'type' = 'Supplier' and coalesce(v_payload ->> 'supplierOrigin', 'Local') = 'Foreign')
    and ((p_document_name = 'DTI (Sole)' and v_class = 'CORP')
      or (p_document_name in ('GIS (Corp)', 'SEC (Corp)') and v_class = 'SOL')) then
    raise exception 'This document is not applicable to the current CORP/SOL classification.' using errcode = '22023';
  end if;

  select count(*), min(ordinality::integer - 1) into v_match_count, v_branch_index
  from jsonb_array_elements(coalesce(v_payload -> 'branches', '[]'::jsonb)) with ordinality as branch(value, ordinality)
  where branch.value ->> 'id' = p_branch_id;
  if v_match_count <> 1 then raise exception 'The branch identifier is missing or ambiguous.' using errcode = '22023'; end if;

  v_current_document := coalesce(v_payload #> array['branches', v_branch_index::text, 'documents', p_document_name], '{}'::jsonb);
  if v_current_document is distinct from p_expected_document then
    raise exception 'The document changed since it was opened. Refresh and retry.' using errcode = '40001';
  end if;
  if coalesce(v_current_document ->> 'remarks', '') = p_remarks then return v_payload; end if;

  v_next_document := jsonb_set(v_current_document, '{remarks}', to_jsonb(p_remarks), true);
  if (v_payload ->> 'type' <> 'Uncategorized'
      and not (v_payload ->> 'type' = 'Supplier' and coalesce(v_payload ->> 'supplierOrigin', 'Local') = 'Foreign')
      and ((v_class = 'CORP' and p_document_name in ('GIS (Corp)', 'SEC (Corp)'))
        or (v_class = 'SOL' and p_document_name = 'DTI (Sole)')))
    and (not coalesce((v_next_document ->> 'provided')::boolean, false)
      or (p_document_name in ('GIS (Corp)', 'DTI (Sole)') and not (v_next_document ? 'expiryDate')))
    and nullif(btrim(v_next_document ->> 'remarks'), '') is null then
    raise exception '% requires remarks while it is missing or not provided.', p_document_name using errcode = '22023';
  end if;

  v_next_payload := jsonb_set(v_payload, array['branches', v_branch_index::text, 'documents'],
    coalesce(v_payload #> array['branches', v_branch_index::text, 'documents'], '{}'::jsonb), true);
  v_next_payload := jsonb_set(v_next_payload, array['branches', v_branch_index::text, 'documents', p_document_name], v_next_document, true);
  update public.application_records set payload = v_next_payload
  where record_type = 'partner_company' and record_id = p_company_id;

  v_change := case
    when p_remarks = '' then 'Remarks removed'
    when coalesce(v_current_document ->> 'remarks', '') = '' then 'Remarks added'
    else 'Remarks updated'
  end;
  insert into public.application_records(record_type, record_id, payload, owner_id) values (
    'document_modification', v_audit_id,
    jsonb_build_object('id', v_audit_id, 'actorEmail', v_actor,
      'category', coalesce(v_payload ->> 'type', 'Unknown'), 'companyName', coalesce(v_payload ->> 'name', p_company_id),
      'docName', p_document_name, 'change', v_change, 'timestamp', now()), auth.uid());
  return v_next_payload;
end;
$$;

revoke all on function public.update_partner_document_remarks(text, text, text, jsonb, text) from public, anon;
grant execute on function public.update_partner_document_remarks(text, text, text, jsonb, text) to authenticated;
