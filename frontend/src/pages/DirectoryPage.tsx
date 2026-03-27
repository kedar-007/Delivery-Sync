import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Search, Trophy, Plus, Award, User, Briefcase, Link as LinkIcon,
  ChevronRight, Edit2, X, Upload, FileText, Camera, BarChart2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import PerformanceModal from '../components/ui/PerformanceModal';
import {
  useMyProfile,
  useProfile,
  useDirectory,
  useUpdateMyProfile,
  useBadges,
  useBadgeLeaderboard,
  useCreateBadge,
  useAwardBadge,
  useUploadProfileFile,
} from '../hooks/useBadgeProfile';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirectoryProfile {
  user_id: string;
  name: string;
  designation?: string;
  department?: string;
  avatar_url?: string;
  skills?: string;
  bio?: string;
  experience?: ExperienceEntry[];
  social_links?: Record<string, string>;
  badges?: AwardedBadge[];
  manager_name?: string;
  manager_avatar_url?: string;
}

interface ExperienceEntry {
  company: string;
  role: string;
  from: string;
  to?: string;
}

interface AwardedBadge {
  id: string;
  badge_id: string;
  name: string;
  icon_emoji?: string;
  note?: string;
  awarded_at: string;
}

interface LeaderboardBadge {
  award_id: string;
  badge_id: string;
  name: string;
  logo_url?: string;
  icon_emoji?: string;
}

interface LeaderboardEntry {
  user_id: string;
  name: string;
  designation?: string;
  avatar_url?: string;
  badge_count: number;
  badges?: LeaderboardBadge[];
}

interface BadgeDefinition {
  id: string;
  name: string;
  description?: string;
  criteria?: string;
  icon_emoji?: string;
  logo_url?: string;
}

interface CreateBadgeForm {
  name: string;
  category: string;
  description: string;
  criteria: string;
  icon_emoji: string;
  logo_file?: File;
}

interface AwardBadgeForm {
  user_id: string;
  reason: string;
}

