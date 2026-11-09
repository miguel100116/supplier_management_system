-- Add private files to the existing Foreign Supplier document audit workflow.
-- Existing partner records and the Local Supplier requirements are untouched.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-compliance-documents',
  'partner-compliance-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "partner_compliance_documents_select" on storage.objects;
drop policy if exists "partner_compliance_documents_insert" on storage.objects;
drop policy if exists "partner_compliance_documents_delete" on storage.objects;

create policy "partner_compliance_documents_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-compliance-documents'
    and private.is_confirmed_mgenesis_user()
    and exists (
      select 1 from public.app_profiles p
      where p.email = private.my_app_email()
        and (p.role = 'Admin' or 'renew-documents' = any(coalesce(p.permission_pages, array[]::text[])))
    )
  );

create policy "partner_compliance_documents_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partner-compliance-documents'
    and private.is_confirmed_mgenesis_user()
    and exists (
      select 1 from public.app_profiles p
      where p.email = private.my_app_email()
        and (p.role = 'Admin' or 'renew-documents' = any(coalesce(p.permission_pages, array[]::text[])))
    )
  );

create policy "partner_compliance_documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'partner-compliance-documents'
    and private.is_confirmed_mgenesis_user()
    and exists (
      select 1 from public.app_profiles p
      where p.email = private.my_app_email()
        and (p.role = 'Admin' or 'renew-documents' = any(coalesce(p.permission_pages, array[]::text[])))
    )
  );

