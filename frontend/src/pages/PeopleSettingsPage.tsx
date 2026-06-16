import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapPin, CalendarDays, BarChart2, Building2,
  Wifi, Globe, Target, Clock, Lock, Info, TrendingUp,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { OfficeLocationsTab } from './AdminPage';
import { LeaveTypesTab } from './AdminConfigPage';
import { CompanyCalendarTab, LeaveBalancesTab, LeaveAccrualPolicyTab } from './LeavePage';
import { IpRestrictionsTab, GeoRestrictionsTab, ZoneRestrictionsTab, ShiftsTab } from './IpConfigPage';

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabKey =
  | 'office-locations'
  | 'leave-types'
  | 'leave-balances'
  | 'company-calendar'
  | 'leave-accrual-policy'
  | 'ip-restrictions'
  | 'geo-restrictions'
  | 'zone-restrictions'
  | 'work-shifts';

interface TabDef {
  key: TabKey;
  label: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  activeColor: string;
  section: 'leave' | 'security';
  permission: string | string[];
}

const TABS: TabDef[] = [
  {
    key: 'office-locations',
    label: 'Office Locations',
    labelKey: 'settings.officeLocations',
    icon: MapPin,
    color: 'text-blue-500',
    activeColor: 'bg-blue-50 text-blue-700 border-blue-100',
    section: 'leave',
    permission: [PERMISSIONS.LOCATION_ADMIN, PERMISSIONS.LEAVE_ADMIN],
  },
  {
    key: 'leave-types',
    label: 'Leave Types',
    labelKey: 'settings.leaveTypes',
    icon: CalendarDays,
    color: 'text-emerald-500',
    activeColor: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    section: 'leave',
    permission: PERMISSIONS.LEAVE_ADMIN,
  },
  {
    key: 'leave-balances',
    label: 'Leave Balances',
    labelKey: 'settings.leaveBalances',
    icon: BarChart2,
    color: 'text-violet-500',
    activeColor: 'bg-violet-50 text-violet-700 border-violet-100',
    section: 'leave',
    permission: PERMISSIONS.LEAVE_ADMIN,
  },
  {
    key: 'company-calendar',
    label: 'Company Calendar',
    labelKey: 'settings.companyCalendar',
    icon: Building2,
    color: 'text-red-500',
    activeColor: 'bg-red-50 text-red-700 border-red-100',
    section: 'leave',
    permission: PERMISSIONS.LEAVE_ADMIN,
  },
  {
    key: 'leave-accrual-policy',
    label: 'Accrual Policy',
    labelKey: 'settings.accrualPolicy',
    icon: TrendingUp,
    color: 'text-orange-500',
    activeColor: 'bg-orange-50 text-orange-700 border-orange-100',
    section: 'leave',
    permission: PERMISSIONS.LEAVE_ADMIN,
  },
  {
    key: 'ip-restrictions',
    label: 'IP Restrictions',
    labelKey: 'settings.ipRestrictions',
    icon: Wifi,
    color: 'text-indigo-500',
    activeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    section: 'security',
    permission: PERMISSIONS.IP_CONFIG_WRITE,
  },
  {
    key: 'geo-restrictions',
    label: 'Geo Restrictions',
    labelKey: 'settings.geoRestrictions',
    icon: Globe,
    color: 'text-teal-500',
    activeColor: 'bg-teal-50 text-teal-700 border-teal-100',
    section: 'security',
    permission: PERMISSIONS.IP_CONFIG_WRITE,
  },
  {
    key: 'zone-restrictions',
    label: 'Zone Restrictions',
    labelKey: 'settings.zoneRestrictions',
    icon: Target,
    color: 'text-purple-500',
    activeColor: 'bg-purple-50 text-purple-700 border-purple-100',
    section: 'security',
    permission: PERMISSIONS.IP_CONFIG_WRITE,
  },
  {
    key: 'work-shifts',
    label: 'Work Shifts',
    labelKey: 'settings.workShifts',
    icon: Clock,
    color: 'text-amber-500',
    activeColor: 'bg-amber-50 text-amber-700 border-amber-100',
    section: 'security',
    permission: PERMISSIONS.IP_CONFIG_WRITE,
  },
];

