import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverTests } from './run-tests.mjs';

test('test discovery includes new nested tests once and partitions every test without omissions', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'sms-discovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = ['src/features/example/domain/new.test.ts', 'src/utils/date.test.ts',
    'src/components/dialog.test.tsx', 'server/access.test.ts', 'scripts/import.test.mjs', 'src/ignored.ts'];
  for (const directory of ['src', 'server', 'scripts']) mkdirSync(path.join(root, directory));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  const all = discoverTests(root);
  const unit = discoverTests(root, 'unit');
  const integration = discoverTests(root, 'integration');
  assert.deepEqual(all, files.filter(file => file.includes('.test.')).sort());
  assert.deepEqual(unit, files.slice(0, 2).sort());
  assert.deepEqual([...unit, ...integration].sort(), all);
  assert.equal(new Set([...unit, ...integration]).size, all.length);
  assert.throws(() => discoverTests(root, 'typo'), /Unknown test suite/);
});
