-- Read-only diagnostics for the actual affected project. Run with the signed-in
-- user's RLS context when possible; dashboard owner plans can bypass RLS.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'application_records'
order by indexname;

select record_type, count(*) as rows, pg_size_pretty(sum(pg_column_size(payload))) as payload_size
from public.application_records
where record_type in ('survey_response', 'export_history')
group by record_type;

select pid, state, wait_event_type, wait_event, now() - query_start as elapsed
from pg_stat_activity
where datname = current_database() and state <> 'idle'
order by query_start;

explain (analyze, buffers, format text)
select record_id, payload, created_at
from public.application_records
where record_type = 'survey_response' and record_id > 'response-cursor'
order by record_id
limit 1000;

explain (analyze, buffers, format text)
select record_id
from public.application_records
where record_type = 'survey_response'
  and payload ->> 'responseId' in ('submission-id')
  and record_id > 'response-cursor'
order by record_id
limit 1000;

explain (analyze, buffers, format text)
select record_id, payload -> 'title', payload -> 'format'
from public.application_records
where record_type = 'export_history' and owner_id = auth.uid()
order by record_id
limit 100;
