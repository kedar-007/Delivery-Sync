import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Users, Plus, Trash2, UserPlus, Edit2, Clock, Calendar,
  Crown, Mail, Shield, ChevronRight,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import { PageLoader } from '../components/ui/Spinner';
import UserAvatar from '../components/ui/UserAvatar';
import UserHoverCard from '../components/ui/UserHoverCard';
import UserPicker from '../components/ui/UserPicker';
import {
  useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam,
  useTeam, useAddTeamMember, useRemoveTeamMember,
} from '../hooks/useTeams';
import { useProjects } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { canDo, PERMISSIONS } from '../utils/permissions';
import { useForm, Controller } from 'react-hook-form';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAM_MEMBER_ROLES = [
  { value: 'LEAD',               label: 'Team Lead' },
  { value: 'DEVELOPER',          label: 'Developer' },
  { value: 'SENIOR_DEVELOPER',   label: 'Senior Developer' },
  { value: 'TECH_LEAD',          label: 'Tech Lead' },
  { value: 'BUSINESS_ANALYST',   label: 'Business Analyst' },
  { value: 'TESTER',             label: 'QA / Tester' },
  { value: 'DESIGNER',           label: 'UI/UX Designer' },
  { value: 'DEVOPS_ENGINEER',    label: 'DevOps Engineer' },
  { value: 'SCRUM_MASTER',       label: 'Scrum Master' },
  { value: 'PRODUCT_OWNER',      label: 'Product Owner' },
  { value: 'MEMBER',             label: 'Member' },
];

const ROLE_COLORS: Record<string, string> = {
  LEAD:             'bg-blue-100 text-blue-700',
  TECH_LEAD:        'bg-cyan-100 text-cyan-700',
  DEVELOPER:        'bg-green-100 text-green-700',
  SENIOR_DEVELOPER: 'bg-emerald-100 text-emerald-700',
  BUSINESS_ANALYST: 'bg-purple-100 text-purple-700',
  TESTER:           'bg-orange-100 text-orange-700',
  DESIGNER:         'bg-pink-100 text-pink-700',
  DEVOPS_ENGINEER:  'bg-gray-100 text-gray-700',
  SCRUM_MASTER:     'bg-indigo-100 text-indigo-700',
  PRODUCT_OWNER:    'bg-violet-100 text-violet-700',
  MEMBER:           'bg-gray-100 text-gray-500',
};

const TIMEZONES = [
  { value: 'Asia/Kolkata',    label: 'IST — Asia/Kolkata (UTC+5:30)' },
  { value: 'UTC',             label: 'UTC' },
  { value: 'America/New_York',label: 'EST — America/New_York (UTC−5)' },
  { value: 'America/Chicago', label: 'CST — America/Chicago (UTC−6)' },
  { value: 'America/Denver',  label: 'MST — America/Denver (UTC−7)' },
  { value: 'America/Los_Angeles', label: 'PST — America/Los_Angeles (UTC−8)' },
  { value: 'Europe/London',   label: 'GMT — Europe/London' },
  { value: 'Europe/Paris',    label: 'CET — Europe/Paris (UTC+1)' },
  { value: 'Asia/Dubai',      label: 'GST — Asia/Dubai (UTC+4)' },
  { value: 'Asia/Singapore',  label: 'SGT — Asia/Singapore (UTC+8)' },
  { value: 'Australia/Sydney',label: 'AEST — Australia/Sydney (UTC+10)' },
];

