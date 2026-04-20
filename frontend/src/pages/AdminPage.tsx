import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, UserCheck, UserX, Shield, Search, Filter, RefreshCw,
  ChevronDown, ChevronUp, Clock, User, Tag, Layers, Calendar, Lock,
  ChevronLeft, ChevronRight, Edit2, Check, X, KeyRound,
  GitBranch, Trash2, Settings, Users, Eye,
  LayoutDashboard, FolderKanban, Package, BarChart3, Briefcase,
  Sparkles, AlertTriangle, Wifi,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import UserAvatar from '../components/ui/UserAvatar';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import {
  useAdminUsers, useInviteUser, useDeactivateUser, useUpdateAdminUser, useAuditLogs,
  useOrgRoles, useCreateOrgRole, useUpdateOrgRole, useDeleteOrgRole,
  useSetOrgRolePermissions, useAssignUserOrgRole, useOrgChart, useAllPermissions,
  useSharingRules, useSetDefaultVisibility, useAddExplicitSharingRule, useDeleteSharingRule,
} from '../hooks/useAdmin';
import UserPermissionsModal from '../components/ui/UserPermissionsModal';
import { useAuth } from '../contexts/AuthContext';
import { canDo, hasPermission, PERMISSIONS, INVITE_ALLOWED_ROLES } from '../utils/permissions';
import { User as UserType } from '../types';

const PAGE_SIZE = 20;

type Tab = 'users' | 'audit' | 'roles' | 'orgchart';
interface InviteForm { email: string; name: string; orgRoleId?: string; }

// ─── Colour swatches for role picker ─────────────────────────────────────────
const ROLE_COLORS = [
  '#4F46E5','#7C3AED','#0EA5E9','#10B981','#F59E0B',
  '#EF4444','#EC4899','#8B5CF6','#14B8A6','#F97316',
  '#6366F1','#06B6D4','#84CC16','#A855F7','#F43F5E',
];

// ─── Org Role card ────────────────────────────────────────────────────────────
interface OrgRole {
  id: string; name: string; description: string; color: string;
  level: number; parentRoleId: string | null;
  permissions: string[]; userCount: number; isActive: boolean;
}

