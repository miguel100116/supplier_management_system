# Frontend–Supabase alignment

Status: re-audited through non-intrusive static analysis of the frontend source and versioned migrations on 2026-09-24. The live hosted schema was not queried during this pass. Staging migration statuses below are explicitly labeled as previously verified/reported evidence and must not be treated as a fresh remote verification.

## Verdict

The connection architecture is structurally sound:

- the browser receives only the public Supabase URL and publishable key;
- Supabase Auth establishes the identity used by Postgres RLS;
- shared editable state crosses one `applicationRepository` boundary;
- normalized import tables remain a read-only audit/reference layer;
- `app_profiles` carries authorization attributes;
- `application_records` carries per-entity JSON payloads;
- Realtime messages are invalidation signals and clients refetch through RLS;
- the 19 frontend record types exactly match the latest versioned database check constraint.

The working tree now contains delegated document renewal, Admin-only Archive Center routing, runtime parsing for every application-record type, failed-write refetch, password recovery, and a mandatory Microsoft-to-Supabase exchange. Company-wide lower-rank Analytics remains unresolved. The delegated-renewal database function is pending a reviewed commit and has **not** been applied. Production alignment therefore remains blocked until approved environment-specific migration, policy, role, Realtime, and recovery testing is complete.

## Implementation checklist

Checklist meaning:

- `[x]` is implemented and was verified in the current repository source or versioned migrations.
- `[ ]` is missing, incomplete, or requires environment-specific verification that this static audit could not provide.
- A tracked migration counts as repository implementation, not proof that it has been applied to staging or production.

### Configuration and trust boundary

- [x] The browser configuration contract exposes only the public Supabase URL and publishable key through Vite variables or `/api/config`.
- [x] Supabase client creation has an explicit unconfigured state and a harmless placeholder client; repository/auth operations reject unconfigured use.
- [x] Supabase password sign-in and sign-up normalize and restrict addresses to `@mgenesis.com`.
- [x] The versioned database policies also require a confirmed `@mgenesis.com` identity instead of relying only on the browser check.
- [x] A targeted tracked-file scan found no private-key blocks, JWT-shaped tokens, Supabase secret-key signatures, common live secret prefixes, or AWS access-key signatures.
- [ ] [ENVIRONMENT] Confirm independently in every deployed environment that `/api/config` and built assets contain no service-role key, database password, JWT signing secret, or OAuth client secret.
- [ ] [OWNER] Confirm the production authentication provider and configuration; staging configuration is not production evidence.

### Data ownership and repository boundary

- [x] Shared editable application data crosses the named `applicationRepository` boundary or a focused service built on it.
- [x] `APPLICATION_RECORD_TYPES` defines 19 record types and has a focused test against the latest versioned database constraint.
- [x] `survey_response` uses `responseId:questionId` as its stable application-record key.
- [x] Owner-scoped notification, export, and employee-notification records attach the authenticated Supabase user ID where required.
- [x] Normalized company/form tables are treated as a read-only reference/import layer by the frontend.
- [x] Active-company snapshots use a focused parser/service and cannot create Partner Company or survey-response records.
- [x] Runtime schemas parse all 19 application-record payload types; invalid rows are quarantined and reported without discarding valid neighboring rows. Known legacy survey responses normalize `Contractor` to `Courier`, `General` to `Overall`, absent respondent type to `Unspecified`, and absent rating/comment values to `N/A`/empty text. A missing completion timestamp is recovered deterministically from start time, a `RESP-<timestamp>` ID, or finally the immutable application-record creation time and marked with its inference source; a supplied malformed date remains rejected.
- [x] Profile roles, designations, departments, page permissions, and survey-type permissions are validated at runtime on load and save instead of being cast from database arrays.

### Versioned authorization controls