function formatRole(r?: string) {
  if (!r) return '';
  return r.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Team Card ────────────────────────────────────────────────────────────────

const TeamCard = ({
  team, canWrite, onView, onEdit, onDelete,
}: {
  team: any; canWrite: boolean;
  onView: (t: any) => void;
  onEdit: (t: any) => void;
  onDelete: (t: any) => void;
}) => {
  // Eagerly load member previews
  const { data: detail } = useTeam(team.id);
  const previewMembers = (detail?.members ?? []).slice(0, 5);

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => onView(team)}>
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Users size={15} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{team.name}</h3>
              {team.description && (
                <p className="text-xs text-gray-400 truncate">{team.description}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          {canWrite && (
            <>
              <button
                onClick={() => onEdit(team)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Edit team"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => onDelete(team)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete team"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lead */}
      {team.leadName && (
        <div className="flex items-center gap-1.5 mb-3">
          <Crown size={11} className="text-amber-500 shrink-0" />
          <span className="text-xs text-gray-500">{team.leadName}</span>
        </div>
      )}

      {/* Schedule */}
      {(team.standupTime || team.eodTime) && (
        <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
          {team.standupTime && (
            <div className="flex items-center gap-1">
              <Clock size={10} className="text-blue-400" />
              <span>Standup {team.standupTime}</span>
            </div>
          )}
          {team.eodTime && (
            <div className="flex items-center gap-1">
              <Calendar size={10} className="text-green-400" />
              <span>EOD {team.eodTime}</span>
            </div>
          )}
        </div>
      )}

      {/* Member avatars stack */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {previewMembers.map((m: any) => (
              <div key={m.id} className="ring-2 ring-white rounded-full">
                <UserAvatar name={m.name || m.email} avatarUrl={m.avatarUrl} size="xs" />
              </div>
            ))}
            {(detail?.members?.length ?? team.memberCount) > 5 && (
              <div className="w-5 h-5 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center">
                <span className="text-[8px] font-bold text-gray-500">
                  +{(detail?.members?.length ?? team.memberCount) - 5}
                </span>
              </div>
            )}
          </div>
          <span className="ml-2 text-xs text-gray-400">
            {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View <ChevronRight size={12} />
        </div>
      </div>
    </Card>
  );
};

// ─── Team Detail Modal ────────────────────────────────────────────────────────

const TeamDetailModal = ({
  team, canWrite, onClose, onManageMembers,
}: {
  team: any; canWrite: boolean;
  onClose: () => void;
  onManageMembers: (t: any) => void;
}) => {
  const { data: detail } = useTeam(team.id);
  const members = detail?.members ?? [];

  // Use authoritative lead from team's lead_user_id (detail.lead), fallback to team list data
  const leadInfo = detail?.lead ?? (team.leadName ? { name: team.leadName, email: '', avatarUrl: '' } : null);

  const leads = members.filter((m: any) => m.role === 'LEAD');
  const others = members.filter((m: any) => m.role !== 'LEAD');

  return (
    <Modal open onClose={onClose} size="2xl" title="">
      {/* Custom header */}
      <div className="-mx-6 -mt-6 bg-gradient-to-br from-blue-600 to-indigo-700 px-6 pt-5 pb-6 rounded-t-xl mb-6 overflow-hidden relative">
        {/* Subtle radial highlight */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 55%)' }} />

        {/* Top row: team name + action */}
        <div className="flex items-start justify-between mb-5 relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <Users size={16} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white leading-tight">{team.name}</h2>
            </div>
            {team.description && (
              <p className="text-sm text-blue-100 ml-10">{team.description}</p>
            )}
          </div>
          {canWrite && (
            <Button
              size="sm"
              onClick={() => { onClose(); onManageMembers(team); }}
              icon={<UserPlus size={13} />}
              className="bg-white/20 hover:bg-white/30 text-white border-white/30 shrink-0 ml-3"
            >
              Add Members
            </Button>
          )}
        </div>

        {/* Lead profile — prominent */}
        {leadInfo ? (
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 mb-5 border border-white/20">
            <div className="ring-4 ring-white/30 rounded-full shrink-0">
              <UserAvatar
                name={leadInfo.name || leadInfo.email}
                avatarUrl={leadInfo.avatarUrl}
                size="xl"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Crown size={13} className="text-amber-300 shrink-0" />
                <span className="text-[11px] font-bold text-amber-200 uppercase tracking-widest">Team Lead</span>
              </div>
              <p className="text-white font-bold text-lg leading-tight truncate">
                {leadInfo.name || leadInfo.email}
              </p>
              {leadInfo.email && (
                <p className="text-blue-200 text-xs mt-0.5 flex items-center gap-1 truncate">
                  <Mail size={10} />{leadInfo.email}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* Stats row */}
        <div className="flex flex-wrap gap-2">
          <div className="bg-white/10 rounded-lg px-3 py-1.5 text-center min-w-[56px]">
            <p className="text-lg font-bold text-white leading-tight">{members.length}</p>
            <p className="text-[10px] text-blue-200 uppercase tracking-wide">Members</p>
          </div>
          {team.standupTime && (
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <p className="text-xs font-semibold text-white flex items-center gap-1">
                <Clock size={10} /> {team.standupTime}
              </p>
              <p className="text-[10px] text-blue-200 uppercase tracking-wide">Standup</p>
            </div>
          )}
          {team.eodTime && (
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <p className="text-xs font-semibold text-white flex items-center gap-1">
                <Calendar size={10} /> {team.eodTime}
              </p>
              <p className="text-[10px] text-blue-200 uppercase tracking-wide">EOD</p>
            </div>
          )}
          {team.timezone && (
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <p className="text-xs font-semibold text-white">{team.timezone.split('/')[1] ?? team.timezone}</p>
              <p className="text-[10px] text-blue-200 uppercase tracking-wide">Timezone</p>
            </div>
          )}
        </div>
      </div>

      {!detail ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading members…</div>
      ) : members.length === 0 ? (
        <div className="py-12 text-center">
          <Users size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No members yet.</p>
          {canWrite && (
            <Button size="sm" icon={<UserPlus size={13} />} onClick={() => { onClose(); onManageMembers(team); }} className="mt-3">
              Add First Member
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Leads section */}
          {leads.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Crown size={11} className="text-amber-500" /> Leads
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {leads.map((m: any) => (
                  <MemberCard key={m.id} member={m} />
                ))}
              </div>
            </div>
          )}

          {/* Team members section */}
          {others.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Shield size={11} /> Team Members
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {others.map((m: any) => (
                  <MemberCard key={m.id} member={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ModalActions>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </ModalActions>
    </Modal>
  );
};

// ─── Member Card (inside Team Detail) ────────────────────────────────────────

const MemberCard = ({ member }: { member: any }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
    <UserHoverCard
      name={member.name || member.email}
      role={member.role}
      email={member.email}
      avatarUrl={member.avatarUrl}
      size="md"
    />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{member.name || member.email}</p>
      {member.email && (
        <p className="text-xs text-gray-400 truncate flex items-center gap-1">
          <Mail size={9} />{member.email}
        </p>
      )}
    </div>
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-500'}`}>
      {formatRole(member.role)}
    </span>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const TeamsPage = () => {
  const { user } = useAuth();
  const canWrite = canDo(user?.role, PERMISSIONS.TEAM_WRITE);

  const [projectId, setProjectId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState<any>(null);
  const [viewTeam, setViewTeam] = useState<any>(null);
  const [manageTeam, setManageTeam] = useState<any>(null);
  const [createError, setCreateError] = useState('');
  const [memberError, setMemberError] = useState('');

  const { data: projects = [] } = useProjects();
  const { data: teams = [], isLoading } = useTeams(projectId || undefined);
  const { data: allUsers = [] } = useUsers();

  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam(editTeam?.id ?? '');
  const deleteTeam = useDeleteTeam();
  const addMember = useAddTeamMember(manageTeam?.id ?? '');
  const removeMember = useRemoveTeamMember(manageTeam?.id ?? '');
  const { data: manageDetail } = useTeam(manageTeam?.id ?? '');

  type CreateForm = {
    name: string; description: string; project_id: string;
    lead_user_id: string; standup_time: string; eod_time: string; timezone: string;
  };

  const createForm = useForm<CreateForm>({
    defaultValues: {
      name: '', description: '', project_id: '', lead_user_id: '',
      standup_time: '09:00', eod_time: '17:00', timezone: 'Asia/Kolkata',
    },
  });
  const memberForm = useForm<{ user_id: string; role: string }>({ defaultValues: { role: 'DEVELOPER' } });

  const handleCreate = async (data: any) => {
    try {
      setCreateError('');
      const payload: any = { name: data.name, project_id: data.project_id || projectId };
      if (data.description) payload.description = data.description;
      if (data.lead_user_id) payload.lead_user_id = data.lead_user_id;
      if (data.standup_time) payload.standup_time = data.standup_time;
      if (data.eod_time) payload.eod_time = data.eod_time;
      if (data.timezone) payload.timezone = data.timezone;
      await createTeam.mutateAsync(payload);
      createForm.reset();
      setShowCreate(false);
    } catch (err: any) { setCreateError(err.message); }
  };

  const handleUpdate = async (data: any) => {
    try {
      setCreateError('');
      await updateTeam.mutateAsync(data);
      setEditTeam(null);
    } catch (err: any) { setCreateError(err.message); }
  };

  const handleDelete = async (team: any) => {
    if (!window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) return;
    try { await deleteTeam.mutateAsync(team.id); } catch { /* handled */ }
  };

  const handleAddMember = async (data: any) => {
    try {
      setMemberError('');
      await addMember.mutateAsync(data);
      memberForm.reset({ role: 'DEVELOPER' });
    } catch (err: any) { setMemberError(err.message); }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Remove this member from the team?')) return;
    try { await removeMember.mutateAsync(memberId); } catch { /* handled */ }
  };

  const existingMemberIds = (manageDetail?.members ?? []).map((m: any) => String(m.userId));

  return (
    <Layout>
      <Header
        title="Teams"
        subtitle="Manage project teams and reporting structure"
        actions={
          canWrite ? (
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              New Team
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-4">
        {/* Project filter */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 shrink-0">Filter by project:</label>
          <select className="form-select max-w-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Team list */}
        {isLoading ? (
          <PageLoader />
        ) : teams.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <Users size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500 mb-4">No teams yet.</p>
              {canWrite && (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
                  Create First Team
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {teams.map((t: any) => (
              <div key={t.id} className="relative">
                <TeamCard
                  team={t}
                  canWrite={canWrite}
                  onView={setViewTeam}
                  onEdit={(team) => { setEditTeam(team); setCreateError(''); }}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Detail Modal */}
      {viewTeam && (
        <TeamDetailModal
          team={viewTeam}
          canWrite={canWrite}
          onClose={() => setViewTeam(null)}
          onManageMembers={(team) => { setManageTeam(team); setMemberError(''); }}
        />
      )}

      {/* Create Team Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); createForm.reset(); setCreateError(''); }} title="Create New Team" size="lg">
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="form-label">Team Name *</label>
              <input className="form-input" placeholder="e.g. Frontend Squad" {...createForm.register('name', { required: true })} />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">Description</label>
              <input className="form-input" placeholder="What does this team work on?" {...createForm.register('description')} />
            </div>
            {!projectId && (
              <div className="sm:col-span-2">
                <label className="form-label">Project *</label>
                <select className="form-select" {...createForm.register('project_id', { required: !projectId })}>
                  <option value="">Select project…</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="form-label">Team Lead (optional)</label>
              <Controller
                name="lead_user_id"
                control={createForm.control}
                render={({ field }) => (
                  <UserPicker users={allUsers} value={field.value} onChange={field.onChange} placeholder="Select lead…" allowEmpty />
                )}
              />
            </div>
          </div>

          {/* Schedule section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Clock size={12} /> Notification Schedule
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="form-label">Standup Time</label>
                <input type="time" className="form-input" {...createForm.register('standup_time')} />
                <p className="text-[10px] text-gray-400 mt-1">Daily standup reminder</p>
              </div>
              <div>
                <label className="form-label">EOD Time</label>
                <input type="time" className="form-input" {...createForm.register('eod_time')} />
                <p className="text-[10px] text-gray-400 mt-1">End-of-day reminder</p>
              </div>
              <div>
                <label className="form-label">Timezone</label>
                <select className="form-select" {...createForm.register('timezone')}>
                  {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={createForm.formState.isSubmitting} icon={<Plus size={16} />}>Create Team</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Edit Team Modal */}
      {editTeam && (
        <Modal open={!!editTeam} onClose={() => setEditTeam(null)} title={`Edit – ${editTeam.name}`} size="lg">
          <form onSubmit={createForm.handleSubmit(handleUpdate)} className="space-y-4">
            {createError && <Alert type="error" message={createError} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="form-label">Team Name</label>
                <input className="form-input" defaultValue={editTeam.name} {...createForm.register('name')} />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">Description</label>
                <input className="form-input" defaultValue={editTeam.description} {...createForm.register('description')} />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock size={12} /> Notification Schedule
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Standup Time</label>
                  <input type="time" className="form-input" defaultValue={editTeam.standupTime ?? '09:00'} {...createForm.register('standup_time')} />
                </div>
                <div>
                  <label className="form-label">EOD Time</label>
                  <input type="time" className="form-input" defaultValue={editTeam.eodTime ?? '17:00'} {...createForm.register('eod_time')} />
                </div>
                <div>
                  <label className="form-label">Timezone</label>
                  <select className="form-select" defaultValue={editTeam.timezone ?? 'Asia/Kolkata'} {...createForm.register('timezone')}>
                    {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <ModalActions>
              <Button variant="outline" type="button" onClick={() => setEditTeam(null)}>Cancel</Button>
              <Button type="submit" loading={createForm.formState.isSubmitting}>Save Changes</Button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {/* Manage Members Modal */}
      {manageTeam && (
        <Modal open={!!manageTeam} onClose={() => setManageTeam(null)} title={`Manage Members – ${manageTeam.name}`} size="xl">
          <div className="space-y-5">
            {memberError && <Alert type="error" message={memberError} />}

            {/* Add member form */}
            {canWrite && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add New Member</p>
                <form onSubmit={memberForm.handleSubmit(handleAddMember)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="form-label">User</label>
                    <Controller
                      name="user_id"
                      control={memberForm.control}
                      rules={{ required: true }}
                      render={({ field }) => (
                        <UserPicker
                          users={allUsers}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select user…"
                          excludeIds={existingMemberIds}
                        />
                      )}
                    />
                  </div>
                  <div>
                    <label className="form-label">Discipline / Role</label>
                    <select className="form-select" {...memberForm.register('role')}>
                      {TEAM_MEMBER_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3 flex justify-end">
                    <Button type="submit" size="sm" icon={<UserPlus size={14} />} loading={memberForm.formState.isSubmitting}>
                      Add to Team
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Current members */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Current Members ({(manageDetail?.members ?? []).length})
              </p>
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto rounded-xl border border-gray-100">
                {(manageDetail?.members ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No members yet.</p>
                ) : (
                  (manageDetail?.members ?? []).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <UserHoverCard name={m.name || m.email} role={m.role} email={m.email} avatarUrl={m.avatarUrl} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{m.name || m.email}</p>
                          <p className="text-xs text-gray-400">{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] ?? 'bg-gray-100 text-gray-500'}`}>
                          {formatRole(m.role)}
                        </span>
                        {canWrite && (
                          <button onClick={() => handleRemoveMember(m.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <ModalActions>
              <Button variant="outline" onClick={() => setManageTeam(null)}>Done</Button>
            </ModalActions>
          </div>
        </Modal>
      )}
    </Layout>
  );
};

export default TeamsPage;
