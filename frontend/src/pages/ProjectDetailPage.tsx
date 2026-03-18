import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Users, CheckSquare, AlertTriangle, Milestone, BarChart2, UserPlus, Trash2 } from 'lucide-react';
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
import { useUpdateRAG, useProjectMembers, useAddMember, useRemoveMember } from '../hooks/useProjects';
import { useUsers } from '../hooks/useUsers';
import { useForm } from 'react-hook-form';

const ProjectDetailPage = () => {
  const { projectId, tenantSlug } = useParams<{ projectId: string; tenantSlug: string }>();
  const navigate = useNavigate();
  const [showRAG, setShowRAG] = useState(false);
  const [ragError, setRagError] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberError, setMemberError] = useState('');

  const { data, isLoading, error } = useProjectDashboard(projectId!);
  const updateRAG = useUpdateRAG(projectId!);
  const { data: members = [] } = useProjectMembers(projectId!);
  const { data: allUsers = [] } = useUsers();
  const addMember = useAddMember(projectId!);
  const removeMember = useRemoveMember(projectId!);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ rag_status: string; reason: string }>();
  const addMemberForm = useForm<{ user_id: string; role: string }>({ defaultValues: { role: 'TEAM_MEMBER' } });

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
      addMemberForm.reset({ role: 'TEAM_MEMBER' });
      setShowAddMember(false);
    } catch (err: unknown) {
      setMemberError((err as Error).message);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Remove this member from the project?')) return;
    try { await removeMember.mutateAsync(memberId); } catch { /* handled by query */ }
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
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowRAG(true)} icon={<Edit2 size={14} />}>
              Update RAG
            </Button>
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StatCard label="Members" value={stats.totalMembers} icon={<Users size={20} />} color="blue" />
          <StatCard label="Open Actions" value={stats.openActions} icon={<CheckSquare size={20} />} color={stats.overdueActions > 0 ? 'red' : 'green'} sublabel={stats.overdueActions > 0 ? `${stats.overdueActions} overdue` : 'On track'} />
          <StatCard label="Open Blockers" value={stats.openBlockers} icon={<AlertTriangle size={20} />} color={stats.criticalBlockers > 0 ? 'red' : 'amber'} sublabel={stats.criticalBlockers > 0 ? `${stats.criticalBlockers} critical` : ''} />
          <StatCard label="Milestones" value={stats.totalMilestones} icon={<Milestone size={20} />} color={stats.delayedMilestones > 0 ? 'red' : 'green'} sublabel={stats.delayedMilestones > 0 ? `${stats.delayedMilestones} delayed` : 'On track'} />
          <StatCard label="Standups (7d)" value={stats.totalStandups} icon={<BarChart2 size={20} />} color="purple" />
        </div>

        {/* Sub Navigation */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Standup Rollup', to: `/${tenantSlug}/standup?projectId=${projectId}` },
            { label: 'EOD Rollup', to: `/${tenantSlug}/eod?projectId=${projectId}` },
            { label: 'Actions', to: `/${tenantSlug}/actions?projectId=${projectId}` },
            { label: 'Blockers', to: `/${tenantSlug}/blockers?projectId=${projectId}` },
            { label: 'RAID', to: `/${tenantSlug}/raid?projectId=${projectId}` },
            { label: 'Decisions', to: `/${tenantSlug}/decisions?projectId=${projectId}` },
            { label: 'Milestones', to: `/${tenantSlug}/milestones?projectId=${projectId}` },
            { label: 'Reports', to: `/${tenantSlug}/reports?projectId=${projectId}` },
          ].map((item) => (
            <Link key={item.label} to={item.to}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-colors">
              {item.label}
            </Link>
          ))}
        </div>

        {/* Members */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Users size={16} /> Team Members ({members.length})</h3>
            <Button size="sm" variant="outline" icon={<UserPlus size={14} />} onClick={() => setShowAddMember(true)}>Add Member</Button>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">No members assigned yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {members.map((m: { id: string; userId: string; name?: string; email?: string; avatarUrl?: string; userRole?: string; projectRole?: string }) => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={m.name || m.email || ''} avatarUrl={m.avatarUrl} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.name || m.email || m.userId}</p>
                      <p className="text-xs text-gray-400">{m.projectRole || m.userRole}</p>
                    </div>
                  </div>
                  <button onClick={() => handleRemoveMember(m.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Remove member">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bottom panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Milestones */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Milestones</h3>
            {milestones.length === 0
              ? <p className="text-sm text-gray-400">No milestones defined.</p>
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
              <h3 className="text-sm font-semibold text-gray-900">Overdue Actions</h3>
              <Link to={`/${tenantSlug}/actions?projectId=${projectId}`} className="text-xs text-blue-600 hover:underline">All</Link>
            </div>
            {openActionsPreview.length === 0
              ? <p className="text-sm text-gray-400">No overdue actions.</p>
              : openActionsPreview.map((a: {id: string; title: string; dueDate: string; priority: string}) => (
                <div key={a.id} className="py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700 truncate">{a.title}</p>
                  <div className="flex gap-2 mt-1">
                    <StatusBadge status={a.priority} />
                    <span className="text-xs text-red-500">Due {a.dueDate}</span>
                  </div>
                </div>
              ))
            }
          </Card>

          {/* Open Blockers */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Open Blockers</h3>
              <Link to={`/${tenantSlug}/blockers?projectId=${projectId}`} className="text-xs text-blue-600 hover:underline">All</Link>
            </div>
            {openBlockersPreview.length === 0
              ? <p className="text-sm text-gray-400">No open blockers.</p>
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

      {/* Add Member Modal */}
      <Modal open={showAddMember} onClose={() => { setShowAddMember(false); addMemberForm.reset({ role: 'TEAM_MEMBER' }); setMemberError(''); }} title="Add Team Member">
        <form onSubmit={addMemberForm.handleSubmit(onAddMember)} className="space-y-4">
          {memberError && <Alert type="error" message={memberError} />}
          <div>
            <label className="form-label">User *</label>
            <select className="form-select" {...addMemberForm.register('user_id', { required: 'Required' })}>
              <option value="">Select user…</option>
              {allUsers.filter((u) => !members.some((m: { userId: string }) => String(m.userId) === String(u.id))).map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.email} ({u.role.replace(/_/g, ' ')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Project Role</label>
            <select className="form-select" {...addMemberForm.register('role')}>
              {['DELIVERY_LEAD', 'TEAM_MEMBER', 'STAKEHOLDER', 'OBSERVER'].map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowAddMember(false)}>Cancel</Button>
            <Button type="submit" loading={addMemberForm.formState.isSubmitting} icon={<UserPlus size={16} />}>Add Member</Button>
          </ModalActions>
        </form>
      </Modal>

      {/* Update RAG Modal */}
      <Modal open={showRAG} onClose={() => setShowRAG(false)} title="Update RAG Status">
        <form onSubmit={handleSubmit(onRAGSubmit)} className="space-y-4">
          {ragError && <Alert type="error" message={ragError} />}
          <div>
            <label className="form-label">RAG Status *</label>
            <select className="form-select" {...register('rag_status', { required: true })}>
              <option value="GREEN">Green – On track</option>
              <option value="AMBER">Amber – At risk</option>
              <option value="RED">Red – Off track</option>
            </select>
          </div>
          <div>
            <label className="form-label">Reason / Commentary</label>
            <textarea className="form-textarea" rows={3} placeholder="Why is this changing?" {...register('reason')} />
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowRAG(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Update RAG</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default ProjectDetailPage;
