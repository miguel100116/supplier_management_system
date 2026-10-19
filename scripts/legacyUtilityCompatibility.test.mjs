import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('the relocated question patcher reads reference JSON and updates only a disposable workspace', (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'sms-reference-utilities-'));
  assert.ok(temporaryRoot.startsWith(join(tmpdir(), 'sms-reference-utilities-')));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const extracted = join(temporaryRoot, 'reference-materials', 'extracted');
  const hook = join(temporaryRoot, 'src', 'hooks', 'useSurveyData.ts');
  mkdirSync(extracted, { recursive: true });
  mkdirSync(join(temporaryRoot, 'src', 'hooks'), { recursive: true });
  writeFileSync(join(extracted, 'subQuestions.json'), JSON.stringify([{ questionId: 'SUB-EXAMPLE' }]));
  writeFileSync(join(extracted, 'supQuestions.json'), JSON.stringify([{ questionId: 'SUP-EXAMPLE' }]));
  writeFileSync(hook, 'before();\nconst supplierQuestions = [];\nconst subcontractorQuestions = [];\nloadedSurveys = [];\nafter();\n');

  execFileSync(process.execPath, [resolve('reference-materials/scripts/patch_questions.cjs')], { cwd: temporaryRoot });

  const updated = readFileSync(hook, 'utf8');
  assert.match(updated, /SUB-EXAMPLE/);
  assert.match(updated, /SUP-EXAMPLE/);
  assert.ok(updated.startsWith('before();\n'));
  assert.ok(updated.endsWith('loadedSurveys = [];\nafter();\n'));
});
