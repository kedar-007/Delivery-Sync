import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Users, FolderKanban, TrendingUp, MoreVertical, ChevronDown, ChevronRight, Eye, Shield } from 'lucide-react';
import { superAdminApi } from '../lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  userCount: number;
  createdAt: string;
}

interface Stats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeProjects: number;
}

const StatusPill = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    SUSPENDED: 'bg-amber-100 text-amber-700 border-amber-200',
    CANCELLED: 'bg-red-100 text-red-700 border-red-200',
    INVITED: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {status}
    </span>
  );
};

const StatBox = ({ label, value, sub, icon, color }: { label: string; value: number; sub?: string; icon: React.ReactNode; color: string }) => (
  <div className={`relative overflow-hidden rounded-2xl p-6 ${color}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium opacity-70">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
      <div className="opacity-20 scale-150">{icon}</div>
    </div>
  </div>
);

const SuperAdminPage = () => {
  const qc = useQueryClient();
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => superAdminApi.getStats().then(d => d.stats as Stats),
  });

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['sa-tenants'],
    queryFn: () => superAdminApi.listTenants().then(d => d.tenants as Tenant[]),
  });

  const { data: tenantUsers } = useQuery({
    queryKey: ['sa-tenant-users', expandedTenant],
    queryFn: () => superAdminApi.listTenantUsers(expandedTenant!).then(d => d.users),
    enabled: !!expandedTenant,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      superAdminApi.updateTenantStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); qc.invalidateQueries({ queryKey: ['sa-stats'] }); },
  });

  const planColors: Record<string, string> = {
    STARTER: 'bg-gray-100 text-gray-600',
    PRO: 'bg-blue-100 text-blue-700',
    ENTERPRISE: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top nav */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Shield size={16} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Super Admin</h1>
            <p className="text-xs text-gray-400">Delivery Sync — Platform Console</p>
          </div>
        </div>
        <a href="/#/login" className="text-xs text-gray-400 hover:text-white transition-colors">← Back to app</a>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Stats */}
        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : statsData && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatBox label="Total Tenants" value={statsData.totalTenants} sub={`${statsData.activeTenants} active`} icon={<Building2 size={32} />} color="bg-gradient-to-br from-violet-900/60 to-violet-800/40 text-violet-100 border border-violet-700/30" />
            <StatBox label="Total Users" value={statsData.totalUsers} sub={`${statsData.activeUsers} active`} icon={<Users size={32} />} color="bg-gradient-to-br from-blue-900/60 to-blue-800/40 text-blue-100 border border-blue-700/30" />
            <StatBox label="Total Projects" value={statsData.totalProjects} sub={`${statsData.activeProjects} active`} icon={<FolderKanban size={32} />} color="bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 text-emerald-100 border border-emerald-700/30" />
          </div>
        )}

        {/* Tenants table */}
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Building2 size={16} className="text-violet-400" /> Tenants
            </h2>
            <span className="text-xs text-gray-400">{tenantsData?.length ?? '…'} total</span>
          </div>

          {tenantsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />)}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {(tenantsData ?? []).map((tenant) => (
                <div key={tenant.id}>
                  <div className="px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                      className="text-gray-400 hover:text-white transition-colors shrink-0"
                    >
                      {expandedTenant === tenant.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + slug */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{tenant.name}</p>
                      <p className="text-xs text-gray-400">/{tenant.slug}</p>
                    </div>

                    {/* Plan */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${planColors[tenant.plan] || 'bg-gray-700 text-gray-300'}`}>
                      {tenant.plan}
                    </span>

                    {/* Status */}
                    <StatusPill status={tenant.status} />

                    {/* User count */}
                    <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                      <Users size={12} /> {tenant.userCount}
                    </div>

                    {/* Created */}
                    <p className="text-xs text-gray-500 shrink-0 hidden md:block">
                      {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : '—'}
                    </p>

                    {/* Actions */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setActionMenu(actionMenu === tenant.id ? null : tenant.id)}
                        className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {actionMenu === tenant.id && (
                        <div className="absolute right-0 top-8 z-10 w-44 bg-gray-800 rounded-xl border border-white/10 shadow-xl py-1">
                          {tenant.status === 'ACTIVE' ? (
                            <button onClick={() => { updateStatus.mutate({ id: tenant.id, status: 'SUSPENDED' }); setActionMenu(null); }}
                              className="w-full px-4 py-2 text-xs text-left text-amber-400 hover:bg-white/5 transition-colors">
                              Suspend Tenant
                            </button>
                          ) : (
                            <button onClick={() => { updateStatus.mutate({ id: tenant.id, status: 'ACTIVE' }); setActionMenu(null); }}
                              className="w-full px-4 py-2 text-xs text-left text-emerald-400 hover:bg-white/5 transition-colors">
                              Activate Tenant
                            </button>
                          )}
                          <button onClick={() => { updateStatus.mutate({ id: tenant.id, status: 'CANCELLED' }); setActionMenu(null); }}
                            className="w-full px-4 py-2 text-xs text-left text-red-400 hover:bg-white/5 transition-colors">
                            Cancel Tenant
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded: users list */}
                  {expandedTenant === tenant.id && (
                    <div className="px-6 pb-4 bg-black/20">
                      <p className="text-xs font-medium text-gray-400 mb-3 pt-3">Users in this tenant</p>
                      {!tenantUsers ? (
                        <div className="h-8 rounded bg-white/5 animate-pulse" />
                      ) : tenantUsers.length === 0 ? (
                        <p className="text-xs text-gray-500">No users found.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {(tenantUsers as any[]).map((u: any) => (
                            <div key={u.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-xs font-bold shrink-0">
                                {(u.name || u.email || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-white truncate">{u.name || u.email}</p>
                                <p className="text-xs text-gray-400">{u.role} · <StatusPill status={u.status} /></p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close action menu */}
      {actionMenu && (
        <div className="fixed inset-0 z-0" onClick={() => setActionMenu(null)} />
      )}
    </div>
  );
};

export default SuperAdminPage;
