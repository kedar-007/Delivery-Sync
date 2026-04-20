import React, { useEffect, useState } from 'react';
import {
  Shield, Lock, Unlock, Check, Loader, Sparkles, Wifi, ChevronRight,
  AlertTriangle, Info, Users, Zap, Eye, EyeOff, X,
} from 'lucide-react';
import Modal, { ModalActions } from './Modal';
import Button from './Button';
import Alert from './Alert';
import { useUserPermissions, useSetUserPermissions } from '../../hooks/useAdmin';

// ─── Permission catalogue ─────────────────────────────────────────────────────

interface PermGroup {
  label: string;
  color: string;
  icon: React.ReactNode;
  perms: { key: string; label: string; desc: string }[];
}

const PERM_GROUPS: PermGroup[] = [
  {
    label: 'Projects',
    color: 'violet',
    icon: <Zap size={12} />,
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
    icon: <Check size={12} />,
    perms: [
      { key: 'TASK_READ',          label: 'View Tasks',       desc: 'See tasks across projects' },
      { key: 'TASK_WRITE',         label: 'Manage Tasks',     desc: 'Create and update tasks' },
      { key: 'TASK_COMMENT_WRITE', label: 'Comment on Tasks', desc: 'Add comments to tasks' },
    ],
  },
  {
    label: 'Actions, Blockers & RAID',
    color: 'red',
    icon: <AlertTriangle size={12} />,
    perms: [
      { key: 'ACTION_READ',    label: 'View Actions',    desc: 'See action items and owners' },
      { key: 'ACTION_WRITE',   label: 'Manage Actions',  desc: 'Create and update actions' },
      { key: 'BLOCKER_READ',   label: 'View Blockers',   desc: 'See blockers and impediments' },
      { key: 'BLOCKER_WRITE',  label: 'Manage Blockers', desc: 'Log and update blockers' },
      { key: 'RAID_READ',      label: 'View RAID',       desc: 'See RAID register entries' },
      { key: 'RAID_WRITE',     label: 'Manage RAID',     desc: 'Create and update RAID items' },
      { key: 'DECISION_READ',  label: 'View Decisions',  desc: 'See decision log' },
      { key: 'DECISION_WRITE', label: 'Log Decisions',   desc: 'Add entries to the decision log' },
    ],
  },
  {
    label: 'Daily Work',
    color: 'sky',
    icon: <ChevronRight size={12} />,
    perms: [
      { key: 'STANDUP_SUBMIT', label: 'Submit Standup',   desc: 'Post daily standup updates' },
      { key: 'STANDUP_READ',   label: 'View Standups',    desc: 'Read team standup history' },
      { key: 'EOD_SUBMIT',     label: 'Submit EOD',       desc: 'Post end-of-day reports' },
      { key: 'EOD_READ',       label: 'View EOD Reports', desc: 'Read team EOD history' },
    ],
  },
  {
    label: 'Time Tracking',
    color: 'orange',
    icon: <Info size={12} />,
    perms: [
      { key: 'TIME_READ',    label: 'View Time Logs', desc: 'See time tracking entries' },
      { key: 'TIME_WRITE',   label: 'Log Time',       desc: 'Submit time entries' },
      { key: 'TIME_APPROVE', label: 'Approve Time',   desc: 'Approve team time submissions' },
    ],
  },
  {
    label: 'Attendance',
    color: 'blue',
    icon: <Users size={12} />,
    perms: [
      { key: 'ATTENDANCE_READ',  label: 'View Attendance',       desc: 'See own and team attendance records' },
      { key: 'ATTENDANCE_WRITE', label: 'Check In / Out',        desc: 'Log attendance entries' },
      { key: 'ATTENDANCE_ADMIN', label: 'Manage All Attendance', desc: 'View all users, export CSV, override records' },
      { key: 'IP_CONFIG_WRITE',  label: 'IP Restriction Config', desc: 'Add / remove office IP ranges and toggle IP enforcement' },
    ],
  },
  {
    label: 'Leave',
    color: 'emerald',
    icon: <Eye size={12} />,
    perms: [
      { key: 'LEAVE_READ',    label: 'View Leave',    desc: 'See own leave requests and balances' },
      { key: 'LEAVE_WRITE',   label: 'Request Leave', desc: 'Submit leave applications' },
      { key: 'LEAVE_APPROVE', label: 'Approve Leave', desc: 'Approve or reject team leave requests' },
      { key: 'LEAVE_ADMIN',   label: 'Manage Leave',  desc: 'Manage leave types, balances and policies' },
    ],
  },
  {
    label: 'People & Org',
    color: 'teal',
    icon: <Users size={12} />,
    perms: [
      { key: 'TEAM_READ',          label: 'View Teams',         desc: 'See team structure and members' },
      { key: 'TEAM_WRITE',         label: 'Manage Teams',       desc: 'Create and edit teams' },
      { key: 'ORG_READ',           label: 'View Org Chart',     desc: 'See organisational hierarchy' },
      { key: 'ORG_WRITE',          label: 'Edit Org Chart',     desc: 'Update org structure' },
      { key: 'ORG_ROLE_READ',      label: 'View Org Roles',     desc: 'See org roles and their permissions' },
      { key: 'ORG_ROLE_WRITE',     label: 'Manage Org Roles',   desc: 'Create, edit and assign org roles' },
      { key: 'PROFILE_READ',       label: 'View Profiles',      desc: 'See user profiles and directories' },
      { key: 'PROFILE_WRITE',      label: 'Edit Profiles',      desc: 'Update profile information' },
      { key: 'ANNOUNCEMENT_READ',  label: 'View Announcements', desc: 'Read company announcements' },
      { key: 'ANNOUNCEMENT_WRITE', label: 'Post Announcements', desc: 'Create and publish announcements' },
      { key: 'NOTIFICATION_READ',  label: 'Notifications',      desc: 'Receive in-app notifications' },
      { key: 'INVITE_USER',        label: 'Invite Users',       desc: 'Send invitations to new team members' },
    ],
  },
  {
    label: 'Assets & Badges',
    color: 'rose',
    icon: <Shield size={12} />,
    perms: [
      { key: 'ASSET_READ',    label: 'View Assets',      desc: 'See asset inventory' },
      { key: 'ASSET_WRITE',   label: 'Manage Assets',    desc: 'Create and update asset records' },
      { key: 'ASSET_ASSIGN',  label: 'Assign Assets',    desc: 'Assign assets to users' },
      { key: 'ASSET_APPROVE', label: 'Approve Requests', desc: 'Approve asset request tickets' },
      { key: 'ASSET_ADMIN',   label: 'Asset Admin',      desc: 'Full asset management access' },
      { key: 'BADGE_READ',    label: 'View Badges',      desc: 'See badge catalog and awards' },
      { key: 'BADGE_WRITE',   label: 'Manage Badges',    desc: 'Create and edit badge definitions' },
      { key: 'BADGE_AWARD',   label: 'Award Badges',     desc: 'Grant badges to team members' },
    ],
  },
  {
    label: 'Reports',
    color: 'indigo',
    icon: <Info size={12} />,
    perms: [
      { key: 'REPORT_READ',    label: 'View Reports',   desc: 'Access reports and analytics' },
      { key: 'REPORT_WRITE',   label: 'Create Reports', desc: 'Generate and save reports' },
      { key: 'DASHBOARD_READ', label: 'View Dashboard', desc: 'Access the main dashboard KPIs' },
    ],
  },
  {
    label: 'AI & Insights',
    color: 'purple',
    icon: <Sparkles size={12} />,
    perms: [
      { key: 'AI_INSIGHTS',      label: 'AI Insights Access',   desc: 'Daily summary, suggestions, NLQ and blocker detection' },
      { key: 'AI_PERFORMANCE',   label: 'Performance Analysis', desc: 'Individual and team performance analysis cards' },
      { key: 'AI_TEAM_ANALYSIS', label: 'Team-wide Analysis',   desc: 'Holistic performance, health scores, trends and retrospectives' },
    ],
  },
  {
    label: 'Administration',
    color: 'slate',
    icon: <Shield size={12} />,
    perms: [
      { key: 'ADMIN_USERS',    label: 'Manage Users',    desc: 'View and update user accounts' },
      { key: 'ADMIN_SETTINGS', label: 'System Settings', desc: 'Access tenant settings and audit logs' },
      { key: 'CONFIG_READ',    label: 'View Config',     desc: 'See workflow and feature configurations' },
      { key: 'CONFIG_WRITE',   label: 'Edit Config',     desc: 'Change workflow and feature configurations' },
      { key: 'DATA_SEED',      label: 'Data Seeding',    desc: 'Generate and clear demo/test data' },
    ],
  },
];

