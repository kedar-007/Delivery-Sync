import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { authApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface RegisterForm {
  tenantName: string;
  domain: string;
}

// ─── Feature list shown on the left panel ──────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Real-time RAG tracking',
    desc: 'Monitor project health with live Red / Amber / Green status across your entire portfolio.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Daily standups & EODs',
    desc: 'Capture team updates every morning and evening. See rollups instantly.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'RAID register',
    desc: 'Track Risks, Issues, Assumptions and Dependencies — all in one place.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Automated reports',
    desc: 'Generate weekly and monthly delivery reports with one click.',
  },
];

// ─── Logo ───────────────────────────────────────────────────────────────────────
const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const s = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const icon = size === 'sm' ? 14 : size === 'lg' ? 24 : 18;
  return (
    <div className={`${s} rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shrink-0`}>
      <svg width={icon} height={icon} fill="none" viewBox="0 0 24 24" stroke="white">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    </div>
  );
};

// ─── Left marketing panel ───────────────────────────────────────────────────────
const LeftPanel = () => (
  <div className="hidden lg:flex flex-col justify-between h-full px-10 py-12 bg-gradient-to-br from-slate-900 via-blue-950 to-violet-950 relative overflow-hidden">
    {/* Background decoration */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-blue-500/5 blur-2xl" />
    </div>

    {/* Brand */}
    <div className="flex items-center gap-3 relative">
      <Logo size="md" />
      <div>
        <h1 className="text-white font-bold text-lg leading-tight">Delivery Sync</h1>
        <p className="text-blue-400 text-xs">Delivery Intelligence Platform</p>
      </div>
    </div>

    {/* Hero text */}
    <div className="relative space-y-6">
      <div>
        <h2 className="text-4xl font-bold text-white leading-tight">
          Run delivery<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">with clarity.</span>
        </h2>
        <p className="text-blue-200/70 mt-4 text-sm leading-relaxed max-w-sm">
          The command centre for engineering and delivery teams. Track every project, blocker, milestone and standup — in one place.
        </p>
      </div>

      {/* Feature list */}
      <div className="space-y-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-blue-300 shrink-0 group-hover:bg-white/15 transition-colors">
              {f.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{f.title}</p>
              <p className="text-xs text-blue-300/60 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Footer */}
    <div className="relative flex items-center gap-4">
      <div className="flex -space-x-2">
        {['K', 'A', 'R', 'M'].map((l, i) => (
          <div key={i} className="w-7 h-7 rounded-full border-2 border-slate-900 bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white">
            {l}
          </div>
        ))}
      </div>
      <p className="text-xs text-blue-300/60">Trusted by delivery teams worldwide</p>
    </div>
  </div>
);

// ─── Spinner ────────────────────────────────────────────────────────────────────
const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ─── Right auth panel wrapper ───────────────────────────────────────────────────
const RightPanel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12 bg-white dark:bg-gray-900 min-h-screen lg:min-h-0">
    {/* Mobile logo */}
    <div className="flex items-center gap-3 mb-10 lg:hidden">
      <Logo size="sm" />
      <div>
        <h1 className="text-gray-900 dark:text-white font-bold text-base">Delivery Sync</h1>
        <p className="text-gray-400 text-xs">Delivery Intelligence Platform</p>
      </div>
    </div>
    {children}
  </div>
);

// ─── Sign-in panel ──────────────────────────────────────────────────────────────
const SignInPanel = ({ error, forcePromptLogin }: { error?: string | null; forcePromptLogin?: boolean }) => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSubmitting(true);
    sessionStorage.removeItem('ds_auth_redirect');
    sessionStorage.removeItem('ds_logged_out');
    const params = new URLSearchParams();
    if (email) params.set('login_hint', email);
    if (forcePromptLogin) params.set('prompt', 'login');
    const qs = params.toString() ? `?${params.toString()}` : '';
    window.location.href = `/__catalyst/auth/login${qs}`;
  };

  return (
    <RightPanel>
      <div className="max-w-sm w-full mx-auto">
        {forcePromptLogin && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            You've been signed out. Please sign in again.
          </div>
        )}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Enter your credentials to access your workspace.</p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              disabled
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-sm text-gray-400 placeholder-gray-300 cursor-not-allowed"
            />
            <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Credentials are verified securely via Zoho. You'll complete sign-in on the next screen.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 text-sm mt-2"
          >
            {submitting ? (
              <><Spinner className="h-4 w-4" /> Redirecting…</>
            ) : (
              <>
                Sign in
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          New to Delivery Sync?{' '}
          <span className="text-blue-600 dark:text-blue-400">Ask your admin to invite you.</span>
        </p>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
          <a
            href="/#/super-admin"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Platform admin console
          </a>
        </div>
      </div>
    </RightPanel>
  );
};

