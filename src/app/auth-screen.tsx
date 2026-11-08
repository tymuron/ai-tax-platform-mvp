'use client';

import React, { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';

export default function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(mode === 'login' ? 'Signing in…' : 'Creating your account…');
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email, password } : { email, password, fullName }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error || 'Something went wrong');
      else onSignedIn();
    } catch {
      setError('Network error');
    } finally {
      setBusy(null);
    }
  }

  async function startDemo() {
    setError(null);
    setBusy('Preparing a private demo with sample data…');
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const json = await res.json();
      if (!json.ok) setError(json.error || 'Could not start the demo');
      else onSignedIn();
    } catch {
      setError('Network error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-sky-700 flex items-center justify-center text-white font-bold text-lg">
            AT
          </div>
          <h1 className="text-2xl font-bold text-slate-900">AI Tax</h1>
          <p className="text-sm text-slate-600">
            AI-powered tax analysis for US individuals and sole proprietors: potential deductions and an
            estimated federal tax impact, with every number traced to its source.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex bg-slate-100 rounded-lg p-1 text-sm font-medium">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 py-1.5 rounded-md ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3 text-sm">
            {mode === 'signup' && (
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">Full name</span>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            )}
            <label className="block">
              <span className="block font-semibold text-slate-700 mb-1">Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block font-semibold text-slate-700 mb-1">Password</span>
              <input
                required
                type="password"
                minLength={mode === 'signup' ? 10 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              {mode === 'signup' && <span className="text-xs text-slate-500">At least 10 characters.</span>}
            </label>
            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2">{error}</div>}
            <button
              type="submit"
              disabled={Boolean(busy)}
              className="w-full rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold py-2.5 disabled:opacity-60"
            >
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="relative text-center text-xs text-slate-400">
            <span className="bg-white px-2 relative z-10">or</span>
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
          </div>

          <button
            type="button"
            onClick={startDemo}
            disabled={Boolean(busy)}
            className="w-full rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold py-2.5 disabled:opacity-60"
          >
            Try a demo with sample data
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            The demo creates a private account filled with made-up sample statements. Nothing you do there is shared.
          </p>

          {busy && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {busy}
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400" />
          AI Tax does not file returns, sign returns or represent you before the IRS. Results are estimates of
          potential deductions and estimated tax impact, not a guarantee of savings or a refund. You review and file
          your own return.
        </p>
      </div>
    </div>
  );
}
