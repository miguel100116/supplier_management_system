-- Supplier "Other Documents" is legacy history, not a required checklist item.
-- Supporting documents remain optional branch records with explicit audit logs.
create or replace function public.enforce_partner_branch_completion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  company_type text;
  supplier_origin text;
  business_classification text;
  common_documents text[] := array[
    'Confidentiality and Non-Disclosure Agreement',
    'Letter of Accreditation',
    'Supplier Code of Business Conduct and Ethics'
  ];
  local_documents text[] := array[
    'SIF', 'BIR2303', 'SEC (Corp)', 'Articles of Incorporation', 'AFS',
    'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit',
    'Product Profile', 'Proof of Present Address',
    'Sole Proprietorship (Owner''s ID)', 'Other Documents'
  ];
  foreign_documents text[] := array[
    'SIF', 'AFS', 'Certificate of Incorporation', 'Articles of Incorporation',
    'Business Permit/License', 'Owner''s ID', 'Product Profile'
  ];
  required_documents text[];
  expiry_documents text[] := array[
    'AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit',
    'Business Permit/License', 'Owner''s ID'
  ];
  expiry_date date;
  days_left integer;
  branch jsonb;
  document jsonb;
  branch_complete boolean;
  branch_index integer;
  i integer;
  updated_branches jsonb := '[]'::jsonb;
begin
  if new.record_type <> 'partner_company' or jsonb_typeof(new.payload->'branches') is distinct from 'array' then
    return new;
  end if;

  company_type := new.payload->>'type';
  supplier_origin := coalesce(new.payload->>'supplierOrigin', 'Local');
  business_classification := new.payload->>'businessClassification';
  if company_type = 'Uncategorized' then
    required_documents := common_documents;
  elsif company_type = 'Supplier' and supplier_origin = 'Foreign' then
    required_documents := foreign_documents;
  else
    required_documents := common_documents || local_documents;
    if company_type = 'Supplier' then required_documents := array_remove(required_documents, 'Other Documents'); end if;
    if business_classification <> 'CORP' then required_documents := array_remove(required_documents, 'SEC (Corp)'); end if;
    if business_classification <> 'CORP' then required_documents := array_remove(required_documents, 'GIS (Corp)'); end if;
    if business_classification <> 'SOL' then required_documents := array_remove(required_documents, 'DTI (Sole)'); end if;
  end if;

  for branch, branch_index in
    select value, ordinality::integer
    from jsonb_array_elements(new.payload->'branches') with ordinality
  loop
    branch_complete := company_type = 'Uncategorized'
      or business_classification in ('CORP', 'SOL')
      or (company_type = 'Supplier' and supplier_origin = 'Foreign');

    for i in 1..coalesce(array_length(required_documents, 1), 0) loop
      document := coalesce(branch->'documents'->required_documents[i], '{}'::jsonb);
      if document->>'provided' is distinct from 'true' then
        branch_complete := false;
        exit;
      end if;
      if required_documents[i] = any(expiry_documents) then
        if coalesce(document->>'expiryDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
          branch_complete := false;
          exit;
        end if;
        begin
          expiry_date := (document->>'expiryDate')::date;
        exception when others then
          branch_complete := false;
          exit;
        end;
        days_left := expiry_date - current_date;
        if required_documents[i] = 'AFS' and company_type = 'Supplier' and supplier_origin = 'Foreign' then
          if extract(year from expiry_date) <> extract(year from current_date) then
            branch_complete := false;
            exit;
          end if;
        elsif required_documents[i] = 'AFS' then
          if extract(year from expiry_date) < extract(year from current_date) - 1 then
            branch_complete := false;
            exit;
          end if;
        elsif required_documents[i] = 'Owner''s ID' and company_type = 'Supplier' and supplier_origin = 'Foreign' then
          if days_left < 0 then
            branch_complete := false;
            exit;
          end if;
        elsif days_left <= 30 then
          branch_complete := false;
          exit;
        end if;
      end if;
    end loop;

    if branch_complete then
      branch := jsonb_set(branch, '{manualStatus}', to_jsonb(coalesce(branch->>'manualStatus', branch->>'status', 'Pending')), true);
      branch := jsonb_set(branch, '{status}', '"Completed"'::jsonb, true);
    elsif branch->>'status' = 'Completed' then
      branch := jsonb_set(branch, '{status}', to_jsonb(coalesce(branch->>'manualStatus', 'Pending')), true);
      branch := branch - 'manualStatus';
    end if;
    updated_branches := updated_branches || jsonb_build_array(branch);
  end loop;

  new.payload := jsonb_set(new.payload, '{branches}', updated_branches, true);
  return new;
end;
$$;

create or replace function public.remove_supplier_supporting_document(
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
  if coalesce(v_payload ->> 'type', '') <> 'Supplier'
    or coalesce(v_payload ->> 'supplierOrigin', 'Local') not in ('Local', 'Foreign') then
    raise exception 'Only Supplier supporting documents can be removed.' using errcode = '22023';
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

revoke all on function public.remove_supplier_supporting_document(text, text, text, jsonb) from public, anon;
grant execute on function public.remove_supplier_supporting_document(text, text, text, jsonb) to authenticated;
