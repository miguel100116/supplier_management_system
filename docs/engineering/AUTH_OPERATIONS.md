# Authentication and account operations

Status: repository procedure as of 2026-09-24. Hosted configuration and production-provider approval remain environment-owner responsibilities.

## Supported repository behavior

- Password authentication accepts only normalized, confirmed `@mgenesis.com` identities.
- Password reset sends Supabase's recovery email and handles the recovery callback in the application before accepting a new password.
- Passwords must be at least eight characters in the client; hosted password policy remains authoritative.
- Microsoft sign-in is never considered complete unless the Microsoft ID token is successfully exchanged for a Supabase session. When Microsoft public configuration is absent, the option remains disabled.
- Logout clears the application identity and signs out the active Supabase and Microsoft providers. A 30-minute inactivity boundary is synchronized across browser tabs.
- Database RLS and the confirmed profile are the authorization boundary; navigation visibility is not authorization.
- Explicit login checks the selected account type against the existing persisted role. A matching verified, confirmed company email may use a legacy Employee profile with `user_id = null`, consistent with the nullable schema and email-based profile RLS. A non-null ID must match the authenticated identity; Admin profiles always require that match. Missing/malformed profiles and failed lookups remain blocked. Login never creates profiles, assigns roles, or repairs remote links.

## Account lifecycle

1. **Provision:** with the Express account endpoint configured, a signed-in Admin opens **Account Management → Add Account**, enters the verified employee's `@mgenesis.com` address and least-privilege access profile, and copies the initial password before saving. The form generates a new 20-character password using browser cryptographic randomness and also accepts a custom password of at least 16 characters, limited to 72 UTF-8 bytes. Reveal, copy, and regeneration controls are available. Editing an existing account changes access only; it does not reset that account's password. Existing profiles/logins are rejected without changing their credentials.
2. **Confirm:** the server verifies the caller through Supabase Auth and requires the current `app_profiles` row to have role `Admin` and the same authenticated user ID. It creates an unconfirmed login, updates the trigger-created profile, and then confirms the login. The Admin is responsible for verifying the employee's email before creation; this flow does not send a verification or invitation email. Other provider/self-service workflows retain their email confirmation requirement. Unconfirmed or non-company identities must not receive database access.
3. **Promote or change access:** an Admin changes the profile through the application. Review the requested access and keep Archive Center Admin-only. Database policies remain decisive even if stale UI state exists.
4. **Suspend:** disable or revoke the provider account/session first, then remove or reduce the profile permissions. Verify with a fresh session; hiding the account in the UI is insufficient.
5. **Recover password:** use **Forgot password** on the sign-in page. The hosted redirect allowlist must contain the deployed application recovery URL. After a successful update, the application signs the user out and requires a fresh sign-in.
6. **Emergency Admin recovery:** two authorized operators verify the incident and environment, restore access through the hosted identity console, and then create or repair the least-privilege Admin profile. Record the action outside the application according to the incident process. Never add a browser passcode, hard-coded account, service-role key, or temporary anonymous database policy.

## Admin account endpoint setup and recovery

Configure `SUPABASE_SECRET_KEY` and `SUPABASE_URL` (or `VITE_SUPABASE_URL`) for the same project used by the browser. For local runs, add the server key to ignored `.env.local`, then restart `npm run dev`; Express loads `.env`, `.env.local`, and the appropriate development/production mode files before registering the account endpoint. Shell/hosting environment values take precedence. `SUPABASE_SERVICE_ROLE_KEY` is also accepted for compatibility with the import CLI. Obtain the existing secret or legacy service-role key from the intended project's **Settings → API Keys**; the public/publishable key cannot provision logins. Secrets must never have a `VITE_` prefix, be returned by `/api/config`, or be included in the frontend build. See `.env.example` for names. Run the Express host with `npm run dev` or the built `npm start`; a static host or Vite preview alone cannot provision logins.

The endpoint validates email, profile enums, permission arrays, and password length before writing. It returns only the profile, uses `Cache-Control: no-store`, and does not log passwords, request bodies, or provider exception contents. Passwords stay in the form's transient state and are cleared on success/cancel; copying occurs only when the Admin selects **Copy Password**. Share the copied credential through the approved private channel.

Auth and profile updates span separate Supabase requests. On a known profile-save or activation failure, the endpoint deletes only the newly created Auth user and its now-unlinked profile. If cleanup fails, the UI reports incomplete creation and requires identity-administrator reconciliation. A process crash or lost response can also leave an incomplete operation; inspect the target email in Auth and `app_profiles` before retrying. Do not reset an existing user's password to recover this workflow. Removing the server secret disables new provisioning; it does not change existing accounts.

Automated tests use a mocked Supabase provider and a local HTTP server. Live provisioning, employee sign-in, and hosted password policy still require an authorized staging check; production has not been verified.

## Required environment checks before production

- Approve one production identity model and its owners.
- Configure and test the exact recovery redirect URLs.
- Enable hosted leaked-password protection when the plan supports it, or formally approve a time-bounded compensating control.
- Test confirmation, suspension, recovery, revoked sessions, disabled accounts, multi-tab logout, and emergency recovery in staging.
- Inspect production independently; do not copy staging conclusions.
