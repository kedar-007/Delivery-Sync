'use strict';

/**
 * MCPService — Model Context Protocol for the AI bot.
 *
 * Provides 13 workspace tools (leave, tasks, projects, time, attendance,
 * standup, EOD, team, assets, RAID, sprint, badges, announcements).
 * Each tool is keyword-triggered and queries Catalyst DataStore directly.
 * Tools run in parallel; combined output is injected into the LLM prompt.
 */

const DataStoreService = require('./DataStoreService');
const { TABLES } = require('../utils/Constants');

const e = DataStoreService.escape;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [

  // ── Leave ────────────────────────────────────────────────────────────────────
  {
    name:     'leave_info',
    keywords: ['leave', 'pto', 'vacation', 'annual', 'sick', 'holiday', 'day off', 'time off', 'balance', 'remaining days', 'days left'],
    async run(userId, tenantId, db) {
      const year = new Date().getFullYear();
      // Match LeaveController pattern: unquoted numeric user_id + year filter
      const [rawBalances, types, upcoming] = await Promise.all([
        db.query(
          `SELECT allocated_days, used_days, pending_days, remaining_days, leave_type_id
           FROM ${TABLES.LEAVE_BALANCES}
           WHERE tenant_id = '${e(tenantId)}' AND user_id = ${Number(userId)} AND year = '${year}'
           LIMIT 20`
        ),
        db.query(
          `SELECT ROWID, name FROM ${TABLES.LEAVE_TYPES} WHERE tenant_id = '${e(tenantId)}' LIMIT 20`
        ),
        db.query(
          `SELECT start_date, end_date, days_count, status, leave_type_id
           FROM ${TABLES.LEAVE_REQUESTS}
           WHERE tenant_id = '${e(tenantId)}' AND user_id = '${e(userId)}'
             AND status IN ('PENDING','APPROVED')
           ORDER BY start_date ASC LIMIT 5`
        ),
      ]);

      // Build type_id → name map
      const typeMap = {};
      types.forEach((t) => { typeMap[String(t.ROWID)] = t.name; });

      const lines = ['--- LEAVE ---'];

      if (types.length > 0) {
        lines.push('Leave types available: ' + types.map((t) => t.name).join(', '));
      }

      if (rawBalances.length > 0) {
        // Deduplicate by leave_type_id, keep the most recent row per type
        const seen = {};
        const balances = [];
        for (const b of rawBalances) {
          const k = String(b.leave_type_id);
          if (!seen[k]) { seen[k] = true; balances.push(b); }
        }
        lines.push('Leave balance:');
        balances.forEach((b) => {
          const typeName = typeMap[String(b.leave_type_id)] || `Type ${b.leave_type_id}`;
          lines.push(`  ${typeName}: ${b.remaining_days ?? 0}/${b.allocated_days ?? 0} days remaining (${b.used_days ?? 0} used, ${b.pending_days ?? 0} pending)`);
        });
      } else {
        lines.push('No leave balance records found for this user.');
      }

      if (upcoming.length > 0) {
        lines.push('Upcoming/active leaves:');
        upcoming.forEach((r) => {
          const typeName = typeMap[String(r.leave_type_id)] || 'Leave';
          lines.push(`  ${typeName} | ${r.start_date} → ${r.end_date} | ${r.days_count}d | ${r.status}`);
        });
      }
      return lines.join('\n');
    },
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  {
    name:     'task_list',
    keywords: ['task', 'ticket', 'bug', 'story', 'backlog', 'pending', 'assigned to me', 'my tasks', 'todo', 'in progress', 'overdue task', 'sprint task'],
    async run(userId, tenantId, db) {
      const today = DataStoreService.today();
      const tasks = await db.query(
        `SELECT ROWID, title, status, task_priority, due_date, type
         FROM ${TABLES.TASKS}
         WHERE tenant_id = '${e(tenantId)}'
           AND assignee_ids LIKE '%${e(userId)}%'
           AND status NOT IN ('DONE','CANCELLED')
         ORDER BY due_date ASC, task_priority ASC
         LIMIT 30`
      );
      const lines = ['--- TASKS ---'];
      if (tasks.length === 0) { lines.push('No open tasks assigned to you'); return lines.join('\n'); }
      const overdue  = tasks.filter((t) => t.due_date && t.due_date < today);
      const dueToday = tasks.filter((t) => t.due_date === today);
      const critical = tasks.filter((t) => ['CRITICAL', 'HIGH'].includes(String(t.task_priority).toUpperCase()));
      lines.push(`Total open: ${tasks.length} | Overdue: ${overdue.length} | Due today: ${dueToday.length} | High priority: ${critical.length}`);
      if (overdue.length > 0)  lines.push('Overdue: ' + overdue.slice(0, 5).map((t) => `"${t.title}" [${t.status}]`).join(' | '));
      if (dueToday.length > 0) lines.push('Due today: ' + dueToday.map((t) => `"${t.title}"`).join(' | '));
      lines.push('Open tasks: ' + tasks.slice(0, 15).map((t) => `"${t.title}" [${t.status}, ${t.task_priority}, due:${t.due_date || 'none'}]`).join(' | '));
      return lines.join('\n');
    },
  },

  // ── Projects & Milestones ─────────────────────────────────────────────────────
  {
    name:     'project_overview',
    keywords: ['project', 'milestone', 'deadline', 'progress', 'completion', 'deliverable', 'sprint goal', 'project status'],
    async run(userId, tenantId, db) {
      const today = DataStoreService.today();
      const [projects, milestones] = await Promise.all([
        db.query(
          `SELECT p.ROWID, p.name, p.status
           FROM ${TABLES.PROJECTS} p
           INNER JOIN ${TABLES.PROJECT_MEMBERS} pm ON CAST(p.ROWID AS CHAR) = pm.project_id
           WHERE p.tenant_id = '${e(tenantId)}' AND pm.tenant_id = '${e(tenantId)}' AND pm.user_id = '${e(userId)}'
           LIMIT 20`
        ),
        db.query(
          `SELECT m.title, m.due_date, m.status, p.name AS project_name
           FROM ${TABLES.MILESTONES} m
           LEFT JOIN ${TABLES.PROJECTS} p ON m.project_id = CAST(p.ROWID AS CHAR)
           WHERE m.tenant_id = '${e(tenantId)}' AND m.status NOT IN ('COMPLETED','CANCELLED')
           ORDER BY m.due_date ASC LIMIT 15`
        ),
      ]);
      const lines = ['--- PROJECTS ---'];
      if (projects.length === 0) { lines.push('No projects found'); return lines.join('\n'); }
      lines.push('Your projects: ' + projects.map((p) => `${p.name} [id:${p.ROWID}] (${p.status})`).join(' | '));
      if (milestones.length > 0) {
        const overdue = milestones.filter((m) => m.due_date && m.due_date < today);
        lines.push(`Milestones: ${milestones.length} upcoming, ${overdue.length} overdue`);
        milestones.slice(0, 8).forEach((m) => lines.push(`  [${m.project_name}] "${m.title}" — due ${m.due_date} [${m.status}]`));
      }
      return lines.join('\n');
    },
  },

  // ── Time Tracking ─────────────────────────────────────────────────────────────
  {
    name:     'time_summary',
    keywords: ['time', 'hours', 'billable', 'log', 'timesheet', 'tracked', 'spent', 'worked', 'time entry', 'time today', 'time this week'],
    async run(userId, tenantId, db) {
      const today      = DataStoreService.today();
      const weekStart  = DataStoreService.weekStart();
      const monthStart = today.slice(0, 7) + '-01';
      const [todayRows, weekRows, monthRows] = await Promise.all([
        db.query(`SELECT hours, is_billable, description FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id='${e(tenantId)}' AND user_id='${e(userId)}' AND entry_date='${today}' LIMIT 50`),
        db.query(`SELECT hours, is_billable FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id='${e(tenantId)}' AND user_id='${e(userId)}' AND entry_date>='${weekStart}' LIMIT 200`),
        // ZCQL caps LIMIT at 300 — overshooting rejects the whole query.
        db.query(`SELECT hours FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id='${e(tenantId)}' AND user_id='${e(userId)}' AND entry_date>='${monthStart}' LIMIT 300`),
      ]);
      const sum      = (rows) => rows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
      const billable = (rows) => rows.filter((r) => String(r.is_billable).toLowerCase() === 'true').reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
      const todayH  = sum(todayRows);
      const weekH   = sum(weekRows);
      const weekB   = billable(weekRows);
      const monthH  = sum(monthRows);
      const lines = ['--- TIME ---'];
      lines.push(`Today (${today}): ${todayH.toFixed(1)}h across ${todayRows.length} entries`);
      if (todayRows.length > 0) lines.push('  Today entries: ' + todayRows.slice(0, 5).map((r) => `${r.description?.slice(0, 40) || '(no desc)'} — ${r.hours}h`).join(' | '));
      lines.push(`This week: ${weekH.toFixed(1)}h total | ${weekB.toFixed(1)}h billable | ${(weekH - weekB).toFixed(1)}h non-billable`);
      lines.push(`This month: ${monthH.toFixed(1)}h total`);
      return lines.join('\n');
    },
  },

  // ── Attendance ────────────────────────────────────────────────────────────────
  {
    name:     'attendance_info',
    keywords: ['attendance', 'check in', 'check-in', 'check out', 'checked in', 'present', 'absent', 'missed', 'late', 'on time', 'work hours'],
    async run(userId, tenantId, db) {
      const today     = DataStoreService.today();
      const weekStart = DataStoreService.weekStart();
      const records = await db.query(
        `SELECT attendance_date, check_in_time, check_out_time, status
         FROM ${TABLES.ATTENDANCE_RECORDS}
         WHERE tenant_id = '${e(tenantId)}' AND user_id = '${e(userId)}'
           AND attendance_date >= '${weekStart}'
         ORDER BY attendance_date DESC LIMIT 10`
      );
      const lines = ['--- ATTENDANCE ---'];
      const todayRec = records.find((r) => r.attendance_date === today);
      lines.push(
        todayRec
          ? `Today: checked in at ${todayRec.check_in_time || '?'}${todayRec.check_out_time ? ', out at ' + todayRec.check_out_time : ' (still in)'}`
          : `Today (${today}): not yet checked in`
      );
      const checkedDays = records.filter((r) => r.check_in_time).length;
      lines.push(`This week: ${checkedDays} days checked in`);
      records.slice(0, 7).forEach((r) => {
        const ci = r.check_in_time || 'absent';
        const co = r.check_out_time ? '→ ' + r.check_out_time : '';
        lines.push(`  ${r.attendance_date}: ${ci} ${co}`);
      });
      return lines.join('\n');
    },
  },

  // ── Standup ───────────────────────────────────────────────────────────────────
  {
    name:     'standup_history',
    keywords: ['standup', 'stand-up', 'daily update', 'yesterday', 'scrum', 'submitted standup', 'standup today', 'standup history'],
    async run(userId, tenantId, db) {
      const today     = DataStoreService.today();
      const weekStart = DataStoreService.weekStart();
      const [todayS, history] = await Promise.all([
        db.query(
          `SELECT s.*, p.name AS project_name
           FROM ${TABLES.STANDUP_ENTRIES} s LEFT JOIN ${TABLES.PROJECTS} p ON s.project_id = CAST(p.ROWID AS CHAR)
           WHERE s.tenant_id = '${e(tenantId)}' AND s.user_id = '${e(userId)}' AND s.entry_date = '${today}'
           LIMIT 5`
        ),
        db.query(
          `SELECT entry_date, yesterday, today, blockers
           FROM ${TABLES.STANDUP_ENTRIES}
           WHERE tenant_id = '${e(tenantId)}' AND user_id = '${e(userId)}'
             AND entry_date >= '${weekStart}' AND entry_date < '${today}'
           ORDER BY entry_date DESC LIMIT 7`
        ),
      ]);
      const lines = ['--- STANDUP ---'];
      lines.push(`Today: ${todayS.length > 0 ? 'SUBMITTED' : 'NOT YET SUBMITTED'}`);
      if (todayS.length > 0) {
        const s = todayS[0];
        if (s.yesterday) lines.push(`  Yesterday: ${s.yesterday}`);
        if (s.today)     lines.push(`  Today: ${s.today}`);
        if (s.blockers)  lines.push(`  Blockers: ${s.blockers}`);
      }
      if (history.length > 0) {
        lines.push(`History (${history.length} standups this week):`);
        history.forEach((h) => lines.push(`  ${h.entry_date}: ${h.today?.slice(0, 80) || '—'}`));
      }
      return lines.join('\n');
    },
  },

  // ── EOD Reports ───────────────────────────────────────────────────────────────
  {
    name:     'eod_info',
    keywords: ['eod', 'end of day', 'daily report', 'end-of-day', 'wrap up', 'daily summary'],
    async run(userId, tenantId, db) {
      const today     = DataStoreService.today();
      const weekStart = DataStoreService.weekStart();
      const [todayEod, recent] = await Promise.all([
        db.query(`SELECT * FROM ${TABLES.EOD_ENTRIES} WHERE tenant_id='${e(tenantId)}' AND user_id='${e(userId)}' AND entry_date='${today}' LIMIT 1`),
        db.query(`SELECT entry_date, summary FROM ${TABLES.EOD_ENTRIES} WHERE tenant_id='${e(tenantId)}' AND user_id='${e(userId)}' AND entry_date>='${weekStart}' ORDER BY entry_date DESC LIMIT 5`),
      ]);
      const lines = ['--- EOD ---'];
      lines.push(`Today: ${todayEod.length > 0 ? 'SUBMITTED' : 'NOT SUBMITTED'}`);
      if (todayEod.length > 0 && todayEod[0].summary) lines.push(`  Summary: ${String(todayEod[0].summary).slice(0, 200)}`);
      lines.push(`This week: ${recent.length} EOD report${recent.length !== 1 ? 's' : ''} submitted`);
      return lines.join('\n');
    },
  },

  // ── Team & People ─────────────────────────────────────────────────────────────
  {
    name:     'team_info',
    keywords: ['team', 'colleague', 'manager', 'report to', 'org', 'member', 'who is', 'who are', 'peer', 'people', 'staff', 'headcount'],
    async run(userId, tenantId, db) {
      const [teams, members] = await Promise.all([
        db.query(
          `SELECT t.ROWID, t.name
           FROM ${TABLES.TEAMS} t
           INNER JOIN ${TABLES.TEAM_MEMBERS} tm ON CAST(t.ROWID AS CHAR) = tm.team_id
           WHERE t.tenant_id = '${e(tenantId)}' AND tm.user_id = '${e(userId)}'
           LIMIT 5`
        ),
        db.query(
          `SELECT u.name, u.email, tm.role
           FROM ${TABLES.TEAM_MEMBERS} tm
           INNER JOIN ${TABLES.USERS} u ON tm.user_id = CAST(u.ROWID AS CHAR)
           WHERE tm.tenant_id = '${e(tenantId)}'
             AND tm.team_id IN (
               SELECT team_id FROM ${TABLES.TEAM_MEMBERS}
               WHERE user_id = '${e(userId)}' AND tenant_id = '${e(tenantId)}'
             )
           LIMIT 30`
        ),
      ]);
      const lines = ['--- TEAM ---'];
      if (teams.length === 0) { lines.push('No team data found'); return lines.join('\n'); }
      lines.push('My teams: ' + teams.map((t) => t.name).join(', '));
      if (members.length > 0) {
        lines.push(`Team members (${members.length}):`);
        members.forEach((m) => lines.push(`  ${m.name} — ${m.role || 'member'} (${m.email})`));
      }
      return lines.join('\n');
    },
  },

  // ── Assets ────────────────────────────────────────────────────────────────────
  {
    name:     'asset_info',
    keywords: ['asset', 'equipment', 'laptop', 'device', 'hardware', 'software licence', 'inventory', 'assigned equipment', 'my assets'],
    async run(userId, tenantId, db) {
      const assignments = await db.query(
        `SELECT a.name, a.asset_code, a.category, aa.assigned_date, aa.status
         FROM ${TABLES.ASSET_ASSIGNMENTS} aa
         INNER JOIN ${TABLES.ASSETS} a ON aa.asset_id = CAST(a.ROWID AS CHAR)
         WHERE aa.tenant_id = '${e(tenantId)}' AND aa.user_id = '${e(userId)}' AND aa.status = 'ACTIVE'
         LIMIT 20`
      );
      const lines = ['--- ASSETS ---'];
      if (assignments.length === 0) { lines.push('No assets assigned'); return lines.join('\n'); }
      lines.push(`Assigned assets (${assignments.length}):`);
      assignments.forEach((a) => lines.push(`  ${a.name} (${a.asset_code}) | ${a.category} | since ${a.assigned_date}`));
      return lines.join('\n');
    },
  },

  // ── RAID (Risks, Actions, Issues, Decisions, Blockers) ────────────────────────
  {
    name:     'raid_info',
    keywords: ['risk', 'blocker', 'issue', 'action item', 'decision', 'raid', 'impediment', 'obstacle', 'dependency', 'unresolved', 'open issue'],
    async run(userId, tenantId, db) {
      const [blockers, actions, risks] = await Promise.all([
        db.query(`SELECT title, status FROM ${TABLES.BLOCKERS} WHERE tenant_id='${e(tenantId)}' AND (assigned_to='${e(userId)}' OR reported_by='${e(userId)}') AND status!='RESOLVED' LIMIT 10`),
        db.query(`SELECT title, status, due_date FROM ${TABLES.ACTIONS} WHERE tenant_id='${e(tenantId)}' AND owner_id='${e(userId)}' AND status!='DONE' LIMIT 10`),
        db.query(`SELECT title, likelihood, impact, status FROM ${TABLES.RISKS} WHERE tenant_id='${e(tenantId)}' AND status NOT IN ('CLOSED','RESOLVED') LIMIT 10`),
      ]);
      const lines = ['--- RAID ---'];
      if (blockers.length === 0 && actions.length === 0 && risks.length === 0) { lines.push('No active RAID items'); return lines.join('\n'); }
      if (blockers.length > 0) lines.push('Blockers: ' + blockers.map((b) => `"${b.title}" [${b.status}]`).join(' | '));
      if (actions.length > 0)  lines.push('My action items: ' + actions.map((a) => `"${a.title}" [${a.status}, due:${a.due_date || 'none'}]`).join(' | '));
      if (risks.length > 0) {
        const high = risks.filter((r) => ['HIGH', 'CRITICAL'].includes(String(r.impact).toUpperCase()));
        lines.push(`Risks: ${risks.length} open (${high.length} high/critical)`);
        risks.slice(0, 5).forEach((r) => lines.push(`  "${r.title}" — impact:${r.impact} likelihood:${r.likelihood} [${r.status}]`));
      }
      return lines.join('\n');
    },
  },

  // ── Sprints ───────────────────────────────────────────────────────────────────
  {
    name:     'sprint_info',
    keywords: ['sprint', 'velocity', 'capacity', 'scrum board', 'iteration', 'sprint progress', 'current sprint', 'sprint tasks'],
    async run(userId, tenantId, db) {
      const [sprints, sprintTasks] = await Promise.all([
        db.query(
          `SELECT s.ROWID, s.name, s.start_date, s.end_date, s.status, p.name AS project_name
           FROM ${TABLES.SPRINTS} s
           LEFT JOIN ${TABLES.PROJECTS} p ON s.project_id = CAST(p.ROWID AS CHAR)
           WHERE s.tenant_id = '${e(tenantId)}' AND s.status = 'ACTIVE'
             AND s.ROWID IN (
               SELECT sprint_id FROM ${TABLES.SPRINT_MEMBERS}
               WHERE tenant_id = '${e(tenantId)}' AND user_id = '${e(userId)}'
             )
           LIMIT 5`
        ),
        db.query(
          `SELECT status, task_priority, story_points
           FROM ${TABLES.TASKS}
           WHERE tenant_id = '${e(tenantId)}' AND assignee_ids LIKE '%${e(userId)}%'
             AND sprint_id != '0' AND sprint_id IS NOT NULL
           LIMIT 50`
        ),
      ]);
      const lines = ['--- SPRINT ---'];
      if (sprints.length === 0) { lines.push('Not in any active sprint'); return lines.join('\n'); }
      sprints.forEach((s) => lines.push(`Sprint: "${s.name}" | ${s.project_name} | ${s.start_date} → ${s.end_date}`));
      if (sprintTasks.length > 0) {
        const done = sprintTasks.filter((t) => t.status === 'DONE').length;
        const total = sprintTasks.length;
        const sp = sprintTasks.reduce((s, t) => s + (parseFloat(t.story_points) || 0), 0);
        lines.push(`My sprint tasks: ${done}/${total} done | ${sp} story points`);
      }
      return lines.join('\n');
    },
  },

  // ── Badges & Recognition ──────────────────────────────────────────────────────
  {
    name:     'badge_info',
    keywords: ['badge', 'recognition', 'reward', 'achievement', 'award', 'kudos', 'points', 'earned'],
    async run(userId, tenantId, db) {
      const badges = await db.query(
        `SELECT b.name, b.description, ub.awarded_at
         FROM ${TABLES.USER_BADGES} ub
         INNER JOIN ${TABLES.BADGE_DEFINITIONS} b ON ub.badge_id = CAST(b.ROWID AS CHAR)
         WHERE ub.tenant_id = '${e(tenantId)}' AND ub.user_id = '${e(userId)}'
         ORDER BY ub.awarded_at DESC LIMIT 10`
      );
      const lines = ['--- BADGES ---'];
      if (badges.length === 0) { lines.push('No badges earned yet'); return lines.join('\n'); }
      lines.push(`Badges earned: ${badges.length}`);
      badges.forEach((b) => lines.push(`  ${b.name} — ${b.description?.slice(0, 60) || ''} (${String(b.awarded_at).split('T')[0]})`));
      return lines.join('\n');
    },
  },

  // ── Announcements ─────────────────────────────────────────────────────────────
  {
    name:     'announcement_info',
    keywords: ['announcement', 'company news', 'notice', 'policy update', 'org update', 'latest news', 'company update'],
    async run(userId, tenantId, db) {
      const announcements = await db.query(
        `SELECT title, content, priority, CREATEDTIME
         FROM ${TABLES.ANNOUNCEMENTS}
         WHERE tenant_id = '${e(tenantId)}'
         ORDER BY CREATEDTIME DESC LIMIT 5`
      );
      const lines = ['--- ANNOUNCEMENTS ---'];
      if (announcements.length === 0) { lines.push('No announcements'); return lines.join('\n'); }
      announcements.forEach((a) =>
        lines.push(`  [${a.priority || 'NORMAL'}] ${a.title}: ${String(a.content || '').slice(0, 120)}`)
      );
      return lines.join('\n');
    },
  },
];

// ─── MCPService ───────────────────────────────────────────────────────────────

class MCPService {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * Pick which tools to run based on message + last few bot turns.
   * Always run project_overview as a lightweight base (provides IDs for actions).
   */
  // Max chars per tool output — keeps total LLM input within the 1106-token context window
  static TOOL_CHAR_LIMIT = 280;

  _selectTools(message, history = []) {
    const text = [
      message,
      ...history.slice(-2).map((h) => h.message || ''),
    ].join(' ').toLowerCase();

    // Score each non-base tool by keyword matches
    const scored = TOOLS
      .filter((t) => t.name !== 'project_overview')
      .map((t) => ({
        tool:  t,
        score: t.keywords.filter((kw) => text.includes(kw)).length,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Always include project_overview; add at most 1 additional tool to stay within token budget
    const base = TOOLS.find((t) => t.name === 'project_overview');
    return scored.length > 0 ? [base, scored[0].tool] : [base];
  }

  /**
   * Build the compact context block for the LLM.
   * Runs at most 2 tools in parallel; truncates each to TOOL_CHAR_LIMIT.
   */
  async buildContext(userId, tenantId, message, history = []) {
    const tools = this._selectTools(message, history);
    console.log(`[MCPService] buildContext — running ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);

    const results = await Promise.allSettled(
      tools.map((t) => t.run(userId, tenantId, this.db))
    );

    const parts = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        // Truncate each tool's output to stay within token budget
        parts.push(String(r.value).slice(0, MCPService.TOOL_CHAR_LIMIT));
      } else if (r.status === 'rejected') {
        console.warn(`[MCPService] tool "${tools[i].name}" failed (non-fatal):`, r.reason?.message);
      }
    }

    const context = parts.join('\n');
    console.log(`[MCPService] buildContext ✓ — ${tools.length} tools, ${context.length} chars`);
    return context || '';
  }

  /**
   * Lightweight context: just project list + leave types (for action conversations).
   * Used when the user is mid-conversation about leave/standup/task.
   */
  async buildActionContext(userId, tenantId) {
    const [projects, leaveTypes] = await Promise.allSettled([
      this.db.query(
        `SELECT ROWID, name FROM ${TABLES.PROJECTS}
         WHERE tenant_id = '${e(tenantId)}'
           AND ROWID IN (SELECT project_id FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id='${e(tenantId)}' AND user_id='${e(userId)}')
         LIMIT 20`
      ),
      this.db.query(
        `SELECT ROWID, name FROM ${TABLES.LEAVE_TYPES} WHERE tenant_id='${e(tenantId)}' LIMIT 20`
      ),
    ]);

    const lines = [];
    if (projects.status === 'fulfilled' && projects.value.length > 0) {
      lines.push('User\'s projects: ' + projects.value.map((p) => `${p.name} [id:${p.ROWID}]`).join(', '));
    }
    if (leaveTypes.status === 'fulfilled' && leaveTypes.value.length > 0) {
      // Use the name as the id value so the LLM echoes it back as leave_type_id — avoids
      // float64 precision loss on 17-digit Catalyst ROWIDs when the LLM serialises them.
      lines.push('Leave types (use name as leave_type_id): ' + leaveTypes.value.map((t) => `${t.name}`).join(', '));
    }
    return lines.join('\n');
  }
}

module.exports = MCPService;
