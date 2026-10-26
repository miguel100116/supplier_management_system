import assert from 'node:assert/strict';
import test from 'node:test';
import { describeArchiveResponseGroup } from './archiveResponseGroup';
import type { SurveyResponse } from '../../../types/survey';

test('Archive Center entry identities preserve named series, unknown series and legacy dates', () => {
  const row = { surveyType: 'Courier', seriesId: 'half-one', archivedBySurveyId: 'survey', archivedBySurveyTitle: 'Courier review', archivedAt: '2026-07-01', submissionDate: '2026-06-01' } as SurveyResponse;
  const series = { id: 'half-one', label: 'First half', createdAt: '2026-07-01' };
  assert.deepEqual(describeArchiveResponseGroup(row, new Map([[series.id, series]])), { id: 'half-one', label: 'First half', seriesId: 'half-one', sortKey: '2026-07-01' });
  assert.deepEqual(describeArchiveResponseGroup(row, new Map()), { id: 'legacy_survey_2026-07-01', label: 'Courier review', seriesId: undefined, sortKey: '2026-07-01' });
  assert.equal(describeArchiveResponseGroup({ ...row, archivedAt: undefined, archivedBySurveyId: undefined }, new Map()).id, 'legacy_Courier_2026-06-01');
});
