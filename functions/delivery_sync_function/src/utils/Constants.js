'use strict';

// ─── User Roles ───────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  TENANT_ADMIN: 'TENANT_ADMIN',
  DELIVERY_LEAD: 'DELIVERY_LEAD',
  TEAM_MEMBER: 'TEAM_MEMBER',
  PMO: 'PMO',
  EXEC: 'EXEC',
  CLIENT: 'CLIENT',
});

// ─── Project Member Roles (roles allowed when adding a user to a project) ─────
const PROJECT_MEMBER_ROLES = Object.freeze([
  'DELIVERY_LEAD', 'PROJECT_MANAGER', 'SCRUM_MASTER', 'PRODUCT_OWNER',
  'TECH_LEAD', 'SENIOR_DEVELOPER', 'DEVELOPER', 'DEVOPS_ENGINEER',
  'TESTER', 'DESIGNER', 'BUSINESS_ANALYST', 'DATA_ANALYST',
  'STAKEHOLDER', 'OBSERVER', 'LEAD', 'MEMBER',
]);

// ─── Permissions ──────────────────────────────────────────────────────────────
const PERMISSIONS = Object.freeze({
  // ── Existing delivery permissions ───────────────────────────────────────────
  PROJECT_READ: 'PROJECT_READ',
  PROJECT_WRITE: 'PROJECT_WRITE',
  STANDUP_SUBMIT: 'STANDUP_SUBMIT',
  STANDUP_READ: 'STANDUP_READ',
  EOD_SUBMIT: 'EOD_SUBMIT',
  EOD_READ: 'EOD_READ',
  ACTION_READ: 'ACTION_READ',
  ACTION_WRITE: 'ACTION_WRITE',
  BLOCKER_READ: 'BLOCKER_READ',
  BLOCKER_WRITE: 'BLOCKER_WRITE',
  RAID_READ: 'RAID_READ',
  RAID_WRITE: 'RAID_WRITE',
  DECISION_READ: 'DECISION_READ',
  DECISION_WRITE: 'DECISION_WRITE',
  MILESTONE_READ: 'MILESTONE_READ',
  MILESTONE_WRITE: 'MILESTONE_WRITE',
  REPORT_READ: 'REPORT_READ',
  REPORT_WRITE: 'REPORT_WRITE',
  DASHBOARD_READ: 'DASHBOARD_READ',
  ADMIN_USERS: 'ADMIN_USERS',
  ADMIN_SETTINGS: 'ADMIN_SETTINGS',
  INVITE_USER: 'INVITE_USER',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  TEAM_READ: 'TEAM_READ',
  TEAM_WRITE: 'TEAM_WRITE',
  // ── Task & Sprint permissions ────────────────────────────────────────────────
  TASK_READ: 'TASK_READ',
  TASK_WRITE: 'TASK_WRITE',
  TASK_COMMENT_WRITE: 'TASK_COMMENT_WRITE',
  SPRINT_READ: 'SPRINT_READ',
  SPRINT_WRITE: 'SPRINT_WRITE',
  // ── Time tracking permissions ────────────────────────────────────────────────
  TIME_READ: 'TIME_READ',
  TIME_WRITE: 'TIME_WRITE',
  TIME_APPROVE: 'TIME_APPROVE',
  TIME_ANALYTICS: 'TIME_ANALYTICS',
  TIME_TEAM_VIEW: 'TIME_TEAM_VIEW',  // View time logs of team members (scoped to caller's teams)
  // ── People / Attendance / Leave permissions ──────────────────────────────────
  ATTENDANCE_READ: 'ATTENDANCE_READ',
  ATTENDANCE_WRITE: 'ATTENDANCE_WRITE',
  ATTENDANCE_ADMIN: 'ATTENDANCE_ADMIN',
  LEAVE_READ: 'LEAVE_READ',
  LEAVE_WRITE: 'LEAVE_WRITE',
  LEAVE_APPROVE: 'LEAVE_APPROVE',
  LEAVE_ADMIN: 'LEAVE_ADMIN',
  LOCATION_ADMIN: 'LOCATION_ADMIN',
  // ── Asset permissions ────────────────────────────────────────────────────────
  ASSET_READ: 'ASSET_READ',
  ASSET_WRITE: 'ASSET_WRITE',
  ASSET_ASSIGN: 'ASSET_ASSIGN',
  ASSET_APPROVE: 'ASSET_APPROVE',
  ASSET_ADMIN: 'ASSET_ADMIN',
  // QR scan tiers — granted via Org Roles UI; never tied to a static role.
  ASSET_SCAN_FULL: 'ASSET_SCAN_FULL',
  ASSET_SCAN_BASIC: 'ASSET_SCAN_BASIC',
  // ── Badge & Profile permissions ──────────────────────────────────────────────
  BADGE_READ: 'BADGE_READ',
  BADGE_WRITE: 'BADGE_WRITE',
  BADGE_AWARD: 'BADGE_AWARD',
  PROFILE_READ: 'PROFILE_READ',
  PROFILE_WRITE: 'PROFILE_WRITE',
  // Explicit grant required — not assigned to any role by default.
  // Without this, users can view their profile but cannot change their login email.
  PROFILE_EMAIL_CHANGE: 'PROFILE_EMAIL_CHANGE',
  // ── Announcement & Org permissions ──────────────────────────────────────────
  ANNOUNCEMENT_READ: 'ANNOUNCEMENT_READ',
  ANNOUNCEMENT_WRITE: 'ANNOUNCEMENT_WRITE',
  ORG_READ: 'ORG_READ',
  ORG_WRITE: 'ORG_WRITE',
  // ── Admin / Config permissions ───────────────────────────────────────────────
  CONFIG_READ: 'CONFIG_READ',
  CONFIG_WRITE: 'CONFIG_WRITE',
  // ── Org Roles & Chart permissions ────────────────────────────────────────────
  ORG_ROLE_READ: 'ORG_ROLE_READ',
  ORG_ROLE_WRITE: 'ORG_ROLE_WRITE',
  // ── Attendance IP Whitelist ───────────────────────────────────────────────────
  IP_CONFIG_WRITE: 'IP_CONFIG_WRITE',
  // ── Data Seeding (testing/demo only) ─────────────────────────────────────────
  DATA_SEED: 'DATA_SEED',
  // ── Task assignment ───────────────────────────────────────────────────────────
  TASK_ASSIGN: 'TASK_ASSIGN',
  // ── Attendance team view ──────────────────────────────────────────────────────
  ATTENDANCE_TEAM_VIEW: 'ATTENDANCE_TEAM_VIEW',
  // ── Attendance regularization peer approval ─────────────────────────────────
  REGULARIZATION_APPROVE: 'REGULARIZATION_APPROVE',
  // ── Standup / EOD team view (see submissions from team peers) ───────────────
  STANDUP_TEAM_VIEW: 'STANDUP_TEAM_VIEW',
  EOD_TEAM_VIEW:     'EOD_TEAM_VIEW',
  // ── Elevated delete permissions ───────────────────────────────────────────
  // Owners can always delete their own entries; these grant deletion of ANY entry.
  STANDUP_DELETE:      'STANDUP_DELETE',
  EOD_DELETE:          'EOD_DELETE',
  TASK_COMMENT_DELETE: 'TASK_COMMENT_DELETE',
  // ── Team management ───────────────────────────────────────────────────────
  TEAM_MANAGE: 'TEAM_MANAGE',
  // ── Bug reports ───────────────────────────────────────────────────────────
  BUG_REPORT_READ_ALL: 'BUG_REPORT_READ_ALL',
  BUG_REPORT_CONFIG:   'BUG_REPORT_CONFIG',
  // ── Leave visibility ─────────────────────────────────────────────────────
  LEAVE_TEAM_VIEW: 'LEAVE_TEAM_VIEW',  // view team-scoped leave calendar
  LEAVE_ORG_VIEW:  'LEAVE_ORG_VIEW',   // view org-wide leave calendar (all employees)
  // ── Attendance reporting ──────────────────────────────────────────────────
  ATTENDANCE_REPORT: 'ATTENDANCE_REPORT',  // generate/download comprehensive attendance reports
  // ── Granular user management (sub-permissions of ADMIN_USERS) ────────────
  USER_READ:          'USER_READ',         // view the user list in admin panel
  USER_WRITE:         'USER_WRITE',        // edit user profiles (name, timezone, shift, location)
  USER_DELETE:        'USER_DELETE',       // deactivate / reactivate user accounts
  ROLE_ASSIGN:        'ROLE_ASSIGN',       // change a user's system role (TEAM_MEMBER → DELIVERY_LEAD etc.)
  PERMISSION_MANAGE:  'PERMISSION_MANAGE', // grant or revoke individual permissions for other users
  // ── Executive dashboards ──────────────────────────────────────────────────────
  CEO_DASHBOARD: 'CEO_DASHBOARD',
  CTO_DASHBOARD: 'CTO_DASHBOARD',
  // ── AI Insights ───────────────────────────────────────────────────────────────
  // Four-tier AI access. Each tier is granted independently via the permissions
  // modal — there are no automatic role defaults for AI_PERFORMANCE_SELF.
  //   AI_INSIGHTS         – basic AI page: daily summary, suggestions, NLQ
  //   AI_PERFORMANCE_SELF – analyse OWN data only (no team picker, no other users)
  //   AI_PERFORMANCE      – analyse own team(s) (teams the user is a member/lead of)
  //   AI_TEAM_ANALYSIS    – analyse ANY team + the org-wide "All Teams" view
  AI_INSIGHTS:         'AI_INSIGHTS',
  AI_PERFORMANCE_SELF: 'AI_PERFORMANCE_SELF',
  AI_PERFORMANCE:      'AI_PERFORMANCE',
  AI_TEAM_ANALYSIS:    'AI_TEAM_ANALYSIS',
  // ── Cross-project data visibility ────────────────────────────────────────────
  // Grants read access to milestones, blockers, and tasks/backlog across ALL
  // projects regardless of project membership. Not assigned to any default role —
  // must be explicitly granted via org roles or per-user overrides (e.g. PMO,
  // exec reviewer). Within a project, regular membership + MILESTONE_READ /
  // BLOCKER_READ / TASK_READ is sufficient — this permission is only needed for
  // cross-project visibility.
  PROJECT_DATA_VIEW_ALL: 'PROJECT_DATA_VIEW_ALL',
  // ── Project Documentation ──────────────────────────────────────────────────
  DOC_READ:   'DOC_READ',   // view docs & folders in assigned projects
  DOC_WRITE:  'DOC_WRITE',  // upload files, create folders, edit metadata
  DOC_DELETE: 'DOC_DELETE', // delete own docs/folders
  DOC_SHARE:  'DOC_SHARE',  // create / revoke public share links
  DOC_ADMIN:  'DOC_ADMIN',  // manage all project docs (delete any)
});

