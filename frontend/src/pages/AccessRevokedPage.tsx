import React from 'react';
import { ShieldOff, Mail, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';

const AccessRevokedPage = () => {
  const { logout, user } = useAuth();
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
        {/* Red top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-rose-600" />

        <div className="p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-5">
            <ShieldOff size={30} className="text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">{t('errors.accessRevoked')}</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            {t('errors.accessRevokedDesc')}{' '}
            <span className="font-semibold text-gray-700">DSV OpsPulse</span>.{' '}
            {t('errors.contactAdmin')}
          </p>

          {/* Info box */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left mb-6">
            <p className="text-xs font-semibold text-amber-800 mb-1">{t('errors.whatThisMeans')}</p>
            <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
              <li>{t('errors.zohoStillActive')}</li>
              <li>{t('errors.appAccessRemoved')}</li>
              <li>{t('errors.adminCanRestore')}</li>
            </ul>
          </div>

          {/* Contact hint */}
          <div className="flex items-center gap-2 text-xs text-gray-400 justify-center mb-6">
            <Mail size={13} />
            <span>
              {t('errors.contactAdminEmail')}
              {user?.email ? (
                <span className="font-semibold text-gray-600"> ({user.email})</span>
              ) : null}
            </span>
          </div>

          {/* Sign out */}
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <LogOut size={14} />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessRevokedPage;
