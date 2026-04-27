import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Plus, Trash2, Wifi, Info, ToggleLeft, ToggleRight, Globe, MapPin, Search, Target } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
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

const IpConfigPage = () => {
  useParams<{ tenantSlug: string }>();

  // ── IP state ───────────────────────────────────────────────────────────────
  const { data: ipSettings, isLoading: ipSettingsLoading } = useIpSettings();
  const updateIpSettings = useUpdateIpSettings();
  const { data: ips = [], isLoading: ipsLoading } = useIpConfig();
  const addIp    = useAddIpConfig();
  const deleteIp = useDeleteIpConfig();

  const [ipLabel, setIpLabel] = useState('');
  const [ipAddr,  setIpAddr]  = useState('');

  // ── Geo state ──────────────────────────────────────────────────────────────
  const { data: geoSettings, isLoading: geoSettingsLoading } = useGeoSettings();
  const updateGeoSettings = useUpdateGeoSettings();
  const { data: geos = [], isLoading: geosLoading } = useGeoConfig();
  const addGeo    = useAddGeoConfig();
  const deleteGeo = useDeleteGeoConfig();

  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCode, setSelectedCode]   = useState('');

  // ── Zone state ─────────────────────────────────────────────────────────────
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

  const ipEnabled   = !!(ipSettings   as any)?.enabled;
  const geoEnabled  = !!(geoSettings  as any)?.enabled;
  const zoneEnabled = !!(zoneSettings as any)?.enabled;

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

  const notify = (msg: string) => { setErr(''); setSuccess(msg); };
  const errMsg = (msg: string) => { setSuccess(''); setErr(msg); };

  const handleIpToggle = async () => {
    try {
      await updateIpSettings.mutateAsync({ enabled: !ipEnabled });
      notify(ipEnabled ? 'IP restrictions disabled.' : 'IP restrictions enabled.');
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to update setting.'); }
  };

  const handleGeoToggle = async () => {
    try {
      await updateGeoSettings.mutateAsync({ enabled: !geoEnabled });
      notify(geoEnabled ? 'Geo restrictions disabled.' : 'Geo restrictions enabled.');
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to update setting.'); }
  };

  const handleAddIp = async () => {
    if (!ipLabel.trim() || !ipAddr.trim()) { errMsg('Both a label and an IP address are required.'); return; }
    try {
      await addIp.mutateAsync({ label: ipLabel.trim(), ip_address: ipAddr.trim() });
      setIpLabel(''); setIpAddr('');
      notify('IP address added.');
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to add IP address.'); }
  };

  const handleDeleteIp = async (id: string) => {
    try { await deleteIp.mutateAsync(id); }
    catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to remove IP address.'); }
  };

  const handleAddGeo = async () => {
    if (!selectedCode) { errMsg('Please select a country.'); return; }
    const country = COUNTRIES.find((c) => c.code === selectedCode);
    if (!country) return;
    try {
      await addGeo.mutateAsync({ country_code: country.code, country_name: country.name });
      setSelectedCode(''); setCountrySearch('');
      notify(`${country.name} added to allowed locations.`);
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to add country.'); }
  };

  const handleDeleteGeo = async (id: string) => {
    try { await deleteGeo.mutateAsync(id); }
    catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to remove country.'); }
  };

  const handleZoneToggle = async () => {
    try {
      await updateZoneSettings.mutateAsync({ enabled: !zoneEnabled });
      notify(zoneEnabled ? 'Zone restrictions disabled.' : 'Zone restrictions enabled.');
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to update setting.'); }
  };

  const handleAddZone = async () => {
    if (!zoneName.trim()) { errMsg('Zone name is required.'); return; }
    const lat = parseFloat(zoneLat);
    const lng = parseFloat(zoneLng);
    const radius = parseFloat(zoneRadius);
    if (isNaN(lat) || lat < -90 || lat > 90) { errMsg('Latitude must be between -90 and 90.'); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { errMsg('Longitude must be between -180 and 180.'); return; }
    if (isNaN(radius) || radius <= 0) { errMsg('Radius must be a positive number.'); return; }
    try {
      await addZone.mutateAsync({ name: zoneName.trim(), latitude: lat, longitude: lng, radius_km: radius });
      setZoneName(''); setZoneLat(''); setZoneLng(''); setZoneRadius('1');
      notify(`Zone "${zoneName.trim()}" added.`);
    } catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to add zone.'); }
  };

  const handleDeleteZone = async (id: string) => {
    try { await deleteZone.mutateAsync(id); }
    catch (e: any) { errMsg(e?.response?.data?.message ?? e?.message ?? 'Failed to remove zone.'); }
  };

  return (
    <Layout>
      <Header
        title="Access Restrictions"
        subtitle="Control which networks and locations employees can check in from"
      />

      <div className="p-6 space-y-8 max-w-2xl">

        {err     && <Alert type="error"   message={err} />}
        {success && <Alert type="success" message={success} />}

        {/* ── IP Restrictions ─────────────────────────────────────────────── */}
        <section className="space-y-4">
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
                <label className="text-xs font-medium text-gray-500 block mb-1">Label</label>
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
                  Add
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
                <p className="text-sm">No IP restrictions configured</p>
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
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        {/* ── Geo Restrictions ────────────────────────────────────────────── */}
        <section className="space-y-4">
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
                <label className="text-xs font-medium text-gray-500 block mb-1">Search &amp; Select Country</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    className="form-input w-full pl-8"
                    placeholder="Type to search countries…"
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
                  <p className="text-xs text-gray-400 mt-1 px-1">No matching countries found.</p>
                )}
              </div>
              <div className="flex items-start pt-5">
                <Button
                  icon={<Plus size={14} />}
                  loading={addGeo.isPending}
                  disabled={!selectedCode}
                  onClick={handleAddGeo}
                >
                  Add
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
                <p className="text-sm">No country restrictions configured</p>
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
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        {/* ── Zone Restrictions ───────────────────────────────────────────── */}
        <section className="space-y-4">
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
                <label className="text-xs font-medium text-gray-500 block mb-1">Zone Name</label>
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
                  Add Zone
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
                <p className="text-sm">No zones configured</p>
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
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

      </div>
    </Layout>
  );
};

export default IpConfigPage;
