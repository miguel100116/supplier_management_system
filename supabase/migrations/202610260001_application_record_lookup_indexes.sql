-- Match the owner-scoped History listing and changed-submission refresh queries.
-- The existing (record_type, record_id) primary key already covers full cursor reads.
create index if not exists application_records_history_owner_cursor_idx
  on public.application_records (owner_id, record_id)
  where record_type = 'export_history';

create index if not exists application_records_response_submission_cursor_idx
  on public.application_records ((payload ->> 'responseId'), record_id)
  where record_type = 'survey_response';
