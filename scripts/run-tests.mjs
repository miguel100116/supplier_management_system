import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function discoverTests(root, suite = 'all') {
  if (!['all', 'unit', 'integration'].includes(suite)) throw new Error(`Unknown test suite: ${suite}`);
  return ['src', 'server', 'scripts'].flatMap(directory =>
    readdirSync(path.join(root, directory), { recursive: true })
      .map(file => `${directory}/${file.replaceAll('\\', '/')}`)
      .filter(file => /\.test\.(ts|tsx|mjs)$/.test(file)),
  ).filter(file => {
    const unit = /\/(domain|utils)\//.test(file);
    return suite === 'all' || (suite === 'unit' ? unit : !unit);
  }).sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tests = discoverTests(process.cwd(), process.argv[2]);
  if (!tests.length) throw new Error('No tests found.');
  console.log(`Running ${tests.length} test files (${process.argv[2] ?? 'all'}).`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=4', ...tests], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
