/**
 * DELIVERY SYNC – Catalyst DataStore Schema Reference
 * =====================================================
 * This file documents all table schemas for the Delivery Sync application.
 *
 * HOW TO USE:
 *  1. Open Zoho Catalyst Console → Your Project → DataStore
 *  2. Create each table with the columns listed below
 *  3. All columns are TEXT type unless noted (Catalyst DataStore uses TEXT for everything;
 *     numeric/boolean comparisons still work via ZCQL)
 *  4. ROWID and CREATEDTIME/MODIFIEDTIME are auto-created by Catalyst – do NOT add them
 *
 * NAMING CONVENTION: lowercase_snake_case for all table and column names
 */

const SCHEMA = {

  tenants: {
    columns: [
      { name: 'name',              type: 'TEXT', nullable: false },
      { name: 'domain',            type: 'TEXT', nullable: false, note: 'unique slug e.g. acme-corp' },
      { name: 'subscription_plan', type: 'TEXT', nullable: false, default: 'FREE' },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'ACTIVE' },
      { name: 'settings',          type: 'TEXT', nullable: true,  note: 'JSON string' },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  users: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'catalyst_user_id',  type: 'TEXT', nullable: true },
      { name: 'email',             type: 'TEXT', nullable: false, indexed: true },
      { name: 'name',              type: 'TEXT', nullable: false },
      { name: 'role',              type: 'TEXT', nullable: false, note: 'TENANT_ADMIN|DELIVERY_LEAD|TEAM_MEMBER|PMO|EXEC|CLIENT' },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'INVITED', note: 'ACTIVE|INACTIVE|INVITED' },
      { name: 'invited_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  projects: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'name',              type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'rag_status',        type: 'TEXT', nullable: false, default: 'GREEN', note: 'RED|AMBER|GREEN' },
      { name: 'start_date',        type: 'TEXT', nullable: false, note: 'YYYY-MM-DD' },
      { name: 'end_date',          type: 'TEXT', nullable: false, note: 'YYYY-MM-DD' },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'ACTIVE', note: 'ACTIVE|COMPLETED|ON_HOLD|CANCELLED' },
      { name: 'owner_user_id',     type: 'TEXT', nullable: true, indexed: true },
      { name: 'created_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  project_members: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'user_id',           type: 'TEXT', nullable: false, indexed: true },
      { name: 'role',              type: 'TEXT', nullable: false, note: 'LEAD|MEMBER|OBSERVER' },
      { name: 'added_by',          type: 'TEXT', nullable: true },
      { name: 'added_at',          type: 'TEXT', nullable: true },
    ],
  },

  milestones: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'due_date',          type: 'TEXT', nullable: false, indexed: true, note: 'YYYY-MM-DD' },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'PENDING', note: 'PENDING|IN_PROGRESS|COMPLETED|DELAYED' },
      { name: 'owner_user_id',     type: 'TEXT', nullable: true, indexed: true },
      { name: 'created_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  standup_entries: {
    note: 'Unique per: tenant_id + project_id + user_id + date (enforced in code)',
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'user_id',           type: 'TEXT', nullable: false, indexed: true },
      { name: 'date',              type: 'TEXT', nullable: false, indexed: true, note: 'YYYY-MM-DD' },
      { name: 'yesterday',         type: 'TEXT', nullable: false },
      { name: 'today',             type: 'TEXT', nullable: false },
      { name: 'blockers',          type: 'TEXT', nullable: true },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'SUBMITTED' },
      { name: 'submitted_at',      type: 'TEXT', nullable: true },
    ],
  },

  eod_entries: {
    note: 'Unique per: tenant_id + project_id + user_id + date (enforced in code)',
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'user_id',           type: 'TEXT', nullable: false, indexed: true },
      { name: 'date',              type: 'TEXT', nullable: false, indexed: true, note: 'YYYY-MM-DD' },
      { name: 'accomplishments',   type: 'TEXT', nullable: false },
      { name: 'planned_tomorrow',  type: 'TEXT', nullable: true },
      { name: 'blockers',          type: 'TEXT', nullable: true },
      { name: 'progress_percentage', type: 'TEXT', nullable: true, note: '0-100 as string' },
      { name: 'mood',              type: 'TEXT', nullable: true, note: 'GREEN|YELLOW|RED' },
      { name: 'submitted_at',      type: 'TEXT', nullable: true },
    ],
  },

  actions: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'owner_user_id',     type: 'TEXT', nullable: false, indexed: true },
      { name: 'assigned_by',       type: 'TEXT', nullable: true },
      { name: 'due_date',          type: 'TEXT', nullable: false, indexed: true, note: 'YYYY-MM-DD' },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'OPEN', indexed: true, note: 'OPEN|IN_PROGRESS|DONE|CANCELLED' },
      { name: 'priority',          type: 'TEXT', nullable: false, default: 'MEDIUM', note: 'CRITICAL|HIGH|MEDIUM|LOW' },
      { name: 'source',            type: 'TEXT', nullable: true, note: 'STANDUP|EOD|MANUAL' },
      { name: 'source_id',         type: 'TEXT', nullable: true },
      { name: 'completed_at',      type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  blockers: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'severity',          type: 'TEXT', nullable: false, indexed: true, note: 'CRITICAL|HIGH|MEDIUM|LOW' },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'OPEN', indexed: true, note: 'OPEN|IN_PROGRESS|RESOLVED|ESCALATED' },
      { name: 'owner_user_id',     type: 'TEXT', nullable: false, indexed: true },
      { name: 'raised_by',         type: 'TEXT', nullable: true },
      { name: 'resolution',        type: 'TEXT', nullable: true },
      { name: 'resolved_date',     type: 'TEXT', nullable: true },
      { name: 'escalated_to',      type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  risks: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'probability',       type: 'TEXT', nullable: false, note: 'HIGH|MEDIUM|LOW' },
      { name: 'impact',            type: 'TEXT', nullable: false, note: 'HIGH|MEDIUM|LOW' },
      { name: 'mitigation',        type: 'TEXT', nullable: true },
      { name: 'owner_user_id',     type: 'TEXT', nullable: false, indexed: true },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'OPEN', indexed: true },
      { name: 'created_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  issues: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'severity',          type: 'TEXT', nullable: false, indexed: true },
      { name: 'owner_user_id',     type: 'TEXT', nullable: false },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'OPEN', indexed: true },
      { name: 'created_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  dependencies: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'dependency_type',   type: 'TEXT', nullable: false, note: 'INTERNAL|EXTERNAL' },
      { name: 'dependent_on',      type: 'TEXT', nullable: true },
      { name: 'due_date',          type: 'TEXT', nullable: true },
      { name: 'owner_user_id',     type: 'TEXT', nullable: false },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'PENDING' },
      { name: 'created_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  assumptions: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'impact_if_wrong',   type: 'TEXT', nullable: true },
      { name: 'owner_user_id',     type: 'TEXT', nullable: false },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'VALID' },
      { name: 'created_by',        type: 'TEXT', nullable: true },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  decisions: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'title',             type: 'TEXT', nullable: false },
      { name: 'description',       type: 'TEXT', nullable: true },
      { name: 'decision_date',     type: 'TEXT', nullable: false, note: 'YYYY-MM-DD' },
      { name: 'made_by',           type: 'TEXT', nullable: true },
      { name: 'impact',            type: 'TEXT', nullable: true },
      { name: 'rationale',         type: 'TEXT', nullable: true },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'OPEN' },
      { name: 'created_at',        type: 'TEXT', nullable: true },
    ],
  },

  reports: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'project_id',        type: 'TEXT', nullable: false, indexed: true },
      { name: 'report_type',       type: 'TEXT', nullable: false, note: 'WEEKLY|MONTHLY|CUSTOM' },
      { name: 'period_start',      type: 'TEXT', nullable: false },
      { name: 'period_end',        type: 'TEXT', nullable: false },
      { name: 'summary',           type: 'TEXT', nullable: true, note: 'JSON string' },
      { name: 'generated_by',      type: 'TEXT', nullable: true },
      { name: 'status',            type: 'TEXT', nullable: false, default: 'GENERATED' },
      { name: 'generated_at',      type: 'TEXT', nullable: true },
    ],
  },

  audit_logs: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'entity_type',       type: 'TEXT', nullable: false },
      { name: 'entity_id',         type: 'TEXT', nullable: false },
      { name: 'action',            type: 'TEXT', nullable: false },
      { name: 'old_value',         type: 'TEXT', nullable: true, note: 'JSON string' },
      { name: 'new_value',         type: 'TEXT', nullable: true, note: 'JSON string' },
      { name: 'performed_by',      type: 'TEXT', nullable: false },
      { name: 'log_date',          type: 'TEXT', nullable: true },
    ],
  },

  notification_events: {
    columns: [
      { name: 'tenant_id',         type: 'TEXT', nullable: false, indexed: true },
      { name: 'user_id',           type: 'TEXT', nullable: false, indexed: true },
      { name: 'notification_type', type: 'TEXT', nullable: false, indexed: true },
      { name: 'subject',           type: 'TEXT', nullable: false },
      { name: 'message',           type: 'TEXT', nullable: true },
      { name: 'status',            type: 'TEXT', nullable: false, note: 'SENT|FAILED|PENDING' },
      { name: 'sent_at',           type: 'TEXT', nullable: true },
      { name: 'metadata',          type: 'TEXT', nullable: true, note: 'JSON string' },
    ],
  },
};

module.exports = SCHEMA;
