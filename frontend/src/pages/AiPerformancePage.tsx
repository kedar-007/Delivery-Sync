/**
 * AiPerformancePage — full-page AI performance analysis.
 *
 * Modes (permission-gated):
 *  - 'team'        — analyse one team. AI_PERFORMANCE users see only their own teams;
 *                    AI_TEAM_ANALYSIS users see every team.
 *  - 'individual'  — analyse one person. Non-admins are locked to themselves; admins
 *                    can pick anyone via an avatar dropdown.
 *  - 'compare'     — admin-only: analyse 2+ teams side-by-side (parallel queries).
 *  - 'all-teams'   — admin-only: org-wide view.
 *
 * No mode is selected on page load — the page waits for the user to click into a
 * scope and pick a target before firing any analysis. This avoids surprising the
 * user with whichever team/role happens to be first.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Users, User, ChevronDown, RefreshCw, Zap,
  AlertCircle, BarChart3, Star, GitCompareArrows, Check,
} from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import UserAvatar from '../components/ui/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { useTeams } from '../hooks/useTeams';
import { useUsers, type TenantUser } from '../hooks/useUsers';
import { useAiHolisticPerformance } from '../hooks/useAiInsights';
import { aiApi } from '../lib/api';
import {
  TeamOverview, MemberCard, AnalysisLoading,
  type AnalysisResult, type TeamAggregate,
} from '../components/ui/PerformanceModal';

const RANGE_DAYS = [7, 30, 90] as const;
type Mode = 'all-teams' | 'team' | 'individual' | 'compare';

type TeamLite = {
  id: string; name: string;
  members?: Array<{ id: string }>;
  leadUserId?: string | null;
  memberCount?: number;
};

export default function AiPerformancePage() {
  const { user } = useAuth();
  const { t } = useI18n();

  // Auth flicker guard. On the first render, `user.permissions` may not have
  // arrived yet — without this, `hasPermission` would fall back to the
  // TENANT_ADMIN bypass and briefly show the Org-Wide buttons before snapping
  // back when the array lands. SUPER_ADMIN bypasses the gate (no perms array
  // is ever computed for them at the tenant level).
  const permsReady = user?.role === 'SUPER_ADMIN' || Array.isArray(user?.permissions);

  // Three-tier permission model. Each is granted independently in the modal,
  // but higher tiers imply the lower ones (org-wide implies team implies self).
  //   canOrgWide → any team, org view, compare teams.
  //   canTeam    → teams the user is a member/lead of (+ self).
  //   canSelf    → own data only.
  const canOrgWide = permsReady && hasPermission(user, PERMISSIONS.AI_TEAM_ANALYSIS);
  const canTeam    = canOrgWide || (permsReady && hasPermission(user, PERMISSIONS.AI_PERFORMANCE));
  const canSelf    = canTeam     || (permsReady && hasPermission(user, PERMISSIONS.AI_PERFORMANCE_SELF));
  // Legacy alias retained so the rest of the file (referencing `isAdmin`) keeps working.
  const isAdmin = canOrgWide;

  const { data: usersData } = useUsers();
  const users = useMemo(() => (usersData ?? []) as TenantUser[], [usersData]);
  const { data: teamsData } = useTeams();
  const allTeams = useMemo(() => (teamsData ?? []) as TeamLite[], [teamsData]);

  const myUserId = String(user?.id ?? '');

  const visibleTeams = useMemo(() => isAdmin
    ? allTeams
    : allTeams.filter((t) =>
        (t.members ?? []).some((m) => String(m.id) === myUserId) ||
        String(t.leadUserId ?? '') === myUserId
      ), [isAdmin, allTeams, myUserId]);

  // Scope state. `mode` is null until the user picks one.
  const [mode, setMode]                       = useState<Mode | null>(null);
  const [selectedTeamId, setSelectedTeamId]   = useState<string>('');
  const [selectedUserId, setSelectedUserId]   = useState<string>('');
  const [compareTeamIds, setCompareTeamIds]   = useState<string[]>([]);
  const [days, setDays]                       = useState<7 | 30 | 90>(7);

  const analyze = useAiHolisticPerformance();

  // Who can the current viewer pick in Individual mode?
  //   org-wide  → anyone in the tenant
  //   team-tier → users who share a team with them (team peers + self)
  //   self-only → just themselves (no picker shown)
  const pickableUsers = useMemo(() => {
    if (canOrgWide) return users;
    if (!canTeam)   return users.filter((u) => u.id === user?.id);
    // team-tier: union of members across teams the user belongs to
    const allowed = new Set<string>([myUserId]);
    visibleTeams.forEach((t) => {
      (t.members ?? []).forEach((m) => allowed.add(String(m.id)));
      if (t.leadUserId) allowed.add(String(t.leadUserId));
    });
    return users.filter((u) => allowed.has(String(u.id)));
  }, [users, visibleTeams, canOrgWide, canTeam, myUserId, user?.id]);

  // Auto-select self the first time the user enters Individual mode so the
  // page doesn't get stuck on an empty-state for non-admins.
  useEffect(() => {
    if (mode === 'individual' && !selectedUserId && user?.id) {
      setSelectedUserId(String(user.id));
    }
  }, [mode, selectedUserId, user?.id]);

  // Guard: if the user's permissions don't allow the current `mode` (e.g. their
  // grants changed mid-session, or they bookmarked a state they no longer have
  // access to), reset to the welcome screen. This is the second line of defence
  // on top of the per-button gating below.
  useEffect(() => {
    if (!mode) return;
    const allowed =
      (mode === 'all-teams' && canOrgWide) ||
      (mode === 'compare'   && canOrgWide) ||
      (mode === 'team'      && canTeam) ||
      (mode === 'individual' && canSelf);
    if (!allowed) {
      setMode(null);
      setSelectedTeamId('');
      setSelectedUserId('');
      setCompareTeamIds([]);
    }
  }, [mode, canOrgWide, canTeam, canSelf]);

  // Effective params for the (single) mutation-based analysis.
  // For 'compare' we run multiple useQueries instead — see below.
  const effectiveTargetId = mode === 'individual'
    ? (selectedUserId || user?.id || undefined)
    : undefined;
  const effectiveTeamId = mode === 'team' ? (selectedTeamId || undefined) : undefined;

  // Only the three "single-scope" modes use the mutation. 'compare' uses useQueries.
  const singleScope = mode === 'team' || mode === 'individual' || mode === 'all-teams';

  // Whether we have enough info to fire (avoids 400s and flicker).
  const hasUsableScope =
    (mode === 'all-teams' && canOrgWide) ||
    (mode === 'team'      && !!effectiveTeamId) ||
    (mode === 'individual' && !!effectiveTargetId);

  const triggerAnalysis = (forceRefresh = false) => {
    if (!singleScope || !hasUsableScope) return;
    analyze.reset();
    analyze.mutate({
      targetUserId: effectiveTargetId,
      teamId:       effectiveTeamId,
      days,
      forceRefresh,
    });
  };

  // Auto-fire ONLY when scope is fully resolved. No "default mode" anymore.
  useEffect(() => {
    if (singleScope && hasUsableScope) triggerAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, effectiveTargetId, effectiveTeamId, mode]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: AnalysisResult | null = singleScope ? ((analyze.data as any)?.data ?? analyze.data ?? null) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromCache: boolean = !!(analyze.data as any)?.meta?.cached;

  // ── Compare-Teams fan-out ───────────────────────────────────────────────
  // Run one parallel query per selected team. Each is cached server-side under
  // its own key, so re-selecting the same teams later is near-instant.
  const compareQueries = useQueries({
    queries: (mode === 'compare' ? compareTeamIds : []).map((teamId) => ({
      queryKey: ['ai-perf-compare', teamId, days],
      queryFn:  () => aiApi.holisticPerformance({ teamId, days }),
      enabled:  mode === 'compare' && compareTeamIds.length >= 2,
      staleTime: 60 * 1000,
    })),
  });
  const compareLoading = compareQueries.some((q) => q.isLoading);
  const compareErr     = compareQueries.find((q) => q.isError)?.error as Error | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compareData    = compareQueries.map((q) => ((q.data as any)?.data ?? q.data) as AnalysisResult | undefined);

  // Range labels — computed inside component so t() is available
  const rangeLabels: Record<7 | 30 | 90, string> = {
    7:  t('common.thisWeek'),
    30: t('common.thisMonth'),
    90: t('common.lastWeek'), // closest available key for "Quarterly"
  };

  // Display name for header + loader subject
  const selectedTeamName = visibleTeams.find((t) => t.id === selectedTeamId)?.name;
  const selectedUserObj  = users.find((u) => u.id === selectedUserId);
  const selfUser         = users.find((u) => u.id === user?.id);
  const subjectName =
    mode === 'all-teams' ? t('nav.aiInsights') :
    mode === 'team'      ? (selectedTeamName ?? t('teams.title')) :
    mode === 'compare'   ? `${compareTeamIds.length} ${t('teams.title')}` :
    mode === 'individual'
      ? (isAdmin
          ? (selectedUserObj?.name ?? t('directory.title'))
          : (user?.name ?? t('ai.performance.title')))
      : t('ai.performance.title');
  const subjectAvatar =
    mode === 'individual'
      ? (isAdmin ? selectedUserObj?.avatarUrl : selfUser?.avatarUrl)
      : undefined;

  // Until effective permissions arrive, render a skeleton instead of the
  // scope picker. Prevents the "Org-Wide flashes then disappears" flicker for
  // TENANT_ADMIN users whose org-role narrows their AI access.
  if (!permsReady) {
    return (
      <Layout>
        <Header
          title={t('ai.performance.title')}
          subtitle={t('ai.performance.analyzing')}
        />
        <div className="p-6 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-12 shadow-sm">
            <div className="space-y-3 max-w-md mx-auto">
              <div className="h-3 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header
        title={t('ai.performance.title')}
        subtitle={t('ai.performance.analyzing')}
      />

      <div className="p-6 space-y-5">
        {/* ── Scope picker strip ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 pr-3 border-r border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Sparkles size={17} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none">{t('ai.title')}</p>
                <p className="text-sm font-bold text-gray-900 leading-tight">
                  {mode ? subjectName : t('common.noData')}
                </p>
                {/* Access summary — what scopes the current user actually has.
                    Helpful when admin granted Self+Team but the user still sees
                    Org-Wide: it usually means an inherited role still grants it. */}
                <div className="flex gap-1 mt-1.5">
                  {canSelf    && <AccessChip label="Self"     color="violet" />}
                  {canTeam    && <AccessChip label="My Team"  color="amber" />}
                  {canOrgWide && <AccessChip label="Org-Wide" color="red" />}
                </div>
              </div>
            </div>

            {/* Mode toggle — gated per the three-tier permission model */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
              {canOrgWide && (
                <ModeBtn label={t('nav.aiInsights')} icon={<Sparkles size={13} />} active={mode === 'all-teams'} onClick={() => setMode('all-teams')} />
              )}
              {canTeam && (
                <ModeBtn label={t('teams.title')} icon={<Users size={13} />} active={mode === 'team'}
                  disabled={!canOrgWide && visibleTeams.length === 0}
                  onClick={() => setMode('team')} />
              )}
              {canSelf && (
                <ModeBtn label={t('directory.title')} icon={<User size={13} />} active={mode === 'individual'} onClick={() => setMode('individual')} />
              )}
              {canOrgWide && (
                <ModeBtn label={t('reports.types.team')} icon={<GitCompareArrows size={13} />} active={mode === 'compare'} onClick={() => setMode('compare')} />
              )}
            </div>

            {/* Mode-specific picker */}
            {mode === 'team' && (
              <TeamSelect
                value={selectedTeamId}
                onChange={setSelectedTeamId}
                teams={visibleTeams}
                placeholder={isAdmin ? t('common.all') : t('common.filter')}
              />
            )}
            {mode === 'individual' && pickableUsers.length > 1 && (
              <UserPicker
                users={pickableUsers}
                value={selectedUserId}
                onChange={setSelectedUserId}
              />
            )}
            {mode === 'compare' && isAdmin && (
              <CompareTeamsPicker
                teams={allTeams}
                selected={compareTeamIds}
                onChange={setCompareTeamIds}
              />
            )}

            <div className="ml-auto flex items-center gap-2">
              {fromCache && !analyze.isPending && mode !== 'compare' && (
                <span
                  title={t('common.success')}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"
                >
                  <Zap size={10} /> {t('common.success')}
                </span>
              )}
              <button
                onClick={() => {
                  if (singleScope) triggerAnalysis(true);
                  else compareQueries.forEach((q) => q.refetch());
                }}
                disabled={analyze.isPending || compareLoading}
                title={t('common.refresh')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-all"
              >
                <RefreshCw size={12} className={(analyze.isPending || compareLoading) ? 'animate-spin' : ''} />
              </button>
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                {(RANGE_DAYS).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={[
                      'px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                      days === d
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {rangeLabels[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Welcome / Empty states ───────────────────────────────────────── */}
        {!mode && (
          <WelcomeCard
            canSelf={canSelf}
            canTeam={canTeam}
            canOrgWide={canOrgWide}
            hasTeams={visibleTeams.length > 0}
            onPick={(m) => setMode(m as Mode)}
          />
        )}

        {mode === 'team' && !effectiveTeamId && !analyze.isPending && (
          <EmptyCard
            icon={<Users size={28} className="text-indigo-400" />}
            title={visibleTeams.length === 0 ? t('teams.noTeams') : t('common.filter')}
            body={visibleTeams.length === 0
              ? (isAdmin ? t('errors.notFound') : t('common.noData'))
              : t('common.searchPlaceholder')}
          />
        )}


        {mode === 'compare' && compareTeamIds.length < 2 && !compareLoading && (
          <EmptyCard
            icon={<GitCompareArrows size={28} className="text-indigo-400" />}
            title={t('common.noData')}
            body={t('common.noResults')}
          />
        )}

        {/* ── Loading states ──────────────────────────────────────────────── */}
        {singleScope && analyze.isPending && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <AnalysisLoading subjectName={subjectName} subjectAvatarUrl={subjectAvatar} />
          </div>
        )}

        {mode === 'compare' && compareLoading && compareTeamIds.length >= 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <AnalysisLoading subjectName={`${compareTeamIds.length} ${t('teams.title')}`} />
          </div>
        )}

        {/* ── Errors ──────────────────────────────────────────────────────── */}
        {analyze.isError && !analyze.isPending && singleScope && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">
              {(analyze.error as Error)?.message || t('errors.loadFailed')}
            </p>
          </div>
        )}
        {mode === 'compare' && compareErr && !compareLoading && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{compareErr.message}</p>
          </div>
        )}

        {/* ── Single-scope result ─────────────────────────────────────────── */}
        {singleScope && result && !analyze.isPending && result.members.length > 0 && (
          <div className="space-y-5">
            <KpiStrip result={result} days={days} />

            {result.members.length > 1 && result.teamAggregate && (
              <TeamOverview
                summary={result.teamSummary}
                morale={result.teamMorale}
                topPerformer={result.topPerformer}
                agg={result.teamAggregate}
              />
            )}

            {(result.alerts ?? []).length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
                <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle size={11} /> {t('common.error')}
                </p>
                {result.alerts!.map((a, i) => (
                  <p key={i} className="text-xs text-red-700">{a}</p>
                ))}
              </div>
            )}

            <div>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                  {result.members.length === 1 ? t('common.view') : `${t('teams.members')} (${result.members.length})`}
                </span>
                <span className="text-[10px] text-gray-400">{t('common.showMore')}</span>
              </div>
              <div className="space-y-3">
                {result.members.map((m, i) => (
                  <MemberCard
                    key={m.name + i}
                    member={m}
                    defaultOpen={result.members.length === 1}
                    teamMedians={result.teamMedians}
                  />
                ))}
              </div>
            </div>

            <p className="text-[10px] text-gray-400 text-center pt-1">
              {t('ai.noInsights')}
            </p>
          </div>
        )}

        {singleScope && result && !analyze.isPending && result.members.length === 0 && (
          <EmptyCard
            icon={<BarChart3 size={28} className="text-gray-400" />}
            title={t('common.noData')}
            body={t('common.noResults')}
          />
        )}

        {/* ── Compare-Teams result ────────────────────────────────────────── */}
        {mode === 'compare' && !compareLoading && compareTeamIds.length >= 2 && (
          <TeamComparison
            teamIds={compareTeamIds}
            teams={allTeams}
            results={compareData}
            days={days}
          />
        )}
      </div>
    </Layout>
  );
}