// ─── Role → Permission Matrix ─────────────────────────────────────────────────
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.TENANT_ADMIN]: Object.values(PERMISSIONS), // includes DATA_SEED
  [ROLES.DELIVERY_LEAD]: [
    PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.STANDUP_SUBMIT, PERMISSIONS.STANDUP_READ,
    PERMISSIONS.EOD_SUBMIT, PERMISSIONS.EOD_READ,
    PERMISSIONS.ACTION_READ, PERMISSIONS.ACTION_WRITE,
    PERMISSIONS.BLOCKER_READ, PERMISSIONS.BLOCKER_WRITE,
    PERMISSIONS.RAID_READ, PERMISSIONS.RAID_WRITE,
    PERMISSIONS.DECISION_READ, PERMISSIONS.DECISION_WRITE,
    PERMISSIONS.MILESTONE_READ, PERMISSIONS.MILESTONE_WRITE,
    PERMISSIONS.REPORT_READ, PERMISSIONS.REPORT_WRITE,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.INVITE_USER,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.TEAM_READ, PERMISSIONS.TEAM_WRITE,
    // Extended
    PERMISSIONS.TASK_READ, PERMISSIONS.TASK_WRITE, PERMISSIONS.TASK_COMMENT_WRITE,
    PERMISSIONS.SPRINT_READ, PERMISSIONS.SPRINT_WRITE,
    PERMISSIONS.TIME_READ, PERMISSIONS.TIME_WRITE, PERMISSIONS.TIME_APPROVE, PERMISSIONS.TIME_ANALYTICS, PERMISSIONS.TIME_TEAM_VIEW,
    PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_WRITE, PERMISSIONS.ATTENDANCE_ADMIN, PERMISSIONS.ATTENDANCE_TEAM_VIEW,
    PERMISSIONS.REGULARIZATION_APPROVE,
    PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_WRITE, PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.LEAVE_ADMIN,
    PERMISSIONS.LEAVE_TEAM_VIEW, PERMISSIONS.LEAVE_ORG_VIEW,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.BADGE_READ, PERMISSIONS.BADGE_AWARD,
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.CONFIG_READ,
    PERMISSIONS.ORG_ROLE_READ,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.ATTENDANCE_REPORT,
    // Delivery Leads see their own teams via AI_PERFORMANCE; AI_TEAM_ANALYSIS
    // is reserved for admin/PMO/exec (org-wide "All Teams" view).
    PERMISSIONS.AI_INSIGHTS, PERMISSIONS.AI_PERFORMANCE,
    PERMISSIONS.DOC_READ, PERMISSIONS.DOC_WRITE, PERMISSIONS.DOC_DELETE, PERMISSIONS.DOC_SHARE, PERMISSIONS.DOC_ADMIN,
  ],
  [ROLES.TEAM_MEMBER]: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.STANDUP_SUBMIT, PERMISSIONS.STANDUP_READ,
    PERMISSIONS.EOD_SUBMIT, PERMISSIONS.EOD_READ,
    PERMISSIONS.ACTION_READ, PERMISSIONS.ACTION_WRITE,
    PERMISSIONS.BLOCKER_READ, PERMISSIONS.BLOCKER_WRITE,
    PERMISSIONS.RAID_READ,
    PERMISSIONS.DECISION_READ,
    PERMISSIONS.MILESTONE_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.TEAM_READ,
    // Extended
    PERMISSIONS.TASK_READ, PERMISSIONS.TASK_WRITE, PERMISSIONS.TASK_COMMENT_WRITE,
    PERMISSIONS.SPRINT_READ,
    PERMISSIONS.TIME_READ, PERMISSIONS.TIME_WRITE,
    PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_WRITE,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.BADGE_READ,
    PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_WRITE,
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.AI_INSIGHTS, PERMISSIONS.AI_PERFORMANCE,
    PERMISSIONS.DOC_READ, PERMISSIONS.DOC_WRITE, PERMISSIONS.DOC_DELETE, PERMISSIONS.DOC_SHARE,
  ],
  [ROLES.PMO]: [
    PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.STANDUP_READ,
    PERMISSIONS.EOD_READ,
    PERMISSIONS.ACTION_READ, PERMISSIONS.ACTION_WRITE,
    PERMISSIONS.BLOCKER_READ, PERMISSIONS.BLOCKER_WRITE,
    PERMISSIONS.RAID_READ, PERMISSIONS.RAID_WRITE,
    PERMISSIONS.DECISION_READ, PERMISSIONS.DECISION_WRITE,
    PERMISSIONS.MILESTONE_READ, PERMISSIONS.MILESTONE_WRITE,
    PERMISSIONS.REPORT_READ, PERMISSIONS.REPORT_WRITE,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.INVITE_USER,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.TEAM_READ, PERMISSIONS.TEAM_WRITE,
    // Extended
    PERMISSIONS.TASK_READ, PERMISSIONS.TASK_WRITE,
    PERMISSIONS.SPRINT_READ, PERMISSIONS.SPRINT_WRITE,
    PERMISSIONS.TIME_READ, PERMISSIONS.TIME_APPROVE, PERMISSIONS.TIME_ANALYTICS,
    PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_ADMIN, PERMISSIONS.ATTENDANCE_TEAM_VIEW,
    PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.LEAVE_ADMIN,
    PERMISSIONS.LEAVE_TEAM_VIEW, PERMISSIONS.LEAVE_ORG_VIEW,
    PERMISSIONS.ASSET_READ, PERMISSIONS.ASSET_WRITE, PERMISSIONS.ASSET_ASSIGN, PERMISSIONS.ASSET_APPROVE, PERMISSIONS.ASSET_ADMIN,
    PERMISSIONS.BADGE_READ, PERMISSIONS.BADGE_WRITE, PERMISSIONS.BADGE_AWARD,
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.ANNOUNCEMENT_READ, PERMISSIONS.ANNOUNCEMENT_WRITE,
    PERMISSIONS.ORG_READ, PERMISSIONS.ORG_WRITE,
    PERMISSIONS.CONFIG_READ,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.ATTENDANCE_REPORT,
    PERMISSIONS.AI_INSIGHTS, PERMISSIONS.AI_PERFORMANCE, PERMISSIONS.AI_TEAM_ANALYSIS,
    PERMISSIONS.DOC_READ, PERMISSIONS.DOC_WRITE, PERMISSIONS.DOC_DELETE, PERMISSIONS.DOC_SHARE, PERMISSIONS.DOC_ADMIN,
  ],
  [ROLES.EXEC]: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.STANDUP_READ,
    PERMISSIONS.EOD_READ,
    PERMISSIONS.ACTION_READ,
    PERMISSIONS.BLOCKER_READ,
    PERMISSIONS.RAID_READ,
    PERMISSIONS.DECISION_READ,
    PERMISSIONS.MILESTONE_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.TEAM_READ,
    // Extended
    PERMISSIONS.TASK_READ,
    PERMISSIONS.SPRINT_READ,
    PERMISSIONS.TIME_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.LEAVE_READ,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.BADGE_READ,
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.ORG_ROLE_READ,
    PERMISSIONS.CEO_DASHBOARD,
    PERMISSIONS.CTO_DASHBOARD,
    PERMISSIONS.AI_INSIGHTS, PERMISSIONS.AI_PERFORMANCE, PERMISSIONS.AI_TEAM_ANALYSIS,
    PERMISSIONS.DOC_READ,
  ],
  [ROLES.CLIENT]: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.MILESTONE_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.NOTIFICATION_READ,
  ],
});

