import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('pre-push runs lightweight checks and rejects dirty or unchecked commits', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'sms-hook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hookPath = fileURLToPath(new URL('../.githooks', import.meta.url));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input: '' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = () => {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: {
      'verify:pre-push': 'node -e "console.log(\'PRE_PUSH_CHECKS\')"',
      verify: 'node -e "process.exit(23)"',
    } }));
    git('add', 'package.json');
    git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.test', 'commit', '-m', 'Synthetic hook fixture');
  };
  const hook = (input = '') => {
    const inputFile = path.join(root, '.git', 'push-input');
    writeFileSync(inputFile, input);
    return spawnSync('git', ['-C', root, '-c', `core.hooksPath=${hookPath}`,
      'hook', 'run', `--to-stdin=${inputFile}`, 'pre-push'], { encoding: 'utf8', input: '' });
  };
  git('init');
  commit();
  const clean = hook();
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout + clean.stderr, /PRE_PUSH_CHECKS/);
  assert.doesNotMatch(clean.stdout + clean.stderr, /process\.exit\(23\)/);
  const mismatched = hook(`refs/heads/other ${'1'.repeat(40)} refs/heads/other ${'0'.repeat(40)}\n`);
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /Switch to the branch being pushed/);
  writeFileSync(path.join(root, 'uncommitted.txt'), 'synthetic');
  const dirty = hook();
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /Commit or stash changes/);
});
