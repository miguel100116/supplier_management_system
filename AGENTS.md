# Supplier Management System Agent Rules

## Purpose and precedence

This file is the authoritative repository-wide operating agreement for every AI coding agent working in this project. Follow the user's current request first, then this file, then narrower instructions located closer to the files being changed. Keep changes inside the requested scope. Do not implement adjacent features merely because they appear useful.

Before substantial work, read `README.md`, `SYSTEM_TURNOVER.md`, and `docs/engineering/SECOND_BRAIN.md`. Treat the second brain as navigation and project memory, then verify relevant statements against the code because it can become stale.

## Source-of-truth hierarchy

Do not treat chat history, filenames, comments, screenshots, or planning documents as proof that the implementation behaves a certain way. Resolve conflicts using this order:

1. The user's current request and explicitly approved product decisions.
2. Executable evidence: current source code, versioned database migrations, automated tests, package scripts, and configuration contracts such as `.env.example`.
3. Read-only verification of the actual target environment when the task requires it and access is authorized. Keep staging and production evidence clearly separated.
4. `docs/engineering/SECOND_BRAIN.md` for durable project memory and navigation.
5. `README.md`, `SYSTEM_TURNOVER.md`, manuals, and other documentation.
6. Historical notes, comments, generated artifacts, and assumptions.

When sources disagree, do not silently choose one. Verify the behavior, follow the higher-quality evidence, correct stale documentation within scope, and name any unresolved contradiction in the handoff. A successful build proves that the code compiles; it does not prove the feature, authorization boundary, migration, or user journey works.

## Mandatory context-first preflight

Do not write implementation code until the task's relevant context has been inspected. Scale the inspection to the task, but complete this preflight for every code change:

1. Read this file and the relevant portions of `README.md`, `SYSTEM_TURNOVER.md`, and `docs/engineering/SECOND_BRAIN.md`.
2. Run `git status --short`. Inspect existing diffs for every file likely to be edited so user changes are not overwritten.
3. Locate the feature with `rg`/`rg --files`; identify its entry point, callers, types, persistence boundary, authorization boundary, tests, and public contract.
4. Read the smallest complete set of relevant files. Do not read the whole repository when targeted searches and focused ranges provide the necessary context.
5. Verify documentation claims against code and, for database work, against versioned migrations. Use read-only staging checks when remote facts matter; never infer production state from staging.
6. State the intended outcome, affected boundary, acceptance criteria, verification commands, and rollback approach for risky changes before editing.

If the request is documentation-only or trivially local, the preflight may be brief, but Git status and the directly affected files must still be inspected. Do not ask the user for facts that can be discovered safely from the repository or an authorized read-only check.

## Efficient task execution

- Start narrow: search for symbols, routes, storage keys, table names, and tests before opening large files.
- Read related files and run independent read-only checks in parallel when that reduces delay without creating overlapping edits.
- Reuse the repository's existing types, services, domain rules, scripts, fixtures, and test patterns before introducing new abstractions.
- Make one small vertical slice complete before broadening scope. Prefer a working, tested boundary over scattered partial edits.
- Run the narrowest relevant test during iteration; run the required repository gates once the slice is coherent.
- Stop investigating when the acceptance criteria are supported by enough evidence. Do not perform unrelated audits or cleanup.
- Keep progress updates concise: finding, decision, change, verification, blocker. Do not narrate routine commands.

## Core working agreements

- Preserve existing user changes. Start by checking `git status --short` and inspect relevant diffs before editing overlapping files.
- Prefer the smallest complete change that solves the request. Avoid opportunistic rewrites and broad formatting churn.
- State assumptions when they materially affect architecture, data, security, or user-visible behavior.
- Never expose, copy, log, or commit secrets. Do not read `.env` unless the task specifically requires diagnosing local configuration; use `.env.example` for names and documentation.
- Do not commit generated output, caches, local exports, or customer/partner data. Examples include `dist/`, `.vite/`, ad hoc CSV exports, screenshots, and extracted form text unless the user explicitly requests a versioned fixture or artifact.
- Do not deploy, publish, merge, push, alter remote data, or apply database migrations without explicit authorization.
- Use plain, concise handoffs. Report files changed, behavior affected, checks run, and remaining risks.

## Engineering loop

Use this loop for every code task. Scale the depth to the risk of the change.

1. **Understand**: restate the outcome internally, inspect the relevant code paths, constraints, tests, and current Git diff. Identify the source of truth and affected boundaries.
2. **Plan**: choose a small vertical slice, list likely files, define acceptance criteria, and decide how the change will be verified. For risky work, identify a rollback path.
3. **Implement**: make cohesive edits in small steps. Preserve behavior during refactors and keep domain rules separate from rendering and I/O.
4. **Verify**: run the narrowest meaningful tests first, then the required repository gates. Exercise failure paths and boundary cases, not only the happy path.
5. **Review**: inspect the final diff as a reviewer. Check correctness, security, accessibility, data integrity, unnecessary complexity, and accidental unrelated edits.
6. **Document**: update user-facing docs when behavior or operations change. Update the second brain only with durable architectural facts, decisions, risks, or handoff context.

