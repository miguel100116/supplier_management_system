# Notification corrections — 2026-11-04

## Scope and result

This change corrects notification presentation and client refresh behavior. It does not change survey scores, assignments, authentication, database records, schema, RLS policies, or reminder schedules. Earlier UI changes in the working tree are preserved.

| Issue | Correction |
| --- | --- |
| Relative ages could remain stale | A shared notification clock refreshes the bell while open and the notification center/log every 30 seconds, immediately on opening, and on focus/visibility recovery. |
| “0m ago” at 45–59 seconds | The formatter uses “just now” until a full minute has elapsed. Minute/hour boundaries have automated coverage. |
| Computed alerts looked newly created after reload | Derived document status no longer gets a fabricated browser detection timestamp. Without a recorded event time, it shows “Current status” and “No recorded event time.” Alert IDs remain stable. |
| Legacy and ISO timestamps sorted differently | Notifications share the existing strict UTC+08:00 legacy parser, now placed in a neutral utility with the Dashboard import kept compatible. Explicit offsets are preserved; PostgreSQL fractional seconds are supported. Sorting, date filters, displayed dates and Today counts use normalized timestamps. Unknown dates sort last. Stored timestamps are not rewritten. |
| Scheduled document deliveries appeared as survey responses | The bell, center and log share document classification for both existing designation values. Document filters and details now include scheduled deliveries. Saved days-left values in the center are explicitly labelled “at delivery.” |
| All Notifications lost older submissions on refresh | Removed the 15-item hydration/refresh cap and the inconsistent 200-item local cap. The bell still previews six items. All Notifications uses all countable submissions in the authorized loaded response set; no stored responses are removed. |
| “Questions answered” included blanks/N/A | Reuses the canonical answered-item rule, counts each answered question ID once, retains numeric zero, and omits entirely unanswered submissions from notifications. Metadata is not counted as an answer. |
| Changes could be missed during initial realtime connection | The first successful subscription reconciles all supported record types, including reminder deliveries and read state, using the existing refresh paths. Reconnect reconciliation remains in place. |

## Verification

- Node regressions cover time boundaries, zero/N/A answers, duplicate questions, over-200 submission history, legacy/ISO ordering, invalid dates, PostgreSQL microseconds, document classification/details, and initial realtime reconciliation.
- Browser coverage advances the clock from 1m to 2m, checks reopen/focus updates, full-center and log updates, document filters/details, unknown-time status, blank-only exclusion, and history after reload at desktop/mobile sizes.
- A two-session browser journey uses the real built application and Supabase client with a simulated external HTTP/WebSocket service. It verifies submission arrival, read/unread propagation in both directions, and recovering an update after disconnect/reconnect. It does not write to staging or establish live hosted delivery.
- `npm test`: 460 passed. `npm run lint`: all TypeScript projects passed. `npm run build`: passed with the existing bundle-size warnings. Four focused desktop/mobile notification/realtime browser cases passed.
- Final combined `npm run test:e2e`: **68 passed**, including desktop/mobile notification ages/history, two-session realtime/read-state/reconnects, and the separately requested import-status navigation styling.
- Earlier runs exposed test-harness timing issues. History now uses the existing `openReadyPage` helper, and the clock regression uses paused virtual time plus deferred-render frame advancement so slow test execution cannot change the expected minute. Assertions and application/test deadlines were not relaxed. History and Admin Settings both passed in the final full run.

## Database protection

No migration, DDL, RLS/policy edit, data import, cleanup, deployment, or remote write is part of this task. Supabase access for this task is limited to read-only SELECT queries returning counts and checksums. Tests use synthetic service responses and in-memory records. The existing application may still persist users' explicit read/unread actions through its existing owner-scoped API; that behavior has not been replaced or bypassed.

A before/after checksum comparison of staging `application_records`, grouped by record type, checks payloads and ownership without exporting business records. All 18 non-export groups match exactly, including 1,143 partner records, 6,488 response-answer rows, three surveys, 45 reminder deliveries, configuration and read state. Export History increased from 39 to 40 entries during the work. A second read-only checksum excluding the most recently created export confirms that all original 39 export payloads and owners are unchanged. The additional entry was created at 2026-11-04 06:08:02 UTC; its source was not attributed, and it was not altered or removed. All original application-record payloads and owners therefore match the baseline. This task issued no remote writes. Production data was not accessed.

## Operational limits and rollback

Relative-time refresh is a display clock, independent of network delivery. Realtime requires a connected signed-in client and remains subject to network latency and browser background throttling; focus/visibility recovery refreshes the age label. Existing reconnect recovery reloads authoritative data. Expiry deliveries continue on the existing daily database schedule; this change does not introduce email, browser push, or background delivery when the app is closed.

Rollback is a revert of these application/test changes. No database rollback or record deletion is needed. Existing read-state retention and last-write-wins persistence semantics are unchanged. Live authenticated hosted delivery remains unverified without a separately authorized live test. Existing build bundle-size warnings are outside this change.
