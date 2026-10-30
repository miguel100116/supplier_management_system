# Agent memory and standards map

Last verified: 2026-10-28. This is a navigation aid, not a second source of implementation truth. Follow [AGENTS.md](../../AGENTS.md) for the complete operating agreement and precedence.

Repository files carry memory between sessions when an agent reads them. This file does not create a background agent or guarantee automatic recall outside this repository. Start future work through AGENTS.md and keep durable findings in the existing second brain.

## Where to look first

| Need | Starting point |
| --- | --- |
| Rules, permissions, required checks | [AGENTS.md](../../AGENTS.md) |
| Focused discovery and bounded reads | [TOKEN_EFFICIENCY.md](TOKEN_EFFICIENCY.md) |
| Architecture, decisions, risks, previous verification | [SECOND_BRAIN.md](SECOND_BRAIN.md); search headings for the topic |
| Feature ownership and directory map | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) |
| Setup and public behavior | [README.md](../../README.md), relevant sections |
| Operational handoff and access guidance | [SYSTEM_TURNOVER.md](../../SYSTEM_TURNOVER.md), relevant sections |
| Commands and CI contracts | [package.json](../../package.json), [verify.yml](../../.github/workflows/verify.yml) |
| Login and public configuration | [supabasePasswordAuth.ts](../../src/services/supabasePasswordAuth.ts), [supabaseClient.ts](../../src/services/supabaseClient.ts), [.env.example](../../.env.example) |
| Shared data boundary | [applicationRepository.ts](../../src/services/applicationRepository.ts), [useSurveyData.ts](../../src/hooks/useSurveyData.ts) |
| Modal lifecycle | [useModalEscape.ts](../../src/hooks/useModalEscape.ts) |

Treat paths as starting points. Verify current code, callers, tests, and versioned migrations before relying on a remembered statement. A local run does not establish staging or production behavior.

## Standards to retain

- Preserve user changes; inspect status and relevant diffs first. Keep changes within scope.
- Reuse canonical domain rules and existing feature boundaries. Keep infrastructure I/O out of views and domain logic.
- Enforce authorization at server/database boundaries, validate external data, and preserve persistence compatibility.
- Never store credentials, tokens, customer data, or chat transcripts in memory documents. Do not commit local environment files.
- Do not push, merge, deploy, apply migrations, or change remote data without explicit authorization.
- Use the actual package scripts. `lint` is TypeScript checking. Apply the testing and definition-of-done requirements in AGENTS.md; documentation-only changes need link and diff review rather than application tests.

## UI quality: avoid AI slop

The existing Microgenesis interface is the design authority. Before intentional UI work, inspect the affected screen and its closest existing comparison.

- Match the existing font, compact spacing, hierarchy, borders, radii, responsive behavior, and icon library.
- Use brand blue for primary actions and selected states; keep secondary controls quiet and use semantic colors for status.
- Remove redundant instructions, decorative icons, excessive badges, nested cards, competing actions, and oversized spacing only within the authorized UI change.
- Fix concrete issues such as overflow, clipping, unclear labels, misleading states, and inaccessible focus without expanding into adjacent screens.
- Preserve useful controls, validation, permission checks, keyboard access, error recovery, and confirmation safeguards.
- Register dialogs with `useModalEscape`; use the same guarded close callback for Escape, backdrop, and Close/Cancel. Dismissal must never confirm an action.
- Review desktop/mobile and applicable loading, empty, error, disabled, selected, and dialog states. Report unavailable visual checks.
- During a behavior-preserving refactor, preserve the existing UI. Report pre-existing design issues separately instead of changing them.

## Maintain memory after work

Record durable architectural decisions, changed source-of-truth boundaries, operational commands, and material risks in [SECOND_BRAIN.md](SECOND_BRAIN.md). Include the date, code/test evidence, verification limits, and recovery approach where relevant. Correct stale entries rather than stacking contradictory notes. Keep temporary task progress in working context; do not duplicate the second brain here.
