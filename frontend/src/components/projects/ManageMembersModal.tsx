import React, { useEffect, useState } from 'react';
import { UserPlus, Trash2, RotateCcw, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Modal, { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import UserAvatar from '../ui/UserAvatar';
import { useToast } from '../ui/Toast';
import { projectsApi } from '../../lib/api';

// Project-role options — shared by the Add-Member form and this manager.
export const PROJECT_ROLE_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  { label: 'Leadership', options: [
    { value: 'DELIVERY_LEAD', label: 'Delivery Lead' }, { value: 'PROJECT_MANAGER', label: 'Project Manager' },
    { value: 'TECH_LEAD', label: 'Tech Lead' }, { value: 'SCRUM_MASTER', label: 'Scrum Master' }, { value: 'PRODUCT_OWNER', label: 'Product Owner' },
  ] },
  { label: 'Engineering', options: [
    { value: 'SENIOR_DEVELOPER', label: 'Senior Developer' }, { value: 'DEVELOPER', label: 'Developer' }, { value: 'DEVOPS_ENGINEER', label: 'DevOps Engineer' },
  ] },
  { label: 'Analysis & Reporting', options: [
    { value: 'BUSINESS_ANALYST', label: 'Business Analyst (BA)' }, { value: 'MIS_ANALYST', label: 'MIS Analyst' }, { value: 'DATA_ANALYST', label: 'Data Analyst' },
  ] },
  { label: 'Quality & Design', options: [
    { value: 'TESTER', label: 'QA / Tester' }, { value: 'DESIGNER', label: 'UI/UX Designer' },
  ] },
  { label: 'Entry Level', options: [
    { value: 'TRAINEE', label: 'Trainee' }, { value: 'INTERN', label: 'Intern' },
  ] },
  { label: 'Stakeholders', options: [
    { value: 'STAKEHOLDER', label: 'Stakeholder' }, { value: 'OBSERVER', label: 'Observer' },
  ] },
];

export const RoleOptionGroups = () => (
  <>
    {PROJECT_ROLE_GROUPS.map((g) => (
      <optgroup key={g.label} label={g.label}>
        {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </optgroup>
    ))}
  </>
);

interface Member { id: string; userId: string; name?: string; email?: string; avatarUrl?: string; userRole?: string; projectRole?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppUser = any;

interface DraftRow {
  key: string;
  memberId?: string;   // present for existing members
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: string;
  originalRole: string;
  added?: boolean;
  removed?: boolean;
}

/**
 * One place to manage a project's members — add users, change roles, remove
 * people, then Save. Changes are staged locally and committed together on Save.
 */
const ManageMembersModal = ({
  open, onClose, projectId, members, allUsers,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  members: Member[];
  allUsers: AppUser[];
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('MEMBER');
  const [saving, setSaving] = useState(false);

  // (Re)seed the draft each time the modal opens or the member list changes.
  useEffect(() => {
    if (!open) return;
    setRows(members.map((m) => {
      const role = m.projectRole || m.userRole || 'MEMBER';
      const enriched = allUsers.find((u: AppUser) => String(u.id) === String(m.userId));
      return {
        key: m.id,
        memberId: m.id,
        userId: String(m.userId),
        name: m.name || enriched?.name || '',
        email: m.email || enriched?.email || '',
        avatarUrl: m.avatarUrl || enriched?.avatarUrl || '',
        role,
        originalRole: role,
      };
    }));
    setAddUserId('');
    setAddRole('MEMBER');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, members]);

  const usedIds = new Set(rows.filter((r) => !r.removed).map((r) => r.userId));
  const available = (allUsers as AppUser[]).filter((u) => !usedIds.has(String(u.id)));

  const addRowFromPicker = () => {
    const u = (allUsers as AppUser[]).find((x) => String(x.id) === addUserId);
    if (!u) return;
    setRows((rs) => [...rs, {
      key: `new-${addUserId}`,
      userId: String(addUserId),
      name: u.name || '',
      email: u.email || '',
      avatarUrl: u.avatarUrl || '',
      role: addRole,
      originalRole: '',
      added: true,
    }]);
    setAddUserId('');
    setAddRole('MEMBER');
  };

  const setRole = (key: string, role: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, role } : r)));
  const toggleRemove = (key: string) => setRows((rs) => {
    const r = rs.find((x) => x.key === key);
    if (r?.added) return rs.filter((x) => x.key !== key);   // just drop a not-yet-saved add
    return rs.map((x) => (x.key === key ? { ...x, removed: !x.removed } : x));
  });

  const toAdd = rows.filter((r) => r.added && !r.removed);
  const toRemove = rows.filter((r) => !r.added && r.removed && r.memberId);
  const toUpdate = rows.filter((r) => !r.added && !r.removed && r.memberId && r.role !== r.originalRole);
  const pending = toAdd.length + toRemove.length + toUpdate.length;

  const save = async () => {
    if (!pending) { onClose(); return; }
    setSaving(true);
    try {
      await Promise.all([
        ...toAdd.map((r) => projectsApi.addMember(projectId, { user_id: r.userId, role: r.role })),
        ...toRemove.map((r) => projectsApi.removeMember(projectId, r.memberId!)),
        ...toUpdate.map((r) => projectsApi.updateMember(projectId, r.memberId!, { role: r.role })),
      ]);
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'project', projectId] });
      toast.success(`Saved — ${toAdd.length} added · ${toUpdate.length} updated · ${toRemove.length} removed`);
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const displayName = (u: AppUser) => u.name || u.email || String(u.id);

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title="Manage Members" size="3xl" closeOnBackdropClick={false}>
      <div className="space-y-4">
        {/* Add a member */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-ds-border bg-ds-surface-hover px-4 py-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-ds-text-muted mb-1">Add member</label>
            <select className="form-select w-full" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {available.map((u) => <option key={u.id} value={String(u.id)}>{displayName(u)}</option>)}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-ds-text-muted mb-1">Role</label>
            <select className="form-select w-full" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              <RoleOptionGroups />
            </select>
          </div>
          <Button size="sm" icon={<UserPlus size={14} />} onClick={addRowFromPicker} disabled={!addUserId}>Add</Button>
        </div>

        {/* Member list */}
        <div className="rounded-lg border border-ds-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-ds-surface-hover text-xs font-semibold text-ds-text-muted">
            <Users size={13} /> {rows.filter((r) => !r.removed).length} member{rows.filter((r) => !r.removed).length === 1 ? '' : 's'}
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-ds-border">
            {rows.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-ds-text-muted">No members yet — add someone above.</div>
            )}
            {rows.map((r) => (
              <div key={r.key} className={`flex items-center gap-3 px-4 py-2.5 ${r.removed ? 'opacity-50' : ''}`}>
                <UserAvatar name={r.name || r.email || r.userId} avatarUrl={r.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-ds-text truncate ${r.removed ? 'line-through' : ''}`}>{r.name || r.email || r.userId}</p>
                  {r.email && <p className="text-xs text-ds-text-muted truncate">{r.email}</p>}
                </div>
                {r.added && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">NEW</span>}
                <select
                  className="form-select text-xs !py-1 !w-auto max-w-[170px] shrink-0"
                  value={r.role}
                  disabled={r.removed || saving}
                  onChange={(e) => setRole(r.key, e.target.value)}
                >
                  <RoleOptionGroups />
                </select>
                <button
                  onClick={() => toggleRemove(r.key)}
                  disabled={saving}
                  className={`p-1.5 rounded-lg shrink-0 transition-colors disabled:opacity-50 ${r.removed ? 'text-indigo-600 hover:bg-indigo-50' : 'text-ds-text-muted hover:text-red-600 hover:bg-red-50'}`}
                  title={r.removed ? 'Undo remove' : 'Remove member'}
                >
                  {r.removed ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ModalActions>
        <div className="flex-1 text-xs text-ds-text-muted self-center">
          {pending > 0 ? `${pending} unsaved change${pending === 1 ? '' : 's'}` : 'No changes'}
        </div>
        <Button variant="outline" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" onClick={save} loading={saving} disabled={saving || pending === 0}>
          Save changes
        </Button>
      </ModalActions>
    </Modal>
  );
};

export default ManageMembersModal;
