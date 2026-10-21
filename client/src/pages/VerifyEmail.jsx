import React, { useEffect, useState } from 'react';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const { verifyEmail, openAuth } = useAuth();
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const confirmVerification = async (event) => {
    event.preventDefault();
    if (!token || status === 'loading') return;

    setStatus('loading');
    setError('');
    try {
      await verifyEmail(token);
      setToken('');
      setStatus('success');
    } catch (verificationError) {
      if (!verificationError.status || verificationError.status >= 500) {
        setStatus('ready');
        setError('We could not reach the verification service. Check your connection and try again.');
      } else {
        setToken('');
        setStatus('invalid');
        setError('This verification link is invalid or has expired.');
      }
    }
  };

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        {status === 'success' ? (
          <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-emerald-600" aria-hidden="true" />
        ) : (
          <MailCheck className="mx-auto mb-5 h-12 w-12 text-emerald-600" aria-hidden="true" />
        )}
        <h1 className="text-2xl font-bold text-slate-900">
          {status === 'success' ? 'Email verified' : status === 'invalid' ? 'Link unavailable' : 'Confirm your email'}
        </h1>
        <p className="mt-3 text-slate-600" role="status" aria-live="polite">
          {status === 'success'
            ? 'Your InerTayo account is active. Sign in to continue.'
            : status === 'invalid'
              ? error
              : 'Select the button below to activate your InerTayo account. This confirmation step helps prevent automatic email scanners from using your link.'}
        </p>
        {status === 'ready' && error && <p className="mt-4 text-sm text-rose-700" role="alert">{error}</p>}
        {status === 'ready' && (
          token ? (
            <form onSubmit={confirmVerification}>
              <button
                type="submit"
                disabled={status === 'loading'}
                className="mt-7 rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                Verify My Email
              </button>
            </form>
          ) : (
            <p className="mt-6 text-sm text-rose-700" role="alert">This verification link is invalid or has expired.</p>
          )
        )}
        {status === 'loading' && <p className="mt-7 text-sm text-slate-600" role="status">Verifying your email…</p>}
        {(status === 'success' || status === 'invalid') && (
          <button
            type="button"
            onClick={() => openAuth('login')}
            className="mt-7 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-700"
          >
            Sign in
          </button>
        )}
      </div>
    </section>
  );
}
