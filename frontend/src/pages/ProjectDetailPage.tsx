import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Users, CheckSquare, AlertTriangle, Milestone, BarChart2, UserPlus, Trash2, ListChecks, Clock, FolderOpen, Pencil } from 'lucide-react';
import UserHoverCard from '../components/ui/UserHoverCard';
import UserAvatar from '../components/ui/UserAvatar';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card, { StatCard } from '../components/ui/Card';
import { RAGBadge, StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import { useProjectDashboard } from '../hooks/useDashboard';
import { useUpdateRAG, useProjectMembers, useAddMember, useAddTeamToProject, useUpdateProject } from '../hooks/useProjects';
import { projectsApi } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { useForm, Controller } from 'react-hook-form';
import UserPicker from '../components/ui/UserPicker';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import { useI18n } from '../contexts/I18nContext';
import ManageMembersModal, { RoleOptionGroups } from '../components/projects/ManageMembersModal';

const ProjectDetailPage = () => {
  const { confirm } = useConfirm();
  const { t } = useI18n();
  const { user } = useAuth();
  const { projectId, tenantSlug } = useParams<{ projectId: string; tenantSlug: string }>();
  const navigate = useNavigate();
  const [showRAG, setShowRAG] = useState(false);
  const [ragError, setRagError] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [addMode, setAddMode] = useState<'individual' | 'team'>('individual');
  const [showEditPM, setShowEditPM] = useState(false);
  const [pmUserId, setPmUserId] = useState('');
  const [pmError, setPmError] = useState('');
  const [showManageMembers, setShowManageMembers] = useState(false);


  const { data, isLoading, error } = useProjectDashboard(projectId!);
  const updateRAG = useUpdateRAG(projectId!);
  const { data: members = [] } = useProjectMembers(projectId!);
  const { data: allUsers = [] } = useUsers();
  const { data: allTeams = [] } = useTeams();
  const addMember = useAddMember(projectId!);
  const addTeam = useAddTeamToProject(projectId!);
  const updateProject = useUpdateProject(projectId!);

  const onSavePM = async () => {
    if (!pmUserId) { setPmError('Select a project manager'); return; }
    try {
      setPmError('');
      await updateProject.mutateAsync({ owner_user_id: pmUserId });
      setShowEditPM(false);
    } catch (err) {
      setPmError((err as Error).message);
    }
  };

  const canManageProject = user?.role === 'TENANT_ADMIN' || hasPermission(user, PERMISSIONS.PROJECT_WRITE);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ rag_status: string; reason: string }>();
  const addMemberForm = useForm<{ user_id: string; role: string }>({ defaultValues: { role: 'MEMBER' } });
  const addTeamForm = useForm<{ team_id: string }>({});

  const onRAGSubmit = async (formData: { rag_status: string; reason: string }) => {
    try {
      setRagError('');
      await updateRAG.mutateAsync(formData);
      setShowRAG(false);
    } catch (err: unknown) {
      setRagError((err as Error).message);
    }
  };

  const onAddMember = async (formData: { user_id: string; role: string }) => {
    try {
      setMemberError('');
      await addMember.mutateAsync(formData);
      addMemberForm.reset({ role: 'MEMBER' });
      setShowAddMember(false);
    } catch (err: unknown) {
      setMemberError((err as Error).message);
    }
  };

  const onAddTeam = async (formData: { team_id: string }) => {
    try {
      setMemberError('');
      await addTeam.mutateAsync(formData);
      addTeamForm.reset();
      setShowAddMember(false);
    } catch (err: unknown) {
      setMemberError((err as Error).message);
    }
  };


  if (isLoading) return <Layout><PageLoader /></Layout>;
  if (error) return <Layout><Alert type="error" message={(error as Error).message} className="m-6" /></Layout>;
  if (!data) return <Layout><PageLoader /></Layout>;

  const { project, stats, milestones, openActionsPreview, openBlockersPreview } = data;

  return (
    <Layout>
      <Header
        title={project.name}
        subtitle={`${project.status} • ${project.startDate} → ${project.endDate}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/projects')} icon={<ArrowLeft size={14} />}>
              {t('common.back')}
            </Button>
            {canManageProject && (
              <Button variant="outline" size="sm" onClick={() => setShowRAG(true)} icon={<Edit2 size={14} />}>
                {t('projects.detail.editProject')}
              </Button>
            )}
            {canManageProject && (
              <Button variant="danger" size="sm" icon={<Trash2 size={14} />}
                onClick={async () => {
                  const ok = await confirm({ title: 'Delete project', message: `"${project.name}" will be moved to the Recycle Bin. An admin can restore it.`, confirmText: 'Delete', variant: 'danger' });
                  if (!ok) return;
                  try { await projectsApi.remove(projectId!); navigate('/projects'); } catch { /* surfaced by query layer */ }
                }}>
                {t('common.delete')}
              </Button>
            )}
            <Link
              to={`/${tenantSlug}/projects/${projectId}/docs`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm shrink-0">
              <FolderOpen size={15} />
              Directory
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* RAG + Description */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <RAGBadge status={project.ragStatus} />
                <StatusBadge status={project.status} />
              </div>
              {project.description && <p className="text-sm text-gray-600">{project.description}</p>}
            </div>
          </div>
        </Card>

        {/* Project Manager */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-2 shrink-0"><Users size={16} /> Project Manager:</span>
              {(() => {
                const pm = allUsers.find((u) => String(u.id) === String((project as { ownerUserId?: string }).ownerUserId ?? ''));
                return pm ? (
                  <span className="flex items-center gap-2 min-w-0">
                    <UserAvatar name={pm.name} avatarUrl={pm.avatarUrl} size="sm" />
                    <span className="text-sm text-gray-800 font-medium truncate">{pm.name}</span>
                  </span>
                ) : <span className="text-sm text-gray-400">Unassigned</span>;
              })()}
            </div>
            {canManageProject && (
              <Button size="sm" variant="outline" icon={<Edit2 size={14} />}
                onClick={() => { setPmUserId(String((project as { ownerUserId?: string }).ownerUserId ?? '')); setPmError(''); setShowEditPM(true); }}>
                {t('common.edit')}
              </Button>
            )}
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StatCard label={t('teams.membersLabel')} value={stats.totalMembers} icon={<Users size={20} />} color="blue" />
          <StatCard label={t('actions.title')} value={stats.openActions} icon={<CheckSquare size={20} />} color={stats.overdueActions > 0 ? 'red' : 'green'} sublabel={stats.overdueActions > 0 ? `${stats.overdueActions} ${t('actions.status.overdue').toLowerCase()}` : t('statuses.onTrack')} />
          <StatCard label={t('blockers.title')} value={stats.openBlockers} icon={<AlertTriangle size={20} />} color={stats.criticalBlockers > 0 ? 'red' : 'amber'} sublabel={stats.criticalBlockers > 0 ? `${stats.criticalBlockers} ${t('statuses.critical').toLowerCase()}` : ''} />
          <StatCard label={t('milestones.title')} value={stats.totalMilestones} icon={<Milestone size={20} />} color={stats.delayedMilestones > 0 ? 'red' : 'green'} sublabel={stats.delayedMilestones > 0 ? `${stats.delayedMilestones} ${t('milestones.status.overdue').toLowerCase()}` : t('statuses.onTrack')} />
          <StatCard label={t('standup.title')} value={stats.totalStandups} icon={<BarChart2 size={20} />} color="purple" />
          <StatCard label={t('tasks.title')} value={stats.taskCount ?? 0} icon={<ListChecks size={20} />} color="blue" />
          <StatCard label={t('timeTracking.billable')} value={stats.billableHours ?? 0} icon={<Clock size={20} />} color="green" sublabel={t('common.hours').toLowerCase()} />
          <StatCard label={t('timeTracking.nonBillable')} value={stats.nonBillableHours ?? 0} icon={<Clock size={20} />} color="amber" sublabel={t('common.hours').toLowerCase()} />
          <StatCard label={t('timeTracking.totalHours')} value={stats.totalHours ?? 0} icon={<Clock size={20} />} color="purple" sublabel={t('common.hours').toLowerCase()} />
        </div>

        {/* Sub Navigation */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('nav.myTasks'),       to: `/${tenantSlug}/projects/${projectId}/tasks` },
            { label: t('nav.sprintBoards'),  to: `/${tenantSlug}/projects/${projectId}/sprints` },
            { label: t('nav.backlog'),        to: `/${tenantSlug}/projects/${projectId}/backlog` },
            { label: t('nav.standup'),        to: `/${tenantSlug}/standup?projectId=${projectId}` },
            { label: t('nav.eod'),            to: `/${tenantSlug}/eod?projectId=${projectId}` },
            { label: t('nav.actions'),        to: `/${tenantSlug}/actions?projectId=${projectId}` },
            { label: t('nav.blockers'),       to: `/${tenantSlug}/blockers?projectId=${projectId}` },
            { label: t('nav.raidRegister'),   to: `/${tenantSlug}/raid?projectId=${projectId}` },
            { label: t('nav.decisions'),      to: `/${tenantSlug}/decisions?projectId=${projectId}` },
            { label: t('nav.milestones'),     to: `/${tenantSlug}/milestones?projectId=${projectId}` },
            { label: t('nav.reports'),        to: `/${tenantSlug}/reports?projectId=${projectId}` },
          ].map((item) => (
            <Link key={item.label} to={item.to}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-colors">
              {item.label}
            </Link>
          ))}
        </div>

        {/* Members */}
        <Card>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Users size={16} /> {t('teams.membersLabel')} ({members.length})</h3>
            {canManageProject && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" icon={<UserPlus size={14} />} onClick={() => setShowAddMember(true)}>{t('teams.addMember')}</Button>
                <Button size="sm" icon={<Pencil size={14} />} onClick={() => setShowManageMembers(true)}>Manage</Button>
              </div>
            )}
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">{t('common.noData')}</p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-1 -mr-1">
              {members.map((m: { id: string; userId: string; name?: string; email?: string; avatarUrl?: string; userRole?: string; projectRole?: string }) => {
                const enriched = allUsers.find((u) => String(u.id) === String(m.userId));
                const avatarUrl = m.avatarUrl || enriched?.avatarUrl || '';
                return (
                <div key={m.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserHoverCard
                      name={m.name || enriched?.name || m.email || ''}
                      role={m.userRole}
                      projectRole={m.projectRole}
                      email={m.email}
                      avatarUrl={avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.name || m.email || m.userId}</p>
                      <p className="text-xs text-gray-400 truncate">{(m.projectRole || m.userRole || '').replace(/_/g, ' ') || '—'}</p>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Card>


        {/* Bottom panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Milestones */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('milestones.title')}</h3>
            {milestones.length === 0
              ? <p className="text-sm text-gray-400">{t('milestones.noMilestones')}</p>
              : milestones.slice(0, 5).map((m: {id: string; title: string; dueDate: string; status: string}) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700 truncate pr-2">{m.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{m.dueDate}</span>
                    <StatusBadge status={m.status} />
                  </div>
                </div>
              ))
            }
          </Card>

          {/* Overdue Actions */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">{t('actions.status.overdue')} {t('actions.title')}</h3>
              <Link to={`/${tenantSlug}/actions?projectId=${projectId}`} className="text-xs text-blue-600 hover:underline">{t('common.viewAll')}</Link>
            </div>
            {openActionsPreview.length === 0
              ? <p className="text-sm text-gray-400">{t('actions.noActions')}</p>
              : openActionsPreview.map((a: {id: string; title: string; dueDate: string; priority: string}) => (
                <div key={a.id} className="py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700 truncate">{a.title}</p>
                  <div className="flex gap-2 mt-1">
                    <StatusBadge status={a.priority} />
                    <span className="text-xs text-red-500">{t('actions.dueOn', { date: a.dueDate })}</span>
                  </div>
                </div>
              ))
            }
          </Card>

          {/* Open Blockers */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">{t('blockers.title')}</h3>
              <Link to={`/${tenantSlug}/blockers?projectId=${projectId}`} className="text-xs text-blue-600 hover:underline">{t('common.viewAll')}</Link>
            </div>
            {openBlockersPreview.length === 0
              ? <p className="text-sm text-gray-400">{t('blockers.noBlockers')}</p>
              : openBlockersPreview.map((b: {id: string; title: string; severity: string; status: string}) => (
                <div key={b.id} className="py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700 truncate">{b.title}</p>
                  <div className="flex gap-2 mt-1">
                    <StatusBadge status={b.severity} />
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              ))
            }
          </Card>
        </div>
      </div>

      {/* Manage Members Modal — add / remove / change roles in one place */}
      <ManageMembersModal
        open={showManageMembers}
        onClose={() => setShowManageMembers(false)}
        projectId={projectId!}
        members={members}
        allUsers={allUsers}
      />

      {/* Add Member Modal */}
      <Modal
        open={showAddMember}
        onClose={() => { setShowAddMember(false); addMemberForm.reset({ role: 'MEMBER' }); addTeamForm.reset(); setMemberError(''); setAddMode('individual'); }}
        title={t('teams.addMember')}
      >
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
          <button
            type="button"
            onClick={() => { setAddMode('individual'); setMemberError(''); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${addMode === 'individual' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t('directory.individual')}
          </button>
          <button
            type="button"
            onClick={() => { setAddMode('team'); setMemberError(''); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${addMode === 'team' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t('teams.addTeam')}
          </button>
        </div>

        {memberError && <Alert type="error" message={memberError} className="mb-3" />}

        {addMode === 'individual' ? (
          <form onSubmit={addMemberForm.handleSubmit(onAddMember)} className="space-y-4">
            <div>
              <label className="form-label">{t('common.name')} *</label>
              <Controller
                name="user_id"
                control={addMemberForm.control}
                rules={{ required: t('validation.required') }}
                render={({ field }) => (
                  <UserPicker
                    users={allUsers}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t('common.searchPlaceholder')}
                    excludeIds={members.map((m: { userId: string }) => String(m.userId))}
                  />
                )}
              />
            </div>
            <div>
              <label className="form-label">{t('teams.role')}</label>
              <select className="form-select" {...addMemberForm.register('role')}>
                <RoleOptionGroups />
              </select>
            </div>
            <ModalActions>
              <Button variant="outline" type="button" onClick={() => setShowAddMember(false)}>{t('common.cancel')}</Button>
              <Button type="submit" loading={addMemberForm.formState.isSubmitting} icon={<UserPlus size={16} />}>{t('teams.addMember')}</Button>
            </ModalActions>
          </form>
        ) : (
          <form onSubmit={addTeamForm.handleSubmit(onAddTeam)} className="space-y-4">
            <div>
              <label className="form-label">{t('nav.teams')} *</label>
              <select className="form-select" {...addTeamForm.register('team_id', { required: true })}>
                <option value="">{t('common.searchPlaceholder')}</option>
                {(allTeams as any[]).map((team: any) => (
                  <option key={team.id} value={team.id}>{team.name}{team.memberCount ? ` (${t('teams.members', { count: team.memberCount })})` : ''}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">{t('teams.addTeamNote')}</p>
            </div>
            <ModalActions>
              <Button variant="outline" type="button" onClick={() => setShowAddMember(false)}>{t('common.cancel')}</Button>
              <Button type="submit" loading={addTeamForm.formState.isSubmitting} icon={<Users size={16} />}>{t('teams.addTeam')}</Button>
            </ModalActions>
          </form>
        )}
      </Modal>

      {/* Update RAG Modal */}
      <Modal open={showRAG} onClose={() => setShowRAG(false)} title={t('projects.detail.editProject')}>
        <form onSubmit={handleSubmit(onRAGSubmit)} className="space-y-4">
          {ragError && <Alert type="error" message={ragError} />}
          <div>
            <label className="form-label">{t('projects.modal.ragStatus')} *</label>
            <select className="form-select" {...register('rag_status', { required: true })}>
              <option value="GREEN">{t('projects.modal.ragGreen')} – {t('statuses.onTrack')}</option>
              <option value="AMBER">{t('projects.modal.ragAmber')} – {t('statuses.atRisk')}</option>
              <option value="RED">{t('projects.modal.ragRed')} – {t('statuses.offTrack')}</option>
            </select>
          </div>
          <div>
            <label className="form-label">{t('common.notes')}</label>
            <textarea className="form-textarea" rows={3} placeholder={t('common.description')} {...register('reason')} />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowRAG(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.update')}</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Edit Project Manager */}
      <Modal open={showEditPM} onClose={() => setShowEditPM(false)} title="Update Project Manager">
        <div className="space-y-4">
          {pmError && <Alert type="error" message={pmError} />}
          <div>
            <label className="form-label">Project Manager</label>
            <UserPicker
              users={members.map((m: { userId: string; name?: string; email?: string; avatarUrl?: string }) => ({
                id: String(m.userId),
                name: m.name || m.email || String(m.userId),
                avatarUrl: m.avatarUrl,
              }))}
              value={pmUserId}
              onChange={setPmUserId}
              placeholder="Select a project manager…"
            />
            <p className="text-[11px] text-gray-500 mt-1">Choose from the project's team members.</p>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowEditPM(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={updateProject.isPending} onClick={onSavePM}>{t('common.save')}</Button>
          </ModalActions>
        </div>
      </Modal>
    </Layout>
  );
};

export default ProjectDetailPage;
