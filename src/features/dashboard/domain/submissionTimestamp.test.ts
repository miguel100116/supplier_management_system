import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSubmissionTimestamp } from './submissionTimestamp';

test('legacy source times and explicit UTC/offsets identify the same instant independently of browser timezone', () => {
  const expected = Date.parse('2026-07-23T11:31:15.000Z');
  for (const timezone of ['UTC', 'Asia/Singapore', 'America/New_York']) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = timezone;
      for (const source of ['07/23/2026 19:31:15', '2026-07-23T19:31:15', '2026-07-23T19:31:15+08:00', '2026-07-23T11:31:15Z']) {
        assert.equal(parseSubmissionTimestamp(source), expected);
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});

test('invalid dates and unsupported source formats stay unavailable instead of rolling into another date', () => {
  for (const source of ['', 'invalid', '02/30/2026 12:00:00', '2026-02-29T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '23/07/2026 19:31:15']) {
    assert.equal(parseSubmissionTimestamp(source), null, source);
  }
  assert.equal(parseSubmissionTimestamp('2024-02-29T00:00:00Z'), Date.parse('2024-02-29T00:00:00Z'));
});
