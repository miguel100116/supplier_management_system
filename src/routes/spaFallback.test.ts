import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const viteSource = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const vercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
) as {
  rewrites: Array<{ source: string; destination: string }>;
};

test('production Express serves client routes without rewriting API misses', () => {
  assert.match(serverSource, /app\.get\('\*', \(req, res, next\)/);
  assert.match(serverSource, /req\.path === '\/api' \|\| req\.path\.startsWith\('\/api\/'\)/);
  assert.match(serverSource, /res\.sendFile\(path\.join\(distPath, 'index\.html'\)\)/);
});

test('Vite emits root-relative application assets', () => {
  assert.match(viteSource, /base: '\/'/);
});

test('Vercel rewrites browser routes to the SPA but excludes API paths', () => {
  assert.equal(vercelConfig.rewrites.length, 1);
  const [fallback] = vercelConfig.rewrites;
  assert.equal(fallback.destination, '/index.html');

  const sourcePattern = new RegExp(`^${fallback.source}$`);
  assert.equal(sourcePattern.test('/admin/partners/documents'), true);
  assert.equal(sourcePattern.test('/employee/evaluations/assigned'), true);
  assert.equal(sourcePattern.test('/api'), false);
  assert.equal(sourcePattern.test('/api/health'), false);
});
