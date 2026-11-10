import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadServerEnvironment, publicRuntimeConfig } from './environment';
import { accountProvisioningClient } from './createAccount';

function withEnvFiles(check: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'sms-server-env-'));
  try {
    writeFileSync(path.join(root, '.env'), 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\n');
    writeFileSync(path.join(root, '.env.local'), 'VITE_SUPABASE_URL=https://synthetic.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=synthetic-public\nSUPABASE_SECRET_KEY=synthetic-server-secret\n');
    check(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('server loads .env.local credentials before creating the account endpoint', () => {
  withEnvFiles((root) => {
    const env = loadServerEnvironment('development', root, {});
    assert.equal(env.VITE_SUPABASE_URL, 'https://synthetic.supabase.co');
    assert.equal(env.SUPABASE_SECRET_KEY, 'synthetic-server-secret');
    assert.ok(accountProvisioningClient(env));
  });
});

test('mode-specific configuration and deployed environment take precedence', () => {
  withEnvFiles((root) => {
    writeFileSync(path.join(root, '.env.production.local'), 'SUPABASE_SECRET_KEY=synthetic-production-secret\n');
    assert.equal(loadServerEnvironment('production', root, {}).SUPABASE_SECRET_KEY, 'synthetic-production-secret');
    const env = loadServerEnvironment('production', root, { SUPABASE_SECRET_KEY: 'synthetic-deployed-secret', PORT: '4100' });
    assert.equal(env.SUPABASE_SECRET_KEY, 'synthetic-deployed-secret');
    assert.equal(env.PORT, '4100');
  });
});

test('public runtime configuration never returns server credentials', () => {
  withEnvFiles((root) => {
    writeFileSync(path.join(root, '.env.development.local'), 'UPSTASH_REDIS_REST_URL=https://synthetic.upstash.io\nUPSTASH_REDIS_REST_TOKEN=synthetic-redis-secret\n');
    const env = loadServerEnvironment('development', root, { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-legacy-secret' });
    assert.equal(env.UPSTASH_REDIS_REST_TOKEN, 'synthetic-redis-secret');
    const config = publicRuntimeConfig(env);
    assert.equal(config.supabaseUrl, 'https://synthetic.supabase.co');
    assert.equal(config.supabasePublishableKey, 'synthetic-public');
    const output = JSON.stringify(config);
    assert.equal(output.includes('synthetic-server-secret'), false);
    assert.equal(output.includes('synthetic-legacy-secret'), false);
    assert.equal(output.includes('synthetic-redis-secret'), false);
    assert.equal(output.includes('synthetic.upstash.io'), false);
    assert.equal(config.responseCacheEnabled, true);
    assert.equal(Object.keys(config).some((key) => /secret|service.?role/i.test(key)), false);
  });
});

test('server accepts the existing import CLI service-role variable and never falls back to a public key', () => {
  assert.ok(accountProvisioningClient({ VITE_SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-legacy-secret' }));
  assert.equal(accountProvisioningClient({ VITE_SUPABASE_URL: 'https://synthetic.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public' }), null);
});
