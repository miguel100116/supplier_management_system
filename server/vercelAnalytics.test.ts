import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import app from '../api/analytics';

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