- [x] Versioned migrations enable RLS on `app_profiles`, `application_records`, and normalized business tables.
- [x] Anonymous access to `app_profiles` and `application_records` is revoked in the versioned migration chain.
- [x] Authorization helper functions use an empty `search_path`; security-definer profile helpers live in the unexposed `private` schema.
- [x] The latest RLS migration consolidates `app_profiles` and `application_records` to one policy per operation.
- [x] Raw response reads are scoped by role, designation, department, ownership, and respondent email as documented.
- [x] Shared registry/configuration writes are Admin-only in the current policy model.
- [ ] [STAGING] Re-query staging to confirm the expected RLS policies, grants, functions, and constraints are actually installed.
- [ ] [PRODUCTION] Independently verify production RLS and grants before any production approval.
- [ ] Company-wide aggregate Analytics for lower ranks still needs a reviewed server-side boundary; raw response access must not be widened.
- [x] `202609240001_delegated_document_renewal.sql` implements a narrowly validated renewal RPC with optimistic concurrency and an atomic audit entry; the migration remains unapplied.
- [x] Archive Center is explicitly Admin-only in default and effective page access, matching the existing database write boundary.

### Realtime synchronization

- [x] `subscribeToApplicationChanges()` listens to `application_records` and `app_profiles`.
- [x] Realtime payloads are used only as invalidation signals; clients refetch through normal RLS-protected queries.
- [x] Core surveys, responses, partners, and categories refresh through `useSurveyData.ts`.
- [x] Profiles and department permissions refresh through `App.tsx`.
- [x] Operational stores refresh through `sharedStoreHydration.ts`.
- [x] An open Active Companies view refreshes `active_company_snapshot` records through its focused service.
- [x] A versioned migration adds `application_records` and `app_profiles` to `supabase_realtime` when absent.
- [ ] [ENVIRONMENT] Re-query staging and production separately to confirm both tables are currently published to Realtime.
- [ ] [STAGING] Add environment-backed tests for disconnect, reconnect, duplicate invalidation, and stale-session behavior.

### Persistence failure behavior

- [x] Background persistence failures emit a user-visible `supabase-persistence-error` event.
- [x] Repository functions throw when Supabase reads, writes, deletes, or reconciliation operations fail.
- [x] Repository read/write/reconciliation failures emit a typed invalidation that causes an authoritative RLS-protected refetch.
- [x] Authorization-sensitive Partner, document-renewal, survey, and archive success notifications occur only after the remote mutation resolves.
- [x] Multi-step replacement recovery is defined: any failed upsert, select, or delete requests an authoritative refetch; retry is safe because upserts use stable IDs and deletes target the computed stale-ID set. Atomicity is still preferred for future complex workflows.

### Authentication and account lifecycle

- [x] Supabase email/password authentication is implemented for staging.
- [x] Login rejects an authenticated session whose email is outside the approved company domain.
- [x] Microsoft login remains visibly optional/disabled when its public configuration is unavailable.
- [x] Password reset email initiation, recovery callback handling, password validation/update, and forced fresh sign-in are implemented and covered by focused tests.
- [ ] [OWNER/HOSTED] Enable hosted leaked-password protection when the approved Supabase plan supports it, or approve a documented compensating control.
- [x] Microsoft authentication completes only after a successful Supabase ID-token exchange; bridge failure blocks the application identity.
- [x] Hard-coded browser-side administrative passcodes have been removed; destructive actions retain explicit confirmation and rely on authenticated Admin routing plus database authorization.

### Migration status

- [x] `202609230001_active_company_snapshots.sql` is tracked in Git.
- [x] Staging was previously reported/verified to record `202609230001_active_company_snapshots` as applied; this static pass did not re-query it.
- [x] `202609220001_response_provenance.sql` is tracked, additive, and has a focused non-destructive migration test.
- [x] `202609240001_delegated_document_renewal.sql` exists in the working tree and is statically tested; it was not executed and remains pending the next reviewed commit.
- [x] `202609220001_response_provenance` remains documented as not applied in staging and prohibited from execution without separate authorization.
- [x] The 6,355 pending/zero exact result is explained and reproducibly classified by `response_provenance_readiness.sql` and `RESPONSE_PROVENANCE_RUNBOOK.md`.
- [x] Pre-migration recovery, post-migration reconciliation, and exact failure thresholds are defined in the runbook.
- [ ] [OWNER/STAGING] Obtain environment-owner approval for the recovery plan and a staging-only execution window; no migration was executed in this phase.
- [ ] [PRODUCTION] Inspect production migration state independently; do not infer it from staging.

