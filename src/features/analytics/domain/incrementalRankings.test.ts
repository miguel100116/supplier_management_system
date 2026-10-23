import assert from 'node:assert/strict';
import test from 'node:test';
import type { FilterState, SurveyResponse, SurveyType } from '../../../types/survey';
import { createCompanyRankingUpdater } from './incrementalRankings';
import { getAnalyticsCompanyRankings } from './rankings';
import { applyFilters } from './analytics';

const types: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];
function row(id: string, companyId: string, rating: number | 'N/A' = 5): SurveyResponse {
  return { responseId: id, companyId, company: companyId, surveyType: 'Supplier',
    questionId: 'Q-SUP-1', questionNumber: 1, question: 'Quality', questionCategory: 'Quality',
    rating, comment: '', respondentType: 'Employee', submissionDate: '2026-10-01', dataSource: 'client_csv' };
}

test('incremental INSERT, UPDATE, DELETE and replay match a full leaderboard reload', () => {
  const update = createCompanyRankingUpdater();
  const a = row('a', 'one');
  const b = row('b', 'two', 4);
  const c = row('c', 'one', 0);
  const stages = [[a, b], [a, b, c], [a, { ...b, rating: 6 }, c], [b, c], [], [a, b]];
  for (const rows of stages) {
    const result = update(rows, types);
    assert.deepEqual(result, getAnalyticsCompanyRankings(rows, types));
    assert.equal(update(rows, types), result, 'duplicate event preserves the ranked array');
  }
});

test('changed companies re-sort while unaffected company rows retain their identity', () => {
  const update = createCompanyRankingUpdater();
  const a = row('a', 'one', 7);
  const b = row('b', 'two', 4);
  const first = update([a, b], types);
  const second = update([a, b, row('c', 'one', 0)], types);
  assert.equal(second.find((r) => r.companyId === 'two'), first.find((r) => r.companyId === 'two'));
  assert.notEqual(second.find((r) => r.companyId === 'one'), first.find((r) => r.companyId === 'one'));
  assert.equal(second[0].companyId, 'two');
});

test('metadata, all-N/A and remarks-only forms do not create a numeric ranking; zero does', () => {
  const update = createCompanyRankingUpdater();
  const na = row('na', 'one', 'N/A');
  const metadata = { ...na, responseId: 'meta', questionId: 'Q-SUP-03', question: 'Period Covered', comment: '1st Half' };
  const remark = { ...na, responseId: 'remark', questionId: 'Q-SUP-10', question: 'Documentation Remarks', comment: 'Provided.' };
  assert.deepEqual(update([na, metadata, remark], types), []);
  const scored = update([na, metadata, remark, row('zero', 'one', 0)], types);
  assert.equal(scored[0].scorePercentage, 0);
  assert.equal(scored[0].count, 2, 'remarks count but metadata and all-N/A do not');
});

test('stable IDs preserve renames, ambiguous legacy names and category boundaries exactly as a reload', () => {
  const update = createCompanyRankingUpdater();
  const rows = [row('a', 'id-one'), { ...row('b', 'id-one'), company: 'Renamed' },
    { ...row('c', 'id-two'), company: 'Renamed' },
    { ...row('d', 'unused'), companyId: undefined, company: 'Renamed' }];
  assert.deepEqual(update(rows, types), getAnalyticsCompanyRankings(rows, types));
  assert.deepEqual(update(rows.slice(1), types), getAnalyticsCompanyRankings(rows.slice(1), types));
});

test('filter transitions and events outside the visible company scope retain the visible result', () => {
  const update = createCompanyRankingUpdater();
  const a = row('a', 'one');
  const b = row('b', 'two');
  const filters: FilterState = { surveyType: [], questionId: '', rating: 'All', company: 'one', search: '' };
  const visible = update(applyFilters([a, b], filters), types);
  assert.equal(update(applyFilters([a, b, row('c', 'two')], filters), types), visible);
  assert.deepEqual(update([], ['Courier']), []);
  assert.deepEqual(update([a, b], types), getAnalyticsCompanyRankings([a, b], types));
});