const OrgRoleCard = ({
  role, allRoles, users, onEdit, onDelete, onEditPerms, onAssignUser, onDataAccess,
}: {
  role: OrgRole; allRoles: OrgRole[]; users: UserType[];
  onEdit: (r: OrgRole) => void; onDelete: (id: string) => void;
  onEditPerms: (r: OrgRole) => void;
  onAssignUser: (userId: string, roleId: string | null) => void;
  onDataAccess: (r: OrgRole) => void;
}) => {
  const [showAssign, setShowAssign] = useState(false);
  const parent = allRoles.find((r) => r.id === role.parentRoleId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* colour bar */}
      <div className="h-1.5 w-full" style={{ background: role.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: role.color + '20', border: `1.5px solid ${role.color}40` }}>
              <Shield size={16} style={{ color: role.color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{role.name}</h3>
              {role.description && <p className="text-xs text-gray-400 mt-0.5">{role.description}</p>}
              {parent && (
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <GitBranch size={10} /> Reports to: <span className="font-medium">{parent.name}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onDataAccess(role)} title="Data sharing rules"
              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
              <Eye size={13} />
            </button>
            <button onClick={() => onEditPerms(role)} title="Edit permissions"
              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <KeyRound size={13} />
            </button>
            <button onClick={() => onEdit(role)} title="Edit role"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(role.id)} title="Delete role"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users size={11} /> {role.userCount} {role.userCount === 1 ? 'member' : 'members'}
          </span>
          <span className="flex items-center gap-1">
            <Settings size={11} /> {role.permissions.length} permissions
          </span>
          <span className="flex items-center gap-1">
            <Layers size={11} /> Level {role.level}
          </span>
        </div>

        {/* Assign user */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button onClick={() => setShowAssign((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
            <User size={11} /> Assign member {showAssign ? '▲' : '▼'}
          </button>
          {showAssign && (
            <select
              className="mt-2 form-select text-xs w-full"
              defaultValue=""
              onChange={(e) => { if (e.target.value) { onAssignUser(e.target.value, role.id); setShowAssign(false); } }}
            >
              <option value="">Select user to assign…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Role form modal ──────────────────────────────────────────────────────────
interface RoleFormData { name: string; description: string; color: string; parentRoleId: string; level: number; }

const RoleFormModal = ({
  open, onClose, initial, onSave, saving,
}: {
  open: boolean; onClose: () => void; initial?: OrgRole | null;
  onSave: (d: RoleFormData) => void; saving: boolean;
}) => {
  const [form, setForm] = useState<RoleFormData>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    color: initial?.color ?? ROLE_COLORS[0],
    parentRoleId: initial?.parentRoleId ?? '',
    level: initial?.level ?? 0,
  });
  // Sync when `initial` changes (edit vs create)
  React.useEffect(() => {
    setForm({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      color: initial?.color ?? ROLE_COLORS[0],
      parentRoleId: initial?.parentRoleId ?? '',
      level: initial?.level ?? 0,
    });
  }, [initial, open]);

  const set = (k: keyof RoleFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Role' : 'Create Role'}>
      <div className="space-y-4">
        <div>
          <label className="form-label">Role Name *</label>
          <input className="form-input" placeholder="e.g. Tech Lead" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="form-label">Description</label>
          <input className="form-input" placeholder="Short description" value={form.description} onChange={set('description')} />
        </div>
        <div>
          <label className="form-label">Colour</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ROLE_COLORS.map((c) => (
              <button key={c} type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Set hierarchy by dragging roles in the <strong>Org Chart</strong> tab.
          </p>
        </div>
        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} loading={saving} disabled={!form.name.trim()}>
            {initial ? 'Save Changes' : 'Create Role'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
};

// ─── Role permissions modal ───────────────────────────────────────────────────
// ─── Module → sidebar gate mapping ───────────────────────────────────────────
const SIDEBAR_MODULES = [
  {
    key: 'projects',   label: 'Projects',       icon: FolderKanban,
    desc: 'Project management, tasks, sprints, backlogs, RAID',
    gatePerm: 'PROJECT_READ',
    permGroups: ['Projects & Sprints', 'Tasks', 'Actions & Blockers', 'RAID & Decisions'],
  },
  {
    key: 'daily-work', label: 'Daily Work',      icon: Clock,
    desc: 'Standups, EOD reports, time tracking',
    gatePerm: 'STANDUP_SUBMIT',
    permGroups: ['Standups & EOD', 'Time Tracking'],
  },
  {
    key: 'people',     label: 'People',          icon: Users,
    desc: 'Attendance, leave, teams, org chart, announcements',
    gatePerm: 'TEAM_READ',
    permGroups: ['Attendance & Leave', 'People & Org', 'Teams & Notifications'],
  },
  {
    key: 'assets',     label: 'Assets',          icon: Package,
    desc: 'Asset management and allocation',
    gatePerm: 'ASSET_READ',
    permGroups: ['Assets & Badges'],
  },
  {
    key: 'reports',    label: 'Reports',         icon: BarChart3,
    desc: 'Reports and dashboards',
    gatePerm: 'REPORT_READ',
    permGroups: ['Reports & Dashboard'],
  },
  {
    key: 'ai',         label: 'AI & Insights',   icon: LayoutDashboard,
    desc: 'AI-powered performance, team and org analysis',
    gatePerm: 'AI_INSIGHTS',
    permGroups: ['AI & Insights'],
  },
  {
    key: 'executive',  label: 'Executive',       icon: Briefcase,
    desc: 'CEO/CTO dashboards, portfolio view',
    gatePerm: 'ORG_ROLE_READ',
    permGroups: ['People & Org'],
  },
  {
    key: 'admin',      label: 'Administration',  icon: Settings,
    desc: 'User management, config, workflows',
    gatePerm: 'ADMIN_USERS',
    permGroups: ['Admin'],
  },
] as const;

// ─── Role Permissions Modal ───────────────────────────────────────────────────

const ROLE_PRESETS: Record<string, {
  label: string; emoji: string; summary: string; color: string; permissions: string[];
}> = {
  executive: {
    label: 'Executive / C-Suite', emoji: '👔', color: 'violet',
    summary: 'Broad read access + full AI insights for strategic oversight. No heavy operational writes.',
    permissions: [
      'PROJECT_READ','MILESTONE_READ','SPRINT_READ','TASK_READ',
      'ACTION_READ','BLOCKER_READ','RAID_READ','DECISION_READ',
      'STANDUP_READ','EOD_READ','TIME_READ',
      'ATTENDANCE_READ','LEAVE_READ','ASSET_READ','BADGE_READ',
      'PROFILE_READ','ANNOUNCEMENT_READ','NOTIFICATION_READ',
      'REPORT_READ','REPORT_WRITE','DASHBOARD_READ',
      'TEAM_READ','ORG_READ','ORG_ROLE_READ',
      'AI_INSIGHTS','AI_PERFORMANCE','AI_TEAM_ANALYSIS',
    ],
  },
  techLead: {
    label: 'Tech Lead / Engineering', emoji: '⚙️', color: 'sky',
    summary: 'Full delivery stack: projects, sprints, tasks, RAID + AI insights. Strong operational access.',
    permissions: [
      'PROJECT_READ','PROJECT_WRITE','MILESTONE_READ','MILESTONE_WRITE',
      'SPRINT_READ','SPRINT_WRITE','TASK_READ','TASK_WRITE','TASK_COMMENT_WRITE',
      'ACTION_READ','ACTION_WRITE','BLOCKER_READ','BLOCKER_WRITE',
      'RAID_READ','RAID_WRITE','DECISION_READ','DECISION_WRITE',
      'STANDUP_SUBMIT','STANDUP_READ','EOD_SUBMIT','EOD_READ',
      'TIME_READ','TIME_WRITE','TIME_APPROVE',
      'ATTENDANCE_READ','ATTENDANCE_WRITE','LEAVE_READ','LEAVE_WRITE',
      'ASSET_READ','BADGE_READ','PROFILE_READ',
      'ANNOUNCEMENT_READ','NOTIFICATION_READ',
      'REPORT_READ','REPORT_WRITE','DASHBOARD_READ',
      'TEAM_READ','TEAM_WRITE','ORG_READ','ORG_ROLE_READ','CONFIG_READ',
      'AI_INSIGHTS','AI_PERFORMANCE','AI_TEAM_ANALYSIS',
    ],
  },
  hr: {
    label: 'HR / People Ops', emoji: '👥', color: 'emerald',
    summary: 'Focus on attendance, leave, profiles, badges, org structure. Includes IP config.',
    permissions: [
      'PROJECT_READ','MILESTONE_READ',
      'STANDUP_READ','EOD_READ','TIME_READ','TIME_APPROVE',
      'ATTENDANCE_READ','ATTENDANCE_WRITE','ATTENDANCE_ADMIN','IP_CONFIG_WRITE',
      'LEAVE_READ','LEAVE_WRITE','LEAVE_APPROVE','LEAVE_ADMIN',
      'ASSET_READ','BADGE_READ','BADGE_WRITE','BADGE_AWARD',
      'PROFILE_READ','PROFILE_WRITE',
      'ANNOUNCEMENT_READ','ANNOUNCEMENT_WRITE',
      'NOTIFICATION_READ','INVITE_USER',
      'REPORT_READ','REPORT_WRITE','DASHBOARD_READ',
      'TEAM_READ','TEAM_WRITE','ORG_READ','ORG_WRITE','ORG_ROLE_READ',
      'AI_INSIGHTS','AI_PERFORMANCE',
    ],
  },
  pm: {
    label: 'Project Manager / PMO', emoji: '📋', color: 'amber',
    summary: 'Full project lifecycle: projects, sprints, tasks, reports, team + time approvals.',
    permissions: [
      'PROJECT_READ','PROJECT_WRITE','MILESTONE_READ','MILESTONE_WRITE',
      'SPRINT_READ','SPRINT_WRITE','TASK_READ','TASK_WRITE','TASK_COMMENT_WRITE',
      'ACTION_READ','ACTION_WRITE','BLOCKER_READ','BLOCKER_WRITE',
      'RAID_READ','RAID_WRITE','DECISION_READ','DECISION_WRITE',
      'STANDUP_READ','EOD_READ','TIME_READ','TIME_APPROVE',
      'ATTENDANCE_READ','ATTENDANCE_WRITE','LEAVE_READ','LEAVE_WRITE','LEAVE_APPROVE',
      'ASSET_READ','BADGE_READ','BADGE_AWARD',
      'PROFILE_READ','ANNOUNCEMENT_READ','NOTIFICATION_READ','INVITE_USER',
      'REPORT_READ','REPORT_WRITE','DASHBOARD_READ',
      'TEAM_READ','TEAM_WRITE','ORG_READ','ORG_ROLE_READ','CONFIG_READ',
      'AI_INSIGHTS','AI_PERFORMANCE','AI_TEAM_ANALYSIS',
    ],
  },
  contributor: {
    label: 'Individual Contributor', emoji: '💼', color: 'blue',
    summary: 'Standard employee: submit standups, manage own tasks, log time, track attendance & leave.',
    permissions: [
      'PROJECT_READ','MILESTONE_READ','SPRINT_READ',
      'TASK_READ','TASK_WRITE','TASK_COMMENT_WRITE',
      'ACTION_READ','ACTION_WRITE','BLOCKER_READ','BLOCKER_WRITE',
      'RAID_READ','DECISION_READ',
      'STANDUP_SUBMIT','STANDUP_READ','EOD_SUBMIT','EOD_READ',
      'TIME_READ','TIME_WRITE',
      'ATTENDANCE_READ','ATTENDANCE_WRITE',
      'LEAVE_READ','LEAVE_WRITE',
      'ASSET_READ','BADGE_READ',
      'PROFILE_READ','PROFILE_WRITE',
      'ANNOUNCEMENT_READ','NOTIFICATION_READ',
      'REPORT_READ','DASHBOARD_READ',
      'TEAM_READ','ORG_READ',
    ],
  },
  itAdmin: {
    label: 'IT Admin / Security', emoji: '🔐', color: 'red',
    summary: 'System config, user management, IP restriction config, asset admin. High-privilege role.',
    permissions: [
      'PROJECT_READ','MILESTONE_READ','TASK_READ',
      'ATTENDANCE_READ','ATTENDANCE_ADMIN','IP_CONFIG_WRITE',
      'LEAVE_READ','ASSET_READ','ASSET_WRITE','ASSET_ASSIGN','ASSET_APPROVE','ASSET_ADMIN',
      'BADGE_READ','PROFILE_READ',
      'ANNOUNCEMENT_READ','NOTIFICATION_READ',
      'REPORT_READ','DASHBOARD_READ',
      'TEAM_READ','ORG_READ','ORG_ROLE_READ',
      'ADMIN_USERS','ADMIN_SETTINGS','CONFIG_READ','CONFIG_WRITE',
    ],
  },
  finance: {
    label: 'Finance / CFO', emoji: '💰', color: 'orange',
    summary: 'Time tracking oversight, reports, resource costs. Read-heavy with time approval.',
    permissions: [
      'PROJECT_READ','MILESTONE_READ','SPRINT_READ','TASK_READ',
      'STANDUP_READ','EOD_READ','TIME_READ','TIME_APPROVE',
      'ATTENDANCE_READ','LEAVE_READ','ASSET_READ','BADGE_READ',
      'PROFILE_READ','ANNOUNCEMENT_READ','NOTIFICATION_READ',
      'REPORT_READ','REPORT_WRITE','DASHBOARD_READ',
      'TEAM_READ','ORG_READ','ORG_ROLE_READ',
      'AI_INSIGHTS','AI_PERFORMANCE',
    ],
  },
};

const detectRolePreset = (name: string, desc: string): string | null => {
  const t = (name + ' ' + desc).toLowerCase();
  if (/ceo|chief executive|president|managing director/.test(t)) return 'executive';
  if (/coo|chief operating/.test(t)) return 'executive';
  if (/cto|chief technology|vp eng|engineering manager|tech lead|software architect/.test(t)) return 'techLead';
  if (/cfo|chief financial|finance|controller|accounting/.test(t)) return 'finance';
  if (/chro|hr |human resources|people ops|talent|recruitment/.test(t)) return 'hr';
  if (/pmo|project manager|programme manager|scrum master|delivery manager|product manager/.test(t)) return 'pm';
  if (/it admin|security|infrastructure|devops|sysadmin|system admin|ciso/.test(t)) return 'itAdmin';
  if (/developer|engineer|designer|analyst|contributor|specialist|associate/.test(t)) return 'contributor';
  if (/vp |vice president|director|head of|svp|evp/.test(t)) return 'executive';
  if (/manager|team lead|lead/.test(t)) return 'pm';
  return null;
};

const PERM_INFO: Record<string, { label: string; desc: string; risk: 'low' | 'medium' | 'high' }> = {
  PROJECT_READ:       { label: 'View Projects',      desc: 'See project list and details',                   risk: 'low' },
  PROJECT_WRITE:      { label: 'Manage Projects',    desc: 'Create and edit projects, add members',          risk: 'medium' },
  MILESTONE_READ:     { label: 'View Milestones',    desc: 'See milestone due dates and status',             risk: 'low' },
  MILESTONE_WRITE:    { label: 'Manage Milestones',  desc: 'Create and update milestones',                   risk: 'low' },
  SPRINT_READ:        { label: 'View Sprints',       desc: 'See sprint boards and velocity',                 risk: 'low' },
  SPRINT_WRITE:       { label: 'Manage Sprints',     desc: 'Create, start, complete sprints',                risk: 'medium' },
  TASK_READ:          { label: 'View Tasks',         desc: 'See tasks across projects',                      risk: 'low' },
  TASK_WRITE:         { label: 'Manage Tasks',       desc: 'Create, assign and update tasks',                risk: 'low' },
  TASK_COMMENT_WRITE: { label: 'Comment on Tasks',   desc: 'Add comments to tasks',                          risk: 'low' },
  ACTION_READ:        { label: 'View Actions',       desc: 'See action items and owners',                    risk: 'low' },
  ACTION_WRITE:       { label: 'Manage Actions',     desc: 'Create and update action items',                 risk: 'low' },
  BLOCKER_READ:       { label: 'View Blockers',      desc: 'See blockers and impediments',                   risk: 'low' },
  BLOCKER_WRITE:      { label: 'Manage Blockers',    desc: 'Log and escalate blockers',                      risk: 'low' },
  RAID_READ:          { label: 'View RAID',          desc: 'See risks, issues, dependencies',                risk: 'low' },
  RAID_WRITE:         { label: 'Manage RAID',        desc: 'Create and update RAID items',                   risk: 'low' },
  DECISION_READ:      { label: 'View Decisions',     desc: 'See decision log',                               risk: 'low' },
  DECISION_WRITE:     { label: 'Log Decisions',      desc: 'Add entries to decision log',                    risk: 'low' },
  STANDUP_SUBMIT:     { label: 'Submit Standup',     desc: 'Post daily standup updates',                     risk: 'low' },
  STANDUP_READ:       { label: 'View Standups',      desc: 'Read team standup history',                      risk: 'low' },
  EOD_SUBMIT:         { label: 'Submit EOD',         desc: 'Post end-of-day reports',                        risk: 'low' },
  EOD_READ:           { label: 'View EODs',          desc: 'Read team EOD reports',                          risk: 'low' },
  TIME_READ:          { label: 'View Time Logs',     desc: 'See time tracking entries',                      risk: 'low' },
  TIME_WRITE:         { label: 'Log Time',           desc: 'Submit time entries',                            risk: 'low' },
  TIME_APPROVE:       { label: 'Approve Time',       desc: 'Approve team time submissions',                  risk: 'medium' },
  ATTENDANCE_READ:    { label: 'View Attendance',    desc: 'See own and team attendance records',            risk: 'low' },
  ATTENDANCE_WRITE:   { label: 'Check In / Out',     desc: 'Log daily attendance, WFH, breaks',             risk: 'low' },
  ATTENDANCE_ADMIN:   { label: 'Attendance Admin',   desc: 'Override records, view all, export CSV',        risk: 'high' },
  IP_CONFIG_WRITE:    { label: 'IP Restriction',     desc: 'Manage office IP whitelist & toggle enforcement', risk: 'high' },
  LEAVE_READ:         { label: 'View Leave',         desc: 'See own leave requests and balance',             risk: 'low' },
  LEAVE_WRITE:        { label: 'Request Leave',      desc: 'Submit leave applications',                      risk: 'low' },
  LEAVE_APPROVE:      { label: 'Approve Leave',      desc: 'Approve or reject team leave',                  risk: 'medium' },
  LEAVE_ADMIN:        { label: 'Manage Leave',       desc: 'Manage types, balances, policies',              risk: 'high' },
  TEAM_READ:          { label: 'View Teams',         desc: 'See team structure and members',                 risk: 'low' },
  TEAM_WRITE:         { label: 'Manage Teams',       desc: 'Create and edit teams',                         risk: 'medium' },
  ORG_READ:           { label: 'View Org Chart',     desc: 'See organisational hierarchy',                   risk: 'low' },
  ORG_WRITE:          { label: 'Edit Org Chart',     desc: 'Reassign managers, edit hierarchy',             risk: 'high' },
  ORG_ROLE_READ:      { label: 'View Org Roles',     desc: 'See roles and their permissions',               risk: 'low' },
  ORG_ROLE_WRITE:     { label: 'Manage Org Roles',   desc: 'Create, edit, assign org roles',                risk: 'high' },
  PROFILE_READ:       { label: 'View Profiles',      desc: 'See user profiles and directory',               risk: 'low' },
  PROFILE_WRITE:      { label: 'Edit Profiles',      desc: 'Update own profile information',                risk: 'low' },
  ANNOUNCEMENT_READ:  { label: 'View Announcements', desc: 'Read company announcements',                    risk: 'low' },
  ANNOUNCEMENT_WRITE: { label: 'Post Announcements', desc: 'Create and publish announcements',              risk: 'medium' },
  NOTIFICATION_READ:  { label: 'Notifications',      desc: 'Receive in-app notifications',                  risk: 'low' },
  INVITE_USER:        { label: 'Invite Users',       desc: 'Send invitations to new members',               risk: 'medium' },
  ASSET_READ:         { label: 'View Assets',        desc: 'See asset inventory',                           risk: 'low' },
  ASSET_WRITE:        { label: 'Manage Assets',      desc: 'Create and update asset records',               risk: 'medium' },
  ASSET_ASSIGN:       { label: 'Assign Assets',      desc: 'Assign assets to users',                        risk: 'medium' },
  ASSET_APPROVE:      { label: 'Approve Requests',   desc: 'Approve asset request tickets',                 risk: 'medium' },
  ASSET_ADMIN:        { label: 'Asset Admin',        desc: 'Full asset management access',                  risk: 'high' },
  BADGE_READ:         { label: 'View Badges',        desc: 'See badge catalog and awards',                  risk: 'low' },
  BADGE_WRITE:        { label: 'Manage Badges',      desc: 'Create and edit badge definitions',             risk: 'low' },
  BADGE_AWARD:        { label: 'Award Badges',       desc: 'Grant badges to team members',                  risk: 'low' },
  REPORT_READ:        { label: 'View Reports',       desc: 'Access reports and analytics',                  risk: 'low' },
  REPORT_WRITE:       { label: 'Create Reports',     desc: 'Generate and export reports',                   risk: 'medium' },
  DASHBOARD_READ:     { label: 'View Dashboard',     desc: 'Access main dashboard KPIs',                    risk: 'low' },
  AI_INSIGHTS:        { label: 'AI Insights',        desc: 'Daily summary, suggestions, NLQ, voice',        risk: 'low' },
  AI_PERFORMANCE:     { label: 'AI Performance',     desc: 'Individual performance analysis cards',         risk: 'medium' },
  AI_TEAM_ANALYSIS:   { label: 'AI Team Analysis',   desc: 'Org-wide health, trends, retrospectives',       risk: 'high' },
  ADMIN_USERS:        { label: 'Manage Users',       desc: 'Invite, edit, deactivate users',                risk: 'high' },
  ADMIN_SETTINGS:     { label: 'System Settings',    desc: 'Tenant settings and audit logs',                risk: 'high' },
  CONFIG_READ:        { label: 'View Config',        desc: 'See feature flags and configurations',          risk: 'low' },
  CONFIG_WRITE:       { label: 'Edit Config',        desc: 'Change features and workflow rules',            risk: 'high' },
  DATA_SEED:          { label: 'Data Seeding',       desc: 'Generate/clear demo or test data',              risk: 'high' },
};

const PRESET_COLORS: Record<string, { bg: string; border: string; text: string; btn: string }> = {
  violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-800',  btn: 'bg-violet-100 text-violet-700 border-violet-200' },
  sky:     { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-800',     btn: 'bg-sky-100 text-sky-700 border-sky-200' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', btn: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   btn: 'bg-amber-100 text-amber-700 border-amber-200' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    btn: 'bg-blue-100 text-blue-700 border-blue-200' },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     btn: 'bg-red-100 text-red-700 border-red-200' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  btn: 'bg-orange-100 text-orange-700 border-orange-200' },
};

const RISK_CHIP: Record<string, string> = {
  low:    'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
};

const RolePermissionsModal = ({
  open, onClose, role, onSave, saving,
}: {
  open: boolean; onClose: () => void; role: OrgRole | null;
  onSave: (perms: string[]) => void; saving: boolean;
}) => {
  const { data: permData } = useAllPermissions();
  const groups: { group: string; keys: string[] }[] = permData?.groups ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [permTab, setPermTab] = useState<'modules' | 'permissions'>('modules');
  const [permSearch, setPermSearch] = useState('');
  const [hoveredPerm, setHoveredPerm] = useState<string | null>(null);

  const detectedPreset = role ? detectRolePreset(role.name, role.description) : null;
  const preset = detectedPreset ? ROLE_PRESETS[detectedPreset] : null;
  const presetClr = preset ? (PRESET_COLORS[preset.color] ?? PRESET_COLORS.violet) : null;

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(role?.permissions ?? []));
      setPermTab('modules');
      setPermSearch('');
      setHoveredPerm(null);
    }
  }, [role, open]);

  const toggle = (key: string) =>
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleGroup = (keys: string[]) => {
    const allOn = keys.every((k) => selected.has(k));
    setSelected((s) => { const n = new Set(s); keys.forEach((k) => allOn ? n.delete(k) : n.add(k)); return n; });
  };

  const toggleModule = (mod: typeof SIDEBAR_MODULES[number]) => {
    setSelected((s) => { const n = new Set(s); n.has(mod.gatePerm) ? n.delete(mod.gatePerm) : n.add(mod.gatePerm); return n; });
  };

  const applyPreset = (key: string) => setSelected(new Set(ROLE_PRESETS[key]?.permissions ?? []));

  const filteredGroups = groups
    .map(({ group, keys }) => ({
      group,
      keys: permSearch.trim()
        ? keys.filter((k) => {
            const info = PERM_INFO[k];
            return k.toLowerCase().includes(permSearch.toLowerCase()) ||
                   (info?.label ?? '').toLowerCase().includes(permSearch.toLowerCase());
          })
        : keys,
    }))
    .filter(({ keys }) => keys.length > 0);

  const suggestedSet = preset ? new Set(preset.permissions) : null;
  const matchCount   = preset ? preset.permissions.filter((p) => selected.has(p)).length : 0;
  const missingPerms = preset ? preset.permissions.filter((p) => !selected.has(p)) : [];
  const hovInfo = hoveredPerm ? PERM_INFO[hoveredPerm] : null;

  return (
    <Modal open={open} onClose={onClose} size="3xl">
      {/* ── Custom header ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: (role?.color ?? '#4F46E5') + '22', border: `1.5px solid ${role?.color ?? '#4F46E5'}44` }}>
          <Shield size={18} style={{ color: role?.color ?? '#4F46E5' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 truncate">Permissions — {role?.name ?? ''}</h2>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {role?.description || 'Set which features and actions this org role can access'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
            {selected.size} permissions
          </span>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex gap-5" style={{ height: '62vh' }}>

        {/* Left: tabs + content */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Tab bar */}
          <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 shrink-0">
            {(['modules', 'permissions'] as const).map((t) => (
              <button key={t} onClick={() => setPermTab(t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  permTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'modules' ? 'Module Access' : `Permissions (${selected.size})`}
              </button>
            ))}
          </div>

          {/* ── Modules tab ── */}
          {permTab === 'modules' && (
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              <p className="text-xs text-gray-400 mb-2">
                Toggle sidebar sections for this role. Turning a module off hides the entire section for every member of this role.
              </p>
              {SIDEBAR_MODULES.map((mod) => {
                const on = selected.has(mod.gatePerm);
                const Icon = mod.icon;
                return (
                  <button key={mod.key} onClick={() => toggleModule(mod)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      on ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-100' : 'border-gray-200 bg-white hover:bg-gray-50 opacity-60'
                    }`}>
                    <div className={`p-2 rounded-lg shrink-0 ${on ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                      <Icon size={15} className={on ? 'text-indigo-600' : 'text-gray-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${on ? 'text-gray-900' : 'text-gray-500'}`}>{mod.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${on ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                          {on ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{mod.desc}</p>
                    </div>
                    <div className={`w-9 h-5 rounded-full transition-colors shrink-0 flex items-center ${on ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                      <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Permissions tab ── */}
          {permTab === 'permissions' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="relative mb-2 shrink-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search permissions…" value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50" />
              </div>

              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {filteredGroups.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No permissions match "{permSearch}"</p>
                ) : filteredGroups.map(({ group, keys }) => {
                  const allOn = keys.every((k) => selected.has(k));
                  const someOn = !allOn && keys.some((k) => selected.has(k));
                  const parentModule = SIDEBAR_MODULES.find((m) => m.permGroups.includes(group as never));
                  const moduleOff = parentModule && !selected.has(parentModule.gatePerm);
                  return (
                    <div key={group}
                      className={`rounded-xl border p-3 transition-opacity ${moduleOff ? 'opacity-40 bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <input type="checkbox" checked={allOn}
                          ref={(el) => { if (el) el.indeterminate = someOn; }}
                          onChange={() => toggleGroup(keys)}
                          className="rounded text-indigo-600 cursor-pointer" />
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{group}</span>
                        {moduleOff && parentModule && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                            {parentModule.label} module off
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400 font-medium">
                          {keys.filter((k) => selected.has(k)).length}/{keys.length}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {keys.map((k) => {
                          const isOn = selected.has(k);
                          const info = PERM_INFO[k];
                          const label = info?.label ?? k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
                          const isSuggested = suggestedSet?.has(k);
                          return (
                            <button key={k} type="button"
                              onClick={() => toggle(k)}
                              onMouseEnter={() => setHoveredPerm(k)}
                              onMouseLeave={() => setHoveredPerm(null)}
                              className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                hoveredPerm === k ? 'ring-1 ring-indigo-400' : ''
                              } ${isOn ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-55'}`}>
                              <div className={`mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors ${isOn ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                {isOn && <Check size={9} color="white" strokeWidth={3} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-xs font-medium text-gray-800 leading-tight">{label}</span>
                                  {k === 'IP_CONFIG_WRITE' && (
                                    <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold leading-none flex items-center gap-0.5">
                                      <Wifi size={7} /> IP
                                    </span>
                                  )}
                                  {info?.risk === 'high' && isOn && (
                                    <span className="text-[9px] px-1 py-0.5 bg-red-100 text-red-600 rounded font-bold leading-none">high</span>
                                  )}
                                  {isSuggested && !isOn && (
                                    <span className="text-[9px] px-1 py-0.5 bg-violet-100 text-violet-600 rounded font-bold leading-none">suggested</span>
                                  )}
                                </div>
                                {info?.desc && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight truncate">{info.desc}</p>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: AI Role Advisor ── */}
        <div className="w-64 shrink-0 flex flex-col bg-gradient-to-b from-purple-50/80 to-violet-50/40 rounded-xl border border-purple-100 p-4 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-purple-100">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-purple-800">AI Role Advisor</p>
              <p className="text-[10px] text-purple-400 leading-none">Auto-detects from role name</p>
            </div>
          </div>

          {/* Detected preset card */}
          {preset && presetClr ? (
            <div className={`rounded-xl border p-3 mb-3 ${presetClr.bg} ${presetClr.border}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xl leading-none">{preset.emoji}</span>
                <div>
                  <p className={`text-xs font-bold leading-tight ${presetClr.text}`}>{preset.label}</p>
                  <p className="text-[10px] text-gray-500 leading-none">Detected from role name</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed mb-2.5">{preset.summary}</p>

              {/* Coverage bar */}
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>{matchCount} of {preset.permissions.length} suggested</span>
                <span>{Math.round((matchCount / preset.permissions.length) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-2.5">
                <div className={`h-full rounded-full transition-all ${matchCount === preset.permissions.length ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.round((matchCount / preset.permissions.length) * 100)}%` }} />
              </div>

              <button onClick={() => applyPreset(detectedPreset!)}
                className={`w-full text-xs font-semibold py-1.5 rounded-lg border transition-colors hover:opacity-80 ${presetClr.btn}`}>
                ✦ Apply {preset.label} Preset
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-white border border-amber-200 p-3 mb-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-700">No role type detected</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                    Add keywords like <em>CEO</em>, <em>HR Manager</em>, <em>Developer</em>, or <em>IT Admin</em> to the role name or description.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Missing from preset */}
          {missingPerms.length > 0 && !hovInfo && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 mb-3">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1.5">
                Missing ({missingPerms.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {missingPerms.slice(0, 6).map((k) => (
                  <button key={k} onClick={() => toggle(k)}
                    className="text-[10px] px-1.5 py-0.5 bg-white border border-amber-200 text-amber-700 rounded hover:bg-amber-100 transition-colors font-medium"
                    title={`Enable ${PERM_INFO[k]?.label ?? k}`}>
                    + {PERM_INFO[k]?.label ?? k.replace(/_/g, ' ')}
                  </button>
                ))}
                {missingPerms.length > 6 && (
                  <span className="text-[10px] text-amber-500 self-center">+{missingPerms.length - 6} more</span>
                )}
              </div>
            </div>
          )}

          {/* Hovered permission detail */}
          {hovInfo && (
            <div className="rounded-xl bg-white border border-indigo-200 p-3 mb-3">
              <p className="text-xs font-bold text-gray-800 mb-0.5">{hovInfo.label}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{hovInfo.desc}</p>
              {hoveredPerm === 'IP_CONFIG_WRITE' && (
                <p className="text-[11px] text-blue-700 bg-blue-50 rounded p-1.5 mb-2 leading-relaxed">
                  Controls the office IP whitelist. Wrong config can block all employees from checking in.
                </p>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${RISK_CHIP[hovInfo.risk]}`}>
                {hovInfo.risk} risk
              </span>
            </div>
          )}

          {/* Other presets list */}
          <div className="mt-auto">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
              {preset ? 'Other presets' : 'Apply a preset'}
            </p>
            <div className="space-y-1">
              {Object.entries(ROLE_PRESETS)
                .filter(([k]) => k !== detectedPreset)
                .map(([key, p]) => (
                  <button key={key} onClick={() => applyPreset(key)}
                    className="w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg border border-gray-100 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                    <span className="text-sm leading-none">{p.emoji}</span>
                    <span className="font-medium text-gray-700 text-[11px] flex-1 truncate">{p.label}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{p.permissions.length}p</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      <ModalActions>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(Array.from(selected))} loading={saving}>
          Save ({selected.size} permissions)
        </Button>
      </ModalActions>
    </Modal>
  );
};

// ─── Data Sharing Rules modal ─────────────────────────────────────────────────
const SCOPE_OPTIONS = [
  { value: 'OWN_DATA',    label: 'Own Data',     desc: 'Can only see records they personally created or own.' },
  { value: 'ROLE_PEERS',  label: 'Role Peers',   desc: 'Own records + records owned by colleagues in the same role.' },
  { value: 'SUBORDINATES',label: 'Subordinates', desc: 'Own records + all records owned by roles below in hierarchy.' },
  { value: 'ORG_WIDE',    label: 'Org Wide',     desc: 'Can see all records across the organisation.' },
];

const DataSharingModal = ({
  open, onClose, role, allRoles,
}: {
  open: boolean; onClose: () => void; role: OrgRole | null; allRoles: OrgRole[];
}) => {
  const roleId = role?.id ?? null;
  const { data: sharingData, isLoading } = useSharingRules(roleId);
  const setVisibility  = useSetDefaultVisibility(roleId ?? '');
  const addExplicit    = useAddExplicitSharingRule(roleId ?? '');
  const deleteRule     = useDeleteSharingRule(roleId ?? '');

  const defaultScope: string = (sharingData as any)?.defaultVisibility?.visibilityScope ?? 'OWN_DATA';
  const explicitRules: any[] = (sharingData as any)?.explicitRules ?? [];

  const [selectedScope, setSelectedScope] = useState('OWN_DATA');
  const [addingExplicit, setAddingExplicit] = useState(false);
  const [explicitTarget, setExplicitTarget] = useState('');
  const [explicitAccess, setExplicitAccess] = useState('READ');

  React.useEffect(() => {
    if (open) {
      setSelectedScope(defaultScope);
      setAddingExplicit(false);
      setExplicitTarget('');
      setExplicitAccess('READ');
    }
  }, [open, defaultScope]);

  if (!role) return null;

  const scopeLabel = (s: string) => SCOPE_OPTIONS.find(o => o.value === s)?.label ?? s;

  return (
    <Modal open={open} onClose={onClose} title={`Data Access — ${role.name}`}>
      <div className="space-y-5">
        {/* Explanation */}
        <p className="text-sm text-gray-500">
          Control which records members of <strong>{role.name}</strong> can see by default,
          and add explicit cross-role grants.
        </p>

        {isLoading ? (
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ) : (
          <>
            {/* ── Default visibility ── */}
            <div>
              <label className="form-label mb-2">Default Visibility Scope</label>
              <div className="space-y-2">
                {SCOPE_OPTIONS.map((opt) => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                      ${selectedScope === opt.value
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                    <input type="radio" name="scope" value={opt.value}
                      checked={selectedScope === opt.value}
                      onChange={() => setSelectedScope(opt.value)}
                      className="mt-0.5 text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <Button
                className="mt-3"
                size="sm"
                loading={setVisibility.isPending}
                disabled={selectedScope === defaultScope}
                onClick={() => setVisibility.mutate({ visibilityScope: selectedScope })}
              >
                Apply Scope
              </Button>
              {selectedScope !== defaultScope && (
                <p className="text-xs text-amber-600 mt-1">
                  Unsaved — current: <strong>{scopeLabel(defaultScope)}</strong>
                </p>
              )}
            </div>

            {/* ── Explicit rules ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Explicit Cross-Role Grants</label>
                <button
                  onClick={() => setAddingExplicit((v) => !v)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                  <Plus size={12} /> Add grant
                </button>
              </div>

              {addingExplicit && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <select
                    value={explicitTarget}
                    onChange={(e) => setExplicitTarget(e.target.value)}
                    className="form-select text-xs flex-1 min-w-0"
                  >
                    <option value="">Select target role…</option>
                    {allRoles.filter(r => r.id !== role.id).map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <select
                    value={explicitAccess}
                    onChange={(e) => setExplicitAccess(e.target.value)}
                    className="form-select text-xs w-24"
                  >
                    <option value="READ">Read</option>
                    <option value="WRITE">Write</option>
                    <option value="FULL">Full</option>
                  </select>
                  <Button
                    size="sm"
                    loading={addExplicit.isPending}
                    disabled={!explicitTarget}
                    onClick={async () => {
                      await addExplicit.mutateAsync({ targetRoleId: explicitTarget, accessLevel: explicitAccess });
                      setAddingExplicit(false);
                      setExplicitTarget('');
                      setExplicitAccess('READ');
                    }}
                  >
                    Add
                  </Button>
                </div>
              )}

              {explicitRules.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2">No explicit grants configured.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {explicitRules.map((r: any) => {
                    const targetRole = allRoles.find(ar => ar.id === String(r.targetRoleId));
                    return (
                      <div key={r.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: targetRole?.color ?? '#94a3b8' }} />
                          <span className="font-medium text-gray-800 truncate">
                            {targetRole?.name ?? `Role #${r.targetRoleId}`}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold shrink-0
                            ${r.accessLevel === 'FULL' ? 'bg-purple-100 text-purple-700'
                              : r.accessLevel === 'WRITE' ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'}`}>
                            {r.accessLevel ?? 'READ'}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteRule.mutate(String(r.id))}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <ModalActions>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </ModalActions>
      </div>
    </Modal>
  );
};

// ─── Org Chart — visual tree with SVG connectors ─────────────────────────────
const ORG_NODE_W  = 164;   // card width  (px)
const ORG_CARD_H  = 208;   // approx card height (px) — used for SVG line origins
const ORG_V_GAP   = 80;    // vertical gap between a card bottom and the next level top
const ORG_H_GAP   = 20;    // horizontal gap between sibling subtrees

/** Build absolute (x, y) positions for every node. */
function buildOrgLayout(all: any[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};

  // Calculate depth from parent chain (not trusting DB `level` field)
  const depth = (id: string, guard = 0): number => {
    if (guard > 20) return 0;
    const node = all.find((n) => n.id === id);
    return node?.parentRoleId ? 1 + depth(node.parentRoleId, guard + 1) : 0;
  };

  function assignX(nodeId: string, startX: number): number {
    const kids = all.filter((n) => n.parentRoleId === nodeId);
    if (!kids.length) {
      pos[nodeId] = { x: startX + ORG_NODE_W / 2, y: depth(nodeId) * (ORG_CARD_H + ORG_V_GAP) };
      return startX + ORG_NODE_W;
    }
    let x = startX;
    const kidCenters: number[] = [];
    kids.forEach((c) => {
      const end = assignX(c.id, x);
      kidCenters.push(pos[c.id].x);
      x = end + ORG_H_GAP;
    });
    pos[nodeId] = {
      x: (kidCenters[0] + kidCenters[kidCenters.length - 1]) / 2,
      y: depth(nodeId) * (ORG_CARD_H + ORG_V_GAP),
    };
    return x - ORG_H_GAP;
  }

  const roots = all.filter((n) => !n.parentRoleId);
  let startX = 0;
  roots.forEach((r) => {
    const endX = assignX(r.id, startX);
    startX = endX + ORG_H_GAP * 4;
  });

  return pos;
}

const OrgChartView = () => {
  const { data, isLoading, refetch } = useOrgChart();
  const [view, setView] = useState<'chart' | 'list'>('chart');
  const [search, setSearch] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const allNodes: any[] = useMemo(() => (data as any)?.nodes ?? [], [data]);
  const totalMembers = allNodes.reduce((s: number, n: any) => s + (n.users?.length ?? 0), 0);
  const layout = useMemo(() => buildOrgLayout(allNodes), [allNodes]);

  const totalW = allNodes.length
    ? Math.max(...allNodes.map((n) => (layout[n.id]?.x ?? 0) + ORG_NODE_W / 2)) + 40
    : 400;
  const totalH = allNodes.length
    ? Math.max(...allNodes.map((n) => (layout[n.id]?.y ?? 0) + ORG_CARD_H)) + 40
    : 300;

  if (isLoading) return (
    <div className="flex justify-center gap-8 p-12">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="w-40 h-52 rounded-2xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  );

  if (!allNodes.length) return (
    <EmptyState
      title="No org chart yet"
      description="Create roles in the Roles tab and assign users to build the org chart."
    />
  );

  // ── helpers ──────────────────────────────────────────────────────────────────
  const isDescendantOf = (ancestorId: string, candidateId: string, guard = 0): boolean => {
    if (guard > 20) return false;
    return allNodes
      .filter((n) => n.parentRoleId === ancestorId)
      .some((c) => c.id === candidateId || isDescendantOf(c.id, candidateId, guard + 1));
  };

  const handleDrop = async (e: React.DragEvent, newParentId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('orgRoleId');
    setDropTarget(null);
    if (!draggedId || draggedId === newParentId) return;
    if (newParentId && isDescendantOf(draggedId, newParentId)) return;
    setSaving(true);
    try {
      await adminApi.updateOrgRole(draggedId, { parentRoleId: newParentId || null });
      refetch();
    } catch { /* silent */ }
    setSaving(false);
    setDraggingId(null);
  };

  // ── SVG connector paths ───────────────────────────────────────────────────────
  const connectors = allNodes
    .filter((n) => n.parentRoleId && layout[n.parentRoleId] && layout[n.id])
    .map((n) => {
      const p = layout[n.parentRoleId!];
      const c = layout[n.id];
      const x1 = p.x, y1 = p.y + ORG_CARD_H;
      const x2 = c.x, y2 = c.y;
      const midY = (y1 + y2) / 2;
      return (
        <path key={n.id}
          d={`M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`}
          stroke="#d1d5db" strokeWidth={1.5} fill="none" strokeLinecap="round"
        />
      );
    });

  // ── Drag-preview connector (dashed, indigo) ────────────────────────────────
  const dragPreview = (() => {
    if (!draggingId || !dropTarget || draggingId === dropTarget) return null;
    const from = layout[draggingId];
    const to   = layout[dropTarget];
    if (!from || !to) return null;
    const x1 = from.x, y1 = from.y + ORG_CARD_H;
    const x2 = to.x,   y2 = to.y;
    const midY = (y1 + y2) / 2;
    return (
      <>
        {/* Animated dashed preview line */}
        <path
          d={`M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`}
          stroke="#6366f1" strokeWidth={2} fill="none" strokeLinecap="round"
          strokeDasharray="6 4"
          style={{ animation: 'dashMove 0.5s linear infinite' }}
        />
        {/* Circle at target node top */}
        <circle cx={x2} cy={y2} r={5} fill="#6366f1" opacity={0.9} />
        {/* Circle at source node bottom */}
        <circle cx={x1} cy={y1} r={5} fill="#6366f1" opacity={0.6} />
      </>
    );
  })();

  // ── individual node card ──────────────────────────────────────────────────────
  const OrgNode = ({ node }: { node: any }) => {
    const pos = layout[node.id];
    if (!pos) return null;
    const isDragging = draggingId === node.id;
    const isOver = dropTarget === node.id;

    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('orgRoleId', node.id);
          e.stopPropagation();
          setDraggingId(node.id);
        }}
        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
        onDragOver={(e) => { e.preventDefault(); setDropTarget(node.id); }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={(e) => handleDrop(e, node.id)}
        data-org-node="1"
        style={{
          position: 'absolute',
          top: pos.y,
          left: pos.x - ORG_NODE_W / 2,
          width: ORG_NODE_W,
        }}
        className={[
          'flex flex-col items-center gap-1.5 p-3 rounded-2xl border bg-white',
          'cursor-grab active:cursor-grabbing select-none text-center',
          'transition-all duration-150',
          isDragging ? 'opacity-30 scale-95' : '',
          isOver
            ? 'border-indigo-400 shadow-xl ring-2 ring-indigo-200 scale-105'
            : 'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300',
        ].join(' ')}
      >
        {/* Role colour circle */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center ring-4 ring-white shadow-md shrink-0"
          style={{ background: node.color }}
        >
          <Shield size={20} className="text-white opacity-90" />
        </div>

        {/* Role name */}
        <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2 mt-0.5 w-full">
          {node.name}
        </p>

        {/* Description */}
        {node.description && (
          <p className="text-xs text-gray-400 line-clamp-1 w-full">{node.description}</p>
        )}

        {/* Colour badge */}
        <span
          className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full max-w-full truncate"
          style={{ background: node.color + '22', color: node.color }}
        >
          {node.name}
        </span>

        {/* Member count */}
        <span className="text-xs text-gray-400">
          {node.userCount ?? 0} {(node.userCount ?? 0) === 1 ? 'member' : 'members'}
        </span>
      </div>
    );
  };

  // ── list view fallback ────────────────────────────────────────────────────────
  const filtered = search
    ? allNodes.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    : [...allNodes].sort((a, b) => {
        const da = allNodes.filter((x) => x.parentRoleId === a.id).length ? 0 : 1;
        return da - (allNodes.filter((x) => x.parentRoleId === b.id).length ? 0 : 1)
          || a.name.localeCompare(b.name);
      });

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
            />
          </div>
          <p className="text-sm text-gray-400">
            {allNodes.length} roles · {totalMembers} members
            {view === 'chart' && <span className="ml-1.5 opacity-60">· Drag nodes to reassign reporting lines</span>}
          </p>
          {saving && <span className="text-xs text-indigo-500 animate-pulse">Saving…</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Chart / List toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setView('chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                ${view === 'chart' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              <GitBranch size={13} /> Chart
            </button>
            <button onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Layers size={13} /> List
            </button>
          </div>
          <button onClick={() => refetch()}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Views ── */}
      {view === 'list' ? (
        <div className="space-y-2">
          {filtered.map((node) => (
            <div key={node.id}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: node.color }} />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: node.color + '20' }}>
                <Shield size={14} style={{ color: node.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{node.name}</p>
                {node.description && <p className="text-xs text-gray-400 truncate">{node.description}</p>}
              </div>
              {node.users?.length > 0 && (
                <div className="flex -space-x-1.5 shrink-0">
                  {(node.users as any[]).slice(0, 5).map((u: any) => (
                    <UserAvatar key={u.id} name={u.name} avatarUrl={u.avatarUrl} size="xs" className="ring-2 ring-white" />
                  ))}
                </div>
              )}
              <span className="text-xs text-gray-400 w-12 text-right shrink-0">
                {node.users?.length ?? 0} member{node.users?.length !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* ── Chart canvas (zoomable + pannable) ── */
        <OrgCanvas
          allNodes={allNodes}
          totalW={totalW}
          totalH={totalH}
          connectors={connectors}
          dragPreview={dragPreview}
          search={search}
          handleDrop={handleDrop}
          OrgNode={OrgNode}
        />
      )}
    </div>
  );
};

// ─── Zoomable / pannable org-chart canvas ────────────────────────────────────
const OrgCanvas = ({
  allNodes, totalW, totalH, connectors, dragPreview, search, handleDrop, OrgNode,
}: {
  allNodes: any[]; totalW: number; totalH: number;
  connectors: React.ReactNode; dragPreview: React.ReactNode;
  search: string;
  handleDrop: (e: React.DragEvent, parentId: string | null) => Promise<void>;
  OrgNode: React.ComponentType<{ node: any }>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale,     setScale]     = useState(1);
  const [offset,    setOffset]    = useState({ x: 20, y: 20 });
  const [isPanning, setIsPanning] = useState(false);
  const panOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Fit the whole tree into view on first render / data change
  useEffect(() => {
    if (!allNodes.length || !containerRef.current || totalW <= 0 || totalH <= 0) return;
    const cw = containerRef.current.clientWidth  || 800;
    const ch = containerRef.current.clientHeight || 560;
    const s  = Math.min(1, (cw - 48) / totalW, (ch - 48) / totalH);
    const fitS = Math.max(0.15, s);
    setScale(fitS);
    setOffset({ x: Math.max(0, (cw - totalW * fitS) / 2), y: 24 });
  }, [allNodes.length, totalW, totalH]);

  const clampScale = (s: number) => Math.min(2.5, Math.max(0.15, s));

  // ── Zoom at cursor ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor  = e.deltaY < 0 ? 1.12 : 0.89;
    const newS    = clampScale(scale * factor);
    const rect    = containerRef.current!.getBoundingClientRect();
    const cx      = e.clientX - rect.left;
    const cy      = e.clientY - rect.top;
    // Keep point under cursor fixed
    setOffset({
      x: cx - (cx - offset.x) * (newS / scale),
      y: cy - (cy - offset.y) * (newS / scale),
    });
    setScale(newS);
  }, [scale, offset]);

  // ── Pan ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element;
    // Don't pan when clicking a node card or its children
    if (target.closest('[data-org-node]')) return;
    setIsPanning(true);
    panOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setOffset({
      x: panOrigin.current.ox + (e.clientX - panOrigin.current.mx),
      y: panOrigin.current.oy + (e.clientY - panOrigin.current.my),
    });
  }, [isPanning]);

  const stopPan = useCallback(() => setIsPanning(false), []);

  // ── Fit / zoom helpers ──
  const fit = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth  || 800;
    const ch = containerRef.current.clientHeight || 560;
    const s  = clampScale(Math.min(1, (cw - 48) / totalW, (ch - 48) / totalH));
    setScale(s);
    setOffset({ x: Math.max(0, (cw - totalW * s) / 2), y: 24 });
  };
  const zoom = (delta: number) => setScale((s) => clampScale(s + delta));

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-[#f8f9fc] overflow-hidden select-none"
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(e, null)}
      style={{ height: 600, cursor: isPanning ? 'grabbing' : 'grab' } as React.CSSProperties}
    >
      {/* ── Zoom controls ── */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
        <button onClick={() => zoom(0.15)}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg leading-none">+</button>
        <div className="w-8 h-7 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center">
          <span className="text-xs font-medium text-gray-500">{Math.round(scale * 100)}%</span>
        </div>
        <button onClick={() => zoom(-0.15)}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg leading-none">−</button>
        <button onClick={fit} title="Fit to screen"
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/>
          </svg>
        </button>
        <button onClick={() => { setScale(1); setOffset({ x: 20, y: 20 }); }} title="Reset zoom"
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ── Hint ── */}
      <div className="absolute bottom-3 left-3 z-10 text-xs text-gray-400 pointer-events-none">
        Scroll or pinch to zoom · Drag background to pan · Drag nodes to reassign
      </div>

      {/* ── Canvas ── */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0,
          width: totalW, height: totalH,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        <svg
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
          width={totalW} height={totalH}
        >
          <defs>
            <style>{`@keyframes dashMove { to { stroke-dashoffset: -20; } }`}</style>
          </defs>
          {connectors}
          {dragPreview}
        </svg>

        {allNodes
          .filter((n) => !search || n.name.toLowerCase().includes(search.toLowerCase()))
          .map((n) => <OrgNode key={n.id} node={n} />)}
      </div>
    </div>
  );
};

// ─── Action badge colours ────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  CREATE:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE:       'bg-blue-100   text-blue-700   border-blue-200',
  DELETE:       'bg-red-100    text-red-700    border-red-200',
  STATUS_CHANGE:'bg-amber-100  text-amber-700  border-amber-200',
  ROLE_CHANGE:  'bg-violet-100 text-violet-700 border-violet-200',
  RESOLVE:      'bg-teal-100   text-teal-700   border-teal-200',
  ESCALATE:     'bg-orange-100 text-orange-700 border-orange-200',
  RAG_CHANGE:   'bg-pink-100   text-pink-700   border-pink-200',
};
const actionColor = (a: string) => ACTION_COLORS[a] || 'bg-gray-100 text-gray-600 border-gray-200';

// ─── Parse change diff from JSON strings ─────────────────────────────────────
const ChangeDiff = ({ oldVal, newVal }: { oldVal?: string; newVal?: string }) => {
  const parse = (v?: string) => {
    if (!v) return null;
    try { return JSON.parse(v); } catch { return v; }
  };
  const oldObj = parse(oldVal);
  const newObj = parse(newVal);
  if (!oldObj && !newObj) return <span className="text-gray-400 text-xs">—</span>;

  // If both are objects, show field-by-field diff
  if (oldObj && newObj && typeof oldObj === 'object' && typeof newObj === 'object') {
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    const changed = keys.filter(k => String(oldObj[k] ?? '') !== String(newObj[k] ?? ''));
    if (changed.length === 0) {
      return <span className="text-gray-400 text-xs">No visible changes</span>;
    }
    return (
      <div className="space-y-1">
        {changed.map(k => (
          <div key={k} className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-medium text-gray-500">{k}:</span>
            {oldObj[k] !== undefined && (
              <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded line-through">
                {String(oldObj[k])}
              </span>
            )}
            <span className="text-gray-400">→</span>
            {newObj[k] !== undefined && (
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">
                {String(newObj[k])}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // If only newValue, show it as a summary
  if (newObj) {
    const str = typeof newObj === 'object'
      ? Object.entries(newObj).map(([k, v]) => `${k}: ${v}`).join(', ')
      : String(newObj);
    return <span className="text-xs text-gray-600 break-all">{str}</span>;
  }

  return <span className="text-xs text-gray-400 break-all">{String(oldObj)}</span>;
};

// ─── Single log row ───────────────────────────────────────────────────────────
interface AuditLog {
  id: string; action: string; entityType?: string; entityId?: string;
  performedByName?: string; performedByEmail?: string; performedById?: string;
  oldValue?: string; newValue?: string; createdAt?: string;
}

const LogRow = ({ log, avatarUrl }: { log: AuditLog; avatarUrl?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(log.oldValue || log.newValue);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className={`flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetail && setExpanded(e => !e)}
      >
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          <UserAvatar
            name={log.performedByName || log.performedByEmail || '?'}
            avatarUrl={avatarUrl}
            size="sm"
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Who */}
              <span className="text-sm font-semibold text-gray-900">
                {log.performedByName || log.performedById || 'Unknown'}
              </span>
              {log.performedByEmail && (
                <span className="text-xs text-gray-400">{log.performedByEmail}</span>
              )}
            </div>
            {/* When */}
            <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 flex items-center gap-1">
              <Clock size={11} />
              {log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              }) : '—'}
            </span>
          </div>

          {/* Action + resource */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${actionColor(log.action)}`}>
              {log.action.replace(/_/g, ' ')}
            </span>
            {log.entityType && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                <Layers size={10} />
                {log.entityType}
                {log.entityId ? <span className="text-gray-400">#{log.entityId.slice(-6)}</span> : null}
              </span>
            )}
          </div>

          {/* Inline diff preview (collapsed) */}
          {!expanded && hasDetail && (
            <div className="mt-1.5">
              <ChangeDiff oldVal={log.oldValue} newVal={log.newValue} />
            </div>
          )}
        </div>

        {/* Expand toggle */}
        {hasDetail && (
          <div className="shrink-0 text-gray-400 mt-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="px-5 pb-4 ml-12 space-y-3">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Change Details</p>
            <ChangeDiff oldVal={log.oldValue} newVal={log.newValue} />
          </div>
          {log.oldValue && (
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer hover:text-gray-600">Raw before / after</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="bg-red-50 rounded p-2 font-mono break-all text-red-600">{log.oldValue}</div>
                <div className="bg-green-50 rounded p-2 font-mono break-all text-green-700">{log.newValue}</div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Role options ─────────────────────────────────────────────────────────────
const ALL_ROLES = ['TENANT_ADMIN', 'TEAM_MEMBER'];

// ─── UserRow ──────────────────────────────────────────────────────────────────
const UserRow = ({
  user, currentUserId, allowedInviteRoles, orgRoles,
  isEditingRole, editingRole, onStartEdit, onCancelEdit, onRoleChange, onSaveRoleDone, onDeactivate,
}: {
  user: UserType;
  currentUserId: string;
  allowedInviteRoles: string[];
  orgRoles: OrgRole[];
  isEditingRole: boolean;
  editingRole: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRoleChange: (r: string) => void;
  onSaveRoleDone: () => void;
  onDeactivate: () => void;
}) => {
  const updateUser = useUpdateAdminUser(user.id);
  const isSelf = user.id === currentUserId;
  const canChangeRole = !isSelf && allowedInviteRoles.length > 0;
  const [showPerms, setShowPerms] = useState(false);

  const saveRole = async () => {
    try { await updateUser.mutateAsync({ role: editingRole }); } catch { /* */ }
    onSaveRoleDone();
  };

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
            <span className="text-sm font-medium text-gray-900">{user.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
        <td className="px-4 py-3">
          {isEditingRole ? (
            <div className="flex items-center gap-1.5">
              <select
                className="form-select text-xs py-1 px-2 border-gray-300 rounded-lg"
                value={editingRole}
                onChange={(e) => onRoleChange(e.target.value)}
              >
                {ALL_ROLES.filter(r => allowedInviteRoles.includes(r)).map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <button onClick={saveRole} disabled={updateUser.isPending}
                className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors" title="Save">
                <Check size={13} />
              </button>
              <button onClick={onCancelEdit}
                className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors" title="Cancel">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                  <Shield size={12} /> {user.role.replace(/_/g, ' ')}
                </span>
                {canChangeRole && user.status === 'ACTIVE' && (
                  <button onClick={onStartEdit}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Change role">
                    <Edit2 size={11} />
                  </button>
                )}
              </div>
              {user.orgRoleId && (() => {
                const or = orgRoles.find(r => r.id === user.orgRoleId);
                return or ? (
                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md w-fit"
                    style={{ background: or.color + '20', color: or.color }}>
                    <GitBranch size={9} /> {or.name}
                  </span>
                ) : null;
              })()}
            </div>
          )}
        </td>
        <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Permissions button */}
            <button
              onClick={() => setShowPerms(true)}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
              title="Manage permissions"
            >
              <KeyRound size={12} /> Permissions
            </button>
            {user.status === 'ACTIVE' && !isSelf && (
              <button onClick={onDeactivate}
                className="text-xs text-red-600 hover:underline flex items-center gap-1">
                <UserX size={12} /> Deactivate
              </button>
            )}
            {user.status === 'INACTIVE' && (
              <span className="text-xs text-gray-400 flex items-center gap-1"><UserCheck size={12} /> Inactive</span>
            )}
          </div>
        </td>
      </tr>

      {/* Per-user permissions modal */}
      <UserPermissionsModal
        open={showPerms}
        onClose={() => setShowPerms(false)}
        userId={user.id}
        userName={user.name}
        userRole={user.role}
      />
    </>
  );
};

// ─── AdminPage ────────────────────────────────────────────────────────────────
const AdminPage = () => {
  const { user: currentUser } = useAuth();
  const canInvite = hasPermission(currentUser, PERMISSIONS.INVITE_USER);
  const canManageRoles = hasPermission(currentUser, PERMISSIONS.ORG_ROLE_WRITE);
  const allowedInviteRoles = INVITE_ALLOWED_ROLES[currentUser?.role ?? ''] ?? [];
  const [tab, setTab] = useState<Tab>('users');

  // Org roles state
  const { data: orgRoles = [] as OrgRole[], isLoading: rolesLoading } = useOrgRoles() as { data: OrgRole[]; isLoading: boolean };
  const createRole = useCreateOrgRole();
  const deleteRole = useDeleteOrgRole();
  const [roleSearch, setRoleSearch] = useState('');
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingOrgRole, setEditingOrgRole] = useState<OrgRole | null>(null);
  const [permRole, setPermRole] = useState<OrgRole | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const setRolePerms = useSetOrgRolePermissions(permRole?.id ?? '');
  const [sharingRole, setSharingRole] = useState<OrgRole | null>(null);
  const [sharingModalOpen, setSharingModalOpen] = useState(false);
  const updateOrgRole = useUpdateOrgRole(editingOrgRole?.id ?? '');
  const assignUserOrgRole = useAssignUserOrgRole();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Audit filters
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  const auditParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filterAction) p.action = filterAction;
    if (filterEntity) p.entityType = filterEntity;
    if (filterUser) p.performedBy = filterUser;
    if (filterDateFrom) p.dateFrom = filterDateFrom;
    if (filterDateTo) p.dateTo = filterDateTo + ' 23:59:59';
    return p;
  }, [filterAction, filterEntity, filterUser, filterDateFrom, filterDateTo]);

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState('');

  const { data: users = [], isLoading } = useAdminUsers();
  const { data: rawLogs = [], isLoading: auditLoading, refetch: refetchLogs } =
    useAuditLogs(auditParams, tab === 'audit');
  const inviteUser = useInviteUser();
  const deactivateUser = useDeactivateUser();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>();

  // Build userId → avatarUrl map from admin users list
  const userAvatarMap = useMemo(() => {
    const map: Record<string, string> = {};
    (users as UserType[]).forEach(u => { if (u.avatarUrl) map[u.id] = u.avatarUrl; });
    return map;
  }, [users]);

  // Client-side search filter
  const auditLogs = useMemo(() => {
    const filtered = !filterSearch ? (rawLogs as AuditLog[]) : (rawLogs as AuditLog[]).filter(l => {
      const q = filterSearch.toLowerCase();
      return (l.performedByName || '').toLowerCase().includes(q) ||
        (l.performedByEmail || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.entityType || '').toLowerCase().includes(q) ||
        (l.newValue || '').toLowerCase().includes(q);
    });
    return filtered;
  }, [rawLogs, filterSearch]);

  const totalPages = Math.max(1, Math.ceil(auditLogs.length / PAGE_SIZE));
  const pagedLogs = auditLogs.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  const onInvite = async (data: InviteForm) => {
    try {
      setInviteError(''); setInviteSuccess('');
      await inviteUser.mutateAsync(data);
      setInviteSuccess(`Invitation sent to ${data.email}. They'll receive an email to sign in.`);
      reset();
      setTimeout(() => { setShowInvite(false); setInviteSuccess(''); }, 2500);
    } catch (err: unknown) { setInviteError((err as Error).message); }
  };

  const handleDeactivate = async (userId: string) => {
    if (!window.confirm('Deactivate this user? They will lose access.')) return;
    try { await deactivateUser.mutateAsync(userId); } catch { /* */ }
  };

  const startEditRole = (userId: string, currentRole: string) => {
    setEditingRoleId(userId);
    setEditingRole(currentRole);
  };

  const cancelEditRole = () => { setEditingRoleId(null); setEditingRole(''); };


  const clearFilters = () => {
    setFilterAction(''); setFilterEntity(''); setFilterUser('');
    setFilterDateFrom(''); setFilterDateTo(''); setFilterSearch('');
    setAuditPage(1);
  };
  const hasFilters = !!(filterAction || filterEntity || filterUser || filterDateFrom || filterDateTo || filterSearch);

  // Unique action types and entity types from loaded logs for filter dropdowns
  const actionOptions = useMemo(() =>
    Array.from(new Set((rawLogs as AuditLog[]).map(l => l.action).filter(Boolean))).sort(),
    [rawLogs]);
  const entityOptions = useMemo(() =>
    Array.from(new Set((rawLogs as AuditLog[]).map(l => l.entityType).filter((v): v is string => !!v))).sort(),
    [rawLogs]);
  // Build user options from loaded logs
  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    (rawLogs as AuditLog[]).forEach(l => {
      if (l.performedById) map.set(l.performedById, l.performedByName || l.performedByEmail || l.performedById);
    });
    return Array.from(map.entries());
  }, [rawLogs]);

  if (isLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header title="Admin" subtitle="User management and audit trail"
        actions={tab === 'users' && (canInvite
          ? <Button onClick={() => setShowInvite(true)} icon={<Plus size={16} />}>Invite User</Button>
          : <span className="flex items-center gap-1.5 text-sm text-gray-400"><Lock size={14} />No permission to invite users</span>)}
      />
      <div className="p-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
          {([
            { key: 'users',    label: `Users (${users.length})` },
            { key: 'roles',    label: `Roles (${orgRoles.length})` },
            { key: 'orgchart', label: 'Org Chart' },
            { key: 'audit',    label: `Audit Log${rawLogs.length ? ` (${rawLogs.length})` : ''}` },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Users tab ─────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          users.length === 0 ? (
            <EmptyState title="No users" description="Invite your first team member."
              action={canInvite ? <Button onClick={() => setShowInvite(true)} icon={<Plus size={16} />}>Invite User</Button> : undefined} />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u: UserType) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      currentUserId={currentUser?.id ?? ''}
                      allowedInviteRoles={allowedInviteRoles}
                      orgRoles={orgRoles}
                      isEditingRole={editingRoleId === u.id}
                      editingRole={editingRole}
                      onStartEdit={() => startEditRole(u.id, u.role)}
                      onCancelEdit={cancelEditRole}
                      onRoleChange={setEditingRole}
                      onSaveRoleDone={cancelEditRole}
                      onDeactivate={() => handleDeactivate(u.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Audit Log tab ──────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div className="space-y-4">

            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter size={14} className="text-gray-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>
                {hasFilters && (
                  <button onClick={clearFilters}
                    className="ml-auto text-xs text-blue-600 hover:underline flex items-center gap-1">
                    Clear all
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="lg:col-span-2 relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="form-input pl-8 text-xs w-full"
                    placeholder="Search name, action, resource…"
                    value={filterSearch}
                    onChange={e => { setFilterSearch(e.target.value); setAuditPage(1); }}
                  />
                </div>

                {/* Who (user) */}
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select className="form-select pl-8 text-xs w-full" value={filterUser} onChange={e => { setFilterUser(e.target.value); setAuditPage(1); }}>
                    <option value="">All users</option>
                    {userOptions.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Action */}
                <div className="relative">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select className="form-select pl-8 text-xs w-full" value={filterAction} onChange={e => { setFilterAction(e.target.value); setAuditPage(1); }}>
                    <option value="">All actions</option>
                    {actionOptions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>

                {/* Entity type */}
                <div className="relative">
                  <Layers size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select className="form-select pl-8 text-xs w-full" value={filterEntity} onChange={e => { setFilterEntity(e.target.value); setAuditPage(1); }}>
                    <option value="">All resources</option>
                    {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                {/* Date from */}
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="date" className="form-input pl-8 text-xs w-full" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setAuditPage(1); }} />
                </div>

                {/* Date to */}
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="date" className="form-input pl-8 text-xs w-full" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setAuditPage(1); }} />
                </div>
              </div>
            </div>

            {/* Results header */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {auditLoading ? 'Loading…' : `${auditLogs.length} event${auditLogs.length !== 1 ? 's' : ''}${hasFilters ? ' matching filters' : ''}`}
              </p>
              <button onClick={() => refetchLogs()}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {/* Log list */}
            {auditLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-32" />
                    </div>
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                  </div>
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'No events match your filters' : 'No audit events yet'}
                description={hasFilters ? 'Try adjusting or clearing the filters.' : 'Activity will appear here as your team uses the platform.'}
                action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            ) : (
              <>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {pagedLogs.map((log) => (
                    <LogRow key={log.id} log={log} avatarUrl={log.performedById ? userAvatarMap[log.performedById] : undefined} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-gray-500">
                      Showing {(auditPage - 1) * PAGE_SIZE + 1}–{Math.min(auditPage * PAGE_SIZE, auditLogs.length)} of {auditLogs.length} events
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                        disabled={auditPage === 1}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - auditPage) <= 1)
                        .reduce<(number | '…')[]>((acc, p, i, arr) => {
                          if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) => p === '…' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setAuditPage(p as number)}
                            className={`min-w-[28px] h-7 rounded-lg text-xs font-medium border transition-colors ${
                              auditPage === p
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      <button
                        onClick={() => setAuditPage(p => Math.min(totalPages, p + 1))}
                        disabled={auditPage === totalPages}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

        {/* ── Roles tab ──────────────────────────────────────────────────────── */}
        {tab === 'roles' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-500">
                Custom org roles with their own permission sets. Assign members to positions in the hierarchy.
              </p>
              <div className="flex items-center gap-2">
                {/* Role search */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search roles…"
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
                  />
                </div>
                {canManageRoles && (
                  <Button icon={<Plus size={15} />} onClick={() => { setEditingOrgRole(null); setRoleFormOpen(true); }}>
                    New Role
                  </Button>
                )}
              </div>
            </div>

            {rolesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : orgRoles.length === 0 ? (
              <EmptyState
                title="No custom roles yet"
                description="Create roles like CEO, Tech Lead, or Product Owner to build your org chart."
                action={canManageRoles
                  ? <Button icon={<Plus size={15} />} onClick={() => { setEditingOrgRole(null); setRoleFormOpen(true); }}>Create First Role</Button>
                  : undefined}
              />
            ) : (
              <>
                {roleSearch.trim() && (
                  <p className="text-xs text-gray-400">
                    {orgRoles.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())).length} of {orgRoles.length} roles
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {orgRoles
                    .filter((r) => !roleSearch.trim() || r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                    .map((role) => (
                      <OrgRoleCard
                        key={role.id}
                        role={role}
                        allRoles={orgRoles}
                        users={users as UserType[]}
                        onEdit={(r) => { setEditingOrgRole(r); setRoleFormOpen(true); }}
                        onDelete={async (id) => {
                          if (!window.confirm('Delete this role? All member assignments will be removed.')) return;
                          await deleteRole.mutateAsync(id);
                        }}
                        onEditPerms={(r) => { setPermRole(r); setPermModalOpen(true); }}
                        onDataAccess={(r) => { setSharingRole(r); setSharingModalOpen(true); }}
                        onAssignUser={(userId, roleId) => assignUserOrgRole.mutateAsync({ userId, orgRoleId: roleId })}
                      />
                    ))}
                </div>
                {roleSearch.trim() && orgRoles.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())).length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">No roles match "{roleSearch}"</div>
                )}
              </>
            )}

            {/* Role form modal */}
            <RoleFormModal
              open={roleFormOpen}
              onClose={() => { setRoleFormOpen(false); setEditingOrgRole(null); }}
              initial={editingOrgRole}
              saving={createRole.isPending || updateOrgRole.isPending}
              onSave={async (data) => {
                if (editingOrgRole) {
                  await updateOrgRole.mutateAsync(data);
                } else {
                  await createRole.mutateAsync(data);
                }
                setRoleFormOpen(false);
                setEditingOrgRole(null);
              }}
            />

            {/* Permissions modal */}
            <RolePermissionsModal
              open={permModalOpen}
              onClose={() => { setPermModalOpen(false); setPermRole(null); }}
              role={permRole}
              saving={setRolePerms.isPending}
              onSave={async (perms) => {
                await setRolePerms.mutateAsync(perms);
                setPermModalOpen(false);
                setPermRole(null);
              }}
            />

            {/* Data Sharing modal */}
            <DataSharingModal
              open={sharingModalOpen}
              onClose={() => { setSharingModalOpen(false); setSharingRole(null); }}
              role={sharingRole}
              allRoles={orgRoles}
            />
          </div>
        )}

        {/* ── Org Chart tab ───────────────────────────────────────────────────── */}
        {tab === 'orgchart' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
              <p className="font-medium mb-1">Org Chart — role hierarchy</p>
              <p className="text-xs text-blue-600">
                Roles are arranged by their hierarchy level. Assign members to roles in the <strong>Roles</strong> tab. Set <em>Reports to</em> on each role to define the parent-child structure.
              </p>
            </div>
            <OrgChartView />
          </div>
        )}

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); reset(); setInviteError(''); setInviteSuccess(''); }} title="Invite User">
        <form onSubmit={handleSubmit(onInvite)} className="space-y-4">
          {inviteError && <Alert type="error" message={inviteError} />}
          {inviteSuccess && <Alert type="success" message={inviteSuccess} />}
          <div>
            <label className="form-label">Name *</label>
            <input className="form-input" placeholder="Full name" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" placeholder="user@company.com" {...register('email', { required: 'Required' })} />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>
          {orgRoles.length > 0 && (
            <div>
              <label className="form-label">Org Role <span className="text-gray-400 font-normal">(optional)</span></label>
              <select className="form-select" {...register('orgRoleId')}>
                <option value="">— None —</option>
                {(orgRoles as OrgRole[]).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Assign a position in the org hierarchy immediately on invite.</p>
            </div>
          )}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 space-y-1">
            <p className="font-medium">What happens when you send this invitation:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-600 text-xs">
              <li>The user is added to your Catalyst org and receives a Zoho email invite.</li>
              <li>They sign in as a <strong>Team Member</strong> — permissions are managed via org roles.</li>
              <li>When they sign in, their account is automatically activated.</li>
            </ol>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} icon={<UserCheck size={16} />}>Send Invitation</Button>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  );
};

export default AdminPage;