### Automated and environment verification

- [x] Focused tests cover record-type constraint alignment, additive migration behavior, private security-definer helpers, consolidated policies, provenance classification, and Active Companies seed behavior.
- [x] The pre-stabilization baseline passed TypeScript checks, 73 tests, and a production build on 2026-09-24.
- [x] The client-passcode removal passed TypeScript checks, 74 tests, and a production build on 2026-09-24.
- [x] Profile/permission runtime validation passed TypeScript checks, 76 tests, and a production build on 2026-09-24.
- [x] The completed local stabilization slice passed a lockfile-clean `npm ci`, TypeScript checks, 97 tests, production build, and zero-vulnerability dependency audit on 2026-09-24.
- [ ] [STAGING] Add database-backed permitted/denied tests for Admin, Executive, Director, Managerial, Supervisory, Rank & File, delegated-renewal, and archive scenarios.
- [x] Focused regression coverage verifies failed-write invalidation and that sensitive success messages follow awaited remote calls.
- [ ] [STAGING] Add environment-backed Realtime disconnect/reconnect and database-rejection integration tests.
- [x] A pinned-Node pull-request workflow runs `npm ci`, type checking, tests, production build, dependency audit, secret scanning, and uploads the immutable build artifact; it cannot run on GitHub until pushed and enabled.
- [x] The previous 1 critical, 5 high, and 5 moderate advisories were remediated; `npm audit` is clean and ownership/install-script decisions are recorded in `DEPENDENCY_SECURITY.md`.

### Repository security hygiene

- [x] Static pattern checks found no tracked privilege-escalation, system-service manipulation, persistence, destructive package-removal, private-key, or credential-token signatures.
- [x] The service-role import path reads its credential from a server-side environment variable and was not executed during this audit.
- [x] First-party network access found in scope is attributable to Supabase, Microsoft Graph, runtime configuration, or documented import tooling rather than hidden exfiltration logic.
- [x] Tracked `.vite/` dependency-cache files are removed and `.vite/` is ignored.
- [x] Obsolete root-level extraction/patch scripts and generated text/JSON outputs were statically reviewed, found unreferenced, and removed without execution; canonical source data and the project charter remain.
- [x] Partner Companies and Survey Forms no longer ship shared administrative passcodes or password inputs for destructive actions; a focused source regression test guards this invariant.

## Static security audit summary

**Static repository security-readiness score: 8.5/10.** The web/Node/PostgreSQL code shows a legitimate, scoped architecture with no detected malicious privilege, persistence, destructive-system, token, private-key, or covert exfiltration signatures. The previously identified repository gaps are implemented and tested locally. Production readiness remains blocked by unapplied migrations, unverified hosted configuration/RLS/Realtime state, environment-backed role and recovery tests, leaked-password configuration, CI branch protection, and operational approval; this static result is not a penetration test or substitute for staging/production verification.

## Connection and trust flow

```text
Express /api/config or Vite public environment variables
                  |
                  v
        src/services/supabaseClient.ts
                  |
                  v
       Supabase Auth session (@mgenesis.com)
                  |
                  v
 applicationRepository / typed feature services
                  |
                  v
       PostgREST + Postgres RLS policies
          |                       |
          v                       v
 app_profiles              application_records
 authorization             editable UI records
                                  |
                                  v
                    Realtime invalidation event
                                  |
                                  v
                         RLS-protected refetch
```

