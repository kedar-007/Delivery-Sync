'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');

// Table names (matching the main app)
const T = {
  PROJECTS:       'projects',
  PROJECT_MEMBERS:'project_members',
  SPRINTS:        'sprints',
  TASKS:          'tasks',
  TIME_ENTRIES:   'time_entries',
  ATTENDANCE_RECORDS: 'attendance_records',
  MILESTONES:     'milestones',
  ACTIONS:        'actions',
  BLOCKERS:       'blockers',
};

const today = () => new Date().toISOString().split('T')[0];
const daysFromNow = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};
const daysAgo = (n) => daysFromNow(-n);

class SeedController {
  // POST /api/config/seed/demo
  static async seedDemo(req, res) {
    try {
      if (!['TENANT_ADMIN', 'OWNER'].includes(req.currentUser?.role)) {
        return ResponseHelper.forbidden(res, 'Only admins can seed demo data');
      }

      const db = new DataStoreService(req.catalystApp);
      const tenantId = req.tenantId;
      const userId   = req.currentUser.id;
      const created  = { projects: [], sprints: [], tasks: [], timeEntries: [], milestones: [], actions: [], blockers: [] };

      // ── 1. Projects ──────────────────────────────────────────────────────────
      const projectDefs = [
        { name: 'Mobile App Redesign', rag_status: 'GREEN', description: 'Redesign the mobile application with new UX', start_date: daysAgo(30), end_date: daysFromNow(60) },
        { name: 'Backend API v2',      rag_status: 'AMBER', description: 'Migrate REST API to GraphQL with auth improvements', start_date: daysAgo(15), end_date: daysFromNow(45) },
        { name: 'Data Platform',       rag_status: 'RED',   description: 'Build data lake and analytics pipeline', start_date: daysAgo(45), end_date: daysFromNow(90) },
      ];

      for (const pd of projectDefs) {
        const p = await db.insert(T.PROJECTS, { tenant_id: tenantId, ...pd, status: 'ACTIVE', created_by: userId });
        created.projects.push(p);
        // Add creator as member
        await db.insert(T.PROJECT_MEMBERS, { tenant_id: tenantId, project_id: p.ROWID, user_id: userId, role: 'DELIVERY_LEAD' });
      }

      const [proj1, proj2, proj3] = created.projects;

      // ── 2. Milestones ────────────────────────────────────────────────────────
      const milestoneDefs = [
        { project_id: proj1.ROWID, title: 'Design Handoff',      due_date: daysFromNow(14), status: 'IN_PROGRESS' },
        { project_id: proj1.ROWID, title: 'Beta Release',        due_date: daysFromNow(45), status: 'PENDING' },
        { project_id: proj2.ROWID, title: 'API Schema Frozen',   due_date: daysAgo(5),     status: 'COMPLETED' },
        { project_id: proj2.ROWID, title: 'Load Test Complete',  due_date: daysFromNow(20), status: 'IN_PROGRESS' },
        { project_id: proj3.ROWID, title: 'Data Model Approved', due_date: daysAgo(10),    status: 'PENDING' },
      ];
      for (const md of milestoneDefs) {
        const m = await db.insert(T.MILESTONES, { tenant_id: tenantId, ...md, description: '', created_by: userId });
        created.milestones.push(m);
      }

      // ── 3. Sprints ──────────────────────────────────────────────────────────
      const sprintDefs = [
        { project_id: proj1.ROWID, name: 'Sprint 1 – Discovery',  status: 'COMPLETED', start_date: daysAgo(28), end_date: daysAgo(14), capacity_points: 40, goal: 'Complete user research and wireframes' },
        { project_id: proj1.ROWID, name: 'Sprint 2 – Design',     status: 'ACTIVE',    start_date: daysAgo(14), end_date: daysFromNow(0), capacity_points: 40, goal: 'High-fidelity designs for core flows' },
        { project_id: proj1.ROWID, name: 'Sprint 3 – Build',      status: 'PLANNING',  start_date: daysFromNow(1), end_date: daysFromNow(14), capacity_points: 40, goal: 'Implement core screens' },
        { project_id: proj2.ROWID, name: 'Sprint A – Schema',     status: 'COMPLETED', start_date: daysAgo(14), end_date: daysAgo(0),  capacity_points: 30, goal: 'Define GraphQL schema' },
        { project_id: proj2.ROWID, name: 'Sprint B – Resolvers',  status: 'ACTIVE',    start_date: daysFromNow(1), end_date: daysFromNow(14), capacity_points: 30, goal: 'Implement all query resolvers' },
        { project_id: proj3.ROWID, name: 'Sprint I – Ingestion',  status: 'ACTIVE',    start_date: daysAgo(7),  end_date: daysFromNow(7),  capacity_points: 25, goal: 'Set up data ingestion pipeline' },
      ];
      for (const sd of sprintDefs) {
        const s = await db.insert(T.SPRINTS, { tenant_id: tenantId, ...sd, created_by: userId });
        created.sprints.push(s);
      }

      const [spr1, spr2, spr3, spr4, spr5, spr6] = created.sprints;

      // ── 4. Tasks ─────────────────────────────────────────────────────────────
      const taskDefs = [
        // proj1 tasks (Mobile App)
        { project_id: proj1.ROWID, sprint_id: spr2.ROWID, title: 'Design home screen',         type: 'STORY',  task_priority: 'HIGH',   status: 'IN_PROGRESS', story_points: 8,  estimated_hours: 12, assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj1.ROWID, sprint_id: spr2.ROWID, title: 'Design profile screen',      type: 'TASK',   task_priority: 'MEDIUM', status: 'TODO',        story_points: 5,  estimated_hours: 8,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj1.ROWID, sprint_id: spr2.ROWID, title: 'Navigation bar component',  type: 'TASK',   task_priority: 'HIGH',   status: 'IN_REVIEW',   story_points: 3,  estimated_hours: 4,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj1.ROWID, sprint_id: spr2.ROWID, title: 'Fix contrast accessibility', type: 'BUG',    task_priority: 'CRITICAL',status: 'IN_PROGRESS', story_points: 2,  estimated_hours: 3,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj1.ROWID, sprint_id: spr3.ROWID, title: 'Implement login screen',    type: 'TASK',   task_priority: 'HIGH',   status: 'TODO',        story_points: 8,  estimated_hours: 12, assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj1.ROWID, sprint_id: 0,          title: 'Push notifications',         type: 'EPIC',   task_priority: 'MEDIUM', status: 'TODO',        story_points: 13, estimated_hours: 20, assignee_ids: JSON.stringify([String(userId)]) },
        // proj2 tasks (API)
        { project_id: proj2.ROWID, sprint_id: spr5.ROWID, title: 'Auth mutation resolvers',   type: 'TASK',   task_priority: 'HIGH',   status: 'IN_PROGRESS', story_points: 8,  estimated_hours: 10, assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj2.ROWID, sprint_id: spr5.ROWID, title: 'Rate limiting middleware',  type: 'TASK',   task_priority: 'HIGH',   status: 'TODO',        story_points: 5,  estimated_hours: 6,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj2.ROWID, sprint_id: spr5.ROWID, title: 'JWT refresh token bug',     type: 'BUG',    task_priority: 'CRITICAL',status: 'IN_PROGRESS', story_points: 3,  estimated_hours: 4,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj2.ROWID, sprint_id: 0,          title: 'WebSocket subscriptions',   type: 'EPIC',   task_priority: 'LOW',    status: 'TODO',        story_points: 21, estimated_hours: 30, assignee_ids: JSON.stringify([String(userId)]) },
        // proj3 tasks (Data)
        { project_id: proj3.ROWID, sprint_id: spr6.ROWID, title: 'S3 connector setup',        type: 'TASK',   task_priority: 'HIGH',   status: 'DONE',        story_points: 5,  estimated_hours: 8,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj3.ROWID, sprint_id: spr6.ROWID, title: 'Kafka stream processor',    type: 'STORY',  task_priority: 'HIGH',   status: 'IN_PROGRESS', story_points: 13, estimated_hours: 20, assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj3.ROWID, sprint_id: spr6.ROWID, title: 'Data schema validation',    type: 'TASK',   task_priority: 'MEDIUM', status: 'TODO',        story_points: 5,  estimated_hours: 6,  assignee_ids: JSON.stringify([String(userId)]) },
        { project_id: proj3.ROWID, sprint_id: 0,          title: 'Dashboard analytics MVP',   type: 'EPIC',   task_priority: 'MEDIUM', status: 'TODO',        story_points: 21, estimated_hours: 35, assignee_ids: JSON.stringify([String(userId)]) },
      ];
      for (const td of taskDefs) {
        const t = await db.insert(T.TASKS, {
          tenant_id: tenantId, parent_task_id: 0,
          description: '', logged_hours: 0,
          labels: '[]', reporter_id: userId, created_by: userId,
          ...td,
        });
        created.tasks.push(t);
      }

      // ── 5. Time Entries ──────────────────────────────────────────────────────
      const timeEntryDefs = [
        { project_id: proj1.ROWID, task_id: created.tasks[0]?.ROWID || 0, entry_date: daysAgo(5), hours: 3.5, description: 'Home screen wireframes review',   is_billable: 'true',  status: 'APPROVED' },
        { project_id: proj1.ROWID, task_id: created.tasks[0]?.ROWID || 0, entry_date: daysAgo(4), hours: 4,   description: 'High fidelity home screen',       is_billable: 'true',  status: 'SUBMITTED' },
        { project_id: proj1.ROWID, task_id: created.tasks[2]?.ROWID || 0, entry_date: daysAgo(3), hours: 2,   description: 'Navigation bar design iteration', is_billable: 'true',  status: 'APPROVED' },
        { project_id: proj2.ROWID, task_id: created.tasks[6]?.ROWID || 0, entry_date: daysAgo(3), hours: 5,   description: 'Auth resolver implementation',    is_billable: 'false', status: 'DRAFT' },
        { project_id: proj2.ROWID, task_id: created.tasks[8]?.ROWID || 0, entry_date: daysAgo(2), hours: 2.5, description: 'JWT refresh token debugging',     is_billable: 'true',  status: 'DRAFT' },
        { project_id: proj3.ROWID, task_id: created.tasks[10]?.ROWID || 0, entry_date: daysAgo(2), hours: 4, description: 'S3 bucket connection setup',       is_billable: 'true',  status: 'APPROVED' },
        { project_id: proj1.ROWID, task_id: created.tasks[1]?.ROWID || 0, entry_date: daysAgo(1), hours: 3,   description: 'Profile screen design',           is_billable: 'true',  status: 'DRAFT' },
        { project_id: proj3.ROWID, task_id: created.tasks[11]?.ROWID || 0, entry_date: today(), hours: 5, description: 'Kafka stream processor development', is_billable: 'true',  status: 'DRAFT' },
      ];
      for (const te of timeEntryDefs) {
        const entry = await db.insert(T.TIME_ENTRIES, {
          tenant_id: tenantId, user_id: userId,
          ...te,
        });
        created.timeEntries.push(entry);
      }

      // ── 6. Actions ───────────────────────────────────────────────────────────
      const actionDefs = [
        { project_id: proj1.ROWID, title: 'Review design system tokens',  assigned_to: userId, due_date: daysFromNow(3),  action_priority: 'HIGH',   status: 'OPEN' },
        { project_id: proj1.ROWID, title: 'Get stakeholder sign-off on nav',assigned_to: userId, due_date: daysAgo(2),  action_priority: 'CRITICAL',status: 'OPEN' },
        { project_id: proj2.ROWID, title: 'Code review auth resolvers',   assigned_to: userId, due_date: daysFromNow(1),  action_priority: 'HIGH',   status: 'OPEN' },
        { project_id: proj3.ROWID, title: 'Setup staging environment',    assigned_to: userId, due_date: daysFromNow(5),  action_priority: 'MEDIUM', status: 'OPEN' },
      ];
      for (const ad of actionDefs) {
        const a = await db.insert(T.ACTIONS, { tenant_id: tenantId, description: '', created_by: userId, source: 'MANUAL', ...ad });
        created.actions.push(a);
      }

      // ── 7. Blockers ──────────────────────────────────────────────────────────
      const blockerDefs = [
        { project_id: proj2.ROWID, title: 'Third-party OAuth provider down', severity: 'CRITICAL', status: 'OPEN',     raised_by: userId, description: 'Auth0 experiencing outage, blocking login flow testing' },
        { project_id: proj3.ROWID, title: 'Kafka cluster not provisioned',   severity: 'HIGH',     status: 'OPEN',     raised_by: userId, description: 'DevOps team has not set up the Kafka cluster yet' },
        { project_id: proj1.ROWID, title: 'Design assets missing from Figma',severity: 'MEDIUM',   status: 'RESOLVED', raised_by: userId, description: 'Icon library was missing, now resolved' },
      ];
      for (const bd of blockerDefs) {
        const b = await db.insert(T.BLOCKERS, { tenant_id: tenantId, owner_user_id: userId, resolved_date: '', resolution: '', raised_date: today(), created_by: userId, ...bd });
        created.blockers.push(b);
      }

      // ── 8. Attendance for last 5 days ────────────────────────────────────────
      for (let i = 5; i >= 1; i--) {
        const d = daysAgo(i);
        const checkIn  = new Date(); checkIn.setDate(checkIn.getDate() - i); checkIn.setHours(9, 0, 0);
        const checkOut = new Date(checkIn); checkOut.setHours(17, 30, 0);
        const hours    = (checkOut - checkIn) / 3600000;
        try {
          await db.insert(T.ATTENDANCE_RECORDS, {
            tenant_id: tenantId, user_id: userId,
            attendance_date: d,
            check_in_time: DataStoreService.fmtDT(checkIn),
            check_out_time: DataStoreService.fmtDT(checkOut),
            work_hours: hours,
            status: 'PRESENT',
            is_wfh: i % 2 === 0 ? 'true' : 'false',
            wfh_reason: i % 2 === 0 ? 'Working from home' : '',
            is_location_verified: 'true',
            check_in_ip: '127.0.0.1',
            override_reason: '',
            overridden_by: 0,
          });
        } catch (_) { /* skip duplicate */ }
      }

      return ResponseHelper.created(res, {
        message: 'Demo data seeded successfully',
        summary: {
          projects:    created.projects.length,
          sprints:     created.sprints.length,
          tasks:       created.tasks.length,
          timeEntries: created.timeEntries.length,
          milestones:  created.milestones.length,
          actions:     created.actions.length,
          blockers:    created.blockers.length,
        },
      });
    } catch (err) {
      console.error('[SeedController]', err.message);
      return ResponseHelper.serverError(res, `Seed failed: ${err.message}`);
    }
  }
}

module.exports = SeedController;
