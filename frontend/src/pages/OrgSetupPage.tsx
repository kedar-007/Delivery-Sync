import React, { useState, useEffect } from 'react';
import { Building2, ArrowRight, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from '../components/ui/BrandLogo';
import { useI18n } from '../contexts/I18nContext';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const STEP_KEYS = ['orgSetup.stepOrganisation', 'orgSetup.stepReview'];

export default function OrgSetupPage() {
  const { t } = useI18n();
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const [step, setStep]             = useState(0);
  const [orgName, setOrgName]       = useState('');
  const [slug, setSlug]             = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(orgName));
  }, [orgName, slugEdited]);

  const handleSlugChange = (val: string) => {
    setSlugEdited(true);
    setSlug(slugify(val) || val.toLowerCase());
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.setupOrg({ orgName: orgName.trim(), slug: slug.trim() });
      const orgSlug: string = result?.tenant?.slug || slug.trim();
      setSuccess(true);
      setTimeout(async () => {
        await refetch(true).catch(() => {});
        navigate(`/${orgSlug}/dashboard`, { replace: true });
      }, 1200);
    } catch (err: unknown) {
      const e = err as Error & { message?: string; data?: { code?: string; data?: { tenantSlug?: string } } };
      // Org already exists — redirect straight to their dashboard instead of showing a dead-end error.
      if (e.data?.code === 'ALREADY_SETUP' && e.data?.data?.tenantSlug) {
        await refetch(true).catch(() => {});
        navigate(`/${e.data.data.tenantSlug}/dashboard`, { replace: true });
        return;
      }
      setError(e.message || t('errors.generic'));
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[420px] shrink-0 p-10 text-white">
        <div className="mb-12">
          <BrandLogo variant="full" height={48} />
        </div>
        <div className="flex-1">
          <h1 className="text-4xl font-bold leading-tight mb-4">{t('orgSetup.title')}</h1>
          <p className="text-white/60 text-base mb-10">
            {t('orgSetup.subtitle')}
          </p>

          {/* Step indicators */}
          <div className="space-y-4">
            {STEP_KEYS.map((key, i) => (
              <div key={key} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/40'}`}>
                  {i < step ? <Check size={13} /> : i + 1}
                </div>
                <span className={`text-sm font-medium ${i === step ? 'text-white' : 'text-white/40'}`}>{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">
          <div className="lg:hidden mb-6 flex justify-center">
            <BrandLogo variant="full" height={40} />
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={28} className="text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{t('orgSetup.orgCreated')}</h2>
              <p className="text-sm text-gray-400 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin text-indigo-500" /> {t('orgSetup.redirecting')}
              </p>
            </div>
          ) : (
            <>
              {step === 0 && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Building2 size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{t('orgSetup.orgDetails')}</h2>
                      <p className="text-sm text-gray-400">{t('orgSetup.orgDetailsDesc')}</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        {t('admin.config.orgName')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        {t('orgSetup.workspaceSlug')} <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400">
                        <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 whitespace-nowrap select-none">
                          app /
                        </span>
                        <input
                          value={slug}
                          onChange={(e) => handleSlugChange(e.target.value)}
                          placeholder="acme-corp"
                          className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white"
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-gray-400">
                        {t('orgSetup.slugHint')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setStep(1)}
                    disabled={!orgName.trim() || !slug.trim()}
                    className="mt-8 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    {t('common.next')} <ArrowRight size={16} />
                  </button>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="mb-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-1">{t('orgSetup.reviewTitle')}</h2>
                    <p className="text-sm text-gray-400">{t('orgSetup.reviewDesc')}</p>
                  </div>

                  <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-200 mb-6">
                    {[
                      { label: t('admin.config.orgName'), value: orgName, mono: false },
                      { label: t('orgSetup.workspaceSlug'), value: slug, mono: true },
                    ].map(({ label, value, mono }) => (
                      <div key={label} className="px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-gray-500">{label}</span>
                        <span className={`text-sm font-semibold ${mono ? 'font-mono text-indigo-600' : 'text-gray-800'}`}>{value}</span>
                      </div>
                    ))}
                    <div className="px-4 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-500">{t('orgSetup.yourRole')}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                        {t('orgSetup.orgAdmin')}
                      </span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-500">{t('orgSetup.plan')}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        STARTER
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setStep(0); setError(null); }}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      {t('common.back')}
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      {submitting
                        ? <><Loader2 size={15} className="animate-spin" /> {t('common.saving')}</>
                        : t('common.create')
                      }
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