Security boundary: React route visibility and TypeScript types are usability controls. Supabase RLS is the authorization boundary. Realtime payloads are never accepted as trusted application data.

## Configuration contract

| Setting | Consumer | Semantics |
|---|---|---|
| `VITE_SUPABASE_URL` | `supabaseClient.ts`, `/api/config` | Public project API URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `supabaseClient.ts`, `/api/config` | Browser-safe publishable/anon key only. Never use a service-role key. |
| `VITE_DEPLOYMENT_ENV` | evaluation submission provenance | Defaults to staging; only an approved production deployment may use `production`. |

`src/main.tsx` requests `/api/config` before dynamically importing the application, allowing runtime public configuration. Static hosting falls back to Vite build-time variables. An unconfigured client uses a harmless placeholder, while repository/auth methods reject operations through `isSupabaseConfigured` checks.

Do not place database passwords, JWT signing secrets, or service-role keys in any `VITE_*` variable or runtime response.

## Data ownership

### Normalized import/audit layer

`companies`, `company_branches`, `company_documents`, `evaluation_forms`, and `evaluation_questions` are read-only reference tables for authenticated confirmed company users. `loadNormalizedPartnerCompanies()` is a fallback only when no editable `partner_company` application records are visible.

The frontend must not write normalized import tables. Import tooling and reviewed migrations own that layer.

### Editable application layer

`app_profiles` stores email, role, designation, department, and optional account permission overrides. `application_records` uses `(record_type, record_id)` as its primary key and stores one JSON object per editable entity.

| Record type | Stable ID | Read boundary | Write boundary |
|---|---|---|---|
| `partner_company` | company ID | confirmed authenticated users | Admin only |
| `survey` | survey ID | confirmed authenticated users | Admin only |
| `survey_response` | `responseId:questionId` | Admin; Managerial/Director/Executive; Supervisory department; owner/email | Admin, or authenticated user inserting their own response |
| `archive_series` | series ID | confirmed authenticated users | Admin only |
| `department_permission` | department | confirmed authenticated users | Admin only |
| `category_labels` | `global` | confirmed authenticated users | Admin only |
| `feedback_contact` | contact ID | Admin or Supervisory+ | Admin or Supervisory+ |
| `feedback_report` | report ID | Admin or Supervisory+ | Admin or Supervisory+ |
| `feedback_settings` | `global` | Admin or Supervisory+ | Admin or Supervisory+ |
| `document_notification_rule` | rule ID | confirmed authenticated users | Admin only |
| `notification_read_state` | authenticated user UUID | owning user | owning user |
| `admin_activity` | activity ID | Admin only | Admin only |
| `document_modification` | modification ID | confirmed authenticated users | Admin, or authenticated actor inserting their own entry |
| `export_history` | export ID | owning user | owning user |
| `supplier_ranking_history` | log ID | Admin only | Admin only |
| `employee_notification_state` | state ID | owning user | owning user |
| `reminder_settings` | settings ID | confirmed authenticated users | Admin only |
| `compliance_snapshot` | snapshot ID | confirmed authenticated users | Admin only |
| `active_company_snapshot` | type/timestamp/UUID | Admin only | Admin only |

The canonical list is exported as `APPLICATION_RECORD_TYPES` from `applicationRepository.ts`. A focused automated test compares it with the latest migration constraint. `supplier_ranking_history` is a legacy record type retained for existing rows; the removed Supplier Ranking module no longer hydrates or writes it.

## Feature-to-service alignment

| Frontend area | Service boundary | Backend source |
|---|---|---|
| Authentication | `supabasePasswordAuth.ts` | Supabase Auth |
| Profiles and account overrides | `applicationRepository.ts` | `app_profiles` |
| Partner Companies and documents | `useSurveyData.ts` | `application_records/partner_company`; normalized fallback on an empty projection |
| Surveys, responses, archives, categories | `useSurveyData.ts` | corresponding `application_records` types |
| Active Companies upload/history | `features/active-companies` | `application_records/active_company_snapshot` |
| Feedback Hub | `feedbackHubStore.ts` | feedback record types |
| Notification read state | dedicated repository functions | owner-scoped `notification_read_state` |
| Operational settings/history | focused utilities plus `sharedStoreHydration.ts` | corresponding application record types |