// ─── RAG Status ───────────────────────────────────────────────────────────────
const RAG_STATUS = Object.freeze({
  RED: 'RED',
  AMBER: 'AMBER',
  GREEN: 'GREEN',
});

// ─── Project Status ───────────────────────────────────────────────────────────
const PROJECT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
});

// ─── Action Status ────────────────────────────────────────────────────────────
const ACTION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
});

// ─── Blocker Status ───────────────────────────────────────────────────────────
const BLOCKER_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
});

// ─── Severity/Priority ────────────────────────────────────────────────────────
const SEVERITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

// ─── Milestone Status ─────────────────────────────────────────────────────────
const MILESTONE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DELAYED: 'DELAYED',
});

// ─── RAID Statuses ────────────────────────────────────────────────────────────
const RISK_STATUS = Object.freeze({
  OPEN: 'OPEN',
  MITIGATED: 'MITIGATED',
  CLOSED: 'CLOSED',
});

const ISSUE_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
});

const DEPENDENCY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  AT_RISK: 'AT_RISK',
});

const ASSUMPTION_STATUS = Object.freeze({
  VALID: 'VALID',
  INVALID: 'INVALID',
  UNDER_REVIEW: 'UNDER_REVIEW',
});

const DECISION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IMPLEMENTED: 'IMPLEMENTED',
  REVERSED: 'REVERSED',
});