create or replace function public.attach_foreign_supplier_document_file(
  p_company_id text,
  p_branch_id text,
  p_document_name text,
  p_expected_document jsonb,
  p_document_file jsonb
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
  v_company_type text;
  v_supplier_origin text;
  v_current_document jsonb;
  v_next_document jsonb;
  v_next_payload jsonb;
  v_actor text := private.my_app_email();
  v_can_renew boolean;
  v_audit_id text := 'DOC-MOD-' || gen_random_uuid()::text;
  v_uploaded_at timestamptz := now();
  v_original_name text;
  v_storage_path text;
  v_content_type text;
  v_file_size bigint;
  v_is_optional boolean;
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

  v_is_optional := p_document_name = 'Other Documents'
    or (p_document_name like 'Other: %' and length(btrim(substr(p_document_name, 8))) between 1 and 120);
  if not v_is_optional and p_document_name <> all(array[
    'SIF', 'AFS', 'Certificate of Incorporation', 'Articles of Incorporation',
    'Business Permit/License', 'Owner''s ID', 'Product Profile'
  ]::text[]) then raise exception 'Unsupported Foreign Supplier document.' using errcode = '22023'; end if;

  if jsonb_typeof(coalesce(p_expected_document, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(p_document_file) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_document_file) as key where key not in ('storagePath', 'originalName', 'contentType', 'fileSize')) then
    raise exception 'Invalid document file metadata.' using errcode = '22023';
  end if;
  v_storage_path := p_document_file ->> 'storagePath';
  v_original_name := p_document_file ->> 'originalName';
  v_content_type := p_document_file ->> 'contentType';
  begin v_file_size := (p_document_file ->> 'fileSize')::bigint; exception when others then v_file_size := 0; end;
  if v_storage_path is null or v_storage_path !~ '^[0-9a-fA-F-]{36}$'
    or v_original_name is null or length(v_original_name) not between 1 and 255
    or v_content_type is null or v_content_type <> all(array[
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg', 'image/png'
    ]::text[])
    or v_file_size not between 1 and 10485760 then
    raise exception 'Document file metadata is not valid.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'partner-compliance-documents' and name = v_storage_path) then
    raise exception 'The uploaded file could not be found in private storage.' using errcode = '22023';
  end if;

  select payload into v_payload from public.application_records
    where record_type = 'partner_company' and record_id = p_company_id for update;
  if v_payload is null then raise exception 'Partner company was not found.' using errcode = 'P0002'; end if;
  v_company_type := v_payload ->> 'type';
  v_supplier_origin := coalesce(v_payload ->> 'supplierOrigin', 'Local');
  if v_company_type <> 'Supplier' or v_supplier_origin <> 'Foreign' then
    raise exception 'Document uploads are available only for Foreign Suppliers.' using errcode = '22023';
  end if;

  select count(*), min(ordinality::integer - 1) into v_match_count, v_branch_index
    from jsonb_array_elements(coalesce(v_payload -> 'branches', '[]'::jsonb)) with ordinality as branch(value, ordinality)
    where branch.value ->> 'id' = p_branch_id;
  if v_match_count <> 1 then raise exception 'The branch identifier is missing or ambiguous.' using errcode = '22023'; end if;
  v_current_document := coalesce(v_payload #> array['branches', v_branch_index::text, 'documents', p_document_name], '{}'::jsonb);
  if v_current_document is distinct from coalesce(p_expected_document, '{}'::jsonb) then
    raise exception 'The document changed since it was opened. Refresh and retry.' using errcode = '40001';
  end if;
  v_next_document := v_current_document || jsonb_build_object(
    'provided', coalesce((v_current_document ->> 'provided')::boolean, false),
    'file', jsonb_build_object(
      'storagePath', v_storage_path, 'originalName', v_original_name,
      'contentType', v_content_type, 'fileSize', v_file_size, 'uploadedAt', v_uploaded_at
    )
  );
  v_next_payload := jsonb_set(v_payload, array['branches', v_branch_index::text, 'documents'],
    coalesce(v_payload #> array['branches', v_branch_index::text, 'documents'], '{}'::jsonb), true);
  v_next_payload := jsonb_set(v_next_payload, array['branches', v_branch_index::text, 'documents', p_document_name], v_next_document, true);
  update public.application_records set payload = v_next_payload
    where record_type = 'partner_company' and record_id = p_company_id;

  insert into public.application_records(record_type, record_id, payload, owner_id) values (
    'document_modification', v_audit_id,
    jsonb_build_object('id', v_audit_id, 'actorEmail', v_actor,
      'category', v_company_type, 'companyName', coalesce(v_payload ->> 'name', p_company_id),
      'docName', p_document_name, 'change', 'Document file uploaded: ' || v_original_name,
      'timestamp', v_uploaded_at), auth.uid());
  return v_next_payload;
end;
$$;
revoke all on function public.attach_foreign_supplier_document_file(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.attach_foreign_supplier_document_file(text, text, text, jsonb, jsonb) to authenticated;

-- Keep the database-computed branch status aligned with the Foreign checklist:
-- seven mandatory records; conditional supporting documents are not a gate.
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
    'SIF', 'Articles of Incorporation', 'Certificate of Incorporation',
    'AFS', 'Business Permit/License', 'Owner''s ID', 'Product Profile'
  ];
  required_documents text[];
  expiry_documents text[] := array['AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit', 'Business Permit/License'];
  expiry_date date;
  branch jsonb;
  document jsonb;
  branch_complete boolean;
  branch_index integer;
  i integer;
  updated_branches jsonb := '[]'::jsonb;
begin
  if new.record_type <> 'partner_company' or jsonb_typeof(new.payload->'branches') is distinct from 'array' then return new; end if;
  company_type := new.payload->>'type';
  supplier_origin := coalesce(new.payload->>'supplierOrigin', 'Local');
  business_classification := new.payload->>'businessClassification';
  if company_type = 'Uncategorized' then required_documents := common_documents;
  elsif company_type = 'Supplier' and supplier_origin = 'Foreign' then required_documents := foreign_documents;
  else
    required_documents := common_documents || local_documents;
    if business_classification <> 'CORP' then required_documents := array_remove(required_documents, 'SEC (Corp)'); end if;
    if business_classification <> 'CORP' then required_documents := array_remove(required_documents, 'GIS (Corp)'); end if;
    if business_classification <> 'SOL' then required_documents := array_remove(required_documents, 'DTI (Sole)'); end if;
  end if;

  for branch, branch_index in
    select value, ordinality::integer from jsonb_array_elements(new.payload->'branches') with ordinality
  loop
    branch_complete := company_type = 'Uncategorized' or business_classification in ('CORP', 'SOL') or (company_type = 'Supplier' and supplier_origin = 'Foreign');
    for i in 1..coalesce(array_length(required_documents, 1), 0) loop
      document := coalesce(branch->'documents'->required_documents[i], '{}'::jsonb);
      if document->>'provided' is distinct from 'true' then branch_complete := false; exit; end if;
      if required_documents[i] = any(expiry_documents) then
        if coalesce(document->>'expiryDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then branch_complete := false; exit; end if;
        begin expiry_date := (document->>'expiryDate')::date;
        exception when others then branch_complete := false; exit;
        end;
        if required_documents[i] = 'AFS' and company_type = 'Supplier' and supplier_origin = 'Foreign' then
          if extract(year from expiry_date) < extract(year from current_date) then branch_complete := false; exit; end if;
        elsif required_documents[i] = 'AFS' then
          if extract(year from expiry_date) < extract(year from current_date) - 1 then branch_complete := false; exit; end if;
        elsif expiry_date - current_date <= 30 then branch_complete := false; exit;
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