// ─── Loading panel ──────────────────────────────────────────────────────────────
const LoadingPanel = ({ message = 'Verifying your session…' }: { message?: string }) => (
  <RightPanel>
    <div className="max-w-sm w-full mx-auto text-center">
      <Spinner className="h-8 w-8 text-blue-500 mx-auto mb-4" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
    </div>
  </RightPanel>
);

// ─── Registration panel ─────────────────────────────────────────────────────────
const RegisterPanel = () => {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterForm>();
  const domainValue = watch('domain', '');

  const handleRegister = async (data: RegisterForm) => {
    try {
      setError('');
      await authApi.registerTenant(data);
      setSuccess('Workspace created! Redirecting…');
      await refetch();
      navigate(`/${data.domain}/dashboard`, { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <RightPanel>
      <div className="max-w-sm w-full mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-xs font-medium mb-4">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Signed in via Zoho
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create your workspace</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Set up your organisation to get started.</p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit(handleRegister)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Organisation name *</label>
            <input
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
              placeholder="Acme Corp"
              {...register('tenantName', { required: 'Required' })}
            />
            {errors.tenantName && <p className="mt-1 text-xs text-red-500">{errors.tenantName.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Workspace URL *</label>
            <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition overflow-hidden bg-white dark:bg-gray-800">
              <span className="px-3 py-2.5 bg-gray-50 dark:bg-gray-700 text-gray-400 text-xs border-r border-gray-200 dark:border-gray-700 shrink-0">
                app/
              </span>
              <input
                className="flex-1 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none bg-transparent"
                placeholder="acme-corp"
                {...register('domain', {
                  required: 'Required',
                  pattern: { value: /^[a-z0-9-]+$/, message: 'Lowercase letters, numbers, hyphens only' },
                })}
              />
            </div>
            {domainValue && !errors.domain && (
              <p className="mt-1 text-xs text-gray-400">Your URL: <span className="text-blue-500 font-medium">app/{domainValue}/dashboard</span></p>
            )}
            {errors.domain && <p className="mt-1 text-xs text-red-500">{errors.domain.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25 text-sm"
          >
            {isSubmitting ? <><Spinner className="h-4 w-4" />Creating workspace…</> : 'Create workspace & continue'}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500 text-center">
          You'll be set as Tenant Admin with full access.
        </p>
      </div>
    </RightPanel>
  );
};

// ─── Layout wrapper (split screen) ─────────────────────────────────────────────
const SplitLayout = ({ right }: { right: React.ReactNode }) => (
  <div className="min-h-screen grid lg:grid-cols-2">
    <LeftPanel />
    {right}
  </div>
);

// ─── Main LoginPage ─────────────────────────────────────────────────────────────
const LoginPage = () => {
  const { user, loading, error: authError, needsRegistration, isLoggedOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isLoggedOut && user) {
      if (user.role === 'SUPER_ADMIN') {
        navigate('/super-admin', { replace: true });
      } else if (user.tenantSlug) {
        navigate(`/${user.tenantSlug}/dashboard`, { replace: true });
      }
    }
  }, [user, loading, navigate, isLoggedOut]);

  if (loading) return <SplitLayout right={<LoadingPanel />} />;

  if (isLoggedOut) return <SplitLayout right={<SignInPanel error={authError} forcePromptLogin />} />;

  if (user?.tenantSlug) return <SplitLayout right={<LoadingPanel message="Redirecting to your workspace…" />} />;

  if (needsRegistration) return <SplitLayout right={<RegisterPanel />} />;

  return (
    <SplitLayout
      right={
        <SignInPanel error={authError} />
      }
    />
  );
};

export default LoginPage;