// ─── User Status ──────────────────────────────────────────────────────────────
const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  INVITED: 'INVITED',
});

// ─── Notification Types ───────────────────────────────────────────────────────
const NOTIFICATION_TYPE = Object.freeze({
  // ── Existing ─────────────────────────────────────────────────────────────────
  STANDUP_REMINDER: 'STANDUP_REMINDER',
  EOD_REMINDER: 'EOD_REMINDER',
  ACTION_OVERDUE: 'ACTION_OVERDUE',
  BLOCKER_ESCALATION: 'BLOCKER_ESCALATION',
  TASK_ASSIGNMENT: 'TASK_ASSIGNMENT',
  BLOCKER_ADDED: 'BLOCKER_ADDED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  PROJECT_ASSIGNED: 'PROJECT_ASSIGNED',
  TEAM_UPDATED: 'TEAM_UPDATED',
  REPORT_READY: 'REPORT_READY',
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  GENERAL: 'GENERAL',
  // ── Task & Sprint ─────────────────────────────────────────────────────────────
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_COMMENTED: 'TASK_COMMENTED',
  TASK_OVERDUE: 'TASK_OVERDUE',
  SPRINT_ENDING_SOON: 'SPRINT_ENDING_SOON',
  SPRINT_COMPLETED: 'SPRINT_COMPLETED',
  // ── Time Tracking ─────────────────────────────────────────────────────────────
  TIME_ENTRY_SUBMITTED: 'TIME_ENTRY_SUBMITTED',
  TIME_ENTRY_APPROVED: 'TIME_ENTRY_APPROVED',
  TIME_ENTRY_REJECTED: 'TIME_ENTRY_REJECTED',
  TIME_APPROVAL_REMINDER: 'TIME_APPROVAL_REMINDER',
  // ── Attendance ────────────────────────────────────────────────────────────────
  ATTENDANCE_ANOMALY: 'ATTENDANCE_ANOMALY',
  // ── Leave ─────────────────────────────────────────────────────────────────────
  LEAVE_APPROVAL_NEEDED: 'LEAVE_APPROVAL_NEEDED',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
  LEAVE_APPROVAL_REMINDER: 'LEAVE_APPROVAL_REMINDER',
  // ── Assets ───────────────────────────────────────────────────────────────────
  ASSET_REQUEST_SUBMITTED: 'ASSET_REQUEST_SUBMITTED',
  ASSET_REQUEST_APPROVED: 'ASSET_REQUEST_APPROVED',
  ASSET_REQUEST_REJECTED: 'ASSET_REQUEST_REJECTED',
  ASSET_ASSIGNED: 'ASSET_ASSIGNED',
  ASSET_MAINTENANCE_DUE: 'ASSET_MAINTENANCE_DUE',
  // ── Badges ───────────────────────────────────────────────────────────────────
  BADGE_AWARDED: 'BADGE_AWARDED',
  // ── Announcements ────────────────────────────────────────────────────────────
  ANNOUNCEMENT_PUBLISHED: 'ANNOUNCEMENT_PUBLISHED',
  // ── People Milestones ─────────────────────────────────────────────────────────
  BIRTHDAY_WISH:    'BIRTHDAY_WISH',
  WORK_ANNIVERSARY: 'WORK_ANNIVERSARY',
});