If verification fails, return to Understand with the new evidence. Do not weaken assertions, delete tests, or hide errors to make a gate pass.

## Definition of done

A code change is complete only when all applicable conditions are met:

- Acceptance criteria are satisfied and no known requested work remains.
- New or changed behavior has meaningful automated coverage at the lowest effective level.
- Existing relevant tests pass; type checking and production build pass.
- Error, empty, loading, permission, and boundary states were considered where applicable.
- The final diff contains no secrets, debug leftovers, generated files, or unrelated changes.
- Documentation and `docs/engineering/SECOND_BRAIN.md` are updated when their durable facts changed.
- Any skipped check or unresolved risk is named explicitly in the handoff.

Documentation-only and agent-rule-only edits do not require application tests or a build. Verify their links, commands, internal consistency, and Git diff instead.

## Architecture and modularity

Evolve the application incrementally toward feature-oriented modules. Do not perform a big-bang rewrite.

Use these responsibilities:

- `pages/`: route-level composition, data loading orchestration, and page layout. Pages should not own reusable domain algorithms or infrastructure details.
- `components/`: reusable presentation and focused interactions. Prefer explicit typed props and composition.
- `hooks/`: reusable React orchestration and state lifecycle. Keep pure business rules outside hooks.
- `services/`: external I/O boundaries such as Supabase, Microsoft Graph, authentication, and future APIs. UI code should not call infrastructure clients directly.
- `utils/`: small, pure, domain-neutral helpers. Domain workflows should not become miscellaneous utility collections.
- `types/`: shared contracts. Keep runtime validation at untrusted boundaries; TypeScript types alone do not validate external data.
- `data/`: static reference data and development fixtures. Large generated datasets should be produced or imported through a documented process rather than hand-edited.

For new or substantially changed areas, prefer a feature module such as:

```text
src/features/<feature>/
  components/
  hooks/
  services/
  domain/
  types.ts
  index.ts
```

Apply these dependency rules:

- React views may depend on feature application/domain code; domain code must not depend on React, browser storage, Supabase, MSAL, or rendering libraries.
- Isolate `localStorage`, network calls, clocks, file generation, and authentication behind named adapters or services.
- Keep one canonical implementation of each business rule. Do not duplicate scoring, authorization, status, or data-mapping logic across pages.
- Prefer pure functions for scoring, filtering, mapping, compliance, and report preparation.
- Avoid circular dependencies and deep imports into another feature's internals. Export a small public feature API.
- Make invalid states difficult to represent with discriminated unions, narrow types, and exhaustive checks.
- Split a module when it has multiple reasons to change, mixes rendering with domain/I/O logic, or cannot be tested without mounting unrelated behavior. File length is a signal, not the primary rule.
- Do not add abstractions for a single speculative use. Extract after a clear boundary or repeated concept is demonstrated.

## Refactoring rules

- Separate refactoring from behavior changes when practical so reviewers can distinguish them.
- A modular refactor must preserve the current UI unless the user separately and explicitly requests a UI change. Preserve visible layout, styling, spacing, typography, colors, responsive behavior, copy, controls, navigation, animations, accessibility behavior, and interaction flows.
- Do not redesign, restyle, modernize, simplify, or "clean up" the interface while extracting modules. Keep existing JSX structure and CSS/Tailwind classes stable where practical; any markup change must be the minimum required for extraction and must render equivalently.
- Treat intentional UI changes as a separate scoped change or clearly separated diff. Never hide a UI change inside a refactoring task.
- Before refactoring a UI area, capture or inspect its baseline at representative desktop and mobile sizes when visual tooling is available. Afterward, compare the same states and viewports. If automated visual comparison is unavailable, perform a rendered manual comparison and state that limitation in the handoff.
- Before changing poorly covered behavior, add characterization tests around the current contract.
- Refactor in safe seams: extract pure functions, adapters, focused hooks, and components one behavior at a time.
- Preserve public contracts unless the task explicitly authorizes a breaking change. Update every caller and relevant document when a contract changes.
- For persistence migrations, define compatibility, migration, validation, and rollback. Never silently discard browser or database data.
- Replace the current `localStorage`-first design incrementally; do not create another competing source of truth.
- Do not mix a repository-wide rename, formatter pass, or dependency upgrade into an unrelated refactor.

## UI/UX design consistency