// ─── Welcome (no mode selected) ───────────────────────────────────────────────

function WelcomeCard({ canSelf, canTeam, canOrgWide, hasTeams, onPick }: {
  canSelf: boolean; canTeam: boolean; canOrgWide: boolean; hasTeams: boolean;
  onPick: (m: 'team' | 'individual' | 'compare' | 'all-teams') => void;
}) {
  const { t } = useI18n();
  const tiles = [
    canTeam && hasTeams && {
      key: 'team' as const,
      icon: <Users size={22} className="text-indigo-500" />,
      title: t('teams.title'),
      body: t('ai.tabs.health'),
      cta: t('common.filter'),
    },
    canSelf && {
      key: 'individual' as const,
      icon: <User size={22} className="text-violet-500" />,
      title: canOrgWide ? t('directory.title') : t('ai.productivity.title'),
      body: canOrgWide
        ? t('ai.productivity.subtitle')
        : t('ai.healthCheck.subtitle'),
      cta: canOrgWide ? t('common.view') : t('ai.analyze'),
    },
    canOrgWide && {
      key: 'compare' as const,
      icon: <GitCompareArrows size={22} className="text-emerald-500" />,
      title: t('reports.types.team'),
      body: t('ai.tabs.productivity'),
      cta: t('reports.types.team'),
    },
    canOrgWide && {
      key: 'all-teams' as const,
      icon: <Sparkles size={22} className="text-pink-500" />,
      title: t('nav.aiInsights'),
      body: t('ai.subtitle'),
      cta: t('common.viewAll'),
    },
  ].filter(Boolean) as Array<{
    key: 'team' | 'individual' | 'compare' | 'all-teams';
    icon: React.ReactNode; title: string; body: string; cta: string;
  }>;

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl p-6 border border-indigo-100">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles size={22} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{t('ai.performance.title')}</p>
          <p className="text-xs text-gray-500">{t('ai.performance.analyzing')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => onPick(t.key)}
            className="text-left bg-white rounded-2xl p-4 border border-white hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              {t.icon}
              <span className="text-sm font-bold text-gray-900">{t.title}</span>
            </div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">{t.body}</p>
            <span className="text-xs font-semibold text-indigo-600 inline-flex items-center gap-1">
              {t.cta} <ChevronDown size={12} className="-rotate-90" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KpiStrip({ result, days }: { result: AnalysisResult; days: number }) {
  const { t } = useI18n();
  const agg     = result.teamAggregate;
  const single  = result.members[0]?.metrics;
  const score   = agg?.avgScore ?? result.members[0]?.score ?? 0;
  const tasks   = agg?.totals.tasksDone   ?? single?.tasksDone   ?? 0;
  const hours   = agg?.totals.hoursLogged ?? single?.hoursLogged ?? 0;
  const checks  = agg?.totals.standupCount ?? single?.standupCount ?? 0;
  const block   = agg?.totals.blockersRaised ?? single?.blockersRaised ?? 0;
  const morale  = result.teamMorale;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Kpi label={t('common.percentage')}   value={`${score}/100`} accent="indigo"  icon={<Star size={14} />} />
      <Kpi label={t('tasks.title')}          value={String(tasks)} accent="emerald" />
      <Kpi label={t('timeTracking.totalHours')} value={`${hours}h`} accent="blue" />
      <Kpi label={t('standup.title')}        value={String(checks)} accent="violet" />
      <Kpi label={morale ? t('common.status') : t('blockers.title')}
           value={morale ?? String(block)}
           accent={morale === 'High' ? 'emerald' : morale === 'Low' ? 'red' : 'amber'} />
      <Kpi label={t('common.days')} value={`${days} ${t('common.days')}`} accent="gray" />
    </div>
  );
}

