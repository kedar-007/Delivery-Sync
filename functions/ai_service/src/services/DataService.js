'use strict';

const { TABLES, AI_SCOPE } = require('../constants');

/**
 * DataService — fetches and shapes project data from Catalyst DataStore for
 * consumption by PromptService.
 *
 * Role-based scoping is enforced here before any data reaches the LLM:
 *   - all      → full tenant data (TENANT_ADMIN, PMO)
 *   - projects → only projects the user leads (DELIVERY_LEAD)
 *   - own      → only the user's own records (TEAM_MEMBER)
 *   - summary  → aggregated counts only, no PII (EXEC)
 *   - project  → one specific project (CLIENT)
 *
 * All ZCQL results are flattened from Catalyst's nested format:
 *   [{ table_name: { col: val } }]  →  [{ col: val }]
 */
class DataService {
  /**
   * @param {object} catalystApp  – Initialised Catalyst SDK instance
   */
  constructor(catalystApp) {
    if (!catalystApp) throw new Error('catalystApp is required for DataService');
    this.zcql = catalystApp.zcql();
  }

  // ─── Internal ZCQL Helper ──────────────────────────────────────────────────

  async _query(sql) {
    try {
      const raw = await this.zcql.executeZCQLQuery(sql);
      if (!Array.isArray(raw)) return [];
      // Flatten Catalyst's { tableName: { col: val } } row format
      return raw.map((row) => {
        const vals = Object.values(row);
        if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
          return Object.assign({}, ...vals);
        }
        return row;
      });
    } catch (err) {
      console.error('[DataService] ZCQL error:', sql.substring(0, 120), err.message);
      return []; // Return empty rather than crash — partial data is still usable.
    }
  }

  static _esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/'/g, "''");
  }

  static _today() {
    return new Date().toISOString().slice(0, 10);
  }

  static _daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  // ─── Project Scope Resolution ──────────────────────────────────────────────

  /**
   * Returns the list of project IDs visible to the user based on their role.
   * Enforces the role-based data scoping rules.
   *
   * @param {string} tenantId
   * @param {string} userId
   * @param {string} role
   * @param {string|null} filterProjectId   – Optional single-project filter from request
   * @returns {Promise<{ projects: object[], projectIds: string[] }>}
   */
  async resolveProjectScope(tenantId, userId, role, filterProjectId = null) {
    const scope = AI_SCOPE[role] ?? 'own';
    let projects = [];

    if (scope === 'all') {
      // TENANT_ADMIN / PMO — all active projects in the tenant
      projects = await this._query(
        `SELECT ROWID, name, rag_status, status, start_date, end_date, description
         FROM ${TABLES.PROJECTS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND status = 'ACTIVE'
         LIMIT 50`
      );

    } else if (scope === 'projects' || scope === 'summary') {
      // DELIVERY_LEAD / EXEC — projects where they are a member
      const memberships = await this._query(
        `SELECT project_id FROM ${TABLES.PROJECT_MEMBERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND user_id = '${DataService._esc(userId)}'
         LIMIT 50`
      );
      const ids = memberships.map((m) => m.project_id).filter(Boolean);
      if (ids.length > 0) {
        const idList = ids.map((id) => `'${DataService._esc(id)}'`).join(',');
        projects = await this._query(
          `SELECT ROWID, name, rag_status, status, start_date, end_date, description
           FROM ${TABLES.PROJECTS}
           WHERE ROWID IN (${idList}) AND tenant_id = '${DataService._esc(tenantId)}' AND status = 'ACTIVE'
           LIMIT 50`
        );
      }

    } else {
      // TEAM_MEMBER / CLIENT — projects they are explicitly a member of
      const memberships = await this._query(
        `SELECT project_id FROM ${TABLES.PROJECT_MEMBERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND user_id = '${DataService._esc(userId)}'
         LIMIT 20`
      );
      const ids = memberships.map((m) => m.project_id).filter(Boolean);
      if (ids.length > 0) {
        const idList = ids.map((id) => `'${DataService._esc(id)}'`).join(',');
        projects = await this._query(
          `SELECT ROWID, name, rag_status, status, start_date, end_date
           FROM ${TABLES.PROJECTS}
           WHERE ROWID IN (${idList}) AND tenant_id = '${DataService._esc(tenantId)}'
           LIMIT 20`
        );
      }
    }

    // Apply optional single-project filter
    if (filterProjectId) {
      projects = projects.filter((p) => String(p.ROWID) === String(filterProjectId));
    }

    const projectIds = projects.map((p) => String(p.ROWID));
    return { projects, projectIds };
  }

  // ─── Daily Activity Data ───────────────────────────────────────────────────

  /**
   * Fetch standups and EODs for a given date + project scope.
   * TEAM_MEMBER scope is limited to their own records only.
   */
  async getDailyActivityData(tenantId, userId, role, projectIds, date = null) {
    const targetDate = date || DataService._today();
    const scope = AI_SCOPE[role] ?? 'own';

    if (projectIds.length === 0) return { standups: [], eodEntries: [] };

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const userClause = scope === 'own' ? `AND user_id = '${DataService._esc(userId)}'` : '';

    const [standups, eodEntries] = await Promise.all([
      this._query(
        `SELECT ROWID, user_id, project_id, yesterday, today, blockers, entry_date
         FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}'
           AND project_id IN (${idList})
           AND entry_date = '${targetDate}'
           ${userClause}
         LIMIT 100`
      ),
      this._query(
        `SELECT ROWID, user_id, project_id, accomplished, plan_for_tomorrow, blockers, mood, entry_date
         FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}'
           AND project_id IN (${idList})
           AND entry_date = '${targetDate}'
           ${userClause}
         LIMIT 100`
      ),
    ]);

    return { standups, eodEntries };
  }

  // ─── Project Health Data ───────────────────────────────────────────────────

  /**
   * Fetch all metrics needed to assess project health:
   * milestones, open actions, blockers, recent standup count.
   */
  async getProjectHealthData(tenantId, projectIds) {
    if (projectIds.length === 0) return { milestones: [], actions: [], blockers: [], standupCount: 0 };

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const sevenDaysAgo = DataService._daysAgo(7);

    const [milestones, actions, blockers, recentStandups] = await Promise.all([
      this._query(
        `SELECT ROWID, project_id, title, status, due_date
         FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
         LIMIT 50`
      ),
      this._query(
        `SELECT ROWID, project_id, title, status, action_priority, due_date, assigned_to
         FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
         LIMIT 100`
      ),
      this._query(
        `SELECT ROWID, project_id, title, severity, status, raised_date
         FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status != 'RESOLVED'
         LIMIT 50`
      ),
      this._query(
        `SELECT COUNT(ROWID) AS cnt FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${sevenDaysAgo}'`
      ),
    ]);

    return {
      milestones,
      actions,
      blockers,
      standupCount: parseInt(recentStandups[0]?.cnt ?? 0, 10),
    };
  }

  // ─── Performance Data ──────────────────────────────────────────────────────

  /**
   * Fetch per-member activity for the last N days.
   * When scope = 'own', only data for userId is returned.
   */
  async getPerformanceData(tenantId, userId, role, projectIds, days = 7) {
    if (projectIds.length === 0) return { members: [], activityByMember: {} };

    const scope = AI_SCOPE[role] ?? 'own';
    const since = DataService._daysAgo(days);
    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const userClause = scope === 'own' ? `AND user_id = '${DataService._esc(userId)}'` : '';

    // Fetch project members (to get names)
    const memberRows = await this._query(
      `SELECT user_id, role FROM ${TABLES.PROJECT_MEMBERS}
       WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
       LIMIT 100`
    );

    // Filter to only the requesting user if TEAM_MEMBER
    const relevantMemberIds = scope === 'own'
      ? [userId]
      : [...new Set(memberRows.map((m) => String(m.user_id)).filter(Boolean))];

    if (relevantMemberIds.length === 0) return { members: memberRows, activityByMember: {} };

    const memberIdList = relevantMemberIds.map((id) => `'${DataService._esc(id)}'`).join(',');

    // Fetch user names
    const userRows = await this._query(
      `SELECT ROWID, name, email FROM ${TABLES.USERS}
       WHERE tenant_id = '${DataService._esc(tenantId)}' AND ROWID IN (${memberIdList})
       LIMIT 100`
    );
    const userMap = {};
    userRows.forEach((u) => { userMap[String(u.ROWID)] = u; });

    // Fetch standups, EODs, actions, blockers in parallel
    const [standups, eods, actions, blockers] = await Promise.all([
      this._query(
        `SELECT user_id, entry_date, blockers FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT user_id, entry_date, mood FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT assigned_to, status FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND assigned_to IN (${memberIdList}) LIMIT 200`
      ),
      this._query(
        `SELECT raised_by, severity FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND raised_by IN (${memberIdList}) LIMIT 100`
      ),
    ]);

    // Group by member
    const activityByMember = {};
    relevantMemberIds.forEach((id) => {
      const user = userMap[id];
      activityByMember[id] = {
        userId:   id,
        name:     user?.name  || `User-${id}`,
        email:    user?.email || '',
        standups:       standups.filter((s) => String(s.user_id) === id),
        eods:           eods.filter((e) => String(e.user_id) === id),
        actions:        actions.filter((a) => String(a.assigned_to) === id),
        blockersRaised: blockers.filter((b) => String(b.raised_by) === id),
      };
    });

    return { members: memberRows, activityByMember };
  }

  // ─── Suggestions Data ─────────────────────────────────────────────────────

  /**
   * Aggregated snapshot used by the Suggestions engine:
   * open blockers, overdue actions, at-risk milestones, team size, recent moods.
   */
  async getSuggestionsData(tenantId, projectIds, days = 14) {
    if (projectIds.length === 0) return {};

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const since = DataService._daysAgo(days);

    const [openBlockers, overdueActions, delayedMilestones, teamSize, moods] = await Promise.all([
      this._query(
        `SELECT project_id, severity, title FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status != 'RESOLVED' LIMIT 50`
      ),
      this._query(
        `SELECT project_id, title, action_priority, due_date FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status != 'DONE' AND status != 'CANCELLED'
           AND due_date < '${DataService._today()}' LIMIT 50`
      ),
      this._query(
        `SELECT project_id, title, due_date FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status = 'DELAYED' LIMIT 20`
      ),
      this._query(
        `SELECT COUNT(ROWID) AS cnt FROM ${TABLES.PROJECT_MEMBERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})`
      ),
      this._query(
        `SELECT mood FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' LIMIT 100`
      ),
    ]);

    return { openBlockers, overdueActions, delayedMilestones, teamSize: parseInt(teamSize[0]?.cnt ?? 0, 10), moods };
  }

  // ─── Report Data ──────────────────────────────────────────────────────────

  /**
   * Returns a wider dataset covering a date range, used for weekly / project reports.
   */
  async getReportData(tenantId, userId, role, projectIds, { dateFrom, dateTo, type }) {
    if (projectIds.length === 0) return {};

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const from = dateFrom || DataService._daysAgo(type === 'weekly' ? 7 : 30);
    const to   = dateTo   || DataService._today();
    const scope = AI_SCOPE[role] ?? 'own';
    const userClause = scope === 'own' ? `AND user_id = '${DataService._esc(userId)}'` : '';

    const [standups, eods, actions, blockers, milestones, decisions] = await Promise.all([
      this._query(
        `SELECT user_id, project_id, today, blockers, entry_date FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${from}' AND entry_date <= '${to}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT user_id, project_id, accomplished, blockers, mood, entry_date FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${from}' AND entry_date <= '${to}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT title, status, action_priority, due_date, assigned_to FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 150`
      ),
      this._query(
        `SELECT title, severity, status, raised_date FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 100`
      ),
      this._query(
        `SELECT title, status, due_date FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 50`
      ),
      this._query(
        `SELECT title, status, made_by FROM ${TABLES.DECISIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
         LIMIT 30`
      ),
    ]);

    return { standups, eods, actions, blockers, milestones, decisions, dateFrom: from, dateTo: to };
  }

  // ─── Blocker Detection Data ────────────────────────────────────────────────

  /**
   * Fetches standup/EOD text and existing open blockers for AI blocker detection.
   */
  async getBlockerDetectionData(tenantId, userId, role, projectIds, days = 7) {
    if (projectIds.length === 0) return { standups: [], eods: [], existingBlockers: [] };

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const since = DataService._daysAgo(days);
    const scope = AI_SCOPE[role] ?? 'own';
    const userClause = scope === 'own' ? `AND user_id = '${DataService._esc(userId)}'` : '';

    const [standups, eods, existingBlockers] = await Promise.all([
      this._query(
        `SELECT user_id, entry_date, yesterday, today, blockers FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' ${userClause} LIMIT 100`
      ),
      this._query(
        `SELECT user_id, entry_date, accomplished, blockers FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' ${userClause} LIMIT 100`
      ),
      this._query(
        `SELECT title, severity, status FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status != 'RESOLVED' LIMIT 50`
      ),
    ]);

    return { standups, eods, existingBlockers };
  }

  // ─── Trend Analysis Data ───────────────────────────────────────────────────

  /**
   * Fetches historical activity data for trend analysis over N days.
   */
  async getTrendData(tenantId, userId, role, projectIds, days = 30) {
    if (projectIds.length === 0) return { standups: [], eods: [], actions: [], blockers: [] };

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const since = DataService._daysAgo(days);
    const scope = AI_SCOPE[role] ?? 'own';
    const userClause = scope === 'own' ? `AND user_id = '${DataService._esc(userId)}'` : '';

    const [standups, eods, actions, blockers] = await Promise.all([
      this._query(
        `SELECT entry_date, user_id FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT entry_date, mood, progress_percentage FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT status, action_priority, due_date FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 200`
      ),
      this._query(
        `SELECT raised_date, status, severity FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND raised_date >= '${since}' LIMIT 100`
      ),
    ]);

    return { standups, eods, actions, blockers };
  }

  // ─── Sprint Retrospective Data ─────────────────────────────────────────────

  /**
   * Fetches all sprint-period data needed for retrospective generation.
   */
  async getRetrospectiveData(tenantId, userId, role, projectIds, { sprintStart, sprintEnd }) {
    if (projectIds.length === 0) return { standups: [], eods: [], actions: [], blockers: [], milestones: [] };

    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const from = sprintStart || DataService._daysAgo(14);
    const to   = sprintEnd   || DataService._today();
    const scope = AI_SCOPE[role] ?? 'own';
    const userClause = scope === 'own' ? `AND user_id = '${DataService._esc(userId)}'` : '';

    const [standups, eods, actions, blockers, milestones] = await Promise.all([
      this._query(
        `SELECT user_id, entry_date, yesterday, today, blockers FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${from}' AND entry_date <= '${to}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT user_id, entry_date, accomplished, blockers, mood, progress_percentage FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${from}' AND entry_date <= '${to}' ${userClause} LIMIT 200`
      ),
      this._query(
        `SELECT title, status, action_priority, assigned_to FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 150`
      ),
      this._query(
        `SELECT title, severity, status FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 50`
      ),
      this._query(
        `SELECT title, status, due_date FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList}) LIMIT 30`
      ),
    ]);

    return { standups, eods, actions, blockers, milestones, sprintStart: from, sprintEnd: to };
  }

  // ─── NL Query Context ─────────────────────────────────────────────────────

  /**
   * Builds a rich, per-project context for the NL query engine.
   *
   * Each project entry includes resolved member names, open actions with
   * assignee names, blockers, milestones, and recent activity — giving the
   * LLM enough facts to answer any question about the workspace.
   *
   * @param {string}   tenantId
   * @param {object[]} projects   – Resolved project objects (with ROWID + name)
   */
  async getNLQueryContext(tenantId, projects) {
    if (projects.length === 0) return { projectContexts: [], allMembers: [] };

    const projectIds = projects.map((p) => String(p.ROWID));
    const idList = projectIds.map((id) => `'${DataService._esc(id)}'`).join(',');
    const since7 = DataService._daysAgo(7);

    // ── 1. Fetch all raw data in parallel ─────────────────────────────────
    const [memberRows, userRows, actions, blockers, milestones, standups, eods] = await Promise.all([
      // All project memberships
      this._query(
        `SELECT project_id, user_id, role FROM ${TABLES.PROJECT_MEMBERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
         LIMIT 200`
      ),
      // All user details for name resolution
      this._query(
        `SELECT ROWID, name, email FROM ${TABLES.USERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}'
         LIMIT 200`
      ),
      // Open actions with project context
      this._query(
        `SELECT ROWID, project_id, title, status, action_priority, assigned_to, due_date FROM ${TABLES.ACTIONS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status IN ('OPEN', 'IN_PROGRESS')
         LIMIT 150`
      ),
      // Open blockers with project context
      this._query(
        `SELECT ROWID, project_id, title, severity, status FROM ${TABLES.BLOCKERS}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND status != 'RESOLVED'
         LIMIT 100`
      ),
      // All milestones with project context
      this._query(
        `SELECT ROWID, project_id, title, status, due_date FROM ${TABLES.MILESTONES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
         LIMIT 100`
      ),
      // Recent standup entry counts per project
      this._query(
        `SELECT project_id, COUNT(ROWID) AS cnt FROM ${TABLES.STANDUP_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since7}'
         LIMIT 100`
      ),
      // Recent EOD mood data per project
      this._query(
        `SELECT project_id, mood FROM ${TABLES.EOD_ENTRIES}
         WHERE tenant_id = '${DataService._esc(tenantId)}' AND project_id IN (${idList})
           AND entry_date >= '${since7}'
         LIMIT 100`
      ),
    ]);

    // ── 2. Build lookup maps ───────────────────────────────────────────────
    const userMap = {};
    userRows.forEach((u) => { userMap[String(u.ROWID)] = u.name || u.email || `User-${u.ROWID}`; });

    const resolveName = (uid) => (uid ? (userMap[String(uid)] || `User-${uid}`) : 'Unassigned');

    // ── 3. Group per project ───────────────────────────────────────────────
    const projectContexts = projects.map((proj) => {
      const pid = String(proj.ROWID);

      const projMembers = memberRows
        .filter((m) => String(m.project_id) === pid)
        .map((m) => ({ name: resolveName(m.user_id), role: m.role }));

      const projActions = actions
        .filter((a) => String(a.project_id) === pid)
        .map((a) => ({
          title:    a.title,
          status:   a.status,
          priority: a.action_priority,
          assignee: resolveName(a.assigned_to),
          due:      a.due_date || null,
        }));

      const projBlockers = blockers
        .filter((b) => String(b.project_id) === pid)
        .map((b) => ({ title: b.title, severity: b.severity, status: b.status }));

      const projMilestones = milestones
        .filter((m) => String(m.project_id) === pid)
        .map((m) => ({ title: m.title, status: m.status, due: m.due_date || null }));

      const standupRow = standups.find((s) => String(s.project_id) === pid);
      const standupCount = parseInt(standupRow?.cnt ?? 0, 10);

      const projEods = eods.filter((e) => String(e.project_id) === pid);
      const moodCounts = {};
      projEods.forEach((e) => {
        const k = (e.mood || 'unknown').toUpperCase();
        moodCounts[k] = (moodCounts[k] || 0) + 1;
      });

      return {
        projectId:   pid,
        name:        proj.name,
        status:      proj.status || 'ACTIVE',
        ragStatus:   proj.rag_status || 'UNKNOWN',
        endDate:     proj.end_date || null,
        teamMembers: projMembers,
        teamSize:    projMembers.length,
        openActions:    projActions,
        openBlockers:   projBlockers,
        milestones:     projMilestones,
        recentActivity: {
          standups_last_7_days: standupCount,
          eods_last_7_days:     projEods.length,
          moodDistribution:     moodCounts,
        },
      };
    });

    // ── 4. All unique members across workspace (for cross-project queries) ─
    const seenUserIds = new Set();
    const allMembers = [];
    memberRows.forEach((m) => {
      const uid = String(m.user_id);
      if (!seenUserIds.has(uid)) {
        seenUserIds.add(uid);
        allMembers.push({ name: resolveName(uid) });
      }
    });

    return { projectContexts, allMembers };
  }
}

module.exports = DataService;
