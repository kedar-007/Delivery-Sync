import React, { useEffect, useState } from 'react';
import { Shield, Lock, Unlock, Info, Check, Loader } from 'lucide-react';
import Modal, { ModalActions } from './Modal';
import Button from './Button';
import Alert from './Alert';
import { useUserPermissions, useSetUserPermissions } from '../../hooks/useAdmin';

// ─── Permission catalogue (grouped for display) ───────────────────────────────

interface PermGroup {
  label: string;
  color: string;
  perms: { key: string; label: string; desc: string }[];
}

const PERM_GROUPS: PermGroup[] = [
  {
    label: 'Attendance',
    color: 'blue',
    perms: [
      { key: 'ATTENDANCE_READ',  label: 'View Attendance',         desc: 'See own and team attendance records' },
      { key: 'ATTENDANCE_WRITE', label: 'Check In / Out',          desc: 'Log attendance entries' },
      { key: 'ATTENDANCE_ADMIN', label: 'Manage All Attendance',   desc: 'View all users, export CSV, override records' },
    ],
  },
  {
    label: 'Leave',
    color: 'emerald',
    perms: [
      { key: 'LEAVE_READ',    label: 'View Leave',          desc: 'See own leave requests and balances' },
      { key: 'LEAVE_WRITE',   label: 'Request Leave',       desc: 'Submit leave applications' },
      { key: 'LEAVE_APPROVE', label: 'Approve Leave',       desc: 'Approve or reject team leave requests' },
      { key: 'LEAVE_ADMIN',   label: 'Manage Leave',        desc: 'Manage leave types, balances and policies' },
    ],
  },
  {
    label: 'Projects',
    color: 'violet',
    perms: [
      { key: 'PROJECT_READ',    label: 'View Projects',     desc: 'See project list and details' },
      { key: 'PROJECT_WRITE',   label: 'Manage Projects',   desc: 'Create and edit projects' },
      { key: 'MILESTONE_READ',  label: 'View Milestones',   desc: 'See milestones and deadlines' },
      { key: 'MILESTONE_WRITE', label: 'Manage Milestones', desc: 'Create and update milestones' },
      { key: 'SPRINT_READ',     label: 'View Sprints',      desc: 'See sprint boards' },
      { key: 'SPRINT_WRITE',    label: 'Manage Sprints',    desc: 'Create and manage sprints' },
    ],
  },
  {
    label: 'Tasks',
    color: 'amber',
    perms: [
      { key: 'TASK_READ',          label: 'View Tasks',        desc: 'See tasks across projects' },
      { key: 'TASK_WRITE',         label: 'Manage Tasks',      desc: 'Create and update tasks' },
      { key: 'TASK_COMMENT_WRITE', label: 'Comment on Tasks',  desc: 'Add comments to tasks' },
    ],
  },
  {
    label: 'People',
    color: 'teal',
    perms: [
      { key: 'TEAM_READ',         label: 'View Teams',       desc: 'See team structure and members' },
      { key: 'TEAM_WRITE',        label: 'Manage Teams',     desc: 'Create and edit teams' },
      { key: 'ORG_READ',          label: 'View Org Chart',   desc: 'See organisational hierarchy' },
      { key: 'ORG_WRITE',         label: 'Edit Org Chart',   desc: 'Update org structure' },
      { key: 'PROFILE_READ',      label: 'View Profiles',    desc: 'See user profiles and directories' },
      { key: 'PROFILE_WRITE',     label: 'Edit Profiles',    desc: 'Update profile information' },
      { key: 'ANNOUNCEMENT_READ', label: 'View Announcements', desc: 'Read company announcements' },
      { key: 'ANNOUNCEMENT_WRITE','label': 'Post Announcements', desc: 'Create and publish announcements' },
    ],
  },
  {
    label: 'Reports & AI',
    color: 'indigo',
    perms: [
      { key: 'REPORT_READ',    label: 'View Reports',       desc: 'Access reports and analytics' },
      { key: 'REPORT_WRITE',   label: 'Create Reports',     desc: 'Generate and save reports' },
      { key: 'DASHBOARD_READ', label: 'View Dashboard',     desc: 'Access the main dashboard' },
    ],
  },
  {
    label: 'Time Tracking',
    color: 'orange',
    perms: [
      { key: 'TIME_READ',    label: 'View Time Logs',   desc: 'See time tracking entries' },
      { key: 'TIME_WRITE',   label: 'Log Time',         desc: 'Submit time entries' },
      { key: 'TIME_APPROVE', label: 'Approve Time',     desc: 'Approve team time submissions' },
    ],
  },
  {
    label: 'Assets',
    color: 'rose',
    perms: [
      { key: 'ASSET_READ',    label: 'View Assets',     desc: 'See asset inventory' },
      { key: 'ASSET_WRITE',   label: 'Manage Assets',   desc: 'Create and update asset records' },
      { key: 'ASSET_ASSIGN',  label: 'Assign Assets',   desc: 'Assign assets to users' },
      { key: 'ASSET_APPROVE', label: 'Approve Requests','desc': 'Approve asset request tickets' },
      { key: 'ASSET_ADMIN',   label: 'Asset Admin',     desc: 'Full asset management access' },
    ],
  },
  {
    label: 'Administration',
    color: 'slate',
    perms: [
      { key: 'ADMIN_USERS',    label: 'Manage Users',     desc: 'View and update user accounts' },
      { key: 'ADMIN_SETTINGS', label: 'System Settings',  desc: 'Access tenant settings and audit logs' },
      { key: 'INVITE_USER',    label: 'Invite Users',     desc: 'Send invitations to new team members' },
      { key: 'CONFIG_READ',    label: 'View Config',      desc: 'See workflow and feature configurations' },
      { key: 'CONFIG_WRITE',   label: 'Edit Config',      desc: 'Change workflow and feature configurations' },
    ],
  },
];

