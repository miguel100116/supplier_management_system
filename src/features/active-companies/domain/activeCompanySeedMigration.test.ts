import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { SurveyType } from '../../../types/survey';
import { REPOSITORY_ACTIVE_COMPANY_SEED } from '../data/repositoryActiveCompanySeed';
import { parseActiveCompanyWorkbook } from './activeCompanySnapshots';

const ROOT = process.cwd();
const MIGRATION_PATH = path.join(ROOT, 'supabase', 'migrations', '202609230001_active_company_snapshots.sql');

const SEED_FILES: Array<{ surveyType: SurveyType; fileName: string; expectedCount: number }> = [
  { surveyType: 'Courier', fileName: 'Microgenesis Courier Evaluation Form.csv', expectedCount: 7 },
  { surveyType: 'Supplier', fileName: 'Microgenesis Supplier Evaluation Form.csv', expectedCount: 20 },
  { surveyType: 'Subcontractor', fileName: 'Microgenesis Subcontractor Evaluation Form.csv', expectedCount: 13 },
];

test('seeds every distinct company from the three repository evaluation exports', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');

  for (const { surveyType, fileName, expectedCount } of SEED_FILES) {
    const file = readFileSync(path.join(ROOT, 'reference-materials', 'source-data', fileName));
    const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const companies = parseActiveCompanyWorkbook(data, fileName, surveyType);
    const localSeed = REPOSITORY_ACTIVE_COMPANY_SEED.find((snapshot) => snapshot.surveyType === surveyType);

    assert.equal(companies.length, expectedCount, `${surveyType} source count changed`);
    assert.deepEqual(localSeed?.companies, companies, `${surveyType} local seed no longer matches its repository CSV`);
    assert.equal(localSeed?.sourceFileName, fileName);
    assert.match(migration, new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const company of companies) {
      assert.ok(migration.includes(`'${company.split("'").join("''")}'`), `${company} is missing from the seed migration`);
    }
  }
});

test('adds the snapshot record type without destructive history statements', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(migration, /'active_company_snapshot'/);
  assert.doesNotMatch(migration, /\b(?:delete|truncate)\s+(?:from\s+)?public\.application_records\b/i);
  assert.match(migration, /on conflict \(record_type, record_id\) do nothing/i);
});
