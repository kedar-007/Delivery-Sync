import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import {
  Plus, UserCheck, UserX, Shield, Search, RefreshCw,
  ChevronDown, ChevronUp, Clock, User, Layers, Lock,
  ChevronLeft, ChevronRight, Edit2, Check, X, KeyRound,
  GitBranch, Trash2, Settings, Users, Eye, Globe,
  LayoutDashboard, FolderKanban, Package, BarChart3, Briefcase,
  Sparkles, AlertTriangle, MapPin,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import Button from '../components/ui/Button';
import UserAvatar from '../components/ui/UserAvatar';
import { StatusBadge } from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import {
  useAdminUsers, useInviteUser, useDeactivateUser, useActivateUser, useUpdateAdminUser,
  useOrgRoles, useCreateOrgRole, useUpdateOrgRole, useDeleteOrgRole,
  useSetOrgRolePermissions, useAssignUserOrgRole, useOrgChart, useAllPermissions,
  useSharingRules, useSetDefaultVisibility, useAddExplicitSharingRule, useDeleteSharingRule,
  useOfficeLocations, useUpdateUserLocation,
} from '../hooks/useAdmin';
import { useShifts, useCalendarConfig, useSaveCalendarConfig } from '../hooks/usePeople';
import UserPermissionsModal from '../components/ui/UserPermissionsModal';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { canDo, hasPermission, PERMISSIONS, INVITE_ALLOWED_ROLES } from '../utils/permissions';
import { COUNTRIES, TIMEZONES, TZ_GROUPS } from '../lib/locationData';
import { User as UserType } from '../types';
const PAGE_SIZE = 20;

type Tab = 'users' | 'roles' | 'orgchart';
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
  permissions: string[]; moduleAccess: string[]; userCount: number; isActive: boolean;
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
  TASK_READ:          { label: 'View Tasks',         desc: 'See tasks across projects',                          risk: 'low' },
  TASK_WRITE:         { label: 'Create / Edit',      desc: 'Create and update tasks (assigned to self only)',    risk: 'low' },
  TASK_ASSIGN:        { label: 'Assign to Others',   desc: 'Assign tasks to other team members, not just self',  risk: 'medium' },
  TASK_COMMENT_WRITE: { label: 'Comment on Tasks',   desc: 'Add comments to tasks',                              risk: 'low' },
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
  STANDUP_TEAM_VIEW:  { label: 'Team Standup View',  desc: "See standups submitted by team peers (teams you're in or lead)", risk: 'medium' },
  EOD_SUBMIT:         { label: 'Submit EOD',         desc: 'Post end-of-day reports',                        risk: 'low' },
  EOD_READ:           { label: 'View EODs',          desc: 'Read team EOD reports',                          risk: 'low' },
  EOD_TEAM_VIEW:      { label: 'Team EOD View',      desc: "See EODs submitted by team peers (teams you're in or lead)", risk: 'medium' },
  TIME_READ:          { label: 'View Time Logs',     desc: 'See time tracking entries',                      risk: 'low' },
  TIME_WRITE:         { label: 'Log Time',           desc: 'Submit time entries',                            risk: 'low' },
  TIME_APPROVE:       { label: 'Approve Time',       desc: 'Approve team time submissions',                  risk: 'medium' },
  TIME_ANALYTICS:     { label: 'Time Analytics',    desc: 'Billable / non-billable hours across all team members', risk: 'medium' },
  ATTENDANCE_READ:      { label: 'View Attendance',   desc: 'See own attendance records',                       risk: 'low' },
  ATTENDANCE_WRITE:     { label: 'Check In / Out',    desc: 'Log daily attendance, WFH, breaks',                risk: 'low' },
  ATTENDANCE_TEAM_VIEW: { label: 'View Team Records', desc: 'See peers\' attendance — live view, records, export', risk: 'medium' },
  ATTENDANCE_ADMIN:     { label: 'Attendance Admin',  desc: 'Override records, view all tenants, export CSV',    risk: 'high' },
  IP_CONFIG_WRITE:    { label: 'Configure',          desc: 'People Settings: IP/Geo/Zone restrictions & work shifts', risk: 'high' },
  LEAVE_READ:         { label: 'View Leave',         desc: 'See own leave requests and balance',             risk: 'low' },
  LEAVE_WRITE:        { label: 'Request Leave',      desc: 'Submit leave applications',                      risk: 'low' },
  LEAVE_APPROVE:      { label: 'Approve Leave',      desc: 'Approve or reject team leave',                  risk: 'medium' },
  LEAVE_ADMIN:        { label: 'Configure',          desc: 'People Settings: leave types, balances & company calendar', risk: 'high' },
  LOCATION_ADMIN:     { label: 'Configure',          desc: 'People Settings: create/edit office locations & assign users', risk: 'medium' },
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
  AI_INSIGHTS:        { label: 'AI Insights',        desc: 'Daily summary, suggestions, NLQ, voice',                  risk: 'low' },
  AI_PERFORMANCE:     { label: 'Self Analysis',      desc: 'View your own AI performance analysis — not others\'',    risk: 'medium' },
  AI_TEAM_ANALYSIS:   { label: 'Team Analysis',      desc: 'Org-wide health, trends, analyze any member\'s data',     risk: 'high' },
  CEO_DASHBOARD:      { label: 'CEO Dashboard',      desc: 'Access the CEO executive dashboard only',                 risk: 'medium' },
  CTO_DASHBOARD:      { label: 'CTO Dashboard',      desc: 'Access the CTO executive dashboard only',                 risk: 'medium' },
  ADMIN_USERS:        { label: 'Manage Users',       desc: 'Invite, edit, deactivate users',                risk: 'high' },
  ADMIN_SETTINGS:     { label: 'System Settings',    desc: 'Tenant settings and audit logs',                risk: 'high' },
  CONFIG_READ:        { label: 'View Config',        desc: 'See feature flags and configurations',          risk: 'low' },
  CONFIG_WRITE:       { label: 'Edit Config',        desc: 'Change features and workflow rules',            risk: 'high' },
  DATA_SEED:          { label: 'Data Seeding',       desc: 'Generate/clear demo or test data',              risk: 'high' },
};

