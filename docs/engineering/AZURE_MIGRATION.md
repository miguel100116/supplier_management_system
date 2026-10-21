# Azure migration preparation

Status: proposal, 2026-10-20. No Azure resources, authentication configuration, or business data have been changed by this preparation.

## Requested outcome

- Replace the live system's Supabase database and hosting with Azure.
- Use the owner's personal Azure subscription, with free services only.
- Microsoft SSO permits company `@mgenesis.com` users only; the subscription owner's personal identity does not automatically gain application access.

## Proposed deployment

Use an Azure App Service F1 host for the existing React/Express application and the Azure SQL Database free offer for persistence, subject to subscription eligibility, region availability, and workload fit. Azure SQL is SQL Server, not PostgreSQL: existing Supabase migrations cannot be applied to it unchanged.

The SQL free offer includes 100,000 vCore seconds, 32 GB data, and 32 GB backup storage per month. Keep the option to pause at the free limit; do not opt into paid overages. App Service F1 has a daily CPU quota. Free-only deployment can therefore become unavailable when quotas are exhausted; suitability for the live workload remains unverified. Do not provision additional paid monitoring, storage, networking, or compute services. Confirm pricing and subscription eligibility immediately before creation.

References checked 2026-10-20: [Azure SQL free offer](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql), [App Service pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/windows/).

## Verified implementation boundaries

| Boundary | Current implementation | Migration requirement |
| --- | --- | --- |
| Identity | `src/services/msalAuth.ts`, `src/services/authBridge.ts`, `src/services/supabasePasswordAuth.ts`, `src/App.tsx` | Reuse MSAL; replace the Supabase token exchange/session dependency with authenticated server API access. |
| Shared data | `src/services/applicationRepository.ts`, `src/services/normalizedPartnerCompanies.ts` | Preserve repository contracts, payload validation, pagination, ownership, and transaction semantics behind the Express API. |
| Authorization | Versioned policies in `supabase/migrations/`, especially consolidated RLS and delegated renewal | Port every applicable read/write rule; enforce permissions in the API/database, including response scope, user-owned history, imports, and document renewal. |
| Accounts | `server/createAccount.ts`, `src/features/account-management/`, `docs/engineering/AUTH_OPERATIONS.md` | Entra owns credentials; application Admins manage authorized company profiles. Existing Supabase password provisioning/recovery must not remain active against the old backend after cutover. |
| File archives | `src/features/evaluation-imports/services/evaluationImportArchiveService.ts`, private Supabase Storage bucket | Inventory and preserve source-file bytes and download/delete permissions. Select storage within the confirmed free allowance before implementation; metadata alone is insufficient. |
| Realtime and per-user state | Repository subscriptions, notification state, report export history | Replace Supabase subscriptions deliberately and preserve cross-session synchronization without keeping both backends writable. |
| Hosting/config | `server.ts`, `server/environment.ts`, `.env.example`, `src/main.tsx`, `.github/workflows/verify.yml` | Keep secrets server-side; preserve runtime config, SPA callbacks, health checks, and the existing verification gates. |
| Imports/operations | `scripts/supabase-import/`, versioned SQL and operational runbooks | Keep legacy tools explicitly scoped to Supabase; prepare a separate validated one-time transfer for the Azure target. |

## SSO and permission contract

Register the application in an accessible Entra tenant. If company users are in another tenant, configure the appropriate organizational multitenant flow and obtain any company consent required by their policy. Discover and explicitly allow the company's tenant ID; do not accept arbitrary tenants merely because the application is multitenant. See [Microsoft's tenant and consent guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-convert-app-to-be-multi-tenant).

Validate API access-token signatures, issuer, audience, expiry, tenant, and delegated scope at the server. Graph access tokens and browser-cached accounts are not API authorization. Bind users to verified tenant/object IDs and authorized profiles; migrate legacy email/owner relationships through a reviewed mapping. Missing, inactive, or unapproved profiles must fail closed. Preserve role, designation, department, permission overrides, and delegated renewal rules. Test rejected personal accounts and rejected company users without approved access. Request only the scopes needed for sign-in/API access; preserve Graph mail functionality through its own consent flow.

## Transfer and cutover acceptance

1. Establish read-only access to the actual live source and identify its host/project. Repository staging evidence is not proof of live state.
2. Inventory records, normalized audit tables, files, identities, dependencies, total size, and representative usage without exporting confidential data into Git or logs.
3. Prepare versioned Azure schema, protected APIs, identity mapping, file transfer, deployment configuration, and recovery instructions. Keep the current system working while preparing the replacement.
4. Rehearse migration against a disposable target. Preserve stable record identifiers, timestamps, provenance, attachments, ownership, and historical data; compare counts, relationships, and content hashes.
5. Run `npm test`, `npm run lint` (TypeScript checks), and `npm run build`. Add meaningful API/authentication/migration tests and exercise live SSO, forbidden operations, account lifecycle, surveys, documents, imports, archives, reporting, and synchronization.
6. Validate free-tier eligibility and quota behavior in the actual account. Final resource settings, source/target identities, deployment URL, downtime, data reconciliation, and rollback must be reviewable before cutover.
7. Freeze source writes for final transfer, retain a recoverable backup, reconcile the destination, then switch the application. Do not leave Supabase and Azure as competing writable sources.

## Rollback

Retain the previous application artifact/configuration and the intact source until Azure acceptance. Before Azure accepts new writes, rollback can restore the old application and source. After Azure accepts writes, freeze writes and reconcile those changes back before switching; changing the URL alone would lose data. Never delete the source as part of initial cutover.

## Outstanding prerequisites

Authenticated access to the owner's subscription, confirmed free-offer eligibility and region, Entra registration permissions, company tenant ID and consent policy, actual live source access, archive storage fit, and live workload/quota fit remain unverified. No production cutover is ready yet.
