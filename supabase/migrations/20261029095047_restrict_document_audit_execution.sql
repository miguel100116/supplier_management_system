-- Internal trigger function: callers must use the guarded document RPCs or
-- normal RLS-protected writes. Trigger execution remains enabled.
revoke all on function public.audit_partner_document_configuration()
  from public, anon, authenticated;