interface UpdateProfileForm {
  bio: string;
  designation: string;
  department: string;
  skills_raw: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseSkills = (raw?: string | unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as unknown[]).map(String);
  try {
    const parsed = JSON.parse(raw as string);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fall through
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const TABS = ['Directory', 'Leaderboard', 'Badges', 'My Profile'] as const;
type Tab = (typeof TABS)[number];

const ADMIN_ROLES = ['TENANT_ADMIN', 'PMO'];

// ─── Sub-components ───────────────────────────────────────────────────────────

const SkillTag = ({ skill }: { skill: string }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
    {skill}
  </span>
);

const RankBadge = ({ rank }: { rank: number }) => {
  const styles =
    rank === 1
      ? 'bg-yellow-400 text-yellow-900'
      : rank === 2
        ? 'bg-gray-300 text-gray-800'
        : rank === 3
          ? 'bg-orange-300 text-orange-900'
          : 'bg-gray-100 text-gray-600';
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${styles}`}
    >
      {rank}
    </div>
  );
};

// ─── Profile Detail Modal ─────────────────────────────────────────────────────

const ProfileDetailModal = ({
  userId,
  open,
  onClose,
  managerName,
  managerAvatarUrl,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
  managerName?: string;
  managerAvatarUrl?: string;
}) => {
  const { data } = useProfile(userId);
  const profile: DirectoryProfile | undefined = data?.data ?? data;

  if (!open) return null;

  const skills = parseSkills(profile?.skills);

  return (
    <Modal open={open} onClose={onClose} title="Employee Profile" size="xl">
      {!profile ? (
        <div className="py-10 flex justify-center">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            <UserAvatar
              name={profile.name}
              avatarUrl={profile.avatar_url}
              size="xl"
            />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{profile.name}</h2>
              {profile.designation && (
                <p className="text-sm text-gray-500">{profile.designation}</p>
              )}
              {profile.department && (
                <Badge variant="gray" className="mt-1">
                  {profile.department}
                </Badge>
              )}
              {managerName && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Reporting Manager
                  </p>
                  <div className="flex items-center gap-1.5">
                    <UserAvatar name={managerName} avatarUrl={managerAvatarUrl} size="xs" />
                    <span className="text-sm font-medium text-gray-700">{managerName}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                About
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Skills
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <SkillTag key={s} skill={s} />
                ))}
              </div>
            </div>
          )}

          {/* Experience */}
          {profile.experience && profile.experience.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Experience
              </h4>
              <div className="space-y-2">
                {profile.experience.map((exp, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Briefcase size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-gray-800">{exp.role}</span>
                      <span className="text-gray-500"> at {exp.company}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        {exp.from} – {exp.to ?? 'Present'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {profile.social_links && Object.keys(profile.social_links).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Links
              </h4>
              <div className="flex flex-wrap gap-3">
                {Object.entries(profile.social_links).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                  >
                    <LinkIcon size={13} />
                    {platform}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Badges Earned */}
          {profile.badges && profile.badges.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Badges Earned
              </h4>
              <div className="flex flex-wrap gap-2">
                {profile.badges.map((b: any) => {
                  const def = b.badge ?? {};
                  const logoUrl = def.logo_url || b.logo_url || '';
                  const emoji = def.icon_emoji || b.icon_emoji || '🏅';
                  const name = def.name || b.name || '';
                  return (
                    <div
                      key={b.id ?? b.ROWID}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200"
                      title={b.note || name}
                    >
                      {logoUrl ? (
                        <img src={logoUrl} alt={name} className="w-5 h-5 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span>{emoji}</span>
                      )}
                      <span className="text-xs font-medium text-amber-800">{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <ModalActions>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ─── Directory Tab ────────────────────────────────────────────────────────────

const PERF_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

const DirectoryTab = () => {
  const { user } = useAuth();
  const isAdmin = PERF_ROLES.includes(user?.role ?? '');

  const [search, setSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<DirectoryProfile | null>(null);
  const [analyzeTarget, setAnalyzeTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, error } = useDirectory();
  const profiles: DirectoryProfile[] = useMemo(() => {
    const raw = data?.data ?? data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q) ||
        p.designation?.toLowerCase().includes(q)
    );
  }, [profiles, search]);

  if (isLoading) return <PageSkeleton />;
  if (error)
    return <Alert type="error" message="Failed to load directory." className="m-6" />;

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, department, designation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No employees found"
          description="Try a different search term."
          icon={<User size={36} />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((profile) => {
            const skills = parseSkills(profile.skills);
            const shown = skills.slice(0, 3);
            const extra = skills.length - shown.length;
            return (
              <Card
                key={profile.user_id}
                className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                onClick={() => setSelectedProfile(profile)}
              >
                <div className="flex flex-col items-center text-center gap-3">
                  <UserAvatar
                    name={profile.name}
                    avatarUrl={profile.avatar_url}
                    size="lg"
                  />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{profile.name}</p>
                    {profile.designation && (
                      <p className="text-xs text-gray-500 mt-0.5">{profile.designation}</p>
                    )}
                    {profile.department && (
                      <Badge variant="gray" className="mt-1.5">
                        {profile.department}
                      </Badge>
                    )}
                  </div>
                  {profile.manager_name && (
                    <div className="w-full">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center mb-1">
                        Reporting Manager
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5 w-full justify-center">
                        <UserAvatar
                          name={profile.manager_name}
                          avatarUrl={profile.manager_avatar_url}
                          size="xs"
                        />
                        <span className="truncate max-w-[120px] font-medium" title={profile.manager_name}>
                          {profile.manager_name}
                        </span>
                      </div>
                    </div>
                  )}
                  {skills.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {shown.map((s) => (
                        <SkillTag key={s} skill={s} />
                      ))}
                      {extra > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs">
                          +{extra} more
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between w-full mt-auto gap-2">
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <span>View profile</span>
                      <ChevronRight size={12} />
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnalyzeTarget({ id: profile.user_id, name: profile.name });
                        }}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded-lg hover:bg-indigo-50 transition-colors"
                        title="Analyze performance"
                      >
                        <BarChart2 size={12} /> Analyze
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedProfile && (
        <ProfileDetailModal
          userId={selectedProfile.user_id}
          open={!!selectedProfile}
          onClose={() => setSelectedProfile(null)}
          managerName={selectedProfile.manager_name}
          managerAvatarUrl={selectedProfile.manager_avatar_url}
        />
      )}

      {analyzeTarget && (
        <PerformanceModal
          open={!!analyzeTarget}
          onClose={() => setAnalyzeTarget(null)}
          targetUserId={analyzeTarget.id}
          targetName={analyzeTarget.name}
        />
      )}
    </div>
  );
};

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

const LeaderboardTab = () => {
  const { data, isLoading, error } = useBadgeLeaderboard();
  const entries: LeaderboardEntry[] = useMemo(() => {
    const raw = data?.data ?? data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  if (isLoading) return <PageSkeleton />;
  if (error)
    return <Alert type="error" message="Failed to load leaderboard." className="m-6" />;
  if (entries.length === 0)
    return (
      <EmptyState
        title="No badges awarded yet"
        description="Start awarding badges to build the leaderboard."
        icon={<Trophy size={36} />}
      />
    );

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Top 3 podium */}
      <div className="grid grid-cols-3 gap-3">
        {top3.map((entry, i) => (
          <Card
            key={entry.user_id}
            className={`flex flex-col items-center text-center gap-2 py-5 ${i === 0
              ? 'border-yellow-300 bg-yellow-50'
              : i === 1
                ? 'border-gray-300 bg-gray-50'
                : 'border-orange-200 bg-orange-50'
              }`}
          >
            <RankBadge rank={i + 1} />
            <UserAvatar
              name={entry.name}
              avatarUrl={entry.avatar_url}
              size={i === 0 ? 'xl' : 'lg'}
            />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{entry.name}</p>
              {entry.designation && (
                <p className="text-xs text-gray-500">{entry.designation}</p>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm font-bold text-amber-700">
              <Trophy size={14} />
              <span>{entry.badge_count}</span>
            </div>
            {/* Badge list with names */}
            {entry.badges && entry.badges.length > 0 && (
              <div className="flex flex-col items-center gap-1 mt-1 w-full">
                {entry.badges.slice(0, 3).map((b) => (
                  <div key={b.award_id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 max-w-full">
                    {b.logo_url ? (
                      <img src={b.logo_url} alt={b.name}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-xs shrink-0">{b.icon_emoji ?? '🏅'}</span>
                    )}
                    <span className="text-xs text-amber-800 font-medium truncate">{b.name}</span>
                  </div>
                ))}
                {entry.badges.length > 3 && (
                  <span className="text-xs text-amber-600 font-medium">+{entry.badges.length - 3} more</span>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Rest of list */}
      {rest.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {rest.map((entry, i) => (
            <div
              key={entry.user_id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <RankBadge rank={i + 4} />
              <UserAvatar
                name={entry.name}
                avatarUrl={entry.avatar_url}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {entry.name}
                </p>
                {entry.designation && (
                  <p className="text-xs text-gray-500 truncate">{entry.designation}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {entry.badges && entry.badges.slice(0, 2).map((b) => (
                  <div key={b.award_id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100">
                    {b.logo_url ? (
                      <img src={b.logo_url} alt={b.name}
                        className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-xs shrink-0">{b.icon_emoji ?? '🏅'}</span>
                    )}
                    <span className="text-xs text-amber-800 font-medium max-w-[80px] truncate">{b.name}</span>
                  </div>
                ))}
                {entry.badges && entry.badges.length > 2 && (
                  <span className="text-xs text-amber-600 font-medium">+{entry.badges.length - 2}</span>
                )}
                <div className="flex items-center gap-1 text-sm font-semibold text-amber-700">
                  <Trophy size={13} />
                  <span>{entry.badge_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Badges Tab (Admin) ───────────────────────────────────────────────────────

const BadgesTab = () => {
  const { data: badgesData, isLoading, error } = useBadges();
  const { data: dirData } = useDirectory();
  const createBadge = useCreateBadge();
  const awardBadge = useAwardBadge();

  const [showCreate, setShowCreate] = useState(false);
  const [awardTarget, setAwardTarget] = useState<BadgeDefinition | null>(null);
  const [createError, setCreateError] = useState('');
  const [awardError, setAwardError] = useState('');

  const badges: BadgeDefinition[] = useMemo(() => {
    const raw = badgesData?.data ?? badgesData ?? [];

    if (!Array.isArray(raw)) return [];

    return raw.map((b: any) => ({
      id: b.ROWID ?? b.id,
      name: b.name,
      description: b.description,
      criteria: b.criteria,
      icon_emoji: b.icon_emoji,
      logo_url: b.logo_url || '',
    }));
  }, [badgesData]);

  const employees: DirectoryProfile[] = useMemo(() => {
    const raw = dirData?.data ?? dirData ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [dirData]);

  const createForm = useForm<CreateBadgeForm>({
    defaultValues: { icon_emoji: '🏅' },
  });
  const awardForm = useForm<AwardBadgeForm>();
  const onCreateSubmit = async (data: CreateBadgeForm) => {
    setCreateError('');

    try {
      const formData = new FormData();

      formData.append('name', data.name);
      formData.append('category', data.category);
      formData.append('description', data.description || '');
      formData.append('criteria', data.criteria || '');
      formData.append('icon_emoji', data.icon_emoji || '🏅');

      if (data.logo_file) {
        formData.append('file', data.logo_file); // ✅ MUST BE 'file'
      }

      await createBadge.mutateAsync(formData);

      setShowCreate(false);
      createForm.reset();

    } catch (e: unknown) {
      setCreateError((e as Error).message || 'Failed to create badge');
    }
  };

  const onAwardSubmit = async (data: AwardBadgeForm) => {
    if (!awardTarget) return;
    setAwardError('');
    try {
      await awardBadge.mutateAsync({ id: awardTarget.id, data });
      setAwardTarget(null);
      awardForm.reset();
    } catch (e: unknown) {
      setAwardError((e as Error).message ?? 'Failed to award badge.');
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (error)
    return <Alert type="error" message="Failed to load badges." className="m-6" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          {badges.length} badge{badges.length !== 1 ? 's' : ''} defined
        </h3>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setShowCreate(true)}
        >
          Create Badge
        </Button>
      </div>

      {badges.length === 0 ? (
        <EmptyState
          title="No badges defined"
          description="Create your first badge to start recognizing team members."
          icon={<Award size={36} />}
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              Create Badge
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <Card key={badge.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                {badge.logo_url ? (
                  <img
                    src={badge.logo_url}
                    alt={badge.name}
                    className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-100"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-3xl shrink-0">{badge.icon_emoji ?? '🏅'}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{badge.name}</p>
                  {badge.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {badge.description}
                    </p>
                  )}
                </div>
              </div>
              {badge.criteria && (
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
                  <span className="font-medium text-gray-600">Criteria: </span>
                  {badge.criteria}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={<Award size={13} />}
                onClick={() => {
                  setAwardTarget(badge);
                  awardForm.reset();
                  setAwardError('');
                }}
              >
                Award Badge
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Create Badge Modal */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setCreateError('');
          createForm.reset();
        }}
        title="Create Badge"
        size="md"
      >
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}

          {/* Emoji + Name */}
          <div className="grid grid-cols-[56px_1fr] gap-3 items-start">
            {/* Emoji */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Emoji
              </label>
              <input
                {...createForm.register('icon_emoji')}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-center text-xl"
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                {...createForm.register('name', { required: 'Name is required' })}
                placeholder="e.g. Go-Getter"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {createForm.formState.errors.name && (
                <p className="text-xs text-red-600 mt-1">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>
          </div>

          {/* ✅ CATEGORY (ONLY ONCE) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <input
              {...createForm.register('category', { required: 'Category is required' })}
              placeholder="e.g. Performance, Culture"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {createForm.formState.errors.category && (
              <p className="text-xs text-red-600 mt-1">
                {createForm.formState.errors.category.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              {...createForm.register('description')}
              rows={2}
              placeholder="What this badge represents"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Criteria */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Criteria
            </label>
            <input
              {...createForm.register('criteria')}
              placeholder="Conditions for earning this badge"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* ✅ IMAGE UPLOAD */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Badge Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) createForm.setValue('logo_file', file);
              }}
              className="w-full text-sm"
            />
          </div>

          <ModalActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                createForm.reset();
              }}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="primary"
              loading={createForm.formState.isSubmitting}
            >
              Create Badge
            </Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Award Badge Modal */}
      <Modal
        open={!!awardTarget}
        onClose={() => {
          setAwardTarget(null);
          setAwardError('');
          awardForm.reset();
        }}
        title={`Award "${awardTarget?.name ?? ''}"`}
        size="sm"
      >
        <form onSubmit={awardForm.handleSubmit(onAwardSubmit)} className="space-y-4">
          {awardError && <Alert type="error" message={awardError} />}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              {...awardForm.register('user_id', { required: 'Please select an employee' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.user_id} value={e.user_id}>
                  {e.name}
                  {e.designation ? ` — ${e.designation}` : ''}
                </option>
              ))}
            </select>
            {awardForm.formState.errors.user_id && (
              <p className="text-xs text-red-600 mt-1">
                {awardForm.formState.errors.user_id.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Note (optional)
            </label>
            <input
              {...awardForm.register('reason')}
              placeholder="Reason for awarding this badge"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <ModalActions>
            <Button
              variant="outline"
              type="button"
              onClick={() => setAwardTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={awardForm.formState.isSubmitting}
            >
              Award
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ─── My Profile Tab ───────────────────────────────────────────────────────────

const MyProfileTab = () => {
  const { data, isLoading, error } = useMyProfile();
  const updateProfile = useUpdateMyProfile();
  const uploadFile = useUploadProfileFile();
  const profile: DirectoryProfile | undefined = data?.data ?? data;

  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);

  const handleFileUpload = async (file: File, type: 'resume' | 'photo') => {
    setUploadError('');
    setUploadSuccess('');
    try {
      await uploadFile.mutateAsync({ file, type });
      setUploadSuccess(`${type === 'photo' ? 'Profile photo' : 'Resume'} uploaded successfully.`);
    } catch (e: unknown) {
      setUploadError((e as Error).message ?? 'Upload failed.');
    }
  };

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<UpdateProfileForm>();

  React.useEffect(() => {
    if (profile && editing) {
      const parsed = parseSkills(profile.skills);
      setSkills(parsed);
      reset({
        bio: profile.bio ?? '',
        designation: profile.designation ?? '',
        department: profile.department ?? '',
        skills_raw: '',
      });
    }
  }, [profile, editing, reset]);

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
    }
    setSkillInput('');
  };

  const removeSkill = (s: string) =>
    setSkills((prev) => prev.filter((x) => x !== s));

  const onSubmit = async (data: UpdateProfileForm) => {
    setSaveError('');
    setSaveSuccess(false);
    try {
      await updateProfile.mutateAsync({
        bio: data.bio,
        designation: data.designation,
        department: data.department,
        skills: JSON.stringify(skills),
      });
      setSaveSuccess(true);
      setEditing(false);
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Failed to save profile.');
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (error)
    return <Alert type="error" message="Failed to load your profile." className="m-6" />;

  const profileSkills = parseSkills(profile?.skills);

  return (
    <div className="max-w-2xl space-y-5">
      {saveSuccess && (
        <Alert type="success" message="Profile updated successfully." />
      )}

      {(uploadError || uploadSuccess) && (
        <Alert type={uploadError ? 'error' : 'success'} message={uploadError || uploadSuccess} />
      )}

      {/* File Uploads Card */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Files &amp; Media</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Photo Upload */}
          <div className="p-3 border border-dashed border-gray-300 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Camera size={14} className="text-blue-500" />
              <span className="text-xs font-medium text-gray-700">Profile Photo</span>
            </div>
            {(profile as any)?.avatar_url && (
              <img src={(profile as any).avatar_url} alt="avatar" className="w-12 h-12 rounded-full object-cover mb-2 border border-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              <Upload size={12} />
              {uploadFile.isPending ? 'Uploading…' : 'Upload Photo'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'photo'); }} />
            </label>
          </div>
          {/* Resume Upload */}
          <div className="p-3 border border-dashed border-gray-300 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-green-500" />
              <span className="text-xs font-medium text-gray-700">Resume / CV</span>
            </div>
            {(profile as any)?.resume_url && (
              <a href={(profile as any).resume_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-2">
                <FileText size={11} /> View current resume
              </a>
            )}
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
              <Upload size={12} />
              {uploadFile.isPending ? 'Uploading…' : 'Upload Resume'}
              <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'resume'); }} />
            </label>
          </div>
        </div>
      </Card>

      {!editing ? (
        <Card>
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-4">
              <UserAvatar name={profile?.name ?? ''} avatarUrl={(profile as any)?.avatar_url} size="xl" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {profile?.name}
                </h2>
                {profile?.designation && (
                  <p className="text-sm text-gray-500">{profile.designation}</p>
                )}
                {profile?.department && (
                  <Badge variant="gray" className="mt-1">
                    {profile.department}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Edit2 size={13} />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          </div>

          {profile?.bio ? (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Bio
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-4">No bio added yet.</p>
          )}

          {profileSkills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Skills
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {profileSkills.map((s) => (
                  <SkillTag key={s} skill={s} />
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Edit Profile</h3>
            {saveError && <Alert type="error" message={saveError} />}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Designation
                </label>
                <input
                  {...register('designation')}
                  placeholder="e.g. Senior Engineer"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Department
                </label>
                <input
                  {...register('department')}
                  placeholder="e.g. Engineering"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                {...register('bio')}
                rows={4}
                placeholder="Tell your team about yourself…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Skills editor */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Skills
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="Type a skill and press Enter"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSkill}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSkill(s)}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {skills.length === 0 && (
                  <span className="text-xs text-gray-400">No skills added yet.</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="primary"
                type="submit"
                loading={isSubmitting}
              >
                Save Changes
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditing(false);
                  setSaveError('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const DirectoryPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Directory');

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');
  const visibleTabs = TABS.filter((t) => t !== 'Badges' || isAdmin);

  return (
    <Layout>
      <Header
        title="People Directory"
        subtitle="Browse employees, view profiles, and celebrate achievements"
      />
      <div className="p-6 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px ${activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'Directory' && <DirectoryTab />}
        {activeTab === 'Leaderboard' && <LeaderboardTab />}
        {activeTab === 'Badges' && isAdmin && <BadgesTab />}
        {activeTab === 'My Profile' && <MyProfileTab />}
      </div>
    </Layout>
  );
};

export default DirectoryPage;