Active-company uploads contain only source metadata and a deduplicated `companies: string[]` snapshot. They do not write `partner_company` or `survey_response` and therefore cannot create leaderboard evaluations.

## Realtime alignment

`subscribeToApplicationChanges()` subscribes to `application_records` and `app_profiles`. It emits only a record type or profile-change signal; consumers then perform a normal RLS-protected query.

- Core survey/partner/category stores refresh in `useSurveyData.ts`.
- Profiles and department permissions refresh in `App.tsx`.
- Operational stores refresh through `sharedStoreHydration.ts`.
- An open Active Companies viewer refreshes its snapshots directly through its feature service.

Debouncing is used for the large core hydration path. Feature-specific refreshes remain scoped to their record type.

## Repository resolutions and environment blockers

### 1. Protected lower-rank Analytics

Required resolution: expose a reviewed security-definer aggregate RPC or protected aggregate view returning only approved grouped metrics, then use it for lower-rank Analytics. Do not broaden raw `survey_response` SELECT access merely to make the charts company-wide.

### 2. Delegated document renewal

Resolved in repository: the renewal RPC validates identity, permission, company/branch/document identity, allowed fields, date format, and expected current value, then changes one document and writes its audit entry atomically. Blocker: apply and test permitted, denied, malformed, stale, and concurrent calls in staging.

### 3. Archive authorization

Resolved in repository: Archive Center is Admin-only even if a stale custom permission attempts to expose it. This matches the existing Admin-only response mutation policy. Blocker: verify positive and negative cases against the installed staging policies.

### 4. Rejected-write consistency

Resolved in repository: sensitive mutations are awaited before success and repository failures request authoritative hydration. Stable IDs make replacement retries idempotent. Blocker: inject real database rejections and network interruption in an approved environment.

### 5. Runtime application-record validation

Resolved in repository: all 19 record types have bounded runtime validation, including stable IDs, enums, dates, arrays, and finite numbers. Invalid remote rows are quarantined and reported while valid neighbors load. CSV/XLSX import boundaries retain their dedicated parsers and tests. Blocker: broaden environment/E2E coverage for legacy production-shaped data before release.

### 6. Authentication lifecycle

Resolved in repository: Microsoft bridge failure blocks sign-in and password recovery is implemented. Operational procedures are in `AUTH_OPERATIONS.md`. Blockers: approve the production provider, configure exact redirects and leaked-password protection, and test suspension/revocation/recovery in staging.

## Verification procedure

Local/code verification:

```powershell
npm test
npm run lint
npm run build
```

Remote staging verification, when the approved Supabase CLI or connector is available:

1. Compare applied migration versions with `supabase/migrations/`.
2. Confirm `application_records_record_type_check` matches `APPLICATION_RECORD_TYPES`.
3. Confirm RLS is enabled on `app_profiles` and `application_records`.
4. Confirm anon has no privileges on either table.
5. Confirm both tables are in `supabase_realtime`.
6. Exercise read/write negative cases using Admin, Supervisory, Rank & File, delegated-renewal, and archived-response scenarios.
7. Verify a failed write never produces a durable success state in the UI.

Production must be checked independently. Staging evidence must not be treated as proof of production state.

## Change checklist

Whenever a frontend record type or persistence behavior changes:

1. Update `APPLICATION_RECORD_TYPES`.
2. Add a versioned migration updating the database constraint and RLS.
3. Add runtime parsing for the payload.
4. Add the correct hydration/realtime route.
5. Test permitted and denied roles.
6. Update this document and `SECOND_BRAIN.md` if the architectural fact changed.
7. Apply migrations only with explicit authorization and a rollback/recovery plan.
