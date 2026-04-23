'use strict';

// ─── All Catalyst Table Names ─────────────────────────────────────────────────
const TABLES = Object.freeze({
  // Core app tables (shared across all services)
  USERS:              'users',
  TENANTS:            'tenants',
  PROJECTS:           'projects',
  PROJECT_MEMBERS:    'project_members',
  MILESTONES:         'milestones',
  STANDUP_ENTRIES:    'standup_entries',
  TASKS:              'tasks',
  TIME_ENTRIES:       'time_entries',
  ATTENDANCE_RECORDS: 'attendance_records',
  SPRINTS:            'sprints',

  // Bot-specific tables (create these in Catalyst Datastore console)
  BOT_PROFILES:       'bot_profiles',
  BOT_CONVERSATIONS:  'bot_conversations',
  BOT_TODO_ITEMS:     'bot_todo_items',
  BOT_QUICK_ACTIONS:  'bot_quick_actions',
});

// ─── LLM Configuration (same Zoho Qwen endpoint used by ai_service) ──────────
const LLM_CONFIG = Object.freeze({
  ENDPOINT:        'https://api.catalyst.zoho.in/quickml/v2/project/17682000000819069/llm/chat',
  MODEL:           'crm-di-qwen_text_moe_30b',
  TOP_P:           0.9,
  TOP_K:           50,
  TEMPERATURE:     0.8,   // Slightly higher for conversational tone
  MAX_TOKENS:      1000,  // More tokens for chat responses
  MAX_PLAN_TOKENS: 1500,  // More for daily plan generation
  BEST_OF:         1,
  CACHE_KEY:       'ai_zoho_token',
  CACHE_TTL_HOURS: 1,
});

// ─── Bot Personalities ────────────────────────────────────────────────────────
const PERSONALITIES = Object.freeze({
  FRIENDLY:     'FRIENDLY',
  PROFESSIONAL: 'PROFESSIONAL',
  CONCISE:      'CONCISE',
});

// ─── Module Scan Types ────────────────────────────────────────────────────────
const SCAN_MODULES = Object.freeze({
  TIMELOGS:   'timelogs',
  STANDUP:    'standup',
  TASKS:      'tasks',
  MILESTONES: 'milestones',
  CHECKIN:    'checkin',
});

// ─── Message Types ────────────────────────────────────────────────────────────
const MESSAGE_TYPES = Object.freeze({
  TEXT:         'text',
  QUICK_ACTION: 'quick_action',
  DAILY_PLAN:   'daily_plan',
  DATA_RESPONSE: 'data_response',
});

// ─── Scan Status ──────────────────────────────────────────────────────────────
const SCAN_STATUS = Object.freeze({
  ALL_GOOD:        'all_good',
  NEEDS_ATTENTION: 'needs_attention',
  OVERDUE:         'overdue',
});

// ─── Todo Priority ────────────────────────────────────────────────────────────
const TODO_PRIORITY = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
});

// ─── Default Quick Actions ────────────────────────────────────────────────────
const DEFAULT_QUICK_ACTIONS = [
  { icon: '📋', label: 'Create my daily plan',         prompt_template: 'daily_plan', sort_order: 1 },
  { icon: '⏱',  label: "What's my billable time this week?", prompt_template: "What's my billable time this week?", sort_order: 2 },
  { icon: '🚫', label: 'Non-billable time this week',  prompt_template: 'How much non-billable time did I log this week?', sort_order: 3 },
  { icon: '📌', label: 'What tasks are pending?',      prompt_template: 'Show me all my pending tasks.', sort_order: 4 },
  { icon: '⚠️',  label: 'Any overdue milestones?',     prompt_template: 'Are there any overdue milestones on my projects?', sort_order: 5 },
  { icon: '🕐', label: 'Did I submit my standup today?', prompt_template: 'Did I submit my standup today?', sort_order: 6 },
  { icon: '✅', label: "What check-ins did I miss?",  prompt_template: 'Which days did I miss check-in this week?', sort_order: 7 },
];

module.exports = {
  TABLES,
  LLM_CONFIG,
  PERSONALITIES,
  SCAN_MODULES,
  SCAN_STATUS,
  MESSAGE_TYPES,
  TODO_PRIORITY,
  DEFAULT_QUICK_ACTIONS,
};