// ─── Colour helpers ───────────────────────────────────────────────────────────

const GROUP_BG: Record<string, string> = {
  blue: 'bg-blue-50 border-blue-100',
  emerald: 'bg-emerald-50 border-emerald-100',
  violet: 'bg-violet-50 border-violet-100',
  amber: 'bg-amber-50 border-amber-100',
  teal: 'bg-teal-50 border-teal-100',
  indigo: 'bg-indigo-50 border-indigo-100',
  orange: 'bg-orange-50 border-orange-100',
  rose: 'bg-rose-50 border-rose-100',
  slate: 'bg-slate-50 border-slate-100',
};

const GROUP_TITLE: Record<string, string> = {
  blue: 'text-blue-700',
  emerald: 'text-emerald-700',
  violet: 'text-violet-700',
  amber: 'text-amber-700',
  teal: 'text-teal-700',
  indigo: 'text-indigo-700',
  orange: 'text-orange-700',
  rose: 'text-rose-700',
  slate: 'text-slate-700',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userRole: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const UserPermissionsModal = ({ open, onClose, userId, userName, userRole }: Props) => {
  const { data, isLoading } = useUserPermissions(userId, open);
  const save = useSetUserPermissions(userId);

  // Local state: set of all currently-enabled permissions for this user
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Seed from server data once loaded
  useEffect(() => {
    if (!data) return;
    const roleSet = new Set<string>(data.rolePermissions ?? []);
    const granted = new Set<string>(data.granted ?? []);
    const revoked = new Set<string>(data.revoked ?? []);
    // effective = (role ∪ granted) \ revoked
    const effective = new Set<string>([...Array.from(roleSet), ...Array.from(granted)]);
    revoked.forEach((p) => effective.delete(p));
    setEnabled(effective);
    setDirty(false);
  }, [data]);

  const roleSet = new Set<string>(data?.rolePermissions ?? []);

  const toggle = (perm: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm); else next.add(perm);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaveError('');
    // granted = permissions that are ON but not in the role
    // revoked = permissions that are OFF but ARE in the role
    const granted = Array.from(enabled).filter((p) => !roleSet.has(p));
    const revoked = [...(data?.allPermissions ?? [])].filter(
      (p) => roleSet.has(p) && !enabled.has(p)
    );
    try {
      await save.mutateAsync({ granted, revoked });
      setDirty(false);
      onClose();
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Permissions — ${userName}`}
      size="xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader size={18} className="animate-spin" /> Loading permissions…
        </div>
      ) : (
        <>
          {/* Role badge */}
          <div className="flex items-center gap-2 mb-5 px-1">
            <Shield size={14} className="text-gray-400" />
            <span className="text-sm text-gray-500">Role: </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-200">
              {userRole.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-gray-400 ml-1">
              — Role defaults are pre-filled. Toggle to grant extra or revoke.
            </span>
          </div>

          {saveError && <Alert type="error" message={saveError} className="mb-4" />}

          {/* Permission groups */}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {PERM_GROUPS.map((group) => (
              <div key={group.label}
                className={`rounded-xl border p-4 ${GROUP_BG[group.color] ?? 'bg-gray-50 border-gray-100'}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${GROUP_TITLE[group.color] ?? 'text-gray-600'}`}>
                  {group.label}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.perms.map((p) => {
                    const isOn = enabled.has(p.key);
                    const fromRole = roleSet.has(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => toggle(p.key)}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                          isOn
                            ? 'bg-white border-gray-300 shadow-sm'
                            : 'bg-white/50 border-gray-200 opacity-60'
                        }`}
                      >
                        {/* Toggle indicator */}
                        <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          isOn ? 'bg-indigo-600' : 'bg-gray-200'
                        }`}>
                          {isOn && <Check size={10} color="white" strokeWidth={3} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{p.label}</span>
                            {fromRole && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-semibold">
                                via role
                              </span>
                            )}
                            {isOn && !fromRole && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold flex items-center gap-0.5">
                                <Unlock size={9} /> extra
                              </span>
                            )}
                            {!isOn && fromRole && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-semibold flex items-center gap-0.5">
                                <Lock size={9} /> revoked
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-start gap-4 flex-wrap text-xs text-gray-400 px-1">
            <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-semibold">via role</span> Included in the user's role</span>
            <span className="flex items-center gap-1"><Unlock size={10} className="text-emerald-600" /><span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">extra</span> Granted beyond role</span>
            <span className="flex items-center gap-1"><Lock size={10} className="text-red-500" /><span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-semibold">revoked</span> Removed from role defaults</span>
          </div>
        </>
      )}

      <ModalActions>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={!dirty || save.isPending}
          loading={save.isPending}
          icon={<Shield size={14} />}
        >
          Save Permissions
        </Button>
      </ModalActions>
    </Modal>
  );
};

export default UserPermissionsModal;
