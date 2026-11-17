import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { blockGridPointerEvents } from '../dockEvents';

export function SignInDialog() {
  const auth = useAuth();
  const forced = !!auth.user?.mustChangePassword;
  const open = auth.loginOpen || forced;
  const [step, setStep] = useState<'login' | 'choose'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retained, setRetained] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forced) setStep('choose');
    else if (!auth.loginOpen) {
      setStep('login');
      setRetained(null);
      setError(null);
    }
  }, [forced, auth.loginOpen]);

  if (!open) return null;

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await auth.login(email.trim(), password);
      if (result.mustChangePassword) {
        setRetained(password);
        setStep('choose');
        setNext('');
        setConfirm('');
      } else {
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email or password is incorrect');
    } finally {
      setBusy(false);
    }
  };

  const submitNext = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const currentPassword = retained ?? current;
    if (!currentPassword) {
      setError('Enter your current password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(currentPassword, next);
      setPassword('');
      setRetained(null);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/50 p-4"
      data-grid-control
      data-testid="login-dialog"
      {...blockGridPointerEvents}
    >
      <form
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
        onSubmit={step === 'login' ? submitLogin : submitNext}
      >
        {step === 'login' ? (
          <>
            <h2 className="text-2xl font-black text-slate-900 mb-1">Log in to GridCity</h2>
            <p className="text-sm text-slate-500 mb-6">Use the email and password an admin gave you.</p>
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              data-testid="login-email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
            />
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              data-testid="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
            />
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black text-slate-900 mb-1" data-testid="choose-password-title">
              Choose a new password
            </h2>
            <p className="text-sm text-slate-500 mb-6">At least 8 characters, and not the same as your email.</p>
            {retained == null && (
              <>
                <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="forced-current">Current password</label>
                <input
                  id="forced-current"
                  data-testid="forced-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </>
            )}
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              data-testid="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
            />
            <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              data-testid="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
            />
          </>
        )}
        {error && (
          <p data-testid="login-error" className="mb-4 text-sm text-red-600">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            data-testid={step === 'login' ? 'login-submit' : 'new-password-submit'}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {step === 'login' ? 'Log in' : 'Save password'}
          </button>
          {step === 'login' ? (
            <button
              type="button"
              onClick={auth.closeLogin}
              className="px-4 py-3 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void auth.logout()}
              className="px-4 py-3 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
            >
              Log out
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function ChangePasswordDialog() {
  const auth = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!auth.passwordOpen || auth.user?.mustChangePassword) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      auth.pushToast('Password changed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/50 p-4"
      data-grid-control
      data-testid="change-password-dialog"
      {...blockGridPointerEvents}
    >
      <form className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8" onSubmit={submit}>
        <h2 className="text-2xl font-black text-slate-900 mb-6">Change password</h2>
        <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="change-current">Current password</label>
        <input
          id="change-current"
          data-testid="change-password-current"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
        />
        <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="change-new">New password</label>
        <input
          id="change-new"
          data-testid="change-password-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
        />
        <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="change-confirm">Confirm password</label>
        <input
          id="change-confirm"
          data-testid="change-password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full mb-4 px-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            data-testid="change-password-submit"
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            Save password
          </button>
          <button
            type="button"
            onClick={auth.closePassword}
            className="px-4 py-3 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function AuthDialogs() {
  const auth = useAuth();
  return (
    <>
      <SignInDialog />
      <ChangePasswordDialog />
      {auth.versionMismatch && (
        <div
          data-testid="version-toast"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[280] bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-3"
        >
          GridCity updated — reload
          <button type="button" className="underline" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[270] flex flex-col gap-2 pointer-events-none">
        {auth.toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid="app-toast"
            className="bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg"
          >
            {toast.text}
          </div>
        ))}
      </div>
    </>
  );
}
