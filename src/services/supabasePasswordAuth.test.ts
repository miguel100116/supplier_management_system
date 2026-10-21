import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { User } from '@supabase/supabase-js';
import { normalizeCompanyEmail, validateSupabasePassword } from './supabasePasswordAuth';
import { signInForRole } from './authBridge';
import { supabase } from './supabaseClient';

const email = 'person@mgenesis.com';
const user = { id: 'verified-user', email, email_confirmed_at: '2026-10-20T00:00:00Z' } as User;

function mockLogin(t: TestContext, profile: unknown) {
  const getUser = t.mock.method(supabase.auth, 'getUser', async () => ({ data: { user }, error: null }));
  const signOut = t.mock.method(supabase.auth, 'signOut', async () => ({ error: null }));
  const fetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method ?? 'GET', 'GET', 'Login must not create or modify authorization profiles');
    const url = new URL(String(input));
    assert.equal(url.pathname, '/rest/v1/app_profiles');
    assert.equal(url.searchParams.get('email'), `eq.${email}`);
    assert.equal(url.searchParams.get('select'), 'email,user_id,role');
    return new Response(JSON.stringify(profile ? [profile] : []), { status: 200 });
  });
  return { getUser, signOut, fetch };
}

for (const actualRole of ['Admin', 'Employee'] as const) {
  test(`${actualRole} signs in only through its matching account selection`, async (t) => {
    const { signOut, getUser } = mockLogin(t, { email, user_id: user.id, role: actualRole });
    assert.equal(await signInForRole(actualRole, async () => {
      assert.equal(getUser.mock.callCount(), 0);
      return { email };
    }), email);
    assert.equal(signOut.mock.callCount(), 0);
  });

  test(`${actualRole} is rejected and signed out when the other account type is selected`, async (t) => {
    const { signOut } = mockLogin(t, { email, user_id: user.id, role: actualRole });
    const selectedRole = actualRole === 'Admin' ? 'Employee' : 'Admin';
    await assert.rejects(signInForRole(selectedRole, async () => ({ email })), new RegExp(`Select ${actualRole} Account`));
    assert.deepEqual(signOut.mock.calls[0].arguments, [{ scope: 'local' }]);
  });
}

test('unverifiable profiles fail closed and clear the newly authenticated session', async (t) => {
  for (const profile of [null, { email, role: 'Owner', user_id: user.id },
    { email, role: 'Admin', user_id: 'other-user' }, { email: 'other@mgenesis.com', role: 'Admin', user_id: user.id }]) {
    await t.test(JSON.stringify(profile), async (t) => {
      const { signOut } = mockLogin(t, profile);
      await assert.rejects(signInForRole('Admin', async () => ({ email })), /Unable to verify your account type/);
      assert.equal(signOut.mock.callCount(), 1);
    });
  }
});

test('identity and profile lookup failures never complete login', async (t) => {
  for (const failure of ['identity', 'profile', 'unconfirmed', 'email-mismatch'] as const) {
    await t.test(failure, async (t) => {
      const { getUser, signOut, fetch } = mockLogin(t, { email, role: 'Employee', user_id: user.id });
      if (failure === 'identity') getUser.mock.mockImplementation(async () => { throw new Error('Identity unavailable'); });
      if (failure === 'profile') fetch.mock.mockImplementation(async () => new Response('{}', { status: 503 }));
      if (failure === 'unconfirmed') getUser.mock.mockImplementation(async () => ({ data: { user: { ...user, email_confirmed_at: undefined } }, error: null }));
      await assert.rejects(signInForRole('Employee', async () => ({ email: failure === 'email-mismatch' ? 'other@mgenesis.com' : email })));
      assert.equal(signOut.mock.callCount(), 1);
    });
  }
});

test('signup requiring email confirmation does not open the app or look up a role', async (t) => {
  const { getUser, signOut } = mockLogin(t, null);
  assert.equal(await signInForRole('Employee', async () => null), null);
  assert.equal(getUser.mock.callCount(), 0);
  assert.equal(signOut.mock.callCount(), 0);
});

test('credential errors and session-cleanup errors remain blocking', async (t) => {
  const { signOut } = mockLogin(t, null);
  const authenticate = async () => { throw new Error('Invalid credentials'); };
  await assert.rejects(signInForRole('Employee', authenticate), /Invalid credentials/);
  signOut.mock.mockImplementation(async () => { throw new Error('Sign out unavailable'); });
  await assert.rejects(signInForRole('Employee', authenticate), /Sign out unavailable/);
});

test('a confirmed Employee can sign in through an existing email-matched legacy profile with no user ID link', async (t) => {
  const { signOut } = mockLogin(t, { email, role: 'Employee', user_id: null });
  assert.equal(await signInForRole('Employee', async () => ({ email })), email);
  assert.equal(signOut.mock.callCount(), 0);
});

test('an unlinked legacy Employee cannot enter through Admin Account', async (t) => {
  const { signOut } = mockLogin(t, { email, role: 'Employee', user_id: null });
  await assert.rejects(signInForRole('Admin', async () => ({ email })), /Select Employee Account/);
  assert.equal(signOut.mock.callCount(), 1);
});

test('legacy compatibility never accepts an unlinked Admin, missing link field, or another user ID', async (t) => {
  for (const profile of [
    { email, role: 'Admin', user_id: null },
    { email, role: 'Employee' },
    { email, role: 'Employee', user_id: 'another-user' },
    { email: 'another@mgenesis.com', role: 'Employee', user_id: null },
  ]) {
    await t.test(JSON.stringify(profile), async (t) => {
      const { signOut } = mockLogin(t, profile);
      await assert.rejects(signInForRole('Employee', async () => ({ email })), /Unable to verify your account type/);
      assert.equal(signOut.mock.callCount(), 1);
    });
  }
});

test('password authentication accepts only normalized company email addresses', () => {
  assert.equal(normalizeCompanyEmail('  User.Name@MGENESIS.COM '), 'user.name@mgenesis.com');
  assert.throws(() => normalizeCompanyEmail('user@example.com'), /@mgenesis\.com/);
  assert.throws(() => normalizeCompanyEmail('attacker@mgenesis.com.example.org'), /@mgenesis\.com/);
});

test('password creation and recovery share the same minimum length validation', () => {
  assert.equal(validateSupabasePassword('eight888'), 'eight888');
  assert.throws(() => validateSupabasePassword('short'), /at least 8 characters/);
});