Treat the existing Supplier Management System as the design authority. UI work must extend the established Microgenesis visual language rather than introduce a separate design. Before changing an interface, inspect the affected screen and the closest comparable components; identify their colors, typography, spacing, control states, icon usage, responsive behavior, and interaction patterns. Reuse existing components and styles where practical.

- Preserve the existing font family, type scale, heading hierarchy, compact enterprise layout, spacing, borders, radii, and responsive conventions.
- Use the existing brand blue for primary actions and selected states, existing neutrals for secondary controls, and semantic colors only when they communicate status. Keep secondary filters and controls visually quieter; do not make every selected element use the strongest blue. Avoid arbitrary accent colors and gradients.
- Establish hierarchy through color, spacing, typography, and alignment. Keep selected and focus states clear without overpowering nearby controls.
- Change only the interface elements needed for the request. Do not redesign adjacent UI or add unrequested icons, badges, cards, banners, headings, filters, or navigation. Icons must use the established icon library and meanings.
- Match existing patterns for tabs, segmented filters, buttons, bulk selection, tables, file actions, forms, and modals. Confirmation dialogs should be compact for simple actions and clearly explain consequences; preserve dismissal and accessibility behavior.
- Keep functionality, validation, permissions, persistence, data relationships, error handling, and responsive behavior intact. Appearance must not override these contracts.
- After a UI change, review desktop and mobile states when visual tooling is available. Check brand colors, typography, spacing, hierarchy, alignment, control states, accessibility, and unintended changes. If visual comparison is unavailable, state that limitation in the handoff.
- When comparable patterns conflict, prefer the one used in the same module or workflow. If the choice would materially change the interface and remains ambiguous, ask before inventing a new pattern.

### Automatic UI/UX quality pass (unslop)

- Automatically review and improve UI/UX quality whenever creating or intentionally changing an interface; do not wait for a separate cleanup request. Apply this pass to the affected screen or interaction within the authorized scope.
- Remove unnecessary visual noise: redundant headings, repeated instructions, decorative icons, excessive badges, nested cards, oversized spacing, competing primary actions, and effects that do not help users understand or complete their task. Preserve useful information and controls.
- Fix concrete usability defects in the touched interface: unclear labels, misleading success or empty states, weak hierarchy, inconsistent controls, clipped content, viewport overflow, inaccessible focus states, and avoidable interaction steps. Reuse the closest established Microgenesis pattern instead of inventing a new design.
- Preserve validation, permissions, data, confirmation safeguards, keyboard navigation, focus handling, and error recovery. Simplifying appearance must never remove required functionality or hide operational failures.
- Check the result at desktop and mobile sizes, including relevant loading, empty, error, disabled, selected, and open-dialog states. Add behavioral or viewport regression coverage for defects found; report any visual checks that could not be performed.
- Keep this pass small and reviewable. Do not expand it into adjacent screens, a redesign, dependency additions, or a formatting sweep. During a behavior-preserving refactor, retain the existing UI and report pre-existing design issues separately; this rule does not override the refactoring contract or require approval for routine improvements already within an authorized UI task.

### Modal and dialog contract

- Every modal or dialog must register with the shared `useModalEscape` lifecycle in `src/hooks/useModalEscape.ts`. This provides Escape handling, backdrop dismissal, scroll locking, nested-modal priority, and focus restoration.
- Backdrop dismissal is enabled for every modal. A pointer-down directly on the full-screen backdrop (or its explicit full-screen backdrop layer) must invoke the same request-close callback as Escape; pointer-downs inside the dialog must not close it.
- Pass the modal's request-close callback to `useModalEscape`. If the modal has unsaved edits, that callback must ask whether to discard before closing; use the same guarded callback for Escape and the existing Close/Cancel controls.
- Confirmation dialogs also close through their request-close callback on Escape or backdrop pointer-down. Closing a confirmation must never invoke its confirm, delete, archive, or other action; those actions run only from their explicit controls.
- Do not implement per-dialog backdrop listeners. Preserve the existing overlay markup and styles; new dialogs inherit the shared behavior by registering with `useModalEscape`.
- Add or update tests for direct backdrop pointer-down, inside pointer-down, Escape, guarded dirty-state close, confirmation dismissal without action, and nested-modal priority when changing modal behavior.

## Testing strategy

Use a risk-based test pyramid:

- **Unit tests** for pure domain rules, scoring, RBAC, import mapping, date/compliance logic, and reducers.
- **Component tests** for user interactions, validation, accessibility semantics, and conditional states.
- **Integration tests** at storage, Supabase, authentication, Graph/email, import/export, and routing boundaries. Mock only outside the boundary being tested.
- **End-to-end tests** for a small set of critical journeys: sign-in and authorization, survey submission, partner/document management, reporting, and data import.

Test observable behavior rather than private implementation. Include negative cases, malformed external data, authorization boundaries, time zones/date edges, partial failures, and regression cases for bugs.

