import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accountRequestErrorHandler, createAccountHandler } from './createAccount';

test('account HTTP boundary rejects unauthenticated, non-Admin, malformed and oversized requests', async t => {
  let identityChecks = 0;
  const client = {
    auth: { getUser: async () => {
      identityChecks++;
      return { data: { user: { id: 'employee', email: 'synthetic@mgenesis.com', email_confirmed_at: '2026-01-01' } } };
    } },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'Employee' } }) }) }) }) }),
  } as unknown as SupabaseClient;
  const app = express();
  app.post('/api/admin/accounts', express.json({ limit: '8kb' }), createAccountHandler(client));
  app.use(accountRequestErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/accounts`;
  for (const scenario of [
    { body: '{}', authorization: '', status: 401, error: /Sign in again/ },
    { body: '{}', authorization: 'Bearer synthetic-token', status: 403, error: /Only an Admin/ },
    { body: '{', authorization: '', status: 400, error: /Invalid account request/ },
    { body: JSON.stringify({ value: 'x'.repeat(9_000) }), authorization: '', status: 413, error: /Invalid account request/ },
  ]) {
    const response = await fetch(url, { method: 'POST', body: scenario.body,
      headers: { 'Content-Type': 'application/json', Authorization: scenario.authorization } });
    assert.equal(response.status, scenario.status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match((await response.json() as { error: string }).error, scenario.error);
  }
  assert.equal(identityChecks, 1, 'invalid HTTP requests must not reach account provisioning');
});
