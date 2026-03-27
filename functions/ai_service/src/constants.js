'use strict';

// ─── Database Tables (shared with delivery_sync_function) ────────────────────
const TABLES = Object.freeze({
  TENANTS:            'tenants',
  USERS:              'users',
  PROJECTS:           'projects',
  PROJECT_MEMBERS:    'project_members',
  MILESTONES:         'milestones',
  STANDUP_ENTRIES:    'standup_entries',
  EOD_ENTRIES:        'eod_entries',
  ACTIONS:            'actions',
  BLOCKERS:           'blockers',
  RISKS:              'risks',
  ISSUES:             'issues',
  DECISIONS:          'decisions',
  TEAMS:              'teams',
  TEAM_MEMBERS:       'team_members',
  AUDIT_LOGS:         'audit_logs',
  // Extended tables for holistic analysis
  TASKS:              'tasks',
  SPRINTS:            'sprints',
  SPRINT_MEMBERS:     'sprint_members',
  ATTENDANCE_RECORDS: 'attendance_records',
  LEAVE_REQUESTS:     'leave_requests',
  TIME_ENTRIES:       'time_entries',
  USER_PROFILES:      'user_profiles',
});

// ─── Application Roles ────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  TENANT_ADMIN:  'TENANT_ADMIN',
  DELIVERY_LEAD: 'DELIVERY_LEAD',
  TEAM_MEMBER:   'TEAM_MEMBER',
  PMO:           'PMO',
  EXEC:          'EXEC',
  CLIENT:        'CLIENT',
});

// ─── Role → AI Data Scope ─────────────────────────────────────────────────────
// Controls what data is pulled from the DB before sending to the LLM.
const AI_SCOPE = Object.freeze({
  TENANT_ADMIN:  'all',       // Full tenant data
  DELIVERY_LEAD: 'projects',  // Projects they lead + their team members
  TEAM_MEMBER:   'own',       // Only their own standups/EODs/actions
  PMO:           'all',       // Same as admin — analytics focus
  EXEC:          'summary',   // Aggregated totals only, no PII names in prompt
  CLIENT:        'project',   // Single assigned project, milestone-level only
});

// ─── LLM Configuration ────────────────────────────────────────────────────────
const LLM_CONFIG = Object.freeze({
  ENDPOINT:    'https://api.catalyst.zoho.in/quickml/v2/project/17682000000819069/llm/chat',
  MODEL:       'crm-di-qwen_text_moe_30b',
  TOP_P:       0.9,
  TOP_K:       50,
  TEMPERATURE: 0.7,
  MAX_TOKENS:  600,
  BEST_OF:     1,
  CACHE_KEY:   'ai_zoho_token',
  CACHE_TTL_HOURS: 1,
});

// ─── AI Response Types ────────────────────────────────────────────────────────
const AI_RESPONSE_TYPE = Object.freeze({
  DAILY_SUMMARY:         'daily_summary',
  PROJECT_HEALTH:        'project_health',
  PERFORMANCE:           'performance',
  REPORT:                'report',
  SUGGESTIONS:           'suggestions',
  BLOCKER_DETECTION:     'blocker_detection',
  TREND_ANALYSIS:        'trend_analysis',
  RETROSPECTIVE:         'retrospective',
  NL_QUERY:              'nl_query',
});

// ─── Project / Action / Blocker status values ─────────────────────────────────
const ACTION_STATUS  = Object.freeze({ OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', DONE: 'DONE', CANCELLED: 'CANCELLED' });
const BLOCKER_STATUS = Object.freeze({ OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', ESCALATED: 'ESCALATED' });
const MILESTONE_STATUS = Object.freeze({ PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', DELAYED: 'DELAYED' });

// ─── Export updated constant ──────────────────────────────────────────────────
module.exports = {
  TABLES,
  ROLES,
  AI_SCOPE,
  LLM_CONFIG,
  AI_RESPONSE_TYPE,
  ACTION_STATUS,
  BLOCKER_STATUS,
  MILESTONE_STATUS,
};
