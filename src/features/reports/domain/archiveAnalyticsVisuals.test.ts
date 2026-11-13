import assert from 'node:assert/strict';
import test from 'node:test';
import { questionWeights } from '../../../data/questionWeights';
import type { SurveyResponse, SurveyType } from '../../../types/survey';
import { buildArchiveAnalyticsData, buildArchiveAnalyticsVisuals } from './archiveAnalyticsVisuals';

function response(type: SurveyType, index = 0): SurveyResponse {
  const weight = questionWeights[type][0];
  return { responseId: `response-${index}`, companyId: `company-${index}`, company: `Partner ${index}`, surveyType: type,
    respondentType: 'Employee', submissionDate: '2026-07-01T00:00:00Z', questionId: weight.questionId,
    questionNumber: 1, question: 'Service quality?', questionCategory: weight.section, rating: weight.maxPoints * 0.82,
    comment: '', archived: true, seriesId: 'archive-a', dataSource: 'client_csv' };
}

test('each archived category uses the Analytics score, trend, volume and category-specific leaderboard scale', () => {
  for (const type of ['Courier', 'Supplier', 'Subcontractor'] as const) {
    const rows = [response(type)];
    const before = JSON.stringify(rows);
    const pages = buildArchiveAnalyticsVisuals(buildArchiveAnalyticsData(rows));
    assert.ok(pages.every(page => page.title.startsWith(type)));
    assert.equal(pages[0].placement, 'before-tables');
    const overview = pages.find(page => page.title.endsWith('Overview'))!;
    assert.match(overview.svg, /82.00\/100/);
    assert.match(overview.svg, /Rating trend/);
    assert.match(overview.svg, /Response volume/);
    assert.ok(pages.some(page => page.title.includes('Category performance')));
    const ranking = pages.find(page => page.title.includes('Leaderboard'))!;
    assert.match(ranking.description!, type === 'Subcontractor' ? /1.64 \/ 2.0/ : /82.00 \/ 100/);
    assert.match(ranking.svg, /RANK SCORE/);
    assert.match(ranking.svg, /FORMS/);
    assert.ok(pages.some(page => page.title.includes('Questions')));
    assert.equal(JSON.stringify(rows), before);
  }
});

test('visuals paginate every ranked partner and escape stored text without losing source rows', () => {
  const rows = Array.from({ length: 25 }, (_, index) => response('Courier', index));
  rows[0].company = '<script>alert("unsafe")</script>';
  const pages = buildArchiveAnalyticsVisuals(buildArchiveAnalyticsData(rows));
  const leaderboard = pages.filter(page => page.title.includes('Leaderboard'));
  assert.equal(leaderboard.length, 2);
  assert.ok(leaderboard.every(page => page.placement === 'before-tables'));
  const positions = [...leaderboard[0].svg.matchAll(/<g><rect x="(\d+)" y="(\d+)"/g)].map(match => [Number(match[1]), Number(match[2])]);
  assert.equal(positions.length, 20);
  assert.deepEqual(positions[0], [33, 116]);
  assert.deepEqual(positions[10], [551, 116]);
  assert.equal([...leaderboard[1].svg.matchAll(/<g><rect /g)].length, 5);
  assert.equal(leaderboard[0].title, leaderboard[1].title);
  assert.doesNotMatch(leaderboard[1].svg, /Company Leaderboard/);
  assert.equal(leaderboard[1].continuation, true);
  assert.match(leaderboard[0].svg, /clip-path="url\(#company-name-Courier-1\)"/);
  const svg = leaderboard.map(page => page.svg).join('');
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  for (let index = 1; index < 25; index++) assert.ok(svg.includes(`Partner ${index}<`));
  assert.ok(pages.every(page => page.width === 1080 && page.height > 0));
});

test('empty archives and unscored answers never invent company ranks or a score', () => {
  assert.deepEqual(buildArchiveAnalyticsVisuals([]), []);
  const pages = buildArchiveAnalyticsVisuals(buildArchiveAnalyticsData([{ ...response('Supplier'), rating: 'N/A' }]));
  assert.match(pages[0].svg, /No Score Yet/);
  assert.equal(pages.some(page => page.title.includes('Leaderboard')), false);
});

test('report ranking limits omit rank 21 while raw archive visual exports retain every company', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ ...response('Supplier', index), rating: 4 - index / 10 }));
  const analytics = buildArchiveAnalyticsData(rows);
  const limited = buildArchiveAnalyticsVisuals(analytics.map(item => ({ ...item, leaderboardLimit: 20 })));
  const leaderboards = limited.filter(page => page.title.includes('Leaderboard'));
  assert.equal(leaderboards.length, 1);
  assert.equal([...leaderboards[0].svg.matchAll(/<g><rect /g)].length, 20);
  assert.doesNotMatch(leaderboards[0].description!, /Rank 21:/);
  assert.equal(analytics[0].summary.totalSubmissions, 25);
  assert.equal(buildArchiveAnalyticsVisuals(analytics).filter(page => page.title.includes('Leaderboard')).length, 2);
});

test('months without a score leave a gap rather than inventing a zero in the rating trend', () => {
  const analytics = buildArchiveAnalyticsData([response('Courier')]);
  analytics[0].summary.monthly = [
    { month: '2026-06', average: 82, responses: 1 },
    { month: '2026-07', average: null, responses: 1 },
    { month: '2026-08', average: 90, responses: 1 },
  ];
  const svg = buildArchiveAnalyticsVisuals(analytics).find(page => page.title.endsWith('Overview'))!.svg;
  assert.equal((svg.match(/<circle[^>]+fill="#2187CD"/g) ?? []).length, 2);
  assert.equal((svg.match(/<polyline[^>]+stroke="#2187CD"/g) ?? []).length, 2);
});
