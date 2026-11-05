import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/202611050001_enforce_completed_partner_branch_status.sql', import.meta.url), 'utf8');

test('branch completion is enforced on shared partner records and restores saved manual status', () => {
  assert.match(migration, /before insert or update of payload on public\.application_records/i);
  assert.match(migration, /new\.record_type <> 'partner_company'/i);
  assert.match(migration, /branch->>'manualStatus'/i);
  assert.match(migration, /branch := jsonb_set\(branch, '\{status\}', '"Completed"'::jsonb, true\)/i);
  assert.match(migration, /branch := branch - 'manualStatus'/i);
  assert.match(migration, /days_left <= 30/i);
  assert.match(migration, /cron\.schedule\('partner-branch-completion-refresh', '10 0 \* \* \*'/i);
  assert.match(migration, /set payload = payload/i);
});
