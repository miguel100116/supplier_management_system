import { type FormEvent, useState } from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { updateSupabasePassword } from '../services/supabasePasswordAuth';

interface PasswordRecoveryPageProps {
  onComplete: () => Promise<void>;
}

export function PasswordRecoveryPage({ onComplete }: PasswordRecoveryPageProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setIsSaving(true);
    try {
      await updateSupabasePassword(password);
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the password.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="password-recovery-title">
        <img src="/microgenesis_logo.png" alt="Microgenesis" className="mb-8 h-9 object-contain" />
        <h1 id="password-recovery-title" className="text-2xl font-semibold text-slate-900">Set a new password</h1>
        <p className="mt-2 text-sm text-slate-500">Choose a password with at least eight characters for your verified work account.</p>

        {error && (
          <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-slate-600">
              New password
            </label>
            <PasswordInput
              id="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0866B1] focus:ring-2 focus:ring-[#0866B1]/15"
            />
          </div>
          <div>
            <label htmlFor="confirm-new-password" className="mb-1 block text-xs font-medium text-slate-600">
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0866B1] focus:ring-2 focus:ring-[#0866B1]/15"
            />
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-[#0866B1] py-2.5 text-sm font-semibold text-white transition hover:bg-[#07528E] disabled:opacity-70"
          >
            {isSaving ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      </section>
    </main>
  );
}
