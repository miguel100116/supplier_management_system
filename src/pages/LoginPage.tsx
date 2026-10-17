import { type FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { isMsalConfigured, loginWithMicrosoft } from '../services/msalAuth';
import { isSupabaseConfigured } from '../services/supabaseClient';
import {
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
  requestSupabasePasswordReset,
} from '../services/supabasePasswordAuth';
import { PasswordInput } from '../components/PasswordInput';

// Passed up to App so it can establish the Supabase session (RLS) from the
// Microsoft ID token. `auth` is optional only so non-Microsoft/dev callers
// still type-check; the real sign-in path always provides it.
export interface MicrosoftAuth {
  idToken: string;
  nonce: string;
}

interface LoginPageProps {
  onLogin: (email: string, auth?: MicrosoftAuth) => Promise<void>;
}

// Ambient dot texture for the hero panel — kept extremely faint (2–5% via the
// text-white/[x] utility on the parent) so it reads as depth, not pattern.
function DotGrid({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={id} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Oversized concentric rings echoing the orbital swoosh in the Microgenesis
// mark — bled off the panel edge and kept near-invisible, so it only adds a
// sense of scale/depth behind the hero content, never a focal point.
function OrbitalRings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="480" cy="120" r="260" stroke="currentColor" strokeWidth="1" />
      <circle cx="480" cy="120" r="195" stroke="currentColor" strokeWidth="1" transform="rotate(-16 480 120)" />
      <ellipse cx="480" cy="120" rx="260" ry="150" stroke="currentColor" strokeWidth="1" transform="rotate(22 480 120)" />
    </svg>
  );
}

// Minimal line-art scene standing in for the product: an analytics dashboard
// (bars + trend), a KPI gauge, and a small supplier network with one
// checkmark node for surveys. No text/numbers — purely pictogram-level, so it
// reads as texture rather than a mock dashboard.
function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 460 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M55 55 L160 60" stroke="#8fb9dd" strokeOpacity="0.25" strokeWidth="1" />
      <path d="M45 145 L160 130" stroke="#8fb9dd" strokeOpacity="0.25" strokeWidth="1" />
      <path d="M405 135 L340 110" stroke="#8fb9dd" strokeOpacity="0.25" strokeWidth="1" />
      <path d="M245 182 L245 150" stroke="#8fb9dd" strokeOpacity="0.25" strokeWidth="1" />

      <rect x="160" y="35" width="180" height="115" rx="12" fill="#ffffff" fillOpacity="0.03" stroke="#8fc0ea" strokeOpacity="0.3" strokeWidth="1.2" />
      <line x1="178" y1="56" x2="226" y2="56" stroke="#8fc0ea" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />

      <rect x="178" y="100" width="13" height="28" rx="2" fill="#6fa8dd" fillOpacity="0.45" />
      <rect x="200" y="86" width="13" height="42" rx="2" fill="#6fa8dd" fillOpacity="0.6" />
      <rect x="222" y="106" width="13" height="22" rx="2" fill="#6fa8dd" fillOpacity="0.35" />
      <rect x="244" y="76" width="13" height="52" rx="2" fill="#8fc0ea" fillOpacity="0.85" />

      <polyline
        points="178,70 200,64 222,68 244,52 262,46"
        fill="none"
        stroke="#bcdcf7"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="262" cy="46" r="2.5" fill="#bcdcf7" fillOpacity="0.9" />

      <circle cx="350" cy="45" r="18" fill="#0a1730" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="2" />
      <circle
        cx="350"
        cy="45"
        r="18"
        stroke="#6fa8dd"
        strokeOpacity="0.85"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="79 200"
        transform="rotate(-90 350 45)"
      />

      <circle cx="55" cy="55" r="7" stroke="#6fa8dd" strokeOpacity="0.5" strokeWidth="1.2" />
      <circle cx="55" cy="55" r="3" fill="#6fa8dd" fillOpacity="0.8" />

      <circle cx="45" cy="145" r="7" stroke="#6fa8dd" strokeOpacity="0.5" strokeWidth="1.2" />
      <circle cx="45" cy="145" r="3" fill="#6fa8dd" fillOpacity="0.8" />

      <circle cx="405" cy="135" r="7" stroke="#6fa8dd" strokeOpacity="0.5" strokeWidth="1.2" />
      <circle cx="405" cy="135" r="3" fill="#6fa8dd" fillOpacity="0.8" />

      <circle cx="245" cy="182" r="11" fill="#0a1730" stroke="#8fc0ea" strokeOpacity="0.5" strokeWidth="1.3" />
      <path
        d="M239 182 L243 186 L251 177"
        stroke="#bcdcf7"
        strokeOpacity="0.9"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const msalReady = isMsalConfigured();
  const [isMsSigningIn, setIsMsSigningIn] = useState(false);
  const [msError, setMsError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  async function handleMicrosoftSignIn() {
    setMsError('');
    setIsMsSigningIn(true);
    try {
      const result = await loginWithMicrosoft();
      const normalized = result.email.trim().toLowerCase();
      if (!normalized.endsWith('@mgenesis.com')) {
        setMsError('Access is restricted to verified @mgenesis.com accounts.');
        return;
      }
      await onLogin(normalized, { idToken: result.idToken, nonce: result.nonce });
    } catch (err) {
      setMsError(err instanceof Error ? err.message : 'Microsoft sign-in failed. Please try again.');
    } finally {
      setIsMsSigningIn(false);
    }
  }

  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    setIsPasswordSubmitting(true);
    try {
      const authenticatedEmail = await signInWithSupabasePassword(email, password);
      await onLogin(authenticatedEmail);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setIsPasswordSubmitting(false);
    }
  }

  async function handleCreateAccount() {
    setPasswordError('');
    setPasswordMessage('');
    setIsPasswordSubmitting(true);
    try {
      const result = await signUpWithSupabasePassword(email, password);
      if (result.signedIn) {
        await onLogin(result.email);
      } else {
        setPasswordMessage('Check your work email, confirm the account, then return here to sign in.');
      }
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to create the account.');
    } finally {
      setIsPasswordSubmitting(false);
    }
  }

  async function handlePasswordResetRequest() {
    setPasswordError('');
    setPasswordMessage('');
    setIsPasswordSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await requestSupabasePasswordReset(email, redirectTo);
      setPasswordMessage('If that work account exists, a password reset link has been sent.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to request a password reset.');
    } finally {
      setIsPasswordSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-white">
      {/* Mobile hero — compact brand band, distinct from the desktop split layout */}
      <div className="relative overflow-hidden bg-[linear-gradient(160deg,#060c18_0%,#0a1f38_45%,#123a5e_100%)] px-6 pb-16 pt-12 text-white md:hidden">
        <DotGrid id="dots-mobile" className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.035]" />
        <OrbitalRings className="pointer-events-none absolute -right-32 -top-40 h-[420px] w-[420px] text-white/[0.07]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_0%,rgba(94,169,230,0.18),transparent_65%)]" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src="/microgenesis_logo.png" alt="Microgenesis" className="h-11 object-contain brightness-0 invert" />

          <div className="mt-8 flex max-w-xs items-center gap-3 text-left">
            <img src="/smpesa_icon.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
            <h1 className="min-w-0 text-xl font-medium leading-snug tracking-tight text-white">
              Supplier Management Performance Evaluation Analytics
            </h1>
          </div>
          <p className="mt-4 max-w-xs text-xs font-light leading-relaxed text-[#93aec9]">
            Evaluations, scoring, and reporting for every Microgenesis supplier — in one place.
          </p>
        </div>
      </div>

      <div className="md:flex md:min-h-screen">
        {/* Desktop / tablet brand panel — 2/3 width, marketing-style */}
        <div className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#060c18_0%,#0a1f38_45%,#123a5e_100%)] px-10 py-12 text-white md:flex md:flex-1 md:flex-col lg:px-16">
          <DotGrid id="dots-desktop" className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.035]" />
          <OrbitalRings className="pointer-events-none absolute -right-24 -top-32 h-[560px] w-[560px] text-white/[0.07]" />
          <HeroIllustration className="pointer-events-none absolute -right-16 bottom-0 h-auto w-[620px] max-w-none opacity-[0.14]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_85%_0%,rgba(94,169,230,0.16),transparent_60%)]" />

          <div className="relative z-10 mb-12 flex items-center lg:mb-16">
            <img
              src="/microgenesis_logo.png"
              alt="Microgenesis"
              className="h-12 object-contain brightness-0 invert lg:h-14"
            />
          </div>

          <div className="relative z-10 flex flex-1 flex-col justify-center pb-16 lg:pb-20">
            <div className="max-w-xl lg:max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <div className="flex items-center gap-5">
                  <img src="/smpesa_icon.png" alt="" className="h-16 w-16 shrink-0 object-contain lg:h-20 lg:w-20" />
                  <h2 className="min-w-0 text-4xl font-medium leading-snug tracking-tight text-white lg:text-5xl">
                    Supplier Management Performance Evaluation Analytics
                  </h2>
                </div>
              </motion.div>

              <p className="mt-6 text-base font-light leading-relaxed text-[#93aec9] lg:text-lg">
                Centralizing stakeholder evaluations, scoring, and reporting for every Microgenesis supplier and
                subcontractor — in one dashboard.
              </p>
            </div>
          </div>

          <div className="relative z-10 text-[10px] font-light uppercase tracking-wider text-[#7590ae]">
            © {new Date().getFullYear()} Microgenesis. All rights reserved.
          </div>
        </div>

        {/* Sign-in panel */}
        <div className="relative z-10 -mt-8 flex flex-col justify-center rounded-t-3xl bg-white px-6 py-10 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] sm:px-10 md:mt-0 md:w-[380px] md:shrink-0 md:rounded-none md:px-10 md:py-12 md:shadow-none lg:w-1/3 lg:min-w-[380px] lg:px-14">
          <div className="mx-auto w-full max-w-sm">
            <img
              src="/microgenesis_logo.png"
              alt="Microgenesis"
              className="mb-8 h-8 object-contain object-left md:mb-10 md:h-9"
            />

            <div className="mb-7">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#0866B1]">SMPESA</p>
              <h1 className="mt-1.5 text-2xl font-medium text-slate-900">Welcome back</h1>
              <p className="mt-1.5 text-sm font-light text-slate-500">
                {isSupabaseConfigured
                  ? 'Sign in with your verified Microgenesis work email.'
                  : 'Sign in with your Microgenesis Microsoft account to continue.'}
              </p>
            </div>

            {(msError || passwordError) && (
              <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose">
                {msError || passwordError}
              </p>
            )}

            {passwordMessage && (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {passwordMessage}
              </p>
            )}

            {isSupabaseConfigured && (
              <form onSubmit={handlePasswordSignIn} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Partner email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    placeholder="name@mgenesis.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0866B1] focus:ring-2 focus:ring-[#0866B1]/15"
                  />
                </label>
                <div>
                  <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-slate-600">
                    Password
                  </label>
                  <PasswordInput
                    id="login-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0866B1] focus:ring-2 focus:ring-[#0866B1]/15"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPasswordSubmitting}
                  className="w-full rounded-lg bg-[#0866B1] py-2.5 text-sm font-semibold text-white transition hover:bg-[#07528E] disabled:opacity-70"
                >
                  {isPasswordSubmitting ? 'Please wait…' : 'Sign in'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateAccount}
                  disabled={isPasswordSubmitting || !email || password.length < 8}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Create staging account
                </button>
                <button
                  type="button"
                  onClick={handlePasswordResetRequest}
                  disabled={isPasswordSubmitting || !email}
                  className="w-full py-1.5 text-sm font-medium text-[#0866B1] transition hover:text-[#004f86] disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </form>
            )}

            {msalReady ? (
              <div className={isSupabaseConfigured ? 'mt-6 border-t border-slate-200 pt-6' : ''}>
              <button
                type="button"
                onClick={handleMicrosoftSignIn}
                disabled={isMsSigningIn}
                className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-70"
              >
                <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                {isMsSigningIn ? 'Signing in…' : 'Sign in with Microsoft'}
              </button>
              </div>
            ) : (
              !isSupabaseConfigured && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
                Authentication is not configured. Set the Supabase authentication variables or{' '}
                <span className="font-semibold">VITE_AZURE_CLIENT_ID</span> and{' '}
                <span className="font-semibold">VITE_AZURE_TENANT_ID</span> for Microsoft sign-in.
              </p>
            )}

            <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
              Access restricted to verified <span className="font-semibold text-slate-500">@mgenesis.com</span>{' '}
              accounts.
              <br />© {new Date().getFullYear()} Microgenesis. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