Current repository reality: `npm test` discovers colocated Node tests through `tsx` under `src/`, `server/`, and `scripts/`. `npm run test:unit` selects domain/utils; `npm run test:integration` includes remaining service, HTTP, presentation, import, and tooling tests. Playwright's `npm run test:e2e` exercises the built application with synthetic external-service responses at desktop/mobile sizes; it does not verify live RLS or hosting. Coverage is not repository-wide. `npm run lint` performs TypeScript checks; ESLint is not configured. Report these checks by their real names instead of describing TypeScript checking as stylistic linting or claiming broader test coverage than exists.

Current verification commands:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

`npm run verify` runs these gates plus the dependency audit. Install Chromium with `npx playwright install chromium` before browser tests. `npm run hooks:install` enables the opt-in local pre-push gate; CI remains authoritative.

When test and formatting scripts are introduced, use the scripts declared in `package.json`; CI and local verification must call the same commands.

## CI/CD contract

CI exists in `.github/workflows/verify.yml`: clean install, TypeScript checks, Node tests, production build, desktop/mobile E2E, dependency audit, and secret scan. Preserve these gates when evolving CI/CD:

- Pull requests run on a clean checkout with `npm ci`, type checking, linting, automated tests, and a production build.
- Add dependency/security scanning and secret scanning with explicit triage; do not silently ignore high-severity findings.
- Pin the Node major version and use dependency caching keyed by the lockfile.
- Upload only useful, non-sensitive diagnostics or test artifacts on failure.
- Protect the default branch: required checks, reviewed changes, and no direct production deployment from unverified commits.
- Keep build and deploy separate. Promote the same immutable artifact across environments.
- Store environment-specific configuration in the deployment platform, never in Git. Use least-privilege identities and separate development, staging, and production environments.
- Database migrations are versioned, reviewed, tested against a disposable environment, applied before dependent application code, and paired with a recovery plan.
- Production deployment requires explicit authorization, health checks, observable rollout, and a documented rollback path.
- Do not make a failing pipeline green by disabling a gate. Fix the cause or document and obtain approval for a time-bounded exception.

## Security and data integrity

- Treat partner, employee, survey, and document data as confidential business data.
- Authorization must be enforced at the server/database boundary. Client-side route hiding is usability, not security.
- Review Supabase row-level-security policies with every schema change. Temporary anonymous policies must never be enabled in production.
- Validate imported CSV/XLSX data, API responses, URL parameters, and persisted browser data at runtime.
- Escape or sanitize untrusted content used in generated HTML, documents, email, or downloads.
- Avoid logging tokens, personal data, response contents, or environment values.
- Use secure defaults and least privilege for Microsoft Graph scopes, Supabase access, and service credentials.

## Agent collaboration

Use multiple agents only when the runtime supports them and the work can be divided into independent, bounded tasks. The coordinating agent owns the plan, integration, and final verification.

Useful review lenses are:

- **Explorer/architect**: maps current behavior, dependencies, contracts, and refactoring seams; does not edit during discovery.
- **Implementer**: owns a clearly defined set of files and acceptance criteria.
- **Test/review agent**: designs edge cases, reviews the diff, and verifies behavior independently.
- **Security/data agent**: reviews authentication, authorization, RLS, external inputs, secrets, and migration safety.
- **CI/release agent**: reviews reproducibility, pipeline gates, artifacts, environment promotion, and rollback.

Do not assign overlapping file ownership to parallel agents. Share constraints and expected outputs, not vague goals. Subagents must not commit, push, deploy, or broaden scope. The coordinating agent must inspect all contributed diffs and run the final checks.

## Code review rules

Flag the following as blocking unless the user explicitly accepts the risk:

- Broken authorization or reliance on client-side checks for protected data.
- New competing sources of truth or unsynchronized persistence paths.
- Data loss, destructive migrations, or imports without validation and recovery.
- Business-rule duplication, especially scoring and RBAC logic.
- New behavior without meaningful tests, except trivial low-risk changes where a test would only mirror implementation.
- Swallowed errors, misleading success states, unsafe type assertions at external boundaries, or secrets/personal data in logs.
- CI changes that skip gates, use non-reproducible installs, expose secrets, or deploy unverified artifacts.

## Second-brain maintenance

`docs/engineering/SECOND_BRAIN.md` is the durable project memory for humans and agents.

- Update it after architectural decisions, source-of-truth changes, new operational commands, migrations, major risks, or completed modernization milestones.
- Record evidence and dates. Separate verified current facts, approved decisions, proposals, and temporary task notes.
- Keep it concise. Link to canonical code or documentation instead of copying large sections.
- Never store secrets, tokens, personal data, raw customer data, chat transcripts, or speculative claims.
- Remove or correct stale entries when the code changes. Do not append contradictory history indefinitely.