// ─── CRUD permission matrix ───────────────────────────────────────────────────
// view = read-only  |  write = create/edit  |  approve = elevated action  |  admin = full control

interface CrudRow { name: string; view?: string; write?: string; approve?: string; admin?: string }
interface CrudSection { section: string; rows: CrudRow[] }

const CRUD_MODULES: CrudSection[] = [
  {
    section: 'Projects & Delivery',
    rows: [
      { name: 'Projects',    view: 'PROJECT_READ',   write: 'PROJECT_WRITE' },
      { name: 'Milestones',  view: 'MILESTONE_READ', write: 'MILESTONE_WRITE' },
      { name: 'Sprints',     view: 'SPRINT_READ',    write: 'SPRINT_WRITE' },
      { name: 'Tasks',       view: 'TASK_READ',      write: 'TASK_WRITE',    approve: 'TASK_ASSIGN',        admin: 'TASK_COMMENT_WRITE' },
      { name: 'Actions',     view: 'ACTION_READ',    write: 'ACTION_WRITE' },
      { name: 'Blockers',    view: 'BLOCKER_READ',   write: 'BLOCKER_WRITE' },
      { name: 'RAID Log',    view: 'RAID_READ',      write: 'RAID_WRITE' },
      { name: 'Decisions',   view: 'DECISION_READ',  write: 'DECISION_WRITE' },
    ],
  },
  {
    section: 'Daily Work',
    rows: [
      // `approve` slot is repurposed for the team-view permission (same
      // pattern as Attendance / Time below), so admins can grant it directly
      // from the CRUD matrix.
      { name: 'Standups',    view: 'STANDUP_READ',  write: 'STANDUP_SUBMIT', approve: 'STANDUP_TEAM_VIEW' },
      { name: 'EOD Reports', view: 'EOD_READ',      write: 'EOD_SUBMIT',     approve: 'EOD_TEAM_VIEW' },
    ],
  },
  {
    section: 'Time & Attendance',
    rows: [
      { name: 'Time Tracking', view: 'TIME_READ',       write: 'TIME_WRITE',       approve: 'TIME_APPROVE', admin: 'TIME_ANALYTICS' },
      { name: 'Attendance',    view: 'ATTENDANCE_READ',  write: 'ATTENDANCE_WRITE', approve: 'ATTENDANCE_TEAM_VIEW', admin: 'ATTENDANCE_ADMIN' },
      { name: 'Leave',         view: 'LEAVE_READ',       write: 'LEAVE_WRITE',      approve: 'LEAVE_APPROVE', admin: 'LEAVE_ADMIN' },
    ],
  },
  {
    section: 'People & Org',
    rows: [
      { name: 'Teams',         view: 'TEAM_READ',         write: 'TEAM_WRITE' },
      { name: 'Profiles',      view: 'PROFILE_READ',      write: 'PROFILE_WRITE' },
      { name: 'Org Chart',     view: 'ORG_READ',          write: 'ORG_WRITE' },
      { name: 'Org Roles',     view: 'ORG_ROLE_READ',     write: 'ORG_ROLE_WRITE' },
      { name: 'Announcements', view: 'ANNOUNCEMENT_READ', write: 'ANNOUNCEMENT_WRITE' },
    ],
  },
  {
    section: 'People Settings',
    rows: [
      { name: 'Office Locations',                           admin: 'LOCATION_ADMIN' },
      { name: 'Leave Types · Leave Balances · Calendar',    admin: 'LEAVE_ADMIN' },
      { name: 'IP · Geo · Zone Restrictions · Work Shifts', admin: 'IP_CONFIG_WRITE' },
    ],
  },
  {
    section: 'Assets & Badges',
    rows: [
      { name: 'Assets',         view: 'ASSET_READ', write: 'ASSET_WRITE', approve: 'ASSET_ASSIGN', admin: 'ASSET_ADMIN' },
      { name: 'Asset Requests', approve: 'ASSET_APPROVE' },
      { name: 'Badges',         view: 'BADGE_READ', write: 'BADGE_WRITE', approve: 'BADGE_AWARD' },
    ],
  },
  {
    section: 'Reports & AI',
    rows: [
      { name: 'Reports',        view: 'REPORT_READ',   write: 'REPORT_WRITE' },
      { name: 'Dashboard',      view: 'DASHBOARD_READ' },
      { name: 'AI Insights',    view: 'AI_INSIGHTS',   approve: 'AI_PERFORMANCE', admin: 'AI_TEAM_ANALYSIS' },
      { name: 'CEO Dashboard',  view: 'CEO_DASHBOARD' },
      { name: 'CTO Dashboard',  view: 'CTO_DASHBOARD' },
    ],
  },
  {
    section: 'System & Admin',
    rows: [
      { name: 'Notifications',    view:  'NOTIFICATION_READ' },
      { name: 'User Management',  write: 'INVITE_USER',     admin: 'ADMIN_USERS' },
      { name: 'Audit & Settings', admin: 'ADMIN_SETTINGS' },
      { name: 'System Config',    view:  'CONFIG_READ',     write: 'CONFIG_WRITE' },
      { name: 'Data Seeding',     admin: 'DATA_SEED' },
    ],
  },
];

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
  onSave: (perms: string[], moduleAccess: string[]) => void; saving: boolean;
}) => {
  const { data: permData } = useAllPermissions();
  const groups: { group: string; keys: string[] }[] = permData?.groups ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // moduleAccess = set of module keys that are DISABLED for this role
  const [disabledModules, setDisabledModules] = useState<Set<string>>(new Set());
  const [permTab, setPermTab] = useState<'modules' | 'permissions'>('modules');
  const [permSearch, setPermSearch] = useState('');
  const [hoveredPerm, setHoveredPerm] = useState<string | null>(null);

  const detectedPreset = role ? detectRolePreset(role.name, role.description) : null;
  const preset = detectedPreset ? ROLE_PRESETS[detectedPreset] : null;
  const presetClr = preset ? (PRESET_COLORS[preset.color] ?? PRESET_COLORS.violet) : null;

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(role?.permissions ?? []));
      setDisabledModules(new Set((role as any)?.moduleAccess ?? []));
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
    setDisabledModules((s) => { const n = new Set(s); n.has(mod.key) ? n.delete(mod.key) : n.add(mod.key); return n; });
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

  const filteredCrudModules = CRUD_MODULES.map(({ section, rows }) => ({
    section,
    rows: permSearch.trim()
      ? rows.filter((r) =>
          r.name.toLowerCase().includes(permSearch.toLowerCase()) ||
          (['view', 'write', 'approve', 'admin'] as const).some((col) => {
            const perm = r[col];
            if (!perm) return false;
            const info = PERM_INFO[perm];
            return info && (
              info.label.toLowerCase().includes(permSearch.toLowerCase()) ||
              info.desc.toLowerCase().includes(permSearch.toLowerCase())
            );
          })
        )
      : rows,
  })).filter(({ rows }) => rows.length > 0);

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

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 shrink-0">
        {(['modules', 'permissions'] as const).map((t) => (
          <button key={t} onClick={() => setPermTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              permTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'modules' ? 'Module Access' : `Permissions (${selected.size})`}
          </button>
        ))}
      </div>

      {/* ── Content area ── */}
      <div className="flex flex-col" style={{ height: '68vh' }}>

        {/* ── Modules tab ── */}
        {permTab === 'modules' && (
          <div className="flex flex-col flex-1 min-h-0">
            <p className="text-xs text-gray-400 mb-3 shrink-0">
              Toggle sidebar sections. Disabling a module hides that entire section for every member of this role, regardless of their base permissions.
            </p>
            <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-2 content-start pr-1">
              {SIDEBAR_MODULES.map((mod) => {
                const on = !disabledModules.has(mod.key);
                const Icon = mod.icon;
                return (
                  <button key={mod.key} onClick={() => toggleModule(mod)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      on ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-100' : 'border-gray-200 bg-white hover:bg-gray-50 opacity-60'
                    }`}>
                    <div className={`p-2 rounded-lg shrink-0 ${on ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                      <Icon size={15} className={on ? 'text-indigo-600' : 'text-gray-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${on ? 'text-gray-900' : 'text-gray-500'}`}>{mod.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${on ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                          {on ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{mod.desc}</p>
                    </div>
                    <div className={`w-9 h-5 rounded-full transition-colors shrink-0 flex items-center ${on ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                      <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Permissions tab — CRUD matrix ── */}
        {permTab === 'permissions' && (
          <div className="flex flex-col flex-1 min-h-0">

            {/* Search */}
            <div className="relative mb-3 shrink-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Search modules or permissions…" value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50" />
            </div>

            {/* Sticky column headers */}
            <div className="grid shrink-0 mb-2 px-3" style={{ gridTemplateColumns: '1fr 90px 110px 100px 90px' }}>
              <span className="text-xs font-semibold text-gray-400">Module</span>
              <span className="text-xs font-bold text-blue-500 text-center">View</span>
              <span className="text-xs font-bold text-indigo-500 text-center">Create / Edit</span>
              <span className="text-xs font-bold text-amber-500 text-center">Approve</span>
              <span className="text-xs font-bold text-red-500 text-center">Admin</span>
            </div>
            <div className="h-px bg-gray-200 mb-3 shrink-0" />

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {filteredCrudModules.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No modules match "{permSearch}"</p>
              ) : filteredCrudModules.map(({ section, rows }) => {
                const allPerms = Array.from(new Set(rows.flatMap((r) =>
                  ([r.view, r.write, r.approve, r.admin] as (string | undefined)[]).filter(Boolean) as string[]
                )));
                const allOn  = allPerms.length > 0 && allPerms.every((p) => selected.has(p));
                const someOn = !allOn && allPerms.some((p) => selected.has(p));
                return (
                  <div key={section}>
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <input type="checkbox" checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn; }}
                        onChange={() => setSelected((s) => {
                          const n = new Set(s);
                          allOn ? allPerms.forEach((p) => n.delete(p)) : allPerms.forEach((p) => n.add(p));
                          return n;
                        })}
                        className="w-3.5 h-3.5 rounded text-indigo-600 cursor-pointer accent-indigo-600" />
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">{section}</span>
                      <span className="ml-auto text-xs text-gray-400 font-medium">
                        {allPerms.filter((p) => selected.has(p)).length} / {allPerms.length}
                      </span>
                    </div>

                    {/* Module rows */}
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                      {rows.map((row, i) => {
                        const cols = [
                          { perm: row.view,    activeClass: 'bg-blue-500 text-white',   hoverClass: 'hover:bg-blue-50' },
                          { perm: row.write,   activeClass: 'bg-indigo-500 text-white', hoverClass: 'hover:bg-indigo-50' },
                          { perm: row.approve, activeClass: 'bg-amber-500 text-white',  hoverClass: 'hover:bg-amber-50' },
                          { perm: row.admin,   activeClass: 'bg-red-500 text-white',    hoverClass: 'hover:bg-red-50' },
                        ];
                        return (
                          <div key={row.name}
                            className={`grid items-center px-3 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                            style={{ gridTemplateColumns: '1fr 90px 110px 100px 90px' }}
                          >
                            <span className="text-sm font-medium text-gray-800 truncate pr-2">{row.name}</span>
                            {cols.map(({ perm, activeClass, hoverClass }, ci) => (
                              <div key={ci} className="flex justify-center items-center">
                                {perm ? (() => {
                                  const isOn = selected.has(perm);
                                  const info = PERM_INFO[perm];
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => toggle(perm)}
                                      title={info ? `${info.label}: ${info.desc}` : perm}
                                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                                        isOn
                                          ? `${activeClass} border-transparent shadow-sm`
                                          : `bg-white border-gray-200 text-gray-400 ${hoverClass}`
                                      }`}
                                    >
                                      {isOn
                                        ? <Check size={11} strokeWidth={3} />
                                        : <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />}
                                      <span>{info?.label?.split(' ')[0] ?? perm.split('_')[0]}</span>
                                    </button>
                                  );
                                })() : (
                                  <span className="text-gray-200 text-sm select-none">—</span>
                                )}
                              </div>
                            ))}
                          </div>
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

      <ModalActions>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(Array.from(selected), Array.from(disabledModules))} loading={saving}>
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
const ORG_NODE_W  = 172;   // card width  (px)
const ORG_CARD_H  = 240;   // approx card height (px) — used for SVG line origins
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

        {/* Member avatars */}
        {Array.isArray(node.users) && node.users.length > 0 ? (
          <div className="w-full mt-1">
            <div className="flex flex-wrap justify-center gap-1 mb-1">
              {node.users.slice(0, 6).map((u: any) => (
                <div
                  key={u.id}
                  title={u.name}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shrink-0"
                  style={{ background: node.color }}
                >
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt={u.name} className="w-7 h-7 rounded-full object-cover" />
                    : u.initials}
                </div>
              ))}
              {node.users.length > 6 && (
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 ring-2 ring-white shrink-0">
                  +{node.users.length - 6}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {node.users.length} {node.users.length === 1 ? 'member' : 'members'}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">No members yet</span>
        )}
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

// ─── Role options ─────────────────────────────────────────────────────────────
const ALL_ROLES = ['TENANT_ADMIN', 'TEAM_MEMBER'];

const TZ_SHORT: Record<string, string> = {
  'Asia/Kolkata': 'IST', 'America/New_York': 'US Eastern', 'America/Chicago': 'US Central',
  'America/Denver': 'US Mountain', 'America/Los_Angeles': 'US Pacific',
  'Europe/London': 'UK/GMT', 'Europe/Paris': 'Central EU', 'Europe/Athens': 'Eastern EU',
  'Asia/Dubai': 'Gulf (GST)', 'Asia/Riyadh': 'Arabia (AST)', 'Africa/Johannesburg': 'SAST',
  'Asia/Singapore': 'Singapore', 'Asia/Shanghai': 'China (CST)', 'Asia/Tokyo': 'Japan (JST)',
  'Australia/Sydney': 'AU Eastern', 'Pacific/Auckland': 'New Zealand',
};

// ─── UserRow ──────────────────────────────────────────────────────────────────
const UserRow = ({
  user, currentUserId, allowedInviteRoles, orgRoles, shifts, officeLocations, canManageLocation,
  isEditingRole, editingRole, onStartEdit, onCancelEdit, onRoleChange, onSaveRoleDone, onDeactivate, onActivate,
}: {
  user: UserType;
  currentUserId: string;
  allowedInviteRoles: string[];
  orgRoles: OrgRole[];
  shifts: { id: string; name: string; startTime: string; timezone: string }[];
  officeLocations: { id: string; name: string }[];
  canManageLocation: boolean;
  isEditingRole: boolean;
  editingRole: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRoleChange: (r: string) => void;
  onSaveRoleDone: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) => {
  const updateUser = useUpdateAdminUser(user.id);
  const updateLocation = useUpdateUserLocation();
  const isSelf = user.id === currentUserId;
  const canChangeRole = !isSelf && allowedInviteRoles.length > 0;
  const [showPerms, setShowPerms] = useState(false);
  const [editingTz, setEditingTz] = useState(false);
  const [tzValue, setTzValue] = useState(user.timezone || '');
  const [shiftValue, setShiftValue] = useState(user.shiftId || '');
  const [locationValue, setLocationValue] = useState((user as any).officeLocationId || '');

  const saveRole = async () => {
    try { await updateUser.mutateAsync({ role: editingRole }); } catch { /* */ }
    onSaveRoleDone();
  };

  const saveTz = async () => {
    try { await updateUser.mutateAsync({ timezone: tzValue, shift_id: shiftValue || null }); } catch { /* */ }
    setEditingTz(false);
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
        {/* Shift / timezone column */}
        <td className="px-4 py-3">
          {editingTz ? (
            <div className="flex flex-col gap-1.5">
              <select
                className="form-select text-xs py-1 px-2 border-gray-300 rounded-lg max-w-[160px]"
                value={tzValue}
                onChange={(e) => setTzValue(e.target.value)}
              >
                <option value="">— timezone —</option>
                <optgroup label="India"><option value="Asia/Kolkata">India IST (UTC+5:30)</option></optgroup>
                <optgroup label="United States">
                  <option value="America/New_York">US Eastern</option>
                  <option value="America/Chicago">US Central</option>
                  <option value="America/Denver">US Mountain</option>
                  <option value="America/Los_Angeles">US Pacific</option>
                </optgroup>
                <optgroup label="UK &amp; Europe">
                  <option value="Europe/London">UK / GMT</option>
                  <option value="Europe/Paris">Central EU</option>
                  <option value="Europe/Athens">Eastern EU</option>
                </optgroup>
                <optgroup label="Middle East &amp; Africa">
                  <option value="Asia/Dubai">Gulf (GST)</option>
                  <option value="Asia/Riyadh">Arabia (AST)</option>
                  <option value="Africa/Johannesburg">South Africa (SAST)</option>
                </optgroup>
                <optgroup label="Asia Pacific">
                  <option value="Asia/Singapore">Singapore (SGT)</option>
                  <option value="Asia/Shanghai">China (CST)</option>
                  <option value="Asia/Tokyo">Japan (JST)</option>
                  <option value="Australia/Sydney">AU Eastern</option>
                  <option value="Pacific/Auckland">New Zealand</option>
                </optgroup>
              </select>
              <select
                className="form-select text-xs py-1 px-2 border-gray-300 rounded-lg max-w-[160px]"
                value={shiftValue}
                onChange={(e) => setShiftValue(e.target.value)}
              >
                <option value="">— no shift —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.startTime})</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button onClick={saveTz} disabled={updateUser.isPending}
                  className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors" title="Save">
                  <Check size={13} />
                </button>
                <button onClick={() => { setEditingTz(false); setTzValue(user.timezone || ''); setShiftValue(user.shiftId || ''); }}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors" title="Cancel">
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Globe size={11} className="text-gray-400" />
                  {user.timezone ? TZ_SHORT[user.timezone] || user.timezone.split('/')[1] : <span className="text-gray-300">—</span>}
                </span>
                {user.shiftId && shifts.find(s => s.id === user.shiftId) && (
                  <span className="text-xs text-indigo-600 flex items-center gap-1">
                    <Clock size={10} />
                    {shifts.find(s => s.id === user.shiftId)?.name}
                  </span>
                )}
              </div>
              <button onClick={() => setEditingTz(true)}
                className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Set shift/timezone">
                <Edit2 size={11} />
              </button>
            </div>
          )}
        </td>
        {/* Location column */}
        <td className="px-4 py-3">
          {canManageLocation ? (
            <select
              className="form-select text-xs py-1 px-2 border-gray-300 rounded-lg max-w-[140px]"
              value={locationValue}
              onChange={async (e) => {
                const val = e.target.value;
                setLocationValue(val);
                await updateLocation.mutateAsync({ userId: user.id, officeLocationId: val || null });
              }}
              disabled={updateLocation.isPending}
            >
              <option value="">— no location —</option>
              {officeLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-500">
              {officeLocations.find(l => l.id === locationValue)?.name || <span className="text-gray-300">—</span>}
            </span>
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
              <button onClick={onActivate}
                className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                <UserCheck size={12} /> Activate
              </button>
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

// ─── OfficeLocationsTab ───────────────────────────────────────────────────────
const WEEKEND_POLICY_OPTIONS = [
  { value: 'all_off',           label: 'Sat & Sun off' },
  { value: 'all_on',            label: 'No fixed weekends off' },
  { value: '1st_3rd_off',       label: '1st & 3rd Saturday off' },
  { value: '2nd_4th_off',       label: '2nd & 4th Saturday off' },
  { value: '2nd_4th_5th_off',   label: '2nd, 4th & 5th Saturday off' },
  { value: 'alternate_off',     label: 'Alternate Saturdays off' },
  { value: '5th_sat_working',   label: 'Sat & Sun off (5th Sat is working)' },
];

interface LocForm { name: string; country?: string; timezone?: string; }

export const OfficeLocationsTab = () => {
  const { user: currentUser } = useAuth();
  const canManage = hasPermission(currentUser, PERMISSIONS.LOCATION_ADMIN) || hasPermission(currentUser, PERMISSIONS.LEAVE_ADMIN);
  const { data: rawConfig } = useCalendarConfig() as { data: any };
  const saveCalConfig = useSaveCalendarConfig();
  const { data: rawUsers = [] } = useAdminUsers();
  const users = rawUsers as UserType[];

  const [addOpen, setAddOpen] = useState(false);
  const { register: regLoc, handleSubmit: handleLocSubmit, reset: resetLoc, formState: { isSubmitting: locSubmitting } } = useForm<LocForm>();

  const calLocations: { id: string; name: string; country?: string; timezone?: string }[] = (rawConfig as any)?.locations ?? [];
  const weekendPolicy: { default: string; perLocation: Record<string, string> } =
    (rawConfig as any)?.weekendPolicy ?? { default: 'all_off', perLocation: {} };

  const addLocation = async (data: LocForm) => {
    const newLoc = { id: `loc_${Date.now()}`, name: data.name, ...(data.country && { country: data.country }), ...(data.timezone && { timezone: data.timezone }) };
    await saveCalConfig.mutateAsync({ locations: [...calLocations, newLoc] });
    resetLoc();
    setAddOpen(false);
  };

  const removeLocation = async (locId: string) => {
    await saveCalConfig.mutateAsync({ locations: calLocations.filter((l) => l.id !== locId) });
  };

  const updateWeekendPolicy = async (locId: string | 'default', value: string) => {
    const updated = { ...weekendPolicy, perLocation: { ...weekendPolicy.perLocation } };
    if (locId === 'default') updated.default = value;
    else updated.perLocation[locId] = value;
    await saveCalConfig.mutateAsync({ weekendPolicy: updated });
  };

  const usersInLocation = (locId: string) =>
    users.filter((u) => (u as any).officeLocationId === locId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Office Locations</h3>
          <p className="text-xs text-gray-500 mt-0.5">Define your company's office locations. Assign users to locations and configure location-specific holiday calendars.</p>
        </div>
        {canManage && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add Location</Button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <p className="font-medium mb-1 flex items-center gap-2"><MapPin size={14} /> How it works</p>
        <p className="text-xs text-blue-600">
          Each user can be assigned to an office location from the <strong>Users</strong> tab. Their leave calendar will automatically show org-wide holidays plus their office location's specific holidays. Configure location calendars in the <strong>Leave &gt; Company Calendar</strong> tab.
        </p>
      </div>

      {calLocations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <MapPin size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">No office locations yet</p>
          <p className="text-xs text-gray-400 mt-1">Add locations to assign users and configure location-specific holiday calendars.</p>
          {canManage && (
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)} className="mt-4">
              Add First Location
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {calLocations.map((loc) => {
            const assigned = usersInLocation(loc.id);
            const policyValue = weekendPolicy.perLocation?.[loc.id] ?? weekendPolicy.default;
            const policyLabel = WEEKEND_POLICY_OPTIONS.find(p => p.value === policyValue)?.label ?? policyValue;
            return (
              <div key={loc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <MapPin size={15} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                        {loc.country && <p className="text-xs text-gray-400">{loc.country}</p>}
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <button onClick={() => removeLocation(loc.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded" title="Remove location">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Weekend policy */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Weekend Policy</p>
                  {canManage ? (
                    <select
                      className="form-select text-xs py-1 px-2 border-gray-300 rounded-lg w-full"
                      value={policyValue}
                      onChange={(e) => updateWeekendPolicy(loc.id, e.target.value)}
                    >
                      {WEEKEND_POLICY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-700">{policyLabel}</span>
                  )}
                </div>

                {/* Assigned users */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">{assigned.length} user{assigned.length !== 1 ? 's' : ''} assigned</p>
                  {assigned.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {assigned.slice(0, 5).map((u) => (
                        <div key={u.id} className="flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                          <span className="text-xs text-gray-700">{u.name.split(' ')[0]}</span>
                        </div>
                      ))}
                      {assigned.length > 5 && (
                        <span className="text-xs text-gray-400 px-2 py-0.5">+{assigned.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>

                {loc.timezone && (
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} />{loc.timezone}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Org-wide default weekend policy */}
      {calLocations.length > 0 && canManage && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Org-wide Default Weekend Policy</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-36 shrink-0">Applies when no location is assigned</span>
            <select
              className="form-select text-sm"
              value={weekendPolicy.default}
              onChange={(e) => updateWeekendPolicy('default', e.target.value)}
            >
              {WEEKEND_POLICY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); resetLoc(); }} title="Add Office Location" size="sm">
        <form onSubmit={handleLocSubmit(addLocation)} className="space-y-4">
          <div>
            <label className="form-label">Location Name *</label>
            <input className="form-input" placeholder="e.g. Sydney Office" {...regLoc('name', { required: 'Required' })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Country</label>
              <select className="form-select" {...regLoc('country')}>
                <option value="">— Select country —</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Timezone</label>
              <select className="form-select" {...regLoc('timezone')}>
                <option value="">— Select timezone —</option>
                {TZ_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {TIMEZONES.filter((t) => t.group === group).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={locSubmitting} icon={<Plus size={14} />}>Add Location</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

// ─── AdminPage ────────────────────────────────────────────────────────────────
const AdminPage = () => {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { confirm } = useConfirm();
  const canInvite = hasPermission(currentUser, PERMISSIONS.INVITE_USER);
  const canManageRoles = hasPermission(currentUser, PERMISSIONS.ORG_ROLE_WRITE);
  const allowedInviteRoles = INVITE_ALLOWED_ROLES[currentUser?.role ?? ''] ?? [];
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) ?? 'users';
  const [tab, setTab] = useState<Tab>(initialTab);

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

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage]   = useState(1);

  const { data: users = [], isLoading } = useAdminUsers();
  const { data: shifts = [] } = useShifts();
  const { data: officeLocations = [] } = useOfficeLocations();
  const canManageLocations = hasPermission(currentUser, PERMISSIONS.LOCATION_ADMIN);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: calConfig } = useCalendarConfig() as { data: any };
  const saveCalConfig = useSaveCalendarConfig();

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users as UserType[];
    return (users as UserType[]).filter((u) =>
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.role ?? '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers     = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);
  const inviteUser = useInviteUser();
  const deactivateUser = useDeactivateUser();
  const activateUser = useActivateUser();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>();

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
    const ok = await confirm({
      title: 'Deactivate User',
      message: 'This user will immediately lose access to the app. Their data and history will be preserved.',
      confirmText: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    try { await deactivateUser.mutateAsync(userId); } catch { /* */ }
  };

  const handleActivate = async (userId: string) => {
    const ok = await confirm({
      title: 'Reactivate User',
      message: 'This user will regain full access to the app based on their role and permissions.',
      confirmText: 'Activate',
      variant: 'info',
    });
    if (!ok) return;
    try { await activateUser.mutateAsync(userId); } catch { /* */ }
  };

  const startEditRole = (userId: string, currentRole: string) => {
    setEditingRoleId(userId);
    setEditingRole(currentRole);
  };

  const cancelEditRole = () => { setEditingRoleId(null); setEditingRole(''); };


  if (isLoading) return <Layout><PageLoader /></Layout>;

  return (
    <Layout>
      <Header title={t('nav.userManagement')} subtitle="Manage users, roles and org structure"
        actions={tab === 'users' && (canInvite
          ? <Button onClick={() => setShowInvite(true)} icon={<Plus size={16} />}>Invite User</Button>
          : <span className="flex items-center gap-1.5 text-sm text-gray-400"><Lock size={14} />No permission to invite users</span>)}
      />
      <div className="py-5 px-8 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
          {([
            { key: 'users',    label: `Users (${users.length})` },
            { key: 'roles',    label: `Roles (${orgRoles.length})` },
            { key: 'orgchart', label: 'Org Chart' },
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
          (users as UserType[]).length === 0 ? (
            <EmptyState title="No users" description="Invite your first team member."
              action={canInvite ? <Button onClick={() => setShowInvite(true)} icon={<Plus size={16} />}>Invite User</Button> : undefined} />
          ) : (
            <div className="space-y-3">
              {/* Search bar */}
              <div className="relative max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, email or role…"
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400"
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Name', 'Email', 'Role', 'Shift', 'Location', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedUsers.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No users match "{userSearch}"</td></tr>
                    ) : pagedUsers.map((u: UserType) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        currentUserId={currentUser?.id ?? ''}
                        allowedInviteRoles={allowedInviteRoles}
                        orgRoles={orgRoles}
                        shifts={shifts as any}
                        officeLocations={officeLocations}
                        canManageLocation={canManageLocations}
                        isEditingRole={editingRoleId === u.id}
                        editingRole={editingRole}
                        onStartEdit={() => startEditRole(u.id, u.role)}
                        onCancelEdit={cancelEditRole}
                        onRoleChange={setEditingRole}
                        onSaveRoleDone={cancelEditRole}
                        onDeactivate={() => handleDeactivate(u.id)}
                        onActivate={() => handleActivate(u.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {userTotalPages > 1 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-gray-500">
                    Showing {(userPage - 1) * PAGE_SIZE + 1}–{Math.min(userPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: userTotalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === userTotalPages || Math.abs(p - userPage) <= 1)
                      .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === '…' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setUserPage(p as number)}
                            className={`min-w-[28px] h-7 rounded-lg text-xs font-medium border transition-colors ${
                              userPage === p
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                      disabled={userPage === userTotalPages}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── Roles tab ──────────────────────────────────────────────────────── */}
        {tab === 'roles' && (
          <div className="space-y-5">
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
                          const ok = await confirm({ title: 'Delete Role', message: 'All member assignments for this role will be removed. This cannot be undone.', confirmText: 'Delete', variant: 'danger' });
                          if (!ok) return;
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
              onSave={async (perms, moduleAccess) => {
                await setRolePerms.mutateAsync({ permissions: perms, moduleAccess });
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

      </div>

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
