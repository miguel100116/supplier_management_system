import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import app from './analyticsApp';

const execute = promisify(execFile);

test('built Vercel entry starts in plain Node without a TypeScript loader', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await execute(process.execPath, ['scripts/buildAnalyticsApi.mjs'], { cwd: root });
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('SUPABASE_') || key.startsWith('VITE_') || key === 'NODE_OPTIONS') delete env[key];
  }
  const script = `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import app from './api/analytics.mjs';
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = 'http://127.0.0.1:' + server.address().port + '/api/analytics?scope=current';
      const unsigned = await fetch(url);
      assert.equal(unsigned.status, 401);
      assert.equal(unsigned.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await unsigned.json(), { error: 'Sign in again to load Analytics.' });
      const unconfigured = await fetch(url, { headers: { Authorization: 'Bearer synthetic-token' } });
      assert.equal(unconfigured.status, 503);
      assert.deepEqual(await unconfigured.json(), { error: 'Company-wide Analytics requires the configured application server.' });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  `;
  await execute(process.execPath, ['--input-type=module', '--eval', script], { cwd: root, env, timeout: 30_000 });
});

test('Vercel Analytics entry serves the protected route without starting the standalone server', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${origin}/api/analytics?scope=current&types=Courier`);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Sign in again to load Analytics.' });
  assert.equal((await fetch(`${origin}/api/analytics`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${origin}/unrelated`)).status, 404);
});

test('Vercel SPA fallback preserves frontend routes and excludes the Analytics function', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const fallback = config.rewrites.find((rewrite: { destination: string }) => rewrite.destination === '/index.html');
  assert.ok(fallback);
  const pattern = new RegExp(`^${fallback.source}$`);
  assert.equal(pattern.test('/analytics'), true);
  assert.equal(pattern.test('/api/analytics'), false);
  assert.equal(pattern.test('/api/analytics/'), false);
});
