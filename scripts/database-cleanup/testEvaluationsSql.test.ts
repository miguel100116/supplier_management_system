import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTestEvaluationCleanupSql, parseCleanupMode } from './testEvaluationsSql';

test('cleanup defaults to preview and rejects ambiguous or execution flags', () => {
  assert.equal(parseCleanupMode([]), 'preview');
  assert.equal(parseCleanupMode(['--preview']), 'preview');
  assert.equal(parseCleanupMode(['--delete-sql']), 'delete');
  for (const args of [['--apply'], ['--preview', '--delete-sql'], ['--delete-sql', '--confirm'], ['--all']]) {
    assert.throws(() => parseCleanupMode(args), /generates SQL only/);
  }
});

test('preview provides full-row recovery export and rolls back without deleting', () => {
  const sql = buildTestEvaluationCleanupSql('preview');
  assert.match(sql, /SELECT ar\.\*/);
  assert.match(sql, /ROLLBACK;/);
  assert.doesNotMatch(sql, /DELETE FROM|COMMIT;|LOCK TABLE/);
});

test('cleanup protects CSV and official records and deletes only complete test groups', () => {
  for (const mode of ['preview', 'delete'] as const) {
    const sql = buildTestEvaluationCleanupSql(mode);
    for (const protection of ['IMPORT-%', 'client-csv:%', 'client_csv', 'app_submission', 'production_submission', 'public.evaluation_submissions', 'default-%']) {
      assert.ok(sql.includes(protection));
    }
    assert.match(sql, /BOOL_AND\(is_test\) AND NOT BOOL_OR\(is_protected\)/);
    assert.match(sql, /WHERE response_id IS NOT NULL/);
    assert.match(sql, /UPPER\(TRIM\(ar\.payload->>'company'\)\) = 'TEST'/);
    assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE|DELETE FROM public\.(companies|evaluation_submissions|app_profiles)/);
  }
});

test('deletion SQL locks the selection boundary and commits the specific record deletion', () => {
  const sql = buildTestEvaluationCleanupSql('delete');
  assert.ok(sql.indexOf('LOCK TABLE') < sql.indexOf('CREATE TEMP TABLE'));
  assert.match(sql, /WHERE ar\.record_type = 'survey_response' AND ar\.record_id = c\.record_id/);
  assert.match(sql, /RETURNING ar\.record_id/);
  assert.match(sql, /COMMIT;/);
});
