-- Trade and Non-Trade BP codes for one company share a compliance checklist.
-- Keep the existing branch-shaped payload contract, but synchronize document
-- values so older readers, branch status enforcement, and current UI agree.
create or replace function public.share_trade_nontrade_partner_documents()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_branches jsonb;
  v_old_branches jsonb;
  v_has_trade boolean;
  v_has_non_trade boolean;
  v_document_name text;
  v_document jsonb;
  v_changed_count integer;
  v_changed_index integer;
  v_branch_index integer;
  v_branch jsonb;
  v_documents jsonb;
  v_branch_document jsonb;
begin
  if new.record_type <> 'partner_company' or jsonb_typeof(new.payload -> 'branches') is distinct from 'array' then
    return new;
  end if;

  v_branches := new.payload -> 'branches';
  v_old_branches := case when tg_op = 'UPDATE' then old.payload -> 'branches' else null end;

  select
    coalesce(bool_or(is_non_trade), false),
    coalesce(bool_or(not is_non_trade), false)
  into v_has_non_trade, v_has_trade
  from (
    select case
      when branch.value ->> 'businessType' in ('Trade', 'Non-Trade') then branch.value ->> 'businessType' = 'Non-Trade'
      else coalesce(branch.value ->> 'bpCode', '') ~* '-NT$'
        or coalesce(branch.value ->> 'rawCategory', '') ~* '-NT$'
    end as is_non_trade
    from jsonb_array_elements(v_branches) as branch(value)
  ) as classified_branches;

  if not v_has_trade or not v_has_non_trade then
    return new;
  end if;

  for v_document_name in
    select distinct document.key
    from jsonb_array_elements(v_branches) as branch(value)
    cross join lateral jsonb_each(coalesce(branch.value -> 'documents', '{}'::jsonb)) as document(key, value)
    union
    select distinct document.key
    from jsonb_array_elements(coalesce(v_old_branches, '[]'::jsonb)) as branch(value)
    cross join lateral jsonb_each(coalesce(branch.value -> 'documents', '{}'::jsonb)) as document(key, value)
  loop
    if v_document_name like 'Other: %' then
      continue;
    end if;
    v_document := null;
    v_changed_count := 0;
    v_changed_index := null;

    if tg_op = 'UPDATE' and jsonb_typeof(v_old_branches) = 'array' then
      select count(*)::integer, min((current_branch.ordinality - 1)::integer)
      into v_changed_count, v_changed_index
      from jsonb_array_elements(v_branches) with ordinality as current_branch(value, ordinality)
      left join jsonb_array_elements(v_old_branches) as previous_branch(value)
        on previous_branch.value ->> 'id' = current_branch.value ->> 'id'
      where coalesce(current_branch.value #> array['documents', v_document_name], 'null'::jsonb)
        is distinct from coalesce(previous_branch.value #> array['documents', v_document_name], 'null'::jsonb);

      if v_changed_count = 0 then
        continue;
      elsif v_changed_count = 1 then
        v_document := v_branches #> array[v_changed_index::text, 'documents', v_document_name];
      end if;
    end if;

    if v_changed_count <> 1 then
      select candidate.value
      into v_document
      from jsonb_array_elements(v_branches) as branch(value)
      cross join lateral jsonb_each(coalesce(branch.value -> 'documents', '{}'::jsonb)) as candidate(key, value)
      where candidate.key = v_document_name
      order by coalesce((candidate.value ->> 'provided')::boolean, false) desc,
        coalesce(candidate.value ->> 'expiryDate', '') desc,
        coalesce(candidate.value #>> '{file,uploadedAt}', '') desc
      limit 1;
    end if;

    for v_branch_index in 0..jsonb_array_length(v_branches) - 1 loop
      v_branch := v_branches -> v_branch_index;
      v_documents := coalesce(v_branch -> 'documents', '{}'::jsonb);
      if v_document is null then
        v_documents := v_documents - v_document_name;
      else
        v_branch_document := coalesce(v_documents -> v_document_name, '{}'::jsonb);
        if v_document ? 'provided' then
          v_branch_document := jsonb_set(v_branch_document, '{provided}', v_document -> 'provided', true);
        else
          v_branch_document := v_branch_document - 'provided';
        end if;
        if v_document ? 'expiryDate' then
          v_branch_document := jsonb_set(v_branch_document, '{expiryDate}', v_document -> 'expiryDate', true);
        else
          v_branch_document := v_branch_document - 'expiryDate';
        end if;
        v_documents := jsonb_set(v_documents, array[v_document_name], v_branch_document, true);
      end if;
      v_branch := jsonb_set(v_branch, '{documents}', v_documents, true);
      v_branches := jsonb_set(v_branches, array[v_branch_index::text], v_branch, false);
    end loop;
  end loop;

  new.payload := jsonb_set(new.payload, '{branches}', v_branches, false);
  return new;
end;
$$;

drop trigger if exists application_records_00_share_trade_nontrade_documents on public.application_records;
create trigger application_records_00_share_trade_nontrade_documents
before insert or update of payload on public.application_records
for each row when (new.record_type = 'partner_company')
execute function public.share_trade_nontrade_partner_documents();

update public.application_records company
set payload = payload
where company.record_type = 'partner_company'
  and jsonb_typeof(company.payload -> 'branches') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(company.payload -> 'branches') as branch(value)
    where case
      when branch.value ->> 'businessType' in ('Trade', 'Non-Trade') then branch.value ->> 'businessType' = 'Non-Trade'
      else coalesce(branch.value ->> 'bpCode', '') ~* '-NT$'
        or coalesce(branch.value ->> 'rawCategory', '') ~* '-NT$'
    end
  )
  and exists (
    select 1
    from jsonb_array_elements(company.payload -> 'branches') as branch(value)
    where case
      when branch.value ->> 'businessType' in ('Trade', 'Non-Trade') then branch.value ->> 'businessType' = 'Trade'
      else not (
        coalesce(branch.value ->> 'bpCode', '') ~* '-NT$'
        or coalesce(branch.value ->> 'rawCategory', '') ~* '-NT$'
      )
    end
  );