// ─── Team Comparison view ────────────────────────────────────────────────────

function TeamComparison({ teamIds, teams, results, days }: {
  teamIds: string[];
  teams: TeamLite[];
  results: (AnalysisResult | undefined)[];
  days: number;
}) {
  const { t } = useI18n();
  // Stitch team-id to its aggregate. Skip any team that failed to load.
  const cards = teamIds.map((id, i) => ({
    id,
    name: teams.find((t) => t.id === id)?.name ?? `${t('teams.title')} ${i + 1}`,
    result: results[i],
  })).filter((c) => c.result && c.result.teamAggregate);

  if (cards.length < 2) {
    return (
      <EmptyCard
        icon={<GitCompareArrows size={28} className="text-amber-400" />}
        title={t('common.noData')}
        body={t('common.noResults')}
      />
    );
  }

  const SERIES_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];

  // Build radar series — each axis is a factor, each series is a team.
  const allFactorNames = Array.from(new Set(
    cards.flatMap((c) => (c.result!.teamAggregate as TeamAggregate).factorAverages.map((f) => f.name))
  ));
  const radarData = allFactorNames.map((name) => {
    const row: Record<string, string | number> = { factor: shortFactor(name) };
    cards.forEach((c) => {
      const factor = (c.result!.teamAggregate as TeamAggregate).factorAverages.find((f) => f.name === name);
      row[c.name] = factor?.score ?? 0;
    });
    return row;
  });

  // Build bar chart series for the 4 headline metrics.
  const barMetrics = [
    { key: 'avgScore',       label: t('common.average')        },
    { key: 'tasksDone',      label: t('tasks.title')            },
    { key: 'hoursLogged',    label: t('timeTracking.totalHours')},
    { key: 'standupCount',   label: t('standup.title')          },
  ] as const;
  const barData = barMetrics.map((m) => {
    const row: Record<string, string | number> = { metric: m.label };
    cards.forEach((c) => {
      const agg = c.result!.teamAggregate as TeamAggregate;
      const v = m.key === 'avgScore' ? agg.avgScore : (agg.totals as Record<string, number>)[m.key] ?? 0;
      row[c.name] = v;
    });
    return row;
  });

  return (
    <div className="space-y-5">
      {/* Per-team summary cards */}
      <div className={`grid gap-3 ${cards.length === 2 ? 'sm:grid-cols-2' : cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {cards.map((c, i) => {
          const agg = c.result!.teamAggregate as TeamAggregate;
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          return (
            <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-sm font-bold text-gray-900 truncate">{c.name}</span>
                <span className="text-[10px] font-semibold ml-auto px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {agg.memberCount} {t('teams.members')}
                </span>
              </div>
              <div className="text-3xl font-bold tabular-nums" style={{ color }}>
                {agg.avgScore}<span className="text-sm text-gray-400">/100</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                <div className="flex justify-between"><span className="text-gray-500">{t('tasks.title')}</span><span className="font-semibold">{agg.totals.tasksDone}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('timeTracking.totalHours')}</span><span className="font-semibold">{agg.totals.hoursLogged}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('timeTracking.billable')}</span>
                  <span className="font-semibold text-emerald-600">{agg.totals.billableHours ?? 0}h</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('common.percentage')}</span>
                  <span className="font-semibold text-emerald-600">{agg.totals.billableUtilization ?? 0}%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('standup.title')}</span><span className="font-semibold">{agg.totals.standupCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('blockers.title')}</span><span className="font-semibold">{agg.totals.blockersRaised}</span></div>
              </div>
              {/* Inline billable progress bar */}
              {(agg.totals.hoursLogged ?? 0) > 0 && (
                <div className="mt-3">
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-emerald-500"
                      style={{ width: `${agg.totals.billableUtilization ?? 0}%` }}
                    />
                    <div
                      className="bg-gradient-to-r from-amber-300 to-amber-400"
                      style={{ width: `${100 - (agg.totals.billableUtilization ?? 0)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-gray-400 uppercase tracking-wider">
                    <span>{t('timeTracking.billable')}</span><span>{t('timeTracking.nonBillable')}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Overlaid radar */}
        <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{t('reports.aiInsights.title')}</span>
            <span className="text-[10px] text-gray-400">{t('reports.types.team')}</span>
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="78%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 9 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} iconType="circle" />
                {cards.map((c, i) => (
                  <Radar
                    key={c.id}
                    name={c.name}
                    dataKey={c.name}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grouped bar chart */}
        <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{t('reports.teamActivity.title')}</span>
            <span className="text-[10px] text-gray-400">{t('common.sort')}</span>
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart data={barData} margin={{ top: 8, right: 10, left: -16, bottom: 4 }}>
                <CartesianGrid stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} iconType="circle" />
                {cards.map((c, i) => (
                  <Bar key={c.id} dataKey={c.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[6, 6, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Time Allocation (billable vs non-billable per team) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{t('timeTracking.title')}</span>
            <span className="text-[10px] text-gray-400">{t('timeTracking.billable')} vs {t('timeTracking.nonBillable')}</span>
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart
                data={cards.map((c) => ({
                  team:        c.name,
                  Billable:    c.result!.teamAggregate!.totals.billableHours    ?? 0,
                  NonBillable: c.result!.teamAggregate!.totals.nonBillableHours ?? 0,
                }))}
                layout="vertical"
                margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
                barCategoryGap={16}
              >
                <CartesianGrid stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="team" width={110} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} iconType="circle" />
                <Bar dataKey="Billable"     stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="NonBillable"  stackId="a" fill="#f59e0b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Utilization comparison */}
        <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{t('timeTracking.billable')}</span>
            <span className="text-[10px] text-gray-400">{t('common.percentage')}</span>
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart
                data={cards.map((c) => ({
                  team:        c.name,
                  Utilization: c.result!.teamAggregate!.totals.billableUtilization ?? 0,
                }))}
                margin={{ top: 16, right: 12, left: -16, bottom: 4 }}
              >
                <CartesianGrid stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="team" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, t('timeTracking.billable')]} />
                <Bar dataKey="Utilization" radius={[8, 8, 0, 0]}>
                  {cards.map((_c, i) => (
                    <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Workload Balance (per-member hours within each team) ─────────── */}
      {cards.some((c) => (c.result?.teamAggregate?.memberHours?.length ?? 0) > 0) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{t('dashboard.attendance.title')}</span>
            <span className="text-[10px] text-gray-400">{t('common.average')}</span>
          </div>
          <div className={`grid gap-3 p-1 ${cards.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {cards.map((c, i) => {
              const rows  = c.result!.teamAggregate!.memberHours ?? [];
              const color = SERIES_COLORS[i % SERIES_COLORS.length];
              if (rows.length === 0) return (
                <div key={c.id} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">{c.name}</p>
                  <p className="text-[10px] text-gray-400">{t('common.noData')}</p>
                </div>
              );
              const max = Math.max(...rows.map((r) => r.hours), 1);
              return (
                <div key={c.id} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <p className="text-xs font-semibold text-gray-700 truncate">{c.name}</p>
                  </div>
                  <div className="space-y-1">
                    {rows.slice(0, 8).map((r) => {
                      const pct = (r.hours / max) * 100;
                      const billablePct = r.hours > 0 ? (r.billable / r.hours) * 100 : 0;
                      return (
                        <div key={r.name} className="flex items-center gap-2 text-[10px]">
                          <span className="w-20 truncate text-gray-700">{r.name}</span>
                          <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden relative">
                            <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${(pct * billablePct) / 100}%` }} />
                            <div className="absolute inset-y-0 bg-amber-300" style={{ left: `${(pct * billablePct) / 100}%`, width: `${pct - (pct * billablePct) / 100}%` }} />
                          </div>
                          <span className="w-10 text-right tabular-nums font-semibold text-gray-700">{r.hours}h</span>
                        </div>
                      );
                    })}
                    {rows.length > 8 && <p className="text-[10px] text-gray-400 mt-1">+{rows.length - 8} {t('common.moreItems')}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">
        {t('common.total')} {cards.length} {t('teams.title')} · {days} {t('common.days')}
      </p>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  fontSize: 11,
  padding: '6px 10px',
  boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
};

function shortFactor(name: string): string {
  if (!name) return '';
  if (name.length <= 10) return name;
  if (/task/i.test(name))    return 'Tasks';
  if (/time/i.test(name))    return 'Time';
  if (/attend/i.test(name))  return 'Attend.';
  if (/account/i.test(name)) return 'Account.';
  if (/engage/i.test(name))  return 'Engage.';
  return name.slice(0, 9) + '…';
}

// ─── Pickers ──────────────────────────────────────────────────────────────────

// Small chip for the "Access" indicator under the header.
const ACCESS_CHIP_STYLES = {
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  amber:  'bg-amber-50 text-amber-700 border-amber-100',
  red:    'bg-red-50 text-red-700 border-red-100',
} as const;
function AccessChip({ label, color }: { label: string; color: keyof typeof ACCESS_CHIP_STYLES }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${ACCESS_CHIP_STYLES[color]}`}>
      {label}
    </span>
  );
}

function ModeBtn({ label, icon, active, disabled, onClick }: {
  label: string; icon: React.ReactNode;
  active: boolean; disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
        active
          ? 'bg-white text-indigo-600 shadow-sm'
          : disabled
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-500 hover:text-gray-700',
      ].join(' ')}
    >
      {icon}{label}
    </button>
  );
}

function TeamSelect({ value, onChange, teams, placeholder }: {
  value: string; onChange: (v: string) => void;
  teams: TeamLite[]; placeholder: string;
}) {
  const { t } = useI18n();
  return (
    <div className="relative min-w-[220px]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 pr-8 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 appearance-none"
      >
        {teams.length === 0 ? (
          <option value="">{t('teams.noTeams')}</option>
        ) : (
          <>
            <option value="">{placeholder}</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{typeof t.memberCount === 'number' ? ` (${t.memberCount})` : ''}
              </option>
            ))}
          </>
        )}
      </select>
      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

// Avatar-rich user picker — replaces the plain <select> so seniors can identify
// people visually. Click to open, type to filter.
function UserPicker({ users, value, onChange }: {
  users: TenantUser[]; value: string; onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen]     = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = users.find((u) => u.id === value);
  const filtered = users.filter((u) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (u.name?.toLowerCase().includes(f)) ||
           (u.email?.toLowerCase().includes(f)) ||
           (u.role?.toLowerCase().includes(f));
  });

  return (
    <div className="relative min-w-[240px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-xs border border-gray-200 rounded-xl px-2 py-1.5 pr-8 bg-white text-gray-700 hover:border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {selected ? (
          <>
            <UserAvatar name={selected.name} avatarUrl={selected.avatarUrl} size="sm" />
            <span className="flex-1 text-left truncate">
              <span className="font-semibold">{selected.name}</span>
              <span className="text-gray-400 ml-1">· {selected.role}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-left text-gray-400">{t('directory.searchPlaceholder')}</span>
        )}
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-hidden bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('common.searchPlaceholder')}
            className="text-xs px-3 py-2 border-b border-gray-100 outline-none"
          />
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">{t('common.noResults')}</p>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u.id); setOpen(false); setFilter(''); }}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 transition-colors',
                    u.id === value ? 'bg-indigo-50' : '',
                  ].join(' ')}
                >
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{u.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{u.role}{u.email ? ` · ${u.email}` : ''}</p>
                  </div>
                  {u.id === value && <Check size={13} className="text-indigo-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-select team picker for compare mode (admin only).
function CompareTeamsPicker({ teams, selected, onChange }: {
  teams: TeamLite[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const MAX = 5;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < MAX) onChange([...selected, id]);
  };

  return (
    <div className="relative min-w-[240px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-xs border border-gray-200 rounded-xl px-3 py-2 pr-8 bg-white text-gray-700 hover:border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <GitCompareArrows size={13} className="text-indigo-500" />
        <span className="flex-1 text-left truncate">
          {selected.length === 0 ? t('common.filter') :
           selected.length === 1 ? `1 ${t('teams.title')}` :
           `${selected.length} ${t('teams.title')}`}
        </span>
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          {teams.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">{t('teams.noTeams')}</p>
          ) : (
            teams.map((t) => {
              const isOn   = selected.includes(t.id);
              const disabled = !isOn && selected.length >= MAX;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(t.id)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                    disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-indigo-50',
                    isOn ? 'bg-indigo-50' : '',
                  ].join(' ')}
                >
                  <span className={[
                    'w-4 h-4 rounded border flex items-center justify-center',
                    isOn ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300',
                  ].join(' ')}>
                    {isOn && <Check size={11} className="text-white" />}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{t.name}</span>
                  {typeof t.memberCount === 'number' && (
                    <span className="text-[10px] text-gray-400">{t.memberCount}</span>
                  )}
                </button>
              );
            })
          )}
          <p className="text-[10px] text-gray-400 text-center py-1.5 border-t border-gray-100">
            {t('common.filter')} 2–{MAX} {t('teams.title')}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── KPI tile + EmptyCard ─────────────────────────────────────────────────────

const KPI_STYLES = {
  indigo:  { grad: 'from-indigo-500 to-purple-500',  text: 'text-indigo-700',  bg: 'bg-indigo-50' },
  emerald: { grad: 'from-emerald-500 to-teal-500',   text: 'text-emerald-700', bg: 'bg-emerald-50' },
  blue:    { grad: 'from-blue-500 to-cyan-500',      text: 'text-blue-700',    bg: 'bg-blue-50' },
  violet:  { grad: 'from-violet-500 to-fuchsia-500', text: 'text-violet-700',  bg: 'bg-violet-50' },
  amber:   { grad: 'from-amber-500 to-orange-500',   text: 'text-amber-700',   bg: 'bg-amber-50' },
  red:     { grad: 'from-red-500 to-pink-500',       text: 'text-red-700',     bg: 'bg-red-50' },
  gray:    { grad: 'from-gray-400 to-slate-500',     text: 'text-gray-700',    bg: 'bg-gray-50' },
} as const;

function Kpi({ label, value, accent, icon }: {
  label: string; value: string;
  accent: keyof typeof KPI_STYLES;
  icon?: React.ReactNode;
}) {
  const s = KPI_STYLES[accent];
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-100 ${s.bg} p-3.5`}>
      <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${s.grad} opacity-15`} />
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {icon && <span className={s.text}>{icon}</span>}
        {label}
      </div>
      <p className={`text-xl font-bold mt-0.5 ${s.text}`}>{value}</p>
    </div>
  );
}

function EmptyCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center gap-3 text-center shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        <p className="text-xs text-gray-400 mt-1 max-w-md">{body}</p>
      </div>
    </div>
  );
}
