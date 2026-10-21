// Bridges a Microsoft (Entra ID) sign-in into a real Supabase Auth session.
//
// Why this exists: the app authenticates the user with MSAL in the browser,
// but the *data* lives in Supabase, where Row Level Security is the real
// access-control boundary. RLS can only enforce anything if Supabase knows
// who the caller is - i.e. if there is a Supabase session whose JWT carries
// the user's email. This module exchanges the Microsoft ID token for exactly
// that session.
//
// PREREQUISITE (one-time, in the Supabase dashboard):
//   Authentication > Providers > Azure  -> enable it, and add the Entra app's
//   Application (client) ID to the provider's allowed audiences. Without that,
//   signInWithIdToken below returns an "provider not enabled"/audience error
//   and Microsoft sign-in is blocked because an MSAL-only identity cannot be
//   authorized by Postgres RLS. See supabase/seed_admins.sql for role setup.

import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { PersistedProfile } from '../features/account-management/domain/accountProfile';

export type LoginRole = PersistedProfile['role'];
export interface MicrosoftAuth {
  idToken: string;
  nonce: string;
}
export interface LoginIdentity {
  email: string;
  auth?: MicrosoftAuth;
}
export type LoginAttempt = () => Promise<LoginIdentity | null>;

export async function signInForRole(role: LoginRole, authenticate: LoginAttempt): Promise<string | null> {
  try {
    const identity = await authenticate();
    if (!identity) return null;
    if (identity.auth) {
      const result = await signIntoSupabaseWithMicrosoft(identity.auth.idToken, identity.auth.nonce);
      if (!result.ok) throw new Error(result.error || 'Unable to establish the required Supabase session.');
    }
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();
    if (error || !user?.email_confirmed_at || !email?.endsWith('@mgenesis.com')
      || email !== identity.email.trim().toLowerCase()) {
      throw new Error('Unable to verify this account. Please sign in again.');
    }
    const profile = await supabase.from('app_profiles').select('email,user_id,role').eq('email', email).maybeSingle();
    // Legacy Employee profiles may have a null link: the schema permits it,
    // and profile RLS identifies the owner by the verified JWT email. Never
    // infer a role, accept a conflicting link, or use this exception for Admins.
    const legacyEmployee = profile.data?.role === 'Employee' && profile.data.user_id === null;
    if (profile.error || !profile.data || profile.data.email !== email || (!legacyEmployee && profile.data.user_id !== user.id)
      || (profile.data.role !== 'Admin' && profile.data.role !== 'Employee')) {
      throw new Error('Unable to verify your account type. Please contact your administrator.');
    }
    if (profile.data.role !== role) {
      throw new Error(`This is an ${profile.data.role} account. Select ${profile.data.role} Account to sign in.`);
    }
    return email;
  } catch (error) {
    const result = await supabase.auth.signOut({ scope: 'local' });
    if (result.error) throw new Error('Sign-in was blocked, but the session could not be cleared. Please try again.');
    throw error;
  }
}

export interface SupabaseBridgeResult {
  ok: boolean;
  error?: string;
}

// Exchange the Microsoft ID token for a Supabase session. Callers must treat
// failure as a blocking authentication error because Postgres RLS cannot
// authorize an MSAL-only browser identity.
export async function signIntoSupabaseWithMicrosoft(
  idToken: string,
  nonce: string,
): Promise<SupabaseBridgeResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Supabase is not configured (VITE_SUPABASE_* missing).' };
  }
  try {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'azure',
      token: idToken,
      nonce,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown Supabase sign-in error.' };
  }
}

// True if there is a live Supabase session right now. supabase-js persists
// its own session, so this survives reloads without re-bridging.
export async function hasSupabaseSession(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // Signing out of the local app must succeed even if the network call fails.
  }
}
