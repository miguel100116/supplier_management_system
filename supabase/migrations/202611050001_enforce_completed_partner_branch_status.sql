-- Keep branch completion authoritative at the shared persistence boundary.
-- The document key list mirrors documentRequirements.ts and the current
-- status rules in compliance.ts. Manual branch status is retained while the
-- system owns the visible Completed status, then restored if compliance falls.
-- Rollback: unschedule partner-branch-completion-refresh; restore each branch
-- with status='Completed' to manualStatus (or 'Pending'), remove manualStatus,
-- then drop the trigger and both functions. Do not drop the preservation field
-- before restoring values or the prior manual status cannot be recovered.
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
    'AFS', 'Business Permit/License', 'Owner''s ID', 'Product Profile',
    'Other Documents'
  ];
  required_documents text[];
  expiry_documents text[] := array['AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit', 'Business Permit/License'];
  expiry_date date;
  branch jsonb;
  document jsonb;
  branch_complete boolean;
  days_left integer;
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
  required_documents := common_documents;
  if company_type <> 'Uncategorized' then
    if company_type = 'Supplier' and supplier_origin = 'Foreign' then
      required_documents := required_documents || foreign_documents;
    else
      required_documents := required_documents || local_documents;
      if business_classification <> 'CORP' then required_documents := array_remove(required_documents, 'SEC (Corp)'); end if;
      if business_classification <> 'CORP' then required_documents := array_remove(required_documents, 'GIS (Corp)'); end if;
      if business_classification <> 'SOL' then required_documents := array_remove(required_documents, 'DTI (Sole)'); end if;
    end if;
  end if;

  for branch, branch_index in
    select value, ordinality::integer
    from jsonb_array_elements(new.payload->'branches') with ordinality
  loop
    branch_complete := company_type = 'Uncategorized' or business_classification in ('CORP', 'SOL') or (company_type = 'Supplier' and supplier_origin = 'Foreign');
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
        if required_documents[i] = 'AFS' then
          if extract(year from expiry_date) < extract(year from current_date) - 1 then
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

drop trigger if exists application_records_partner_branch_completion on public.application_records;
create trigger application_records_partner_branch_completion
before insert or update of payload on public.application_records
for each row
when (new.record_type = 'partner_company')
execute function public.enforce_partner_branch_completion();

-- Expiry can change compliance without a user write. Re-run the same trigger
-- daily so an expired document releases the system-owned Completed status.
create or replace function public.refresh_partner_branch_completion_status()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.application_records
  set payload = payload
  where record_type = 'partner_company'
    and jsonb_typeof(payload->'branches') = 'array'
    and jsonb_array_length(payload->'branches') > 0;
$$;

revoke all on function public.refresh_partner_branch_completion_status() from public, anon, authenticated;
select cron.schedule('partner-branch-completion-refresh', '10 0 * * *', 'select public.refresh_partner_branch_completion_status()');
