import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Plus, Trash2, Wifi, Info, ToggleLeft, ToggleRight } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import { PageSkeleton } from '../components/ui/Skeleton';
import {
  useIpSettings, useUpdateIpSettings,
  useIpConfig, useAddIpConfig, useDeleteIpConfig,
} from '../hooks/usePeople';

const IpConfigPage = () => {
  useParams<{ tenantSlug: string }>();

  const { data: ipSettings, isLoading: settingsLoading } = useIpSettings();
  const updateSettings = useUpdateIpSettings();

  const { data: ips = [], isLoading } = useIpConfig();
  const addIp    = useAddIpConfig();
  const deleteIp = useDeleteIpConfig();

  const [label,   setLabel]   = useState('');
  const [ipAddr,  setIpAddr]  = useState('');
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState('');

  const enabled = !!(ipSettings as any)?.enabled;

  const handleToggle = async () => {
    setErr(''); setSuccess('');
    try {
      await updateSettings.mutateAsync({ enabled: !enabled });
      setSuccess(enabled ? 'IP restrictions disabled — all networks are now allowed.' : 'IP restrictions enabled.');
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Failed to update setting.');
    }
  };

  const handleAdd = async () => {
    setErr(''); setSuccess('');
    if (!label.trim() || !ipAddr.trim()) {
      setErr('Both a label and an IP address are required.');
      return;
    }
    try {
      await addIp.mutateAsync({ label: label.trim(), ip_address: ipAddr.trim() });
      setLabel(''); setIpAddr('');
      setSuccess('IP address added successfully.');
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Failed to add IP address.');
    }
  };

  const handleDelete = async (id: string) => {
    setErr(''); setSuccess('');
    try {
      await deleteIp.mutateAsync(id);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Failed to remove IP address.');
    }
  };

  return (
    <Layout>
      <Header
        title="IP Restrictions"
        subtitle="Control which networks employees can check in and out from"
      />

      <div className="p-6 space-y-6 max-w-2xl">

        {err     && <Alert type="error"   message={err} />}
        {success && <Alert type="success" message={success} />}

        {/* Master toggle */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Enable IP Restrictions</p>
              <p className="text-xs text-gray-500 mt-0.5">
                When enabled, employees can only check in / check out from the networks listed below.
                When disabled, any network is allowed.
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={settingsLoading || updateSettings.isPending}
              className="shrink-0 flex items-center gap-2 focus:outline-none disabled:opacity-50"
              aria-label={enabled ? 'Disable IP restrictions' : 'Enable IP restrictions'}
            >
              {enabled
                ? <ToggleRight size={36} className="text-indigo-600" />
                : <ToggleLeft  size={36} className="text-gray-300" />
              }
            </button>
          </div>

          {!enabled && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <Shield size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                IP restrictions are currently <strong>disabled</strong>. Employees can check in from any network.
                Enable the toggle above to enforce the allowed-network list.
              </p>
            </div>
          )}
        </Card>

        {/* Info banner */}
        <div className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3.5">
          <Info size={16} className="text-indigo-500 mt-0.5 shrink-0" />
          <div className="text-sm text-indigo-700 space-y-1">
            <p className="font-semibold">How it works</p>
            <ul className="text-xs text-indigo-600 space-y-0.5 list-disc list-inside">
              <li>When restrictions are enabled and at least one IP is configured, check-in / check-out is only allowed from those addresses.</li>
              <li>Employees outside these networks can only use the <strong>WFH check-in</strong>, which notifies their manager.</li>
              <li>Supports single IPs (<code>203.0.113.5</code>) and CIDR ranges (<code>192.168.1.0/24</code>).</li>
              <li>If restrictions are enabled but no IPs are added, all networks remain allowed.</li>
            </ul>
          </div>
        </div>

        {/* Add form */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Plus size={15} className="text-indigo-500" /> Add Allowed IP / Range
          </h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 block mb-1">Label</label>
              <input
                className="form-input w-full"
                placeholder="e.g. Head Office, Branch 2"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 block mb-1">IP Address / CIDR</label>
              <input
                className="form-input w-full font-mono"
                placeholder="203.0.113.5 or 192.168.0.0/24"
                value={ipAddr}
                onChange={e => setIpAddr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="flex items-end">
              <Button
                icon={<Plus size={14} />}
                loading={addIp.isPending}
                disabled={!label.trim() || !ipAddr.trim()}
                onClick={handleAdd}
              >
                Add
              </Button>
            </div>
          </div>
        </Card>

        {/* Configured IPs */}
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Wifi size={15} className="text-gray-400" /> Configured Networks
            </h3>
            <span className="text-xs text-gray-400">{(ips as any[]).length} address{(ips as any[]).length !== 1 ? 'es' : ''}</span>
          </div>

          {isLoading ? (
            <div className="p-4"><PageSkeleton /></div>
          ) : (ips as any[]).length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
              <Shield size={28} className="opacity-30" />
              <p className="text-sm">No IP restrictions configured</p>
              <p className="text-xs text-gray-400">Add networks above to restrict check-in to specific locations.</p>
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
                      onClick={() => handleDelete(id)}
                      disabled={deleteIp.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

      </div>
    </Layout>
  );
};

export default IpConfigPage;
