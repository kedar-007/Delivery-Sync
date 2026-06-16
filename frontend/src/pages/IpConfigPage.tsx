import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Plus, Trash2, Wifi, Info, ToggleLeft, ToggleRight, Globe, MapPin, Search, Target, Clock, Edit2, Check, X } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import { PageSkeleton } from '../components/ui/Skeleton';
import {
  useIpSettings, useUpdateIpSettings,
  useIpConfig, useAddIpConfig, useDeleteIpConfig,
  useGeoSettings, useUpdateGeoSettings,
  useGeoConfig, useAddGeoConfig, useDeleteGeoConfig,
  useGeoZoneSettings, useUpdateGeoZoneSettings,
  useGeoZones, useAddGeoZone, useDeleteGeoZone,
  useShifts, useAddShift, useUpdateShift, useDeleteShift,
} from '../hooks/usePeople';

const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' }, { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' }, { code: 'AT', name: 'Austria' },
  { code: 'BH', name: 'Bahrain' }, { code: 'BD', name: 'Bangladesh' },
  { code: 'BE', name: 'Belgium' }, { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' }, { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' }, { code: 'CO', name: 'Colombia' },
  { code: 'HR', name: 'Croatia' }, { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' }, { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' }, { code: 'ET', name: 'Ethiopia' },
  { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' }, { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' }, { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' }, { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' }, { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' }, { code: 'JO', name: 'Jordan' },
  { code: 'KE', name: 'Kenya' }, { code: 'KW', name: 'Kuwait' },
  { code: 'LB', name: 'Lebanon' }, { code: 'MY', name: 'Malaysia' },
  { code: 'MX', name: 'Mexico' }, { code: 'MA', name: 'Morocco' },
  { code: 'NL', name: 'Netherlands' }, { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' }, { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' }, { code: 'PK', name: 'Pakistan' },
  { code: 'PH', name: 'Philippines' }, { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' }, { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' }, { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' }, { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' }, { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' }, { code: 'LK', name: 'Sri Lanka' },
  { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' }, { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' }, { code: 'TR', name: 'Turkey' },
  { code: 'UA', name: 'Ukraine' }, { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' },
  { code: 'UG', name: 'Uganda' }, { code: 'VN', name: 'Vietnam' },
  { code: 'ZM', name: 'Zambia' }, { code: 'ZW', name: 'Zimbabwe' },
].sort((a, b) => a.name.localeCompare(b.name));

const FLAG_EMOJI = (code: string) =>
  code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

// ── IP Restrictions ────────────────────────────────────────────────────────────

export const IpRestrictionsTab = () => {
  const { t } = useI18n();
  const { data: ipSettings, isLoading: ipSettingsLoading } = useIpSettings();
  const updateIpSettings = useUpdateIpSettings();
  const { data: ips = [], isLoading: ipsLoading } = useIpConfig();
  const addIp    = useAddIpConfig();
  const deleteIp = useDeleteIpConfig();

  const [ipLabel, setIpLabel] = useState('');
  const [ipAddr,  setIpAddr]  = useState('');
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState('');

  const ipEnabled = !!(ipSettings as any)?.enabled;
  const notify = (msg: string) => { setErr(''); setSuccess(msg); };
  const errMsg = (msg: string) => { setSuccess(''); setErr(msg); };

  const handleIpToggle = async () => {
    try {
      await updateIpSettings.mutateAsync({ enabled: !ipEnabled });
      notify(ipEnabled ? t('errors.generic') : t('common.saveSuccess'));
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  const handleAddIp = async () => {
    if (!ipLabel.trim() || !ipAddr.trim()) { errMsg(t('validation.required')); return; }
    try {
      await addIp.mutateAsync({ label: ipLabel.trim(), ip_address: ipAddr.trim() });
      setIpLabel(''); setIpAddr('');
      notify(t('common.saveSuccess'));
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  const handleDeleteIp = async (id: string) => {
    try { await deleteIp.mutateAsync(id); }
    catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  return (
    <section className="space-y-4">
      {err     && <Alert type="error"   message={err} />}
      {success && <Alert type="success" message={success} />}

      <div className="flex items-center gap-2">
        <Wifi size={16} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">IP Restrictions</h2>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Enable IP Restrictions</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Limit check-ins to specific IP addresses or CIDR ranges (e.g. office routers with static IPs).
            </p>
          </div>
          <button
            onClick={handleIpToggle}
            disabled={ipSettingsLoading || updateIpSettings.isPending}
            className="shrink-0 flex items-center gap-2 focus:outline-none disabled:opacity-50"
            aria-label={ipEnabled ? 'Disable IP restrictions' : 'Enable IP restrictions'}
          >
            {ipEnabled
              ? <ToggleRight size={36} className="text-indigo-600" />
              : <ToggleLeft  size={36} className="text-gray-300" />
            }
          </button>
        </div>
        {!ipEnabled && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <Shield size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              IP restrictions are <strong>disabled</strong>. Employees can check in from any network.
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3.5">
        <Info size={16} className="text-indigo-500 mt-0.5 shrink-0" />
        <ul className="text-xs text-indigo-600 space-y-0.5 list-disc list-inside">
          <li>Supports single IPs (<code>203.0.113.5</code>) and CIDR ranges (<code>192.168.1.0/24</code>).</li>
          <li>Employees outside the allowed networks can only use <strong>WFH check-in</strong>.</li>
          <li>If enabled but no IPs are added, all networks remain allowed.</li>
        </ul>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={15} className="text-indigo-500" /> Add Allowed IP / Range
        </h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 block mb-1">{t('common.name')}</label>
            <input
              className="form-input w-full"
              placeholder="e.g. Head Office"
              value={ipLabel}
              onChange={(e) => setIpLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddIp(); }}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 block mb-1">IP / CIDR</label>
            <input
              className="form-input w-full font-mono"
              placeholder="203.0.113.5 or 192.168.0.0/24"
              value={ipAddr}
              onChange={(e) => setIpAddr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddIp(); }}
            />
          </div>
          <div className="flex items-end">
            <Button icon={<Plus size={14} />} loading={addIp.isPending}
              disabled={!ipLabel.trim() || !ipAddr.trim()} onClick={handleAddIp}>
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Wifi size={15} className="text-gray-400" /> Configured Networks
          </h3>
          <span className="text-xs text-gray-400">{(ips as any[]).length} address{(ips as any[]).length !== 1 ? 'es' : ''}</span>
        </div>
        {ipsLoading ? (
          <div className="p-4"><PageSkeleton /></div>
        ) : (ips as any[]).length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400 gap-2">
            <Wifi size={28} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(ips as any[]).map((ip: any) => {
              const id = String(ip.ROWID ?? ip.id ?? '');
              return (
                <div key={id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <Wifi size={15} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{ip.label}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{ip.ip_address}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteIp(id)}
                    disabled={deleteIp.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} /> {t('common.remove')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
};

// ── Geo Restrictions ───────────────────────────────────────────────────────────

export const GeoRestrictionsTab = () => {
  const { t } = useI18n();
  const { data: geoSettings, isLoading: geoSettingsLoading } = useGeoSettings();
  const updateGeoSettings = useUpdateGeoSettings();
  const { data: geos = [], isLoading: geosLoading } = useGeoConfig();
  const addGeo    = useAddGeoConfig();
  const deleteGeo = useDeleteGeoConfig();

  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCode, setSelectedCode]   = useState('');
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState('');

  const geoEnabled = !!(geoSettings as any)?.enabled;
  const notify = (msg: string) => { setErr(''); setSuccess(msg); };
  const errMsg = (msg: string) => { setSuccess(''); setErr(msg); };

  const configuredCodes = useMemo(
    () => new Set((geos as any[]).map((g: any) => g.country_code)),
    [geos]
  );

  const filteredCountries = useMemo(
    () => COUNTRIES.filter(
      (c) => !configuredCodes.has(c.code) &&
        (c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
         c.code.toLowerCase().includes(countrySearch.toLowerCase()))
    ),
    [countrySearch, configuredCodes]
  );

  const handleGeoToggle = async () => {
    try {
      await updateGeoSettings.mutateAsync({ enabled: !geoEnabled });
      notify(geoEnabled ? t('errors.generic') : t('common.saveSuccess'));
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  const handleAddGeo = async () => {
    if (!selectedCode) { errMsg(t('validation.required')); return; }
    const country = COUNTRIES.find((c) => c.code === selectedCode);
    if (!country) return;
    try {
      await addGeo.mutateAsync({ country_code: country.code, country_name: country.name });
      setSelectedCode(''); setCountrySearch('');
      notify(t('common.saveSuccess'));
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  const handleDeleteGeo = async (id: string) => {
    try { await deleteGeo.mutateAsync(id); }
    catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  return (
    <section className="space-y-4">
      {err     && <Alert type="error"   message={err} />}
      {success && <Alert type="success" message={success} />}

      <div className="flex items-center gap-2">
        <Globe size={16} className="text-emerald-500" />
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Geo Restrictions</h2>
        <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">For offices without static IPs</span>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Enable Geo Restrictions</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Restrict check-ins to specific countries based on the employee's detected location.
              Ideal for offices without static IPs.
            </p>
          </div>
          <button
            onClick={handleGeoToggle}
            disabled={geoSettingsLoading || updateGeoSettings.isPending}
            className="shrink-0 flex items-center gap-2 focus:outline-none disabled:opacity-50"
            aria-label={geoEnabled ? 'Disable geo restrictions' : 'Enable geo restrictions'}
          >
            {geoEnabled
              ? <ToggleRight size={36} className="text-emerald-600" />
              : <ToggleLeft  size={36} className="text-gray-300" />
            }
          </button>
        </div>
        {!geoEnabled && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <Globe size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Geo restrictions are <strong>disabled</strong>. Employees can check in from any country.
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5">
        <Info size={16} className="text-emerald-500 mt-0.5 shrink-0" />
        <ul className="text-xs text-emerald-700 space-y-0.5 list-disc list-inside">
          <li>Location is detected from the employee's IP using GeoIP — no GPS required.</li>
          <li>Employees in a blocked country are redirected to <strong>WFH check-in</strong>.</li>
          <li>If lookup fails (e.g. VPN, private network), check-in is allowed automatically.</li>
          <li>Can be used alongside IP restrictions — both must pass for office check-in.</li>
        </ul>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={15} className="text-emerald-500" /> Add Allowed Country
        </h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 block mb-1">{t('common.search')} &amp; Select Country</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                className="form-input w-full pl-8"
                placeholder={t('common.searchPlaceholder')}
                value={countrySearch}
                onChange={(e) => { setCountrySearch(e.target.value); setSelectedCode(''); }}
              />
            </div>
            {countrySearch && filteredCountries.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-xl shadow-sm bg-white max-h-48 overflow-y-auto z-10 relative">
                {filteredCountries.slice(0, 12).map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { setSelectedCode(c.code); setCountrySearch(c.name); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-lg leading-none">{FLAG_EMOJI(c.code)}</span>
                    <span className="text-gray-800">{c.name}</span>
                    <span className="ml-auto text-xs text-gray-400 font-mono">{c.code}</span>
                  </button>
                ))}
              </div>
            )}
            {countrySearch && filteredCountries.length === 0 && !selectedCode && (
              <p className="text-xs text-gray-400 mt-1 px-1">{t('common.noResults')}</p>
            )}
          </div>
          <div className="flex items-start pt-5">
            <Button
              icon={<Plus size={14} />}
              loading={addGeo.isPending}
              disabled={!selectedCode}
              onClick={handleAddGeo}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <MapPin size={15} className="text-gray-400" /> Allowed Countries
          </h3>
          <span className="text-xs text-gray-400">{(geos as any[]).length} countr{(geos as any[]).length !== 1 ? 'ies' : 'y'}</span>
        </div>
        {geosLoading ? (
          <div className="p-4"><PageSkeleton /></div>
        ) : (geos as any[]).length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400 gap-2">
            <Globe size={28} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
            <p className="text-xs text-gray-400">Add countries above to restrict check-in by location.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(geos as any[]).map((geo: any) => {
              const id = String(geo.ROWID ?? geo.id ?? '');
              return (
                <div key={id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-xl leading-none">
                    {FLAG_EMOJI(geo.country_code)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{geo.country_name}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{geo.country_code}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteGeo(id)}
                    disabled={deleteGeo.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} /> {t('common.remove')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
};

// ── Zone Restrictions ──────────────────────────────────────────────────────────

export const ZoneRestrictionsTab = () => {
  const { t } = useI18n();
  const { data: zoneSettings, isLoading: zoneSettingsLoading } = useGeoZoneSettings();
  const updateZoneSettings = useUpdateGeoZoneSettings();
  const { data: zones = [], isLoading: zonesLoading } = useGeoZones();
  const addZone    = useAddGeoZone();
  const deleteZone = useDeleteGeoZone();

  const [zoneName,   setZoneName]   = useState('');
  const [zoneLat,    setZoneLat]    = useState('');
  const [zoneLng,    setZoneLng]    = useState('');
  const [zoneRadius, setZoneRadius] = useState('1');
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState('');

  const zoneEnabled = !!(zoneSettings as any)?.enabled;
  const notify = (msg: string) => { setErr(''); setSuccess(msg); };
  const errMsg = (msg: string) => { setSuccess(''); setErr(msg); };

  const handleZoneToggle = async () => {
    try {
      await updateZoneSettings.mutateAsync({ enabled: !zoneEnabled });
      notify(zoneEnabled ? t('errors.generic') : t('common.saveSuccess'));
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  const handleAddZone = async () => {
    if (!zoneName.trim()) { errMsg(t('validation.required')); return; }
    const lat = parseFloat(zoneLat);
    const lng = parseFloat(zoneLng);
    const radius = parseFloat(zoneRadius);
    if (isNaN(lat) || lat < -90 || lat > 90) { errMsg(t('validation.invalidFormat')); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { errMsg(t('validation.invalidFormat')); return; }
    if (isNaN(radius) || radius <= 0) { errMsg(t('validation.positiveNumber')); return; }
    try {
      await addZone.mutateAsync({ name: zoneName.trim(), latitude: lat, longitude: lng, radius_km: radius });
      setZoneName(''); setZoneLat(''); setZoneLng(''); setZoneRadius('1');
      notify(t('common.saveSuccess'));
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  const handleDeleteZone = async (id: string) => {
    try { await deleteZone.mutateAsync(id); }
    catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? t('errors.saveFailed')); }
  };

  return (
    <section className="space-y-4">
      {err     && <Alert type="error"   message={err} />}
      {success && <Alert type="success" message={success} />}

      <div className="flex items-center gap-2">
        <Target size={16} className="text-violet-500" />
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Zone Restrictions</h2>
        <span className="text-xs bg-violet-100 text-violet-700 font-medium px-2 py-0.5 rounded-full">City / Area level</span>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Enable Zone Restrictions</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Restrict check-ins to specific areas (e.g. Hinjewadi Phase 1, Pune) using a lat/lng centre + radius.
              Works even without a static IP.
            </p>
          </div>
          <button
            onClick={handleZoneToggle}
            disabled={zoneSettingsLoading || updateZoneSettings.isPending}
            className="shrink-0 flex items-center gap-2 focus:outline-none disabled:opacity-50"
            aria-label={zoneEnabled ? 'Disable zone restrictions' : 'Enable zone restrictions'}
          >
            {zoneEnabled
              ? <ToggleRight size={36} className="text-violet-600" />
              : <ToggleLeft  size={36} className="text-gray-300" />
            }
          </button>
        </div>
        {!zoneEnabled && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            <Target size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Zone restrictions are <strong>disabled</strong>. Employees can check in from any location.
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-3 bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3.5">
        <Info size={16} className="text-violet-500 mt-0.5 shrink-0" />
        <ul className="text-xs text-violet-700 space-y-0.5 list-disc list-inside">
          <li>Define a zone by its centre coordinates and a radius (in km).</li>
          <li>Get coordinates from Google Maps — right-click a location and copy the lat/lng.</li>
          <li>A 1–2 km radius covers most office buildings; use 5 km for a larger tech park.</li>
          <li>If location can't be determined (VPN, private IP), check-in is allowed automatically.</li>
        </ul>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={15} className="text-violet-500" /> Add Zone
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">{t('common.name')}</label>
            <input
              className="form-input w-full"
              placeholder="e.g. Hinjewadi Phase 1, Pune"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 block mb-1">Latitude</label>
              <input
                className="form-input w-full font-mono"
                placeholder="18.5908"
                value={zoneLat}
                onChange={(e) => setZoneLat(e.target.value)}
                type="number"
                step="any"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 block mb-1">Longitude</label>
              <input
                className="form-input w-full font-mono"
                placeholder="73.7356"
                value={zoneLng}
                onChange={(e) => setZoneLng(e.target.value)}
                type="number"
                step="any"
              />
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-gray-500 block mb-1">Radius (km)</label>
              <input
                className="form-input w-full font-mono"
                placeholder="1"
                value={zoneRadius}
                onChange={(e) => setZoneRadius(e.target.value)}
                type="number"
                min="0.1"
                max="500"
                step="0.1"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              icon={<Plus size={14} />}
              loading={addZone.isPending}
              disabled={!zoneName.trim() || !zoneLat || !zoneLng}
              onClick={handleAddZone}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Target size={15} className="text-gray-400" /> Configured Zones
          </h3>
          <span className="text-xs text-gray-400">{(zones as any[]).length} zone{(zones as any[]).length !== 1 ? 's' : ''}</span>
        </div>
        {zonesLoading ? (
          <div className="p-4"><PageSkeleton /></div>
        ) : (zones as any[]).length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400 gap-2">
            <Target size={28} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
            <p className="text-xs text-gray-400">Add zones above to restrict check-in by area.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(zones as any[]).map((zone: any) => {
              const id = String(zone.ROWID ?? zone.id ?? '');
              return (
                <div key={id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                    <Target size={15} className="text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{zone.name}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">
                      {parseFloat(zone.latitude).toFixed(4)}, {parseFloat(zone.longitude).toFixed(4)}
                      <span className="ml-2 text-gray-300">·</span>
                      <span className="ml-2">{zone.radius_km} km radius</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteZone(id)}
                    disabled={deleteZone.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} /> {t('common.remove')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
};

// ── Work Shifts ────────────────────────────────────────────────────────────────

export const ShiftsTab = () => {
  const { t } = useI18n();
  const { data: shifts = [], isLoading: shiftsLoading } = useShifts();
  const addShift    = useAddShift();
  const deleteShift = useDeleteShift();

  const [shiftName,    setShiftName]    = useState('');
  const [shiftStart,   setShiftStart]   = useState('09:00');
  const [shiftEnd,     setShiftEnd]     = useState('18:00');
  const [shiftTz,      setShiftTz]      = useState('Asia/Kolkata');
  const [shiftGrace,   setShiftGrace]   = useState('15');
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editShiftName,  setEditShiftName]  = useState('');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftGrace, setEditShiftGrace] = useState('');
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState('');

  const updateShiftMutation = useUpdateShift(editingShiftId ?? '');
  const notify = (msg: string) => { setErr(''); setSuccess(msg); };
  const errMsg = (msg: string) => { setSuccess(''); setErr(msg); };

  const handleAddShift = async () => {
    if (!shiftName.trim()) return errMsg(t('validation.required'));
    if (!/^\d{2}:\d{2}$/.test(shiftStart)) return errMsg(t('validation.invalidFormat'));
    try {
      await addShift.mutateAsync({ name: shiftName.trim(), start_time: shiftStart, end_time: shiftEnd, timezone: shiftTz, grace_minutes: shiftGrace });
      setShiftName(''); setShiftStart('09:00'); setShiftEnd('18:00'); setShiftTz('Asia/Kolkata'); setShiftGrace('15');
      notify(t('common.createSuccess'));
    } catch (e: any) { errMsg(e?.message ?? t('errors.saveFailed')); }
  };

  const handleDeleteShift = async (id: string) => {
    try {
      await deleteShift.mutateAsync(id);
      notify(t('common.success'));
    } catch (e: any) { errMsg(e?.message ?? t('errors.saveFailed')); }
  };

  const startEditShift = (shift: any) => {
    setEditingShiftId(String(shift.ROWID ?? shift.id ?? ''));
    setEditShiftName(shift.name);
    setEditShiftStart(shift.start_time ?? shift.startTime ?? '');
    setEditShiftGrace(String(shift.grace_minutes ?? shift.graceMinutes ?? 15));
  };

  const saveEditShift = async () => {
    if (!editingShiftId) return;
    try {
      await updateShiftMutation.mutateAsync({ name: editShiftName, start_time: editShiftStart, grace_minutes: editShiftGrace });
      setEditingShiftId(null);
      notify(t('common.updateSuccess'));
    } catch (e: any) { errMsg(e?.message ?? t('errors.saveFailed')); }
  };

  return (
    <section>
      {err     && <Alert type="error"   message={err} />}
      {success && <Alert type="success" message={success} />}

      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-amber-500" />
        <h2 className="text-base font-semibold text-gray-900">Work Shifts</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Define shifts with start times. Users can be assigned a shift from the Users admin page.
        Check-ins more than the grace period after shift start are marked <strong>Late</strong> and the reporting manager is notified.
      </p>

      <Card className="mb-4 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">{t('common.add')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('common.name')}</label>
            <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="e.g. AU Shift" value={shiftName} onChange={(e) => setShiftName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Start Time (HH:MM)</label>
            <input type="time" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200"
              value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">End Time (HH:MM)</label>
            <input type="time" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200"
              value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Reference Timezone</label>
            <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200"
              value={shiftTz} onChange={(e) => setShiftTz(e.target.value)}>
              <option value="Asia/Kolkata">India IST (UTC+5:30)</option>
              <option value="Australia/Sydney">AU Eastern (AEST/AEDT)</option>
              <option value="Australia/Perth">AU Western (AWST)</option>
              <option value="America/New_York">US Eastern</option>
              <option value="America/Los_Angeles">US Pacific</option>
              <option value="Europe/London">UK / GMT</option>
              <option value="Asia/Dubai">Gulf (GST)</option>
              <option value="Asia/Singapore">Singapore (SGT)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Grace Period (minutes)</label>
            <input type="number" min="0" max="60" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200"
              value={shiftGrace} onChange={(e) => setShiftGrace(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={handleAddShift} disabled={addShift.isPending}>
          <Plus size={14} /> {addShift.isPending ? t('common.saving') : t('common.add')}
        </Button>
      </Card>

      <Card>
        {shiftsLoading ? (
          <div className="p-6 text-center text-sm text-gray-400">{t('common.loading')}</div>
        ) : (shifts as any[]).length === 0 ? (
          <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
            <Clock size={28} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
            <p className="text-xs text-gray-400">Create a shift above, then assign it to users in the Users admin tab.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(shifts as any[]).map((shift: any) => {
              const id = String(shift.ROWID ?? shift.id ?? '');
              const isEditing = editingShiftId === id;
              return (
                <div key={id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Clock size={15} className="text-amber-500" />
                  </div>
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <input className="text-sm border border-gray-200 rounded-lg px-2 py-1 w-32 outline-none focus:ring-2 focus:ring-amber-200"
                        value={editShiftName} onChange={(e) => setEditShiftName(e.target.value)} placeholder={t('common.name')} />
                      <input type="time" className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-amber-200"
                        value={editShiftStart} onChange={(e) => setEditShiftStart(e.target.value)} />
                      <input type="number" min="0" max="60" className="text-sm border border-gray-200 rounded-lg px-2 py-1 w-20 outline-none focus:ring-2 focus:ring-amber-200"
                        value={editShiftGrace} onChange={(e) => setEditShiftGrace(e.target.value)} placeholder="Grace (min)" />
                      <button onClick={saveEditShift} disabled={updateShiftMutation.isPending}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"><Check size={14} /></button>
                      <button onClick={() => setEditingShiftId(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{shift.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Start: {shift.start_time ?? shift.startTime} · End: {(shift.end_time ?? shift.endTime) || '—'} ·
                        Timezone: {shift.timezone} · Grace: {shift.grace_minutes ?? (shift.graceMinutes ?? 15)} min
                      </p>
                    </div>
                  )}
                  {!isEditing && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEditShift(shift)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors">
                        <Edit2 size={12} /> {t('common.edit')}
                      </button>
                      <button onClick={() => handleDeleteShift(id)} disabled={deleteShift.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50">
                        <Trash2 size={13} /> {t('common.remove')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
};

// ── IpConfigPage (standalone route — keeps existing /ip-config working) ────────

const IpConfigPage = () => {
  const { t } = useI18n();
  useParams<{ tenantSlug: string }>();

  type TabId = 'ip' | 'geo' | 'zones' | 'shifts';
  const [activeTab, setActiveTab] = useState<TabId>('ip');

  return (
    <Layout>
      <Header
        title={t('nav.peopleSettings')}
        subtitle="Manage attendance restrictions, locations, and work shifts"
      />

      <div className="p-6 max-w-2xl space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
          {([
            { id: 'ip' as const,     label: 'IP Restrictions',  icon: <Wifi size={15} />,    activeClass: 'border-indigo-500 text-indigo-700 bg-indigo-50' },
            { id: 'geo' as const,    label: 'Geo Restrictions', icon: <Globe size={15} />,   activeClass: 'border-emerald-500 text-emerald-700 bg-emerald-50' },
            { id: 'zones' as const,  label: 'Zone Restrictions',icon: <Target size={15} />,  activeClass: 'border-violet-500 text-violet-700 bg-violet-50' },
            { id: 'shifts' as const, label: 'Work Shifts',      icon: <Clock size={15} />,   activeClass: 'border-amber-500 text-amber-700 bg-amber-50' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                activeTab === t.id
                  ? t.activeClass + ' shadow-sm border-current'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'ip'     && <IpRestrictionsTab />}
        {activeTab === 'geo'    && <GeoRestrictionsTab />}
        {activeTab === 'zones'  && <ZoneRestrictionsTab />}
        {activeTab === 'shifts' && <ShiftsTab />}
      </div>
    </Layout>
  );
};

export default IpConfigPage;
