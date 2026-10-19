# Normalized Supabase CSV import

Status: prepared, locally tested, and imported into the dedicated `supplier-management-staging` project on 2026-09-16. The reviewed local resolution file produces a zero-blocker plan. The remote migration, database lint, initial import, consolidated reconciliation, repeat import, and repeat reconciliation all passed. Counts remained unchanged on retry, with zero duplicate business keys and zero broken relationships. Authenticated staging sessions use the seeded `application_records` projection as their editable UI-facing store; the normalized tables remain the immutable import/audit layer. No production Supabase project was changed.

Reverified on 2026-09-18: all four repository file hashes and source-row counts matched staging byte-for-byte. Staging contained 1,140 companies, 1,251 branches, 6,957 document rows, 280 submissions, and 6,355 answers, with zero duplicate or broken relationships. Every imported company and answer identity was present in `application_records`, and the compared CSV response fields had zero mismatches. The application store also contained 86 later non-CSV response rows, which were preserved. Three provided documents had the UI-derived `Current` status where the source status was blank; their source values were otherwise unchanged.

## Scope

The process reads these files under `reference-materials/source-data/` without modifying them:

- `Master List Tracker_V4_SMS Copy.csv`
- `Microgenesis Supplier Evaluation Form.csv`
- `Microgenesis Courier Evaluation Form.csv`
- `Microgenesis Subcontractor Evaluation Form.csv`

The importer validates both the reviewed full-file SHA-256 checksum and the inspected header fingerprint of every file. Any source change stops the import until the changed file is inspected and the expected checksum is deliberately updated. The Master List header is found by the observed `#`, `BP Code`, and `BP Name` columns rather than by assuming row 1. Only rows after that header with a BP Name enter the business-data plan.

The CSVs were relocated from the repository root on 2026-10-19 with their bytes and filenames preserved. Run the commands below from the repository root as before. `--project-root` accepts either a repository containing `reference-materials/source-data/` or a directory containing the four CSVs directly; when the nested source folder exists, the importer uses that folder for all four files. Source names stored in import records remain the original filenames.

The additive migration is `supabase/migrations/202609150001_normalized_business_data.sql`. It does not alter the existing `suppliers` or `survey_responses` tables. All new tables have RLS enabled and grant no browser access yet.

## Local dry run

CSV checksums are calculated from canonical LF text. Git checkouts using CRLF therefore verify against the same reviewed client content without weakening validation of any other byte.

Run:

```powershell
npm run import:supabase -- --dry-run
```

Dry run is the default even when `--dry-run` is omitted. It prints source checksums, planned row counts, answer-status counts, warnings, and blocking errors. It does not initialize a Supabase client.

`--dry-run` and `--write` are mutually exclusive. Write mode requires both `--write` and `--confirm-write`; incomplete or contradictory mode flags are rejected before source planning or client initialization.

The importer refuses a write when any blocking issue exists. The initial dry run found two unresolved evaluation-company names; both now have reviewed local resolutions as distinct evaluation-only companies. Fuzzy suggestions are informational only and are never applied automatically. A resolution may link the source name to an existing Master List BP Code or preserve it as a distinct evaluation-only company without inventing a BP Code.

Create a local, uncommitted alias file from `scripts/supabase-import/company-aliases.example.json`. Each reviewed entry has this shape:

```json
{
  "surveyType": "Supplier",
  "sourceName": "exact observed evaluation company name",
  "resolution": "existing",
  "targetBpCode": "reviewed Master List BP Code",
  "reviewedBy": "reviewer identifier",
  "reviewedAt": "ISO timestamp"
}
```

For a reviewed company that is genuinely distinct but absent from the current Master List, omit `targetBpCode` and use:

```json
{
  "surveyType": "Supplier",
  "sourceName": "exact observed evaluation-only company name",
  "resolution": "distinct",
  "reviewedBy": "reviewer identifier",
  "reviewedAt": "ISO timestamp"
}
```

This creates one deterministic company record and points the reviewed evaluation name to it. It does not create a branch, invent a BP Code, or link the submissions to a similarly named Master List company.

`reviewedBy` and `reviewedAt` are required audit fields. `reviewedAt` must be an ISO timestamp with an explicit timezone, such as `2026-09-16T09:30:00+08:00` or `2026-09-16T01:30:00Z`.

Before approving an alias, compare the current Master List record with any retained historical partner record by legal name, address, and tax identity. Never infer that a historical BP Code still identifies the same company: if a code appears to have been reused, renamed, or consolidated, stop and obtain a business-owner decision rather than linking evaluation history to the current holder automatically.

Run the dry run again with:

```powershell
npm run import:supabase -- --dry-run --aliases C:\absolute\path\company-aliases.json
```

Do not commit the populated alias file because it contains business data.

## Apply later, after approval

Prerequisites:

1. Run the read-only `supabase/verification/preflight_schema_audit.sql` in the target SQL Editor and save its results for review. Stop if any proposed target table already exists until its schema and records are reconciled.
2. Back up or snapshot the target Supabase project.
3. Review and apply the additive migration in a disposable/staging project first.
4. Resolve every dry-run error through inspected data or a reviewed alias.
5. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the local shell or an approved secret manager. Never use a `VITE_` variable for the service-role key and never commit it.
6. Obtain explicit approval to alter the target database.

The live command deliberately requires two flags:

```powershell
npm run import:supabase -- --write --confirm-write --aliases C:\absolute\path\company-aliases.json
```

For the dedicated staging project linked by this repository, the equivalent staging-locked shortcut is:

```powershell
npm run import:staging
```

The shortcut pins the destination to project `adxwaxhnqxpmgjvsxgug` and refuses a conflicting `SUPABASE_URL`. It still requires `SUPABASE_SERVICE_ROLE_KEY` to be set in the current shell and does not contain or persist that secret.

For an operator already authenticated and linked through Supabase CLI, the importer can instead generate a temporary transaction-wrapped SQL file and execute it without a database API key:

```powershell
npm run generate:staging-import-sql
npx supabase db query --linked --file supabase/.temp/normalized-staging-import.sql
npx supabase db query --linked --file supabase/verification/normalized_import_reconciliation.sql
```

Delete `supabase/.temp/normalized-staging-import.sql` immediately after reconciliation because it contains confidential business data. The `.temp` directory is ignored by Git.

The writer performs dependency-ordered UPSERT operations by deterministic UUID. It never issues `DELETE`, `TRUNCATE`, or `DROP`. A partial network failure can be retried because repeating the same source and alias inputs produces the same logical IDs and rows.

Afterward, run the read-only queries in `supabase/verification/normalized_import_checks.sql`. Run the same import again and repeat those checks; business-table counts and duplicate queries must remain unchanged.

## Current limitations

- The imported normalized tables are not edited by the browser. Authenticated application reads and writes use the RLS-protected `application_records` projection, with local storage retained as an authenticated startup cache and for device-specific state.
- Re-running the normalized CSV importer updates the audit tables but does not overwrite later UI edits in `application_records`. A changed source file therefore requires an explicit, reviewed projection reconciliation rather than a blind reseed.
- Supabase password authentication is the active staging identity boundary. Microsoft Entra integration remains unavailable until tenant access is provided.
- UPSERT batches are individually retryable but are not one cross-table PostgreSQL transaction through PostgREST. Apply to staging first and retain a pre-import backup for rollback.