// ─── Audit Actions ────────────────────────────────────────────────────────────
const AUDIT_ACTION = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  RAG_CHANGE: 'RAG_CHANGE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  ESCALATE: 'ESCALATE',
  NOTIFY_SENT: 'NOTIFY_SENT',
  NOTIFY_FAILED: 'NOTIFY_FAILED',
  NOTIFY_SKIPPED: 'NOTIFY_SKIPPED',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  SUBMIT: 'SUBMIT',
  RETRACT: 'RETRACT',
  ASSIGN: 'ASSIGN',
  RETURN: 'RETURN',
  AWARD: 'AWARD',
  REVOKE: 'REVOKE',
  OVERRIDE: 'OVERRIDE',
});

// ─── Report Types ─────────────────────────────────────────────────────────────
const REPORT_TYPE = Object.freeze({
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  CUSTOM: 'CUSTOM',
});

// ─── Table Names ──────────────────────────────────────────────────────────────
const TABLES = Object.freeze({
  // ── Existing delivery tables ──────────────────────────────────────────────────
  TENANTS: 'tenants',
  USERS: 'users',
  PROJECTS: 'projects',
  PROJECT_MEMBERS: 'project_members',
  MILESTONES: 'milestones',
  STANDUP_ENTRIES: 'standup_entries',
  EOD_ENTRIES: 'eod_entries',
  ACTIONS: 'actions',
  BLOCKERS: 'blockers',
  RISKS: 'risks',
  ISSUES: 'issues',
  DEPENDENCIES: 'dependencies',
  ASSUMPTIONS: 'assumptions',
  DECISIONS: 'decisions',
  REPORTS: 'reports',
  AUDIT_LOGS: 'audit_logs',
  NOTIFICATION_EVENTS: 'notification_events',
  NOTIFICATIONS: 'notifications',
  TEAMS: 'teams',
  TEAM_MEMBERS: 'team_members',
  REMINDER_CONFIGS: 'reminder_configs',
  // ── Task & Sprint tables ──────────────────────────────────────────────────────
  SPRINTS: 'sprints',
  SPRINT_MEMBERS: 'sprint_members',
  TASKS: 'tasks',
  TASK_ATTACHMENTS: 'task_attachments',
  TASK_COMMENTS: 'task_comments',
  TASK_STATUS_HISTORY: 'task_status_history',
  // ── Time Tracking tables ──────────────────────────────────────────────────────
  TIME_ENTRIES: 'time_entries',
  TIME_APPROVAL_REQUESTS: 'time_approval_requests',
  TIME_EXPORT_JOBS: 'time_export_jobs',
  // ── People / HR tables ────────────────────────────────────────────────────────
  ATTENDANCE_RECORDS: 'attendance_records',
  ATTENDANCE_POLICIES: 'attendance_policies',
  LEAVE_TYPES: 'leave_types',
  LEAVE_BALANCES: 'leave_balances',
  LEAVE_REQUESTS: 'leave_requests',
  LEAVE_CALENDAR: 'leave_calendar',
  ANNOUNCEMENTS: 'announcements',
  ANNOUNCEMENT_READS: 'announcement_reads',
  USER_PROFILES: 'user_profiles',
  // ── Asset tables ──────────────────────────────────────────────────────────────
  ASSET_CATEGORIES: 'asset_categories',
  ASSETS: 'assets',
  ASSET_REQUESTS: 'asset_requests',
  ASSET_ASSIGNMENTS: 'asset_assignments',
  ASSET_MAINTENANCE: 'asset_maintenance',
  // ── Badge tables ──────────────────────────────────────────────────────────────
  BADGE_DEFINITIONS: 'badge_definitions',
  USER_BADGES: 'user_badges',
  // ── Admin / Config tables ─────────────────────────────────────────────────────
  WORKFLOW_CONFIGS: 'workflow_configs',
  FORM_CONFIGS: 'form_configs',
  PERMISSION_OVERRIDES: 'permission_overrides',
  FEATURE_FLAGS: 'feature_flags',
  PROJECT_PERMISSIONS: 'project_permissions',
  NOTIFICATION_PREFERENCES: 'notification_preferences',
  // ── Org Roles & Chart tables ──────────────────────────────────────────────────
  ORG_ROLES: 'org_roles',
  ORG_ROLE_PERMISSIONS: 'org_role_permissions',
  USER_ORG_ROLES: 'user_org_roles',
  ORG_SHARING_RULES: 'org_sharing_rules',
  // ── Reporting tables ──────────────────────────────────────────────────────────
  REPORT_EXPORTS: 'report_exports',
});

// ─── Cron Blocker Escalation Threshold (days) ────────────────────────────────
const BLOCKER_ESCALATION_THRESHOLD_DAYS = 3;

// ─── Report Subtypes ──────────────────────────────────────────────────────────
const REPORT_SUBTYPE = Object.freeze({
  USER_PERFORMANCE: 'USER_PERFORMANCE',
  TEAM_PERFORMANCE: 'TEAM_PERFORMANCE',
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  PROJECT_SUMMARY: 'PROJECT_SUMMARY',
});

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  RAG_STATUS,
  PROJECT_STATUS,
  ACTION_STATUS,
  BLOCKER_STATUS,
  SEVERITY,
  MILESTONE_STATUS,
  RISK_STATUS,
  ISSUE_STATUS,
  DEPENDENCY_STATUS,
  ASSUMPTION_STATUS,
  DECISION_STATUS,
  USER_STATUS,
  NOTIFICATION_TYPE,
  AUDIT_ACTION,
  REPORT_TYPE,
  REPORT_SUBTYPE,
  TABLES,
  BLOCKER_ESCALATION_THRESHOLD_DAYS,
  PROJECT_MEMBER_ROLES,
};
