-- Align persisted Foreign Supplier completion with the seven requirements and
-- validity rules in documentRequirements.ts. This changes rule evaluation only;
-- it does not alter saved documents, files, or document_modification records.
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