// ── PeopleSettingsPage ────────────────────────────────────────────────────────

const PeopleSettingsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canAccess = (tab: TabDef): boolean => {
    const perms = Array.isArray(tab.permission) ? tab.permission : [tab.permission];
    return perms.some((p) => hasPermission(user, p as any));
  };

  const visibleTabs = TABS.filter(canAccess);

  const paramTab = searchParams.get('tab') as TabKey | null;
  const defaultTab = visibleTabs[0]?.key ?? 'office-locations';
  const [activeTab, setActiveTab] = useState<TabKey>(
    paramTab && visibleTabs.some((t) => t.key === paramTab) ? paramTab : defaultTab
  );

  const switchTab = (key: TabKey) => {
    setActiveTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  const leaveTabsDefs = visibleTabs.filter((t) => t.section === 'leave');
  const securityTabsDefs = visibleTabs.filter((t) => t.section === 'security');
  const current = TABS.find((t) => t.key === activeTab);

  return (
    <Layout>
      <Header
        title={t('nav.peopleSettings')}
        subtitle={t('settings.peopleSettingsSubtitle')}
      />

      {visibleTabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Lock size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">{t('errors.forbidden')}</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">
            {t('errors.unauthorized')}
          </p>
        </div>
      ) : (
        <div className="flex gap-6 px-6 mt-2 pb-8">
          {/* ── Left nav ── */}
          <div className="w-56 flex-shrink-0">
            <nav className="space-y-0.5">

              {leaveTabsDefs.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 pt-2 pb-1">
                    {t('settings.leaveHr')}
                  </p>
                  {leaveTabsDefs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => switchTab(tab.key)}
                        className={[
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                          active
                            ? tab.activeColor + ' border'
                            : 'text-gray-600 hover:bg-gray-100 border border-transparent',
                        ].join(' ')}
                      >
                        <Icon size={15} className={active ? undefined : tab.color} />
                        {t(tab.labelKey)}
                      </button>
                    );
                  })}
                </>
              )}

              {securityTabsDefs.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 pt-4 pb-1">
                    {t('settings.attendanceSecurity')}
                  </p>
                  {securityTabsDefs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => switchTab(tab.key)}
                        className={[
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                          active
                            ? tab.activeColor + ' border'
                            : 'text-gray-600 hover:bg-gray-100 border border-transparent',
                        ].join(' ')}
                      >
                        <Icon size={15} className={active ? undefined : tab.color} />
                        {t(tab.labelKey)}
                      </button>
                    );
                  })}
                </>
              )}
            </nav>

            <div className="mt-6 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Info size={12} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">{t('settings.adminOnly')}</span>
              </div>
              <p className="text-xs text-amber-600">
                {t('settings.adminOnlyDesc')}
              </p>
            </div>
          </div>

          {/* ── Content panel ── */}
          <div className="flex-1 min-w-0">
            {current && (
              <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">{t(current.labelKey)}</h2>
              </div>
            )}

            {activeTab === 'office-locations'    && <OfficeLocationsTab />}
            {activeTab === 'leave-types'         && <LeaveTypesTab />}
            {activeTab === 'leave-balances'      && <LeaveBalancesTab />}
            {activeTab === 'company-calendar'    && <CompanyCalendarTab />}
            {activeTab === 'leave-accrual-policy' && <LeaveAccrualPolicyTab />}
            {activeTab === 'ip-restrictions'     && <IpRestrictionsTab />}
            {activeTab === 'geo-restrictions'    && <GeoRestrictionsTab />}
            {activeTab === 'zone-restrictions'   && <ZoneRestrictionsTab />}
            {activeTab === 'work-shifts'         && <ShiftsTab />}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default PeopleSettingsPage;
