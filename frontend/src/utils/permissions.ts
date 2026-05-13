import type { CurrentUser, UserRole } from '../types';

// Mirrors backend Constants.js PERMISSIONS exactly
export const PERMISSIONS = {
  // ── Delivery ──────────────────────────────────────────────────────────────
  PROJECT_READ:    'PROJECT_READ',
  PROJECT_WRITE:   'PROJECT_WRITE',
  STANDUP_SUBMIT:    'STANDUP_SUBMIT',
  STANDUP_READ:      'STANDUP_READ',
  STANDUP_TEAM_VIEW: 'STANDUP_TEAM_VIEW',
  EOD_SUBMIT:        'EOD_SUBMIT',
  EOD_READ:          'EOD_READ',
  EOD_TEAM_VIEW:     'EOD_TEAM_VIEW',
  ACTION_READ:     'ACTION_READ',
  ACTION_WRITE:    'ACTION_WRITE',
  BLOCKER_READ:    'BLOCKER_READ',
  BLOCKER_WRITE:   'BLOCKER_WRITE',
  RAID_READ:       'RAID_READ',
  RAID_WRITE:      'RAID_WRITE',
  DECISION_READ:   'DECISION_READ',
  DECISION_WRITE:  'DECISION_WRITE',
  MILESTONE_READ:  'MILESTONE_READ',
  MILESTONE_WRITE: 'MILESTONE_WRITE',
  REPORT_READ:     'REPORT_READ',
  REPORT_WRITE:    'REPORT_WRITE',
  DASHBOARD_READ:  'DASHBOARD_READ',
  // ── Admin ─────────────────────────────────────────────────────────────────
  ADMIN_USERS:       'ADMIN_USERS',
  ADMIN_SETTINGS:    'ADMIN_SETTINGS',
  INVITE_USER:       'INVITE_USER',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  TEAM_READ:         'TEAM_READ',
  TEAM_WRITE:        'TEAM_WRITE',
  // ── Tasks & Sprints ───────────────────────────────────────────────────────
  TASK_READ:          'TASK_READ',
  TASK_WRITE:         'TASK_WRITE',
  TASK_ASSIGN:        'TASK_ASSIGN',
  TASK_COMMENT_WRITE: 'TASK_COMMENT_WRITE',
  SPRINT_READ:        'SPRINT_READ',
  SPRINT_WRITE:       'SPRINT_WRITE',
  // ── Time tracking ─────────────────────────────────────────────────────────
  TIME_READ:      'TIME_READ',
  TIME_WRITE:     'TIME_WRITE',
  TIME_APPROVE:   'TIME_APPROVE',
  TIME_ANALYTICS: 'TIME_ANALYTICS',
  // ── People / HR ───────────────────────────────────────────────────────────
  ATTENDANCE_READ:      'ATTENDANCE_READ',
  ATTENDANCE_WRITE:     'ATTENDANCE_WRITE',
  ATTENDANCE_TEAM_VIEW: 'ATTENDANCE_TEAM_VIEW',
  ATTENDANCE_ADMIN:     'ATTENDANCE_ADMIN',
  LEAVE_READ:    'LEAVE_READ',
  LEAVE_WRITE:   'LEAVE_WRITE',
  LEAVE_APPROVE: 'LEAVE_APPROVE',
  LEAVE_ADMIN:   'LEAVE_ADMIN',
  LOCATION_ADMIN:'LOCATION_ADMIN',
  // ── Assets ────────────────────────────────────────────────────────────────
  ASSET_READ:    'ASSET_READ',
  ASSET_WRITE:   'ASSET_WRITE',
  ASSET_ASSIGN:  'ASSET_ASSIGN',
  ASSET_APPROVE: 'ASSET_APPROVE',
  ASSET_ADMIN:   'ASSET_ADMIN',
  // ── Badges & Profile ──────────────────────────────────────────────────────
  BADGE_READ:    'BADGE_READ',
  BADGE_WRITE:   'BADGE_WRITE',
  BADGE_AWARD:   'BADGE_AWARD',
  PROFILE_READ:  'PROFILE_READ',
  PROFILE_WRITE: 'PROFILE_WRITE',
  // ── Announcements & Org ───────────────────────────────────────────────────
  ANNOUNCEMENT_READ:  'ANNOUNCEMENT_READ',
  ANNOUNCEMENT_WRITE: 'ANNOUNCEMENT_WRITE',
  ORG_READ:  'ORG_READ',
  ORG_WRITE: 'ORG_WRITE',
  // ── Config & Org Roles ────────────────────────────────────────────────────
  CONFIG_READ:     'CONFIG_READ',
  CONFIG_WRITE:    'CONFIG_WRITE',
  ORG_ROLE_READ:   'ORG_ROLE_READ',
  ORG_ROLE_WRITE:  'ORG_ROLE_WRITE',
  IP_CONFIG_WRITE: 'IP_CONFIG_WRITE',
  // ── Data seeding ──────────────────────────────────────────────────────────
  DATA_SEED: 'DATA_SEED',
  // ── AI & Insights ─────────────────────────────────────────────────────────
  AI_INSIGHTS:      'AI_INSIGHTS',
  AI_PERFORMANCE:   'AI_PERFORMANCE',
  AI_TEAM_ANALYSIS: 'AI_TEAM_ANALYSIS',
  // ── Executive dashboards ──────────────────────────────────────────────────
  CEO_DASHBOARD: 'CEO_DASHBOARD',
  CTO_DASHBOARD: 'CTO_DASHBOARD',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Role-based permission fallback ──────────────────────────────────────────
// Only SUPER_ADMIN, TENANT_ADMIN and TEAM_MEMBER exist in Catalyst auth.
// All elevated access is granted via org roles (user.permissions array from server).
// This map is only used as a fallback when user.permissions is not yet loaded.

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN:  Object.values(PERMISSIONS),
  TENANT_ADMIN: Object.values(PERMISSIONS),

  // Base permissions every regular user gets by default.
  // Anything above this must be granted explicitly via an org role.
  TEAM_MEMBER: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.STANDUP_SUBMIT, PERMISSIONS.STANDUP_READ,
    PERMISSIONS.EOD_SUBMIT,     PERMISSIONS.EOD_READ,
    PERMISSIONS.ACTION_READ,    PERMISSIONS.ACTION_WRITE,
    PERMISSIONS.BLOCKER_READ,   PERMISSIONS.BLOCKER_WRITE,
    PERMISSIONS.RAID_READ,
    PERMISSIONS.DECISION_READ,
    PERMISSIONS.MILESTONE_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.TASK_READ, PERMISSIONS.TASK_WRITE, PERMISSIONS.TASK_COMMENT_WRITE,
    PERMISSIONS.SPRINT_READ,
    PERMISSIONS.TIME_READ,  PERMISSIONS.TIME_WRITE,
    PERMISSIONS.ATTENDANCE_READ,  PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.LEAVE_READ,       PERMISSIONS.LEAVE_WRITE,
    PERMISSIONS.ASSET_READ,
    PERMISSIONS.BADGE_READ,
    PERMISSIONS.PROFILE_READ,     PERMISSIONS.PROFILE_WRITE,
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.ORG_READ,
    // Elevated permissions (TASK_ASSIGN, ATTENDANCE_TEAM_VIEW, SPRINT_WRITE,
    // TIME_APPROVE, AI_*, CEO_DASHBOARD, CTO_DASHBOARD, etc.) are NOT granted
    // by default — admins must assign them via org roles.
  ],
};

/** Returns true if the given role has the given permission. */
export const canDo = (role: UserRole | undefined | null, permission: Permission): boolean => {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
};

/**
 * Returns true if the user has the given permission.
 * TENANT_ADMIN and SUPER_ADMIN always have all permissions.
 * For TEAM_MEMBER, uses server-computed user.permissions when available
 * (includes org role grants), then falls back to the base TEAM_MEMBER set.
 */
export const hasPermission = (user: CurrentUser | null | undefined, permission: Permission): boolean => {
  if (!user) return false;
  if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') return true;
  if (user.permissions) return user.permissions.includes(permission);
  return canDo(user.role, permission);
};

/** Roles available when inviting users. */
export const INVITE_ALLOWED_ROLES: Record<string, UserRole[]> = {
  TENANT_ADMIN: ['TENANT_ADMIN', 'TEAM_MEMBER'],
  TEAM_MEMBER:  ['TEAM_MEMBER'],
};