// ─── AI advisor content per permission ────────────────────────────────────────

interface AiGuide {
  summary: string;
  unlocks: string[];
  defaultRoles: string[];
  risk: 'low' | 'medium' | 'high';
  tip: string;
}

const AI_GUIDE: Record<string, AiGuide> = {
  IP_CONFIG_WRITE: {
    summary: 'Controls who can manage the office IP whitelist — the network addresses that employees must be on to clock in as Present. The holder can add or remove IP ranges (e.g. 192.168.1.0/24), toggle enforcement on or off, and effectively override location-based attendance controls for the whole organisation.',
    unlocks: ['IP Config page under Admin › Attendance', 'Add / remove CIDR IP ranges', 'Enable or disable IP enforcement globally', 'View currently whitelisted ranges'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'high',
    tip: 'Only grant to IT administrators or senior HR managers who own office network config. A wrong IP range silently blocks every employee from checking in.',
  },
  ATTENDANCE_ADMIN: {
    summary: 'Grants full oversight of all attendance records across the organisation. The user can view everyone\'s check-in history, export CSV reports, manually override any attendance record (with a reason), and see anomalies like late arrivals or missing check-outs.',
    unlocks: ['All-user attendance records', 'Attendance anomaly dashboard', 'Manual override with audit trail', 'CSV export for any date range'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'high',
    tip: 'Treat this like payroll access — restrict to HR leads and senior managers only.',
  },
  ATTENDANCE_READ: {
    summary: 'Allows the user to see attendance records. By default the scope is own + subordinates; org-wide visibility is controlled separately by data-sharing rules.',
    unlocks: ['My Attendance page', 'Team attendance records (within data scope)', 'Live attendance widget on dashboard'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe to grant to all employees. Sensitive org-wide data is limited by the separate data-scope setting.',
  },
  ATTENDANCE_WRITE: {
    summary: 'Lets the user submit their own attendance: check in, check out, mark WFH (with optional reason), and start or end breaks. Required for every employee who needs to log daily presence.',
    unlocks: ['Check In / Check Out buttons', 'WFH check-in with reason', 'Lunch and short break timers', 'Attendance widget on dashboard'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'TEAM_MEMBER', 'PMO'],
    risk: 'low',
    tip: 'Should be granted to every active employee.',
  },
  PROJECT_READ: {
    summary: 'Allows viewing the project list, project details, member lists, and linked items like milestones. Non-members only see projects they are explicitly added to.',
    unlocks: ['Projects list page', 'Project detail & overview', 'Project member list'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC', 'CLIENT'],
    risk: 'low',
    tip: 'All employees should have this. Visibility is scoped to membership, so non-admins only see their own projects.',
  },
  PROJECT_WRITE: {
    summary: 'Allows creating new projects, editing project name / description / dates / status, updating RAG status with a reason, and managing project membership.',
    unlocks: ['Create project form', 'Edit project details', 'RAG status update with reason', 'Add / remove project members'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Grant to Project Managers and Delivery Leads. Avoid granting to all team members as anyone could modify project membership.',
  },
  SPRINT_READ: {
    summary: 'Lets the user view all sprints for their projects, including the sprint board (Kanban) and velocity chart.',
    unlocks: ['Sprints list page', 'Sprint board (Kanban view)', 'Velocity & completion charts'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Grant to all project contributors.',
  },
  SPRINT_WRITE: {
    summary: 'Allows creating sprints, editing sprint dates and goals, starting sprints, completing sprints, and moving tasks between sprints.',
    unlocks: ['Create sprint', 'Start / complete sprint', 'Edit sprint name and dates', 'Move tasks between sprints'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Reserve for Scrum Masters and Delivery Leads who own the sprint lifecycle.',
  },
  MILESTONE_READ: {
    summary: 'Allows viewing project milestones, due dates, and completion status.',
    unlocks: ['Milestones tab in project detail', 'Milestone due date view'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC', 'CLIENT'],
    risk: 'low',
    tip: 'Safe for all project members including clients.',
  },
  MILESTONE_WRITE: {
    summary: 'Allows creating, editing, and completing milestones within projects.',
    unlocks: ['Create milestone', 'Edit milestone name / date / status', 'Mark milestone complete'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'low',
    tip: 'Grant to PMs and Delivery Leads.',
  },
  TASK_READ: {
    summary: 'Allows viewing tasks within projects the user is a member of, including task details, comments, attachments, and change history.',
    unlocks: ['My Tasks page', 'Sprint board tasks', 'Task detail with comments and history'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'All project contributors need this.',
  },
  TASK_WRITE: {
    summary: 'Allows creating tasks, updating status, changing assignees, setting priorities and due dates, and managing attachments.',
    unlocks: ['Create task form', 'Update task status', 'Drag tasks on Kanban board', 'Assign / reassign tasks'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'Grant to all active contributors who need to self-assign and update work.',
  },
  TASK_COMMENT_WRITE: {
    summary: 'Allows adding comments to tasks. Users can only delete their own comments.',
    unlocks: ['Comment input on task detail'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'TEAM_MEMBER', 'PMO'],
    risk: 'low',
    tip: 'Safe to grant broadly for collaboration.',
  },
  STANDUP_SUBMIT: {
    summary: 'Allows submitting daily standup updates (yesterday, today, blockers) with optional voice recording and AI field extraction.',
    unlocks: ['Standup submission form (web + mobile)', 'Voice recording for standup', 'AI field auto-population'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'All active contributors should have this.',
  },
  STANDUP_READ: {
    summary: 'Allows viewing standup history and rollup reports for the user\'s data scope.',
    unlocks: ['Standup rollup page', 'Team standup history filtered by scope'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Grant to all team members.',
  },
  EOD_SUBMIT: {
    summary: 'Allows submitting end-of-day reports including summary, completed items, blockers, and mood with voice recording support.',
    unlocks: ['EOD submission form (web + mobile)', 'Mood selection', 'Voice recording for EOD'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'All active contributors should have this.',
  },
  EOD_READ: {
    summary: 'Allows viewing EOD reports and rollup summaries for the user\'s data scope.',
    unlocks: ['EOD rollup page', 'Team EOD history'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Grant to all team members and managers.',
  },
  TIME_READ: {
    summary: 'Allows viewing time tracking entries. Scope (own vs team) is controlled by data-sharing settings.',
    unlocks: ['Time Tracking page', 'Weekly summary', 'Time by project breakdown'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Grant to all contributors who log time.',
  },
  TIME_WRITE: {
    summary: 'Allows creating and editing own time entries, submitting them for approval, and retracting submissions.',
    unlocks: ['Create time entry', 'Submit / retract time entry', 'Bulk submit week'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'Grant to all contributors who track billable / project time.',
  },
  TIME_APPROVE: {
    summary: 'Allows approving or rejecting team time submissions and escalating entries for further review.',
    unlocks: ['Time Approvals queue', 'Approve / reject with reason', 'Escalate to next level'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Reserve for line managers and project leads who own billing / payroll accuracy.',
  },
  ACTION_READ: {
    summary: 'Allows viewing action items within projects including owner, due date, and status.',
    unlocks: ['Actions tab in project detail', 'Action item list'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all project contributors.',
  },
  ACTION_WRITE: {
    summary: 'Allows creating, editing, and closing action items.',
    unlocks: ['Create action form', 'Update action status', 'Delete own actions'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'Grant to all project contributors.',
  },
  BLOCKER_READ: {
    summary: 'Allows viewing project blockers including severity, status, and resolution notes.',
    unlocks: ['Blockers tab in project', 'Blocker list with filters'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all project contributors.',
  },
  BLOCKER_WRITE: {
    summary: 'Allows creating blockers, updating status, resolving with notes, and escalating.',
    unlocks: ['Create blocker', 'Resolve / escalate blocker', 'Auto-blocker from standup'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'Grant to all contributors so they can self-report blockers.',
  },
  RAID_READ: {
    summary: 'Allows viewing the RAID register (Risks, Issues, Actions, Dependencies, Assumptions).',
    unlocks: ['RAID board page', 'All four RAID columns'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Grant to all project stakeholders.',
  },
  RAID_WRITE: {
    summary: 'Allows creating and updating RAID items across all categories.',
    unlocks: ['Create risk / issue / dependency / assumption', 'Update RAID item status'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'low',
    tip: 'Grant to PMs and Delivery Leads who manage project risk.',
  },
  DECISION_READ: {
    summary: 'Allows viewing the decision log for projects.',
    unlocks: ['Decisions tab in project', 'Decision log list'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all project members.',
  },
  DECISION_WRITE: {
    summary: 'Allows logging new decisions and marking them as implemented.',
    unlocks: ['Create decision', 'Mark decision implemented'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'low',
    tip: 'Grant to lead contributors and PMs.',
  },
  LEAVE_READ: {
    summary: 'Allows viewing own leave requests, leave history, and remaining balances.',
    unlocks: ['Leave page — My Leaves tab', 'Leave balance summary', 'Leave calendar view'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'All employees need this.',
  },
  LEAVE_WRITE: {
    summary: 'Allows submitting leave applications, selecting half-day options, and cancelling pending requests.',
    unlocks: ['Apply Leave form', 'Cancel pending leave', 'Half-day session selection'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'All employees need this.',
  },
  LEAVE_APPROVE: {
    summary: 'Allows approving or rejecting leave requests from direct reports, with optional notes. Scoped to the user\'s team or reporting hierarchy.',
    unlocks: ['Team Requests tab (web + mobile)', 'Approve / reject with reason', 'Leave request notification'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Grant only to people managers and HR.',
  },
  LEAVE_ADMIN: {
    summary: 'Provides full leave management: create/edit leave types, set individual balances, manage company holidays, and view all-staff leave.',
    unlocks: ['Leave Types management', 'Set leave balance per user', 'Company holiday calendar admin', 'All-staff leave overview'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'high',
    tip: 'Restrict to HR administrators only. Incorrect balance changes affect payroll.',
  },
  TEAM_READ: {
    summary: 'Allows viewing teams, their members, and team details.',
    unlocks: ['Teams list', 'Team detail and members'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all employees.',
  },
  TEAM_WRITE: {
    summary: 'Allows creating, editing, and deleting teams, and managing team membership.',
    unlocks: ['Create / edit team', 'Add / remove team members', 'Delete team'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Grant to HR and senior managers who own org structure.',
  },
  ORG_READ: {
    summary: 'Allows viewing the organisational chart and reporting hierarchy.',
    unlocks: ['Org Chart page', 'Reporting lines', 'Direct reports count'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all employees.',
  },
  ORG_WRITE: {
    summary: 'Allows editing the org chart: reassigning managers and updating the reporting hierarchy. Circular reporting is prevented by the system.',
    unlocks: ['Drag-to-reassign in org chart', 'Change manager endpoint'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'high',
    tip: 'Restrict to HR admin and TENANT_ADMIN. Incorrect changes break reporting hierarchies and data scoping.',
  },
  ORG_ROLE_READ: {
    summary: 'Allows viewing org roles and their assigned permission sets. Does not allow changes.',
    unlocks: ['Org Roles list in Admin', 'Role permission view'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC'],
    risk: 'low',
    tip: 'Safe to grant for transparency. Read-only, no changes possible.',
  },
  ORG_ROLE_WRITE: {
    summary: 'Allows creating, editing, and deleting org roles and their permission sets. Changes affect every user assigned to a role immediately.',
    unlocks: ['Create / edit org role', 'Set role permissions', 'Delete org role', 'Assign role to users'],
    defaultRoles: ['TENANT_ADMIN'],
    risk: 'high',
    tip: 'Restrict to TENANT_ADMIN only. Editing a role\'s permissions instantly affects all users with that role.',
  },
  PROFILE_READ: {
    summary: 'Allows viewing user profiles in the directory including name, role, team, and badges.',
    unlocks: ['People directory', 'Individual profile page', 'Badge display'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all employees.',
  },
  PROFILE_WRITE: {
    summary: 'Allows editing own profile: name, avatar, contact details, skills, bio, and resume upload.',
    unlocks: ['Edit profile form', 'Avatar / photo upload', 'Resume file upload', 'Skills and bio fields'],
    defaultRoles: ['TENANT_ADMIN', 'TEAM_MEMBER'],
    risk: 'low',
    tip: 'All employees need this for their own profile.',
  },
  ANNOUNCEMENT_READ: {
    summary: 'Allows reading company announcements and seeing the unread badge count.',
    unlocks: ['Announcements page', 'Dashboard announcement widget', 'Unread count badge'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'All employees should have this.',
  },
  ANNOUNCEMENT_WRITE: {
    summary: 'Allows creating and publishing company-wide announcements visible to all users.',
    unlocks: ['Create Announcement form', 'Publish / unpublish announcement'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'medium',
    tip: 'Grant only to comms / HR who own internal communications.',
  },
  NOTIFICATION_READ: {
    summary: 'Allows receiving in-app notifications for relevant events (leave approvals, mentions, assignments).',
    unlocks: ['Notification bell', 'Notification list', 'Push notifications (mobile)'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC', 'CLIENT'],
    risk: 'low',
    tip: 'All users should have this.',
  },
  INVITE_USER: {
    summary: 'Allows sending email invitations to new team members. The inviter can only assign roles they are permitted to grant.',
    unlocks: ['Invite User button in Admin', 'Role selection during invite'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Grant with care — invited users consume a seat and immediately gain access.',
  },
  ASSET_READ: {
    summary: 'Allows viewing the asset inventory, own assigned assets, and asset categories.',
    unlocks: ['Asset inventory page', 'My Assets tab', 'Asset detail view'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all employees.',
  },
  ASSET_WRITE: {
    summary: 'Allows creating and editing asset records including bulk import via CSV.',
    unlocks: ['Add asset form', 'Edit asset details', 'Bulk CSV import'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'medium',
    tip: 'Reserve for IT / asset managers only.',
  },
  ASSET_ASSIGN: {
    summary: 'Allows assigning available assets to users and processing returns.',
    unlocks: ['Assign asset to user', 'Return asset (de-assign)', 'Assignment history'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'medium',
    tip: 'Grant to IT helpdesk staff who manage asset handover.',
  },
  ASSET_APPROVE: {
    summary: 'Allows approving or rejecting asset requests submitted by employees.',
    unlocks: ['Asset Requests queue', 'Approve / reject with notes'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'medium',
    tip: 'Grant to asset managers or IT leads.',
  },
  ASSET_ADMIN: {
    summary: 'Provides full asset management access: categories, maintenance scheduling, retirement, and inventory oversight.',
    unlocks: ['Asset Categories management', 'Schedule / complete maintenance', 'Retire asset', 'Full inventory override'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'high',
    tip: 'Restrict to IT admin and senior asset managers.',
  },
  BADGE_READ: {
    summary: 'Allows viewing the badge catalog, badge awards, and leaderboard.',
    unlocks: ['Badge catalog page', 'User badge display on profile', 'Leaderboard view'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC'],
    risk: 'low',
    tip: 'Safe for all employees.',
  },
  BADGE_WRITE: {
    summary: 'Allows creating and editing badge definitions in the badge catalog.',
    unlocks: ['Create / edit badge form', 'Badge category management'],
    defaultRoles: ['TENANT_ADMIN', 'PMO'],
    risk: 'low',
    tip: 'Grant to HR who manage recognition programs.',
  },
  BADGE_AWARD: {
    summary: 'Allows awarding badges from the catalog to team members.',
    unlocks: ['Award badge to user action', 'Badge nomination flow'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'low',
    tip: 'Grant to team leads and HR who run recognition programs.',
  },
  REPORT_READ: {
    summary: 'Allows accessing and viewing saved reports and analytics dashboards. Scope is limited by data-sharing rules.',
    unlocks: ['Reports list page', 'Report detail view', 'Public report link access'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC', 'CLIENT'],
    risk: 'low',
    tip: 'Grant broadly. Sensitive org-wide data is protected by data-scope.',
  },
  REPORT_WRITE: {
    summary: 'Allows generating, editing, sharing, exporting, and deleting reports.',
    unlocks: ['Generate new report', 'Download PDF', 'Share public link', 'Delete report'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'medium',
    tip: 'Grant to leads and managers who produce delivery reports.',
  },
  DASHBOARD_READ: {
    summary: 'Allows accessing the main dashboard including KPI widgets, quick stats, and the attendance widget.',
    unlocks: ['Main dashboard page', 'KPI widgets', 'Attendance quick-action widget'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'TEAM_MEMBER', 'EXEC', 'CLIENT'],
    risk: 'low',
    tip: 'All users should have this.',
  },
  AI_INSIGHTS: {
    summary: 'Unlocks the core AI features: daily summary of standups/EODs, smart suggestions, natural language queries, and automatic blocker detection.',
    unlocks: ['AI Insights page', 'Daily AI summary card', 'Smart Suggestions', 'Natural Language Query', 'Auto blocker detection from text', 'Voice-to-standup transcription'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC'],
    risk: 'low',
    tip: 'Grant to all managers and leads. Not granted to TEAM_MEMBER by default — must be explicitly enabled.',
  },
  AI_PERFORMANCE: {
    summary: 'Unlocks individual and team performance analysis cards generated by AI, including completion rates, ratings, and comparisons.',
    unlocks: ['Performance Analysis card', 'Individual performance score', 'Team performance breakdown'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC'],
    risk: 'medium',
    tip: 'Contains performance ratings. Only grant to people managers and HR.',
  },
  AI_TEAM_ANALYSIS: {
    summary: 'Unlocks the most powerful AI features: holistic org-wide performance, health scores, productivity trends, mood analysis, and sprint retrospectives.',
    unlocks: ['Holistic performance view', 'Org health score', 'Productivity & mood trends', 'Sprint retrospective AI', 'Team wellbeing insights'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC'],
    risk: 'high',
    tip: 'Highly sensitive — shows org-wide performance and mood trends. Restrict to senior management and HR.',
  },
  ADMIN_USERS: {
    summary: 'Allows full user management: view all users, invite new members, edit roles, override permissions, and deactivate accounts.',
    unlocks: ['Admin › Users list', 'Invite user', 'Edit user role', 'Override user permissions', 'Deactivate user'],
    defaultRoles: ['TENANT_ADMIN'],
    risk: 'high',
    tip: 'Treat this as superuser access. Restrict to TENANT_ADMIN.',
  },
  ADMIN_SETTINGS: {
    summary: 'Allows accessing tenant settings, viewing audit logs, and managing data sharing rules.',
    unlocks: ['Tenant settings page', 'Audit logs (all user activity)', 'Data sharing rules editor', 'Permissions matrix view'],
    defaultRoles: ['TENANT_ADMIN'],
    risk: 'high',
    tip: 'Audit logs contain all user activity. Restrict to TENANT_ADMIN and compliance officers.',
  },
  CONFIG_READ: {
    summary: 'Allows viewing workflow configurations, feature flags, and form configurations. No changes possible.',
    unlocks: ['Admin Config page (read-only)', 'Feature flag list', 'Workflow rules view'],
    defaultRoles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO'],
    risk: 'low',
    tip: 'Safe to grant for visibility. Changes require CONFIG_WRITE.',
  },
  CONFIG_WRITE: {
    summary: 'Allows changing workflow rules, enabling or disabling feature modules, and editing form configurations for the entire tenant.',
    unlocks: ['Feature flag toggles', 'Workflow rule editor', 'Form config editor', 'Module enable / disable'],
    defaultRoles: ['TENANT_ADMIN'],
    risk: 'high',
    tip: 'Disabling a module hides it from all users instantly. Restrict to TENANT_ADMIN.',
  },
  DATA_SEED: {
    summary: 'Allows generating and clearing demo/test data for the tenant. Intended for development and QA environments only.',
    unlocks: ['Data Seed page', 'Generate sample projects / tasks / standups', 'Clear all test data'],
    defaultRoles: ['TENANT_ADMIN'],
    risk: 'high',
    tip: 'Never grant in production. Test data cannot be selectively removed.',
  },
};

// ─── Colour helpers ───────────────────────────────────────────────────────────

const GROUP_BG: Record<string, string> = {
  blue: 'bg-blue-50/60 border-blue-100',
  emerald: 'bg-emerald-50/60 border-emerald-100',
  violet: 'bg-violet-50/60 border-violet-100',
  amber: 'bg-amber-50/60 border-amber-100',
  teal: 'bg-teal-50/60 border-teal-100',
  indigo: 'bg-indigo-50/60 border-indigo-100',
  orange: 'bg-orange-50/60 border-orange-100',
  rose: 'bg-rose-50/60 border-rose-100',
  slate: 'bg-slate-50/60 border-slate-100',
  sky: 'bg-sky-50/60 border-sky-100',
  red: 'bg-red-50/60 border-red-100',
  purple: 'bg-purple-50/60 border-purple-100',
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
  slate: 'text-slate-600',
  sky: 'text-sky-700',
  red: 'text-red-700',
  purple: 'text-purple-700',
};

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low:    { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Low risk' },
  medium: { bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   label: 'Medium risk' },
  high:   { bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     label: 'High risk' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userRole: string;
}

// ─── AI Advisor Panel ─────────────────────────────────────────────────────────

const AiAdvisorPanel = ({
  selectedPerm,
  selectedLabel,
  enabledCount,
  totalCount,
  extraCount,
  revokedCount,
}: {
  selectedPerm: string | null;
  selectedLabel: string;
  enabledCount: number;
  totalCount: number;
  extraCount: number;
  revokedCount: number;
}) => {
  const guide = selectedPerm ? AI_GUIDE[selectedPerm] : null;
  const risk = guide ? RISK_STYLES[guide.risk] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-purple-100">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0">
          <Sparkles size={14} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-purple-800">AI Permission Advisor</p>
          <p className="text-[10px] text-purple-400 leading-none">Click any permission to learn more</p>
        </div>
      </div>

      {!guide ? (
        /* ── Overview when nothing selected ── */
        <div className="space-y-3 flex-1">
          <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Permission Summary</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                <p className="text-xl font-bold text-indigo-600">{enabledCount}</p>
                <p className="text-[10px] text-gray-500">Active</p>
              </div>
              <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                <p className="text-xl font-bold text-gray-400">{totalCount - enabledCount}</p>
                <p className="text-[10px] text-gray-500">Inactive</p>
              </div>
              <div className="rounded-lg bg-white border border-emerald-100 p-2.5 text-center">
                <p className="text-xl font-bold text-emerald-600">{extraCount}</p>
                <p className="text-[10px] text-gray-500">Extra grants</p>
              </div>
              <div className="rounded-lg bg-white border border-red-100 p-2.5 text-center">
                <p className="text-xl font-bold text-red-500">{revokedCount}</p>
                <p className="text-[10px] text-gray-500">Revoked</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
            <div className="flex items-start gap-2">
              <Info size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">How it works</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Permissions inherit from the user's role. You can grant <strong>extra</strong> permissions on top or <strong>revoke</strong> individual defaults without changing the role.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <div className="flex items-start gap-2">
              <Wifi size={13} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-1">IP Restriction Config</p>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  The <strong>IP Restriction Config</strong> permission (under Attendance) controls who can manage office IP ranges and toggle location-based check-in enforcement.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Deep-dive when a permission is selected ── */
        <div className="space-y-3 flex-1 overflow-y-auto">
          {/* Permission name + risk badge */}
          <div className="rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-bold text-gray-900 leading-tight">{selectedLabel}</p>
              {risk && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${risk.bg} ${risk.text}`}>
                  {risk.label}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">{guide.summary}</p>
          </div>

          {/* Unlocks */}
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">What it unlocks</p>
            <ul className="space-y-1">
              {guide.unlocks.map((u) => (
                <li key={u} className="flex items-start gap-1.5">
                  <Check size={10} className="text-emerald-500 mt-1 shrink-0" />
                  <span className="text-[11px] text-emerald-800">{u}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Default roles */}
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
            <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-2">Granted by default to</p>
            <div className="flex flex-wrap gap-1">
              {guide.defaultRoles.map((r) => (
                <span key={r} className="text-[10px] px-1.5 py-0.5 bg-white border border-indigo-200 text-indigo-700 rounded font-semibold">
                  {r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className={`rounded-xl border p-3 ${risk?.bg ?? 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={11} className={`${risk?.text ?? 'text-gray-500'} mt-0.5 shrink-0`} />
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${risk?.text ?? 'text-gray-600'}`}>
                  Admin tip
                </p>
                <p className={`text-[11px] leading-relaxed ${risk?.text ?? 'text-gray-700'}`}>{guide.tip}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const UserPermissionsModal = ({ open, onClose, userId, userName, userRole }: Props) => {
  const { data, isLoading } = useUserPermissions(userId, open);
  const save = useSetUserPermissions(userId);

  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedPerm, setSelectedPerm] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!data) return;
    const roleSet = new Set<string>(data.rolePermissions ?? []);
    const granted = new Set<string>(data.granted ?? []);
    const revoked = new Set<string>(data.revoked ?? []);
    const effective = new Set<string>([...Array.from(roleSet), ...Array.from(granted)]);
    revoked.forEach((p) => effective.delete(p));
    setEnabled(effective);
    setDirty(false);
  }, [data]);

  const roleSet = new Set<string>(data?.rolePermissions ?? []);
  const allPerms = PERM_GROUPS.flatMap((g) => g.perms);
  const totalCount = allPerms.length;
  const enabledCount = allPerms.filter((p) => enabled.has(p.key)).length;
  const extraCount = allPerms.filter((p) => enabled.has(p.key) && !roleSet.has(p.key)).length;
  const revokedCount = allPerms.filter((p) => !enabled.has(p.key) && roleSet.has(p.key)).length;

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

  const lowerSearch = search.toLowerCase();
  const filteredGroups = PERM_GROUPS.map((g) => ({
    ...g,
    perms: lowerSearch
      ? g.perms.filter((p) =>
          p.label.toLowerCase().includes(lowerSearch) ||
          p.desc.toLowerCase().includes(lowerSearch) ||
          p.key.toLowerCase().includes(lowerSearch)
        )
      : g.perms,
  })).filter((g) => g.perms.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="3xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader size={18} className="animate-spin" /> Loading permissions…
        </div>
      ) : (
        <>
          {/* ── Header ── */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
              <Shield size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-gray-900">Permissions — {userName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-200">
                  {userRole.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-gray-400">Role defaults pre-filled · toggle to grant extra or revoke</span>
              </div>
            </div>
            {/* Summary pills */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <span className="flex items-center gap-1 text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-semibold">
                <Unlock size={10} /> {extraCount} extra
              </span>
              <span className="flex items-center gap-1 text-[11px] px-2 py-1 bg-red-50 text-red-600 rounded-full border border-red-200 font-semibold">
                <Lock size={10} /> {revokedCount} revoked
              </span>
            </div>
            <button
              onClick={onClose}
              className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {saveError && <Alert type="error" message={saveError} className="mb-4" />}

          {/* ── Two-column layout ── */}
          <div className="flex gap-5" style={{ height: '62vh' }}>

            {/* Left: Permission groups */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Search */}
              <div className="relative mb-3 shrink-0">
                <input
                  type="text"
                  placeholder="Search permissions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                />
                <Eye size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>

              {/* Groups */}
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {filteredGroups.map((group) => (
                  <div
                    key={group.label}
                    className={`rounded-xl border p-3.5 ${GROUP_BG[group.color] ?? 'bg-gray-50 border-gray-100'}`}
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2.5 flex items-center gap-1.5 ${GROUP_TITLE[group.color] ?? 'text-gray-600'}`}>
                      {group.icon} {group.label}
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                      {group.perms.map((p) => {
                        const isOn = enabled.has(p.key);
                        const fromRole = roleSet.has(p.key);
                        const isSelected = selectedPerm === p.key;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => {
                              toggle(p.key);
                              setSelectedPerm(p.key);
                              setSelectedLabel(p.label);
                            }}
                            onMouseEnter={() => {
                              setSelectedPerm(p.key);
                              setSelectedLabel(p.label);
                            }}
                            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                              isSelected
                                ? 'ring-2 ring-indigo-400 ring-offset-1'
                                : ''
                            } ${
                              isOn
                                ? 'bg-white border-gray-200 shadow-sm'
                                : 'bg-white/50 border-gray-100 opacity-55'
                            }`}
                          >
                            {/* Checkbox */}
                            <div className={`mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors ${
                              isOn ? 'bg-indigo-600' : 'bg-gray-200'
                            }`}>
                              {isOn && <Check size={9} color="white" strokeWidth={3} />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs font-semibold text-gray-800 leading-tight">{p.label}</span>
                                {fromRole && isOn && (
                                  <span className="text-[9px] px-1 py-0.5 bg-indigo-100 text-indigo-600 rounded font-bold leading-none">
                                    role
                                  </span>
                                )}
                                {isOn && !fromRole && (
                                  <span className="text-[9px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold leading-none flex items-center gap-0.5">
                                    <Unlock size={7} /> extra
                                  </span>
                                )}
                                {!isOn && fromRole && (
                                  <span className="text-[9px] px-1 py-0.5 bg-red-100 text-red-600 rounded font-bold leading-none flex items-center gap-0.5">
                                    <Lock size={7} /> revoked
                                  </span>
                                )}
                                {p.key === 'IP_CONFIG_WRITE' && (
                                  <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold leading-none flex items-center gap-0.5">
                                    <Wifi size={7} /> IP
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight truncate">{p.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: AI Advisor */}
            <div className="w-64 shrink-0 flex flex-col bg-gradient-to-b from-purple-50/80 to-violet-50/50 rounded-xl border border-purple-100 p-4 overflow-y-auto">
              <AiAdvisorPanel
                selectedPerm={selectedPerm}
                selectedLabel={selectedLabel}
                enabledCount={enabledCount}
                totalCount={totalCount}
                extraCount={extraCount}
                revokedCount={revokedCount}
              />
            </div>
          </div>

          {/* ── Legend ── */}
          <div className="mt-4 flex items-center gap-4 flex-wrap text-xs text-gray-400 px-0.5">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-indigo-600 inline-block" />
              Enabled
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-semibold">role</span>
              From role
            </span>
            <span className="flex items-center gap-1">
              <Unlock size={10} className="text-emerald-600" />
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">extra</span>
              Granted beyond role
            </span>
            <span className="flex items-center gap-1">
              <Lock size={10} className="text-red-500" />
              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-semibold">revoked</span>
              Removed from role defaults
            </span>
            <span className="flex items-center gap-1">
              <EyeOff size={10} className="text-gray-400" />
              Greyed = inactive
            </span>
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
