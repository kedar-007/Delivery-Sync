'use strict';

const DataStoreService = require('../services/DataStoreService');
const ResponseHelper   = require('../utils/ResponseHelper');
const { TABLES }       = require('../utils/Constants');

// ─── Seed vocabulary ──────────────────────────────────────────────────────────

const PROJECT_NAMES   = ['Apollo Relaunch','Titan Migration','Orion Dashboard','Nexus API v2','Phoenix Rebuild','Helios Analytics','Vega Platform','Nova Checkout','Pulsar Infra','Comet CRM','Zenith Portal','Quartz Data','Lynx Mobile','Hydra Services','Apex Reporting'];
const ACTION_TITLES   = ['Review architecture docs','Set up CI pipeline','Write unit tests','Update API documentation','Fix prod login bug','Migrate DB schema','Code review Sprint 4','Align with stakeholders','Prepare release notes','Performance profiling','Security audit','Dependency upgrade','Onboard new member','Retrospective action','Deploy to staging'];
const BLOCKER_DESCS   = ['Waiting for third-party API credentials','Blocked on legal approval for data transfer','Infrastructure access not provisioned','Dependency team unreachable','Test environment unstable','Unclear acceptance criteria','Missing design assets','License procurement pending','External vendor delay','Awaiting security sign-off'];
const STANDUP_ITEMS   = ['Worked on feature X','Fixed bug in module Y','Reviewed PR from teammate','Attended sprint planning','Updated documentation','Deployed hotfix to staging','Joined stakeholder call','Investigated production issue','Refactored legacy service','Wrote integration tests'];
const PRIORITIES      = ['LOW','MEDIUM','HIGH','CRITICAL'];
const RAG_STATUSES    = ['GREEN','AMBER','RED'];
const ACTION_STATUSES = ['OPEN','IN_PROGRESS','DONE','OVERDUE'];
const BLOCKER_TYPES   = ['TECHNICAL','PROCESS','RESOURCE','EXTERNAL'];

// RAID
const RISK_TITLES     = ['Third-party API instability','Key developer leaving','Regulatory compliance gap','Infrastructure cost overrun','Data migration failure','Scope creep from stakeholders','Security vulnerability in auth','Performance degradation at scale','Vendor lock-in risk','Delayed UAT sign-off'];
const RISK_MITIGATIONS= ['Set up fallback provider','Cross-train team members','Engage legal for compliance review','Cap cloud spend with billing alerts','Run dry-run migration in staging','Weekly scope review with product owner','Schedule penetration test','Load-test before release','Evaluate multi-cloud strategy','Align sign-off timeline with sponsor'];
const ISSUE_TITLES    = ['Build pipeline broken','API rate limit hit in production','Login not working on Safari','Database connection pool exhausted','Incorrect data in weekly report','Email notifications not sending','Payment integration returning 500','Mobile layout broken on iOS 17','CSV export timing out','Search returning stale results'];
const DEP_TITLES      = ['Auth service must complete before SSO','Design tokens needed for UI build','Data model sign-off required','Legal review of privacy policy','Security audit clearance','API contract agreed with partner','Environment provisioned by DevOps','CI/CD pipeline configured','Staging database seeded','Feature flags configured'];
const ASSUMPTION_TITLES = ['Users have modern browsers','Team availability is stable','Third-party SLAs will be met','No major scope changes post-kick-off','Infrastructure will scale linearly','Existing data is clean enough to migrate','Stakeholders will review within 48 hours','Test environment mirrors production','Budget is approved for full scope','Sprint velocity stays consistent'];

// Decisions
const DECISION_TITLES = ['Adopt microservices architecture','Use PostgreSQL over MongoDB','Migrate to Kubernetes','Implement feature flags via LaunchDarkly','Drop IE11 support','Switch from REST to GraphQL for internal APIs','Use Figma as design system source of truth','Adopt trunk-based development','Enforce conventional commits','Centralise logging with Datadog'];
const DECISION_RATIONALE = ['Scalability requirements exceeded monolith limits','Relational data model fits our access patterns','Improve deployment isolation and rollback speed','Enables gradual rollout without code deploys','IE11 usage below 0.3%','Reduces over-fetching for mobile clients','Single source of truth reduces design drift','Reduces merge conflicts and speeds CI','Enables changelog automation','Centralised observability reduces MTTR'];

// Milestones
const MILESTONE_TITLES = ['Kick-off complete','Discovery phase done','Architecture sign-off','MVP shipped','Beta testing begins','User acceptance testing','Security review passed','Performance benchmarks met','Stakeholder demo','Go-live'];

// Sprints & Tasks
const SPRINT_NAMES    = ['Sprint 1 – Kickoff','Sprint 2 – Foundation','Sprint 3 – Core Features','Sprint 4 – Integration','Sprint 5 – Polish','Sprint 6 – Hardening','Sprint 7 – Beta','Sprint 8 – Release Prep','Sprint 9 – Stabilisation','Sprint 10 – Launch'];
const TASK_TITLES     = ['Implement login flow','Build dashboard widgets','Write API documentation','Fix null pointer in payment module','Refactor auth service','Add unit tests for billing','Design onboarding screens','Migrate legacy data','Configure CI/CD pipeline','Review pull requests','Set up error monitoring','Implement search functionality','Performance optimise queries','Accessibility audit','Update dependency versions','Write E2E tests','Create data export feature','Build notification centre','Implement dark mode','Code review and merge PRs'];
const TASK_TYPES      = ['TASK','TASK','TASK','STORY','STORY','BUG','BUG','EPIC'];

// Teams
const TEAM_NAMES      = ['Frontend Guild','Backend Squad','Infrastructure Team','QA Force','Product Trio','Data Platform','Security Task Force','DevRel Team','Mobile Crew','Reliability Engineers'];
const TEAM_MEMBER_ROLES = ['DEVELOPER','LEAD','TESTER','DESIGNER','MEMBER'];

// Time entries
const TIME_DESCS      = ['Feature development','Bug fixing','Code review','Documentation','Sprint planning','Stakeholder meeting','UAT support','Deployment activities','Performance tuning','Security hardening'];

// User profiles
const DEPARTMENTS     = ['Engineering','Product','Design','Marketing','Finance','Operations','HR','Legal','Sales','Customer Success','Data & Analytics','Security'];
const DESIGNATIONS    = ['Software Engineer','Senior Software Engineer','Lead Engineer','Engineering Manager','Product Manager','Senior Product Manager','UX Designer','UI Designer','QA Engineer','DevOps Engineer','Data Analyst','Business Analyst','Technical Lead','Scrum Master','Solution Architect'];
const BIOS            = [
  'Passionate engineer focused on building scalable systems and clean APIs.',
  'Product-minded developer who loves turning ideas into shipped features.',
  'Design systems enthusiast crafting consistent user experiences.',
  'Data-driven thinker with a background in analytics and ML.',
  'Full-stack engineer who enjoys owning features end-to-end.',
  'Reliability engineer obsessed with uptime and observability.',
  'Agile practitioner bridging business requirements and technical delivery.',
  'Security-first engineer who treats vulnerabilities as product bugs.',
  'Front-end specialist bringing pixel-perfect attention to detail.',
  'Platform engineer building the foundations that teams rely on.',
];
const SKILLS_POOL     = ['JavaScript','TypeScript','React','Node.js','Python','Go','Java','SQL','NoSQL','AWS','GCP','Docker','Kubernetes','CI/CD','GraphQL','REST APIs','Figma','Agile','Scrum','Data Analysis','Machine Learning','Security','DevOps','Testing','Technical Writing'];
const TIMEZONES       = ['Asia/Kolkata','America/New_York','Europe/London','America/Los_Angeles','Asia/Singapore','Europe/Berlin','Australia/Sydney','America/Chicago','Asia/Tokyo','Africa/Nairobi'];

// Leave
const LEAVE_TYPE_DEFS = [
  { name:'Annual Leave',      code:'AL',  days_per_year:21, carry_forward_days:5,  min_days:1,   max_days:21,  notice_days:3,  is_paid:'true'  },
  { name:'Sick Leave',        code:'SL',  days_per_year:12, carry_forward_days:0,  min_days:0.5, max_days:12,  notice_days:0,  is_paid:'true'  },
  { name:'Casual Leave',      code:'CL',  days_per_year:7,  carry_forward_days:0,  min_days:0.5, max_days:3,   notice_days:1,  is_paid:'true'  },
  { name:'Compensatory Off',  code:'CO',  days_per_year:10, carry_forward_days:2,  min_days:0.5, max_days:5,   notice_days:1,  is_paid:'true'  },
  { name:'Unpaid Leave',      code:'UL',  days_per_year:30, carry_forward_days:0,  min_days:1,   max_days:30,  notice_days:2,  is_paid:'false' },
];
const LEAVE_REASONS = [
  'Family function',
  'Medical appointment',
  'Not feeling well',
  'Personal work',
  'Travel plans',
  'Home emergency',
  'Wedding in family',
  'Festival celebration',
  'Rest and recovery',
  'Childcare',
];

// Badges
// Valid BADGE_CATEGORY values: PERFORMANCE, COLLABORATION, INNOVATION, LEADERSHIP, SPECIAL
// Valid BADGE_LEVEL values:    BRONZE, SILVER, GOLD, PLATINUM
const BADGE_DEFS = [
  { name:'First Commit',         category:'SPECIAL',        level:'BRONZE',   criteria:'Submitted first standup or EOD entry' },
  { name:'Sprint Finisher',      category:'PERFORMANCE',    level:'SILVER',   criteria:'Completed all sprint tasks on time' },
  { name:'Blocker Buster',       category:'COLLABORATION',  level:'GOLD',     criteria:'Resolved 5+ critical blockers' },
  { name:'Documentation Hero',   category:'SPECIAL',        level:'BRONZE',   criteria:'Consistently maintained up-to-date documentation' },
  { name:'On-Time Delivery',     category:'PERFORMANCE',    level:'GOLD',     criteria:'Delivered 3+ projects on time' },
  { name:'Code Reviewer',        category:'PERFORMANCE',    level:'SILVER',   criteria:'Completed 10+ code reviews' },
  { name:'Mentor',               category:'LEADERSHIP',     level:'GOLD',     criteria:'Onboarded and mentored 2+ team members' },
  { name:'Bug Crusher',          category:'PERFORMANCE',    level:'SILVER',   criteria:'Fixed 10+ bugs reported in production' },
  { name:'Team Player',          category:'COLLABORATION',  level:'BRONZE',   criteria:'Consistently helped teammates unblock their work' },
  { name:'Innovation Award',     category:'INNOVATION',     level:'PLATINUM', criteria:'Proposed and shipped an innovative feature' },
  { name:'Consistency King',     category:'PERFORMANCE',    level:'SILVER',   criteria:'30-day standup streak without missing a day' },
  { name:'Customer Champion',    category:'SPECIAL',        level:'GOLD',     criteria:'Directly resolved a critical customer issue' },
];
const BADGE_AWARD_REASONS = [
  'Exceptional performance this sprint',
  'Outstanding dedication to quality',
  'Going above and beyond to help the team',
  'Delivering complex features under pressure',
  'Consistently excellent standup engagement',
  'Proactively identifying and resolving blockers',
  'Mentoring junior team members',
  'Driving technical excellence across the team',
];

// ─── Deterministic pseudo-random (LCG, seeded per row) ───────────────────────

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return Math.abs(s) / 0x7fffffff; };
}

function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }

function dateInRange(fromDate, toDate, rand) {
  const from = new Date(fromDate).getTime();
  const to   = new Date(toDate).getTime();
  return new Date(from + rand() * (to - from)).toISOString().split('T')[0];
}

// ─── Controller ───────────────────────────────────────────────────────────────

class DataSeedController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
  }

  /**
   * POST /api/data-seed/run
   * Body: {
   *   modules: {
   *     projects?, actions?, blockers?, standups?, eod?,
   *     milestones?, decisions?, risks?, issues?, dependencies?, assumptions?,
   *     teams?, time_entries?, user_profiles?
   *   },
   *   date_from: 'YYYY-MM-DD',
   *   date_to:   'YYYY-MM-DD',
   * }
   */
  async run(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { modules = {}, date_from, date_to } = req.body;

      if (!date_from || !date_to)
        return ResponseHelper.validationError(res, 'date_from and date_to are required');
      if (new Date(date_from) > new Date(date_to))
        return ResponseHelper.validationError(res, 'date_from must be before date_to');

      const MAX = 1000;
      const report = {};

      // ── Resolve users ──────────────────────────────────────────────────────────
      const users = await this.db.findWhere(TABLES.USERS, tenantId, '', { limit: 200 });
      if (users.length === 0)
        return ResponseHelper.validationError(res, 'No users found in tenant — cannot seed relational data');

      // ── Helper: get/cache projects ─────────────────────────────────────────────
      let _projects = null;
      const getProjects = async () => {
        if (!_projects) _projects = await this.db.findWhere(TABLES.PROJECTS, tenantId, '', { limit: 200 });
        return _projects;
      };

      // ── Projects ───────────────────────────────────────────────────────────────
      if (modules.projects > 0) {
        const count = Math.min(MAX, modules.projects);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 7919);
          try {
            await this.db.insert(TABLES.PROJECTS, {
              tenant_id:  String(tenantId),
              name:       `${pick(PROJECT_NAMES, rand)} ${String(i + 1).padStart(3, '0')}`,
              description:`Seeded project #${i + 1} for testing purposes.`,
              status:     pick(['ACTIVE','ACTIVE','ACTIVE','PLANNING','ON_HOLD'], rand),
              rag_status: pick(RAG_STATUSES, rand),
              start_date: dateInRange(date_from, date_to, rand),
              end_date:   dateInRange(date_from, date_to, rand),
              created_by: String(pick(users, rand).ROWID),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.projects = { requested: count, created, failed };
        _projects = null; // bust cache after inserting new projects
      }

      const projects = await getProjects();

      // ── Actions ────────────────────────────────────────────────────────────────
      if (modules.actions > 0) {
        const count = Math.min(MAX, modules.actions);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 6271 + 1);
          try {
            const owner   = pick(users, rand);
            const project = projects.length > 0 ? pick(projects, rand) : null;
            await this.db.insert(TABLES.ACTIONS, {
              tenant_id:     String(tenantId),
              title:         pick(ACTION_TITLES, rand),
              description:   `Seeded action #${i + 1}`,
              status:        pick(ACTION_STATUSES, rand),
              action_priority: pick(PRIORITIES, rand),
              assigned_to:   String(owner.ROWID),
              due_date:      dateInRange(date_from, date_to, rand),
              ...(project ? { project_id: String(project.ROWID) } : {}),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.actions = { requested: count, created, failed };
      }

      // ── Blockers ───────────────────────────────────────────────────────────────
      if (modules.blockers > 0) {
        const count = Math.min(MAX, modules.blockers);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 5381 + 2);
          try {
            const owner   = pick(users, rand);
            const project = projects.length > 0 ? pick(projects, rand) : null;
            await this.db.insert(TABLES.BLOCKERS, {
              tenant_id:     String(tenantId),
              title:         pick(BLOCKER_DESCS, rand),
              description:   `Seeded blocker #${i + 1}`,
              severity:      pick(PRIORITIES, rand),
              status:        pick(['OPEN','OPEN','IN_PROGRESS','RESOLVED'], rand),
              owner_user_id: String(owner.ROWID),
              raised_by:     String(owner.ROWID),
              ...(project ? { project_id: String(project.ROWID) } : {}),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.blockers = { requested: count, created, failed };
      }

      // ── Standups ───────────────────────────────────────────────────────────────
      if (modules.standups > 0) {
        const count = Math.min(MAX, modules.standups);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 4001 + 3);
          try {
            const user    = pick(users, rand);
            const project = projects.length > 0 ? pick(projects, rand) : null;
            await this.db.insert(TABLES.STANDUP_ENTRIES, {
              tenant_id:    String(tenantId),
              user_id:      String(user.ROWID),
              yesterday:    pick(STANDUP_ITEMS, rand),
              today:        pick(STANDUP_ITEMS, rand),
              blockers:     rand() > 0.7 ? pick(BLOCKER_DESCS, rand) : 'None',
              entry_date:   dateInRange(date_from, date_to, rand),
              submitted_at: DataStoreService.fmtDT(new Date()),
              ...(project ? { project_id: String(project.ROWID) } : {}),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.standups = { requested: count, created, failed };
      }

      // ── EOD entries ────────────────────────────────────────────────────────────
      if (modules.eod > 0) {
        const count = Math.min(MAX, modules.eod);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 3307 + 4);
          try {
            const user    = pick(users, rand);
            const project = projects.length > 0 ? pick(projects, rand) : null;
            await this.db.insert(TABLES.EOD_ENTRIES, {
              tenant_id:           String(tenantId),
              user_id:             String(user.ROWID),
              accomplished:        pick(STANDUP_ITEMS, rand),
              plan_for_tomorrow:   pick(STANDUP_ITEMS, rand),
              blockers:            rand() > 0.7 ? pick(BLOCKER_DESCS, rand) : 'None',
              progress_percentage: String(Math.floor(20 + rand() * 80)),
              mood:                pick(['GREAT','GOOD','OKAY','STRESSED'], rand),
              entry_date:          dateInRange(date_from, date_to, rand),
              submitted_at:        DataStoreService.fmtDT(new Date()),
              ...(project ? { project_id: String(project.ROWID) } : {}),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.eod = { requested: count, created, failed };
      }

      // ── Milestones ─────────────────────────────────────────────────────────────
      if (modules.milestones > 0) {
        const count = Math.min(MAX, modules.milestones);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 2903 + 5);
          try {
            const project = projects.length > 0 ? pick(projects, rand) : null;
            if (!project) { failed++; continue; }
            await this.db.insert(TABLES.MILESTONES, {
              tenant_id:   String(tenantId),
              project_id:  String(project.ROWID),
              title:       `${pick(MILESTONE_TITLES, rand)} #${i + 1}`,
              description: `Seeded milestone for testing.`,
              due_date:    dateInRange(date_from, date_to, rand),
              status:      pick(['PENDING','IN_PROGRESS','COMPLETED','DELAYED'], rand),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.milestones = { requested: count, created, failed };
      }

      // ── Decisions ──────────────────────────────────────────────────────────────
      if (modules.decisions > 0) {
        const count = Math.min(MAX, modules.decisions);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 2617 + 6);
          try {
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const user    = pick(users, rand);
            if (!project) { failed++; continue; }
            const idx = Math.floor(rand() * DECISION_TITLES.length);
            await this.db.insert(TABLES.DECISIONS, {
              tenant_id:     String(tenantId),
              project_id:    String(project.ROWID),
              title:         DECISION_TITLES[idx % DECISION_TITLES.length],
              description:   `Seeded decision #${i + 1}`,
              decision_date: dateInRange(date_from, date_to, rand),
              made_by:       String(user.ROWID),
              impact:        pick(PRIORITIES, rand),
              rationale:     DECISION_RATIONALE[idx % DECISION_RATIONALE.length],
              status:        pick(['OPEN','IMPLEMENTED'], rand),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.decisions = { requested: count, created, failed };
      }

      // ── Sprints ────────────────────────────────────────────────────────────────
      let _sprints = null;
      const getSprints = async () => {
        if (!_sprints) _sprints = await this.db.findWhere(TABLES.SPRINTS, tenantId, '', { limit: 200 });
        return _sprints;
      };

      if (modules.sprints > 0) {
        const count = Math.min(MAX, modules.sprints);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand    = rng(Date.now() + i * 2221 + 55);
          const project = projects.length > 0 ? pick(projects, rand) : null;
          if (!project) { failed++; continue; }
          try {
            const startDate = dateInRange(date_from, date_to, rand);
            const endMs     = new Date(startDate).getTime() + (7 + Math.floor(rand() * 7)) * 86400000;
            const endDate   = new Date(endMs).toISOString().split('T')[0];
            await this.db.insert(TABLES.SPRINTS, {
              tenant_id:       String(tenantId),
              project_id:      String(project.ROWID),
              name:            `${pick(SPRINT_NAMES, rand)} (P${project.ROWID})`,
              goal:            'Ship the planned stories and close open bugs.',
              start_date:      startDate,
              end_date:        endDate,
              status:          pick(['PLANNING','ACTIVE','ACTIVE','COMPLETED'], rand),
              capacity_points: String(Math.floor(20 + rand() * 60)),
            });
            created++;
          } catch (_) { failed++; }
        }
        _sprints = null;
        report.sprints = { requested: count, created, failed };
      }

      const sprints = await getSprints();

      // ── Tasks ──────────────────────────────────────────────────────────────────
      if (modules.tasks > 0) {
        const count = Math.min(MAX, modules.tasks);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand    = rng(Date.now() + i * 1979 + 56);
          const project = projects.length > 0 ? pick(projects, rand) : null;
          const sprint  = sprints.length > 0 ? pick(sprints, rand) : null;
          const owner   = pick(users, rand);
          if (!project) { failed++; continue; }
          try {
            const assigneeIds = [String(owner.ROWID)];
            await this.db.insert(TABLES.TASKS, {
              tenant_id:       String(tenantId),
              project_id:      String(project.ROWID),
              sprint_id:       String(sprint ? sprint.ROWID : 0),
              parent_task_id:  '0',
              title:           pick(TASK_TITLES, rand),
              description:     `Seeded task #${i + 1}`,
              type:            pick(TASK_TYPES, rand),
              status:          pick(['TODO','TODO','IN_PROGRESS','IN_PROGRESS','IN_REVIEW','DONE'], rand),
              task_priority:   pick(['LOW','MEDIUM','MEDIUM','HIGH','CRITICAL'], rand),
              assignee_ids:    JSON.stringify(assigneeIds),
              story_points:    Math.floor(rand() * 13),
              estimated_hours: parseFloat((1 + rand() * 15).toFixed(1)),
              logged_hours:    0,
              labels:          '[]',
              created_by:      String(owner.ROWID),
              due_date:        dateInRange(date_from, date_to, rand),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.tasks = { requested: count, created, failed };
      }

      // ── RAID: Risks ────────────────────────────────────────────────────────────
      if (modules.risks > 0) {
        const count = Math.min(MAX, modules.risks);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 2333 + 7);
          try {
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const owner   = pick(users, rand);
            if (!project) { failed++; continue; }
            const idx = Math.floor(rand() * RISK_TITLES.length);
            await this.db.insert(TABLES.RISKS, {
              tenant_id:    String(tenantId),
              project_id:   String(project.ROWID),
              title:        RISK_TITLES[idx % RISK_TITLES.length],
              description:  `Seeded risk #${i + 1}`,
              probability:  pick(['LOW','MEDIUM','HIGH'], rand),
              impact:       pick(['LOW','MEDIUM','HIGH','CRITICAL'], rand),
              status:       pick(['OPEN','MITIGATED','CLOSED'], rand),
              owner_user_id:String(owner.ROWID),
              mitigation:   RISK_MITIGATIONS[idx % RISK_MITIGATIONS.length],
            });
            created++;
          } catch (_) { failed++; }
        }
        report.risks = { requested: count, created, failed };
      }

      // ── RAID: Issues ───────────────────────────────────────────────────────────
      if (modules.issues > 0) {
        const count = Math.min(MAX, modules.issues);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 2089 + 8);
          try {
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const owner   = pick(users, rand);
            if (!project) { failed++; continue; }
            await this.db.insert(TABLES.ISSUES, {
              tenant_id:    String(tenantId),
              project_id:   String(project.ROWID),
              title:        pick(ISSUE_TITLES, rand),
              description:  `Seeded issue #${i + 1}`,
              severity:     pick(PRIORITIES, rand),
              status:       pick(['OPEN','IN_PROGRESS','RESOLVED','CLOSED'], rand),
              owner_user_id:String(owner.ROWID),
              created_by:   String(owner.ROWID),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.issues = { requested: count, created, failed };
      }

      // ── RAID: Dependencies ─────────────────────────────────────────────────────
      if (modules.dependencies > 0) {
        const count = Math.min(MAX, modules.dependencies);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 1847 + 9);
          try {
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const owner   = pick(users, rand);
            if (!project) { failed++; continue; }
            await this.db.insert(TABLES.DEPENDENCIES, {
              tenant_id:       String(tenantId),
              project_id:      String(project.ROWID),
              title:           pick(DEP_TITLES, rand),
              description:     `Seeded dependency #${i + 1}`,
              dependency_type: pick(['INTERNAL','EXTERNAL','TEAM','VENDOR'], rand),
              status:          pick(['PENDING','RESOLVED','AT_RISK'], rand),
              owner_user_id:   String(owner.ROWID),
              created_by:      String(owner.ROWID),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.dependencies = { requested: count, created, failed };
      }

      // ── RAID: Assumptions ──────────────────────────────────────────────────────
      if (modules.assumptions > 0) {
        const count = Math.min(MAX, modules.assumptions);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 1601 + 10);
          try {
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const owner   = pick(users, rand);
            if (!project) { failed++; continue; }
            await this.db.insert(TABLES.ASSUMPTIONS, {
              tenant_id:    String(tenantId),
              project_id:   String(project.ROWID),
              title:        pick(ASSUMPTION_TITLES, rand),
              description:  `Seeded assumption #${i + 1}`,
              owner_user_id:String(owner.ROWID),
              created_by:   String(owner.ROWID),
            });
            created++;
          } catch (_) { failed++; }
        }
        report.assumptions = { requested: count, created, failed };
      }

      // ── Teams ──────────────────────────────────────────────────────────────────
      if (modules.teams > 0) {
        const count = Math.min(MAX, modules.teams);
        let created = 0, failed = 0;
        for (let i = 0; i < count; i++) {
          const rand = rng(Date.now() + i * 1399 + 11);
          try {
            const lead    = pick(users, rand);
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const team = await this.db.insert(TABLES.TEAMS, {
              tenant_id:   String(tenantId),
              name:        `${pick(TEAM_NAMES, rand)} ${String(i + 1).padStart(2, '0')}`,
              description: `Seeded team #${i + 1}`,
              lead_user_id:String(lead.ROWID),
              created_by:  String(performedBy),
              ...(project ? { project_id: String(project.ROWID) } : {}),
            });
            // Add 2–5 random members
            const memberCount = 2 + Math.floor(rand() * 4);
            for (let m = 0; m < memberCount && m < users.length; m++) {
              const member = pick(users, rand);
              try {
                await this.db.insert(TABLES.TEAM_MEMBERS, {
                  tenant_id: String(tenantId),
                  team_id:   String(team.ROWID),
                  user_id:   String(member.ROWID),
                  role:      pick(TEAM_MEMBER_ROLES, rand),
                });
              } catch (_) {}
            }
            created++;
          } catch (_) { failed++; }
        }
        report.teams = { requested: count, created, failed };
      }

      // ── Time Entries + Approval Requests ──────────────────────────────────────
      if (modules.time_entries > 0) {
        const count = Math.min(MAX, modules.time_entries);
        let created = 0, failed = 0, approvalsCreated = 0;

        // Fetch all tasks so we can link time entries to real task IDs
        const allTasks = await this.db.findWhere(TABLES.TASKS, tenantId, '', { limit: 200 });
        // Build index: projectId -> tasks in that project (for fast lookup)
        const tasksByProject = {};
        for (const t of allTasks) {
          const pid = String(t.project_id);
          if (!tasksByProject[pid]) tasksByProject[pid] = [];
          tasksByProject[pid].push(t);
        }

        // Current week bounds (Mon–Sun) so "my week" view has data
        const _now  = new Date();
        const _day  = _now.getDay(); // 0=Sun
        const _mon  = new Date(_now);
        _mon.setDate(_now.getDate() - (_day === 0 ? 6 : _day - 1));
        _mon.setHours(0,0,0,0);
        const weekStart = _mon.toISOString().split('T')[0];
        const weekEnd   = new Date(_mon.getTime() + 6 * 86400000).toISOString().split('T')[0];

        for (let i = 0; i < count; i++) {
          const rand    = rng(Date.now() + i * 1201 + 12);
          try {
            const user    = pick(users, rand);
            const project = projects.length > 0 ? pick(projects, rand) : null;
            const hours   = parseFloat((0.5 + rand() * 7.5).toFixed(1));

            // Pick a real task from this project if available (70% chance); else no task
            const projectTasks = project ? (tasksByProject[String(project.ROWID)] || []) : [];
            const task = projectTasks.length > 0 && rand() < 0.70 ? pick(projectTasks, rand) : null;

            // 30% of entries land in the current week so the "my week" view isn't empty
            const useThisWeek = rand() < 0.30;
            const entryDate   = useThisWeek
              ? dateInRange(weekStart, weekEnd, rand)
              : dateInRange(date_from, date_to, rand);

            // 40% SUBMITTED, 20% APPROVED, rest DRAFT
            const r      = rand();
            const status = r < 0.40 ? 'SUBMITTED' : r < 0.60 ? 'APPROVED' : 'DRAFT';

            // Use task title as description when linked to a task
            const description = task
              ? `${pick(TIME_DESCS, rand)} — ${task.title}`
              : pick(TIME_DESCS, rand);

            const row = await this.db.insert(TABLES.TIME_ENTRIES, {
              tenant_id:   String(tenantId),
              project_id:  String(project ? project.ROWID : 0),
              task_id:     String(task ? task.ROWID : 0),
              user_id:     String(user.ROWID),
              entry_date:  entryDate,
              hours,
              description,
              is_billable: rand() > 0.4 ? 'true' : 'false',
              status,
            });
            created++;

            // Accumulate logged_hours on the linked task
            if (task) {
              try {
                const currentLogged = parseFloat(task.logged_hours || 0);
                task.logged_hours = currentLogged + hours; // update local cache
                await this.db.update(TABLES.TASKS, { ROWID: String(task.ROWID), logged_hours: task.logged_hours });
              } catch (_) {}
            }

            // For SUBMITTED entries create an approval request assigned to the seeder (admin)
            if (status === 'SUBMITTED') {
              try {
                await this.db.insert(TABLES.TIME_APPROVAL_REQUESTS, {
                  tenant_id:     String(tenantId),
                  time_entry_id: String(row.ROWID),
                  requested_by:  String(user.ROWID),
                  assigned_to:   String(performedBy),
                  status:        'PENDING',
                });
                approvalsCreated++;
              } catch (_) {}
            }
          } catch (_) { failed++; }
        }
        const linkedToTask = allTasks.length > 0 ? Math.round(created * 0.70) : 0;
        report.time_entries   = { requested: count, created, failed, linked_to_task: linkedToTask };
        report.time_approvals = { created: approvalsCreated };
      }

      // ── User Profiles + Org Chart hierarchy ───────────────────────────────────
      if (modules.user_profiles) {
        let created = 0, updated = 0, failed = 0;

        // Fetch existing profiles for upsert
        const existingProfiles = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, '', { limit: 200 });
        const profileByUserId  = {};
        existingProfiles.forEach(p => { profileByUserId[String(p.user_id)] = p; });

        // Org tree: branching factor 3 — index 0 is the root (CEO/MD), rest report up
        const managerFor = (idx) => {
          if (idx === 0) return null;
          return users[Math.floor((idx - 1) / 3)];
        };

        for (let i = 0; i < users.length; i++) {
          const rand    = rng(i * 9733 + 13);
          const user    = users[i];
          const userId  = String(user.ROWID);
          const manager = managerFor(i);

          // Pick 3-5 random skills
          const skillCount = 3 + Math.floor(rand() * 3);
          const shuffled   = SKILLS_POOL.slice().sort(() => rand() - 0.5).slice(0, skillCount);

          const profileData = {
            tenant_id:         String(tenantId),
            user_id:           userId,
            department:        pick(DEPARTMENTS, rand),
            designation:       pick(DESIGNATIONS, rand),
            bio:               pick(BIOS, rand),
            photo_url:         '',
            resume_url:        '',
            is_profile_public: 'true',
            timezone:          pick(TIMEZONES, rand),
            ...(manager ? { reporting_manager_id: String(manager.ROWID) } : {}),
          };

          // JSON columns inserted separately — if they cause column errors the base profile still saves
          const jsonFields = {
            skills:         JSON.stringify(shuffled),
            experience:     '[]',
            certifications: '[]',
            social_links:   '{}',
          };

          try {
            const existing = profileByUserId[userId];
            if (existing) {
              await this.db.update(TABLES.USER_PROFILES, { ROWID: existing.ROWID, ...profileData, ...jsonFields });
              updated++;
            } else {
              // Try full insert first; fall back to minimal insert if JSON columns fail
              try {
                await this.db.insert(TABLES.USER_PROFILES, { ...profileData, ...jsonFields });
              } catch (_jsonErr) {
                await this.db.insert(TABLES.USER_PROFILES, profileData);
              }
              created++;
            }
          } catch (e) {
            console.error(`[DataSeedController] user_profiles failed for user ${userId}: ${e.message}`);
            failed++;
          }
        }
        report.user_profiles = { users: users.length, created, updated, failed };
      }

      // ── Badge Definitions + User Badge Awards ──────────────────────────────────
      if (modules.badges > 0) {
        const count = Math.min(MAX, modules.badges);
        let defsCreated = 0, awardsCreated = 0, failed = 0;

        // Upsert badge definitions (create once, reuse across runs)
        const existingDefs = await this.db.findWhere(TABLES.BADGE_DEFINITIONS, tenantId, '', { limit: 50 });
        const defByName    = {};
        existingDefs.forEach(d => { defByName[d.name] = d; });

        const badgeRowIds = [];
        for (const def of BADGE_DEFS) {
          try {
            if (defByName[def.name]) {
              badgeRowIds.push(String(defByName[def.name].ROWID));
            } else {
              const row = await this.db.insert(TABLES.BADGE_DEFINITIONS, {
                tenant_id:         String(tenantId),
                name:              def.name,
                category:          def.category,
                level:             def.level,
                description:       def.criteria,
                criteria:          def.criteria,
                is_auto_awardable: 'false',
                is_active:         'true',
                created_by:        String(performedBy),
              });
              badgeRowIds.push(String(row.ROWID));
              defsCreated++;
            }
          } catch (_) { failed++; }
        }

        // Award badges to random users
        for (let i = 0; i < count; i++) {
          const rand   = rng(Date.now() + i * 8191 + 99);
          const user   = pick(users, rand);
          const badgeId = pick(badgeRowIds, rand);
          if (!badgeId) { failed++; continue; }
          try {
            await this.db.insert(TABLES.USER_BADGES, {
              tenant_id:   String(tenantId),
              user_id:     String(user.ROWID),
              badge_id:    badgeId,
              awarded_by:  String(performedBy),
              reason:      pick(BADGE_AWARD_REASONS, rand),
              is_featured: rand() > 0.7 ? 'true' : 'false',
              is_public:   'true',
            });
            awardsCreated++;
          } catch (_) { failed++; }
        }
        report.badges = { requested: count, definitions: defsCreated, awarded: awardsCreated, failed };
      }

      // ── Leave Types + Balances + Requests ──────────────────────────────────────
      if (modules.leaves) {
        const year = String(new Date().getFullYear());

        // 1. Upsert leave type definitions (idempotent by code)
        const existingTypes = await this.db.findWhere(TABLES.LEAVE_TYPES, tenantId, `is_active = 'true'`, { limit: 50 });
        const typeByCode = {};
        existingTypes.forEach(t => { typeByCode[t.code] = t; });

        const leaveTypeRows = [];
        for (const def of LEAVE_TYPE_DEFS) {
          try {
            if (typeByCode[def.code]) {
              leaveTypeRows.push(typeByCode[def.code]);
            } else {
              const row = await this.db.insert(TABLES.LEAVE_TYPES, {
                tenant_id:          String(tenantId),
                name:               def.name,
                code:               def.code,
                days_per_year:      String(def.days_per_year),
                carry_forward_days: String(def.carry_forward_days),
                requires_approval:  'true',
                min_days:           String(def.min_days),
                max_days:           String(def.max_days),
                notice_days:        String(def.notice_days),
                is_paid:            def.is_paid,
                is_active:          'true',
                created_by:         String(performedBy),
              });
              leaveTypeRows.push(row);
            }
          } catch (_) {}
        }

        // 2. Upsert leave balances — one row per user × leave-type × year
        let balancesCreated = 0;
        for (const user of users) {
          const uid = String(user.ROWID);
          for (const lt of leaveTypeRows) {
            const ltId = String(lt.ROWID);
            try {
              const existing = await this.db.findWhere(TABLES.LEAVE_BALANCES, tenantId,
                `user_id = '${uid}' AND leave_type_id = '${ltId}' AND year = '${year}'`, { limit: 1 });
              const alloc = parseFloat(lt.days_per_year || LEAVE_TYPE_DEFS.find(d => d.code === lt.code)?.days_per_year || 12);
              const cf    = parseFloat(lt.carry_forward_days || 0);
              if (existing.length > 0) {
                // Only update if total_allocated is still 0 (never been set)
                if (!parseFloat(existing[0].total_allocated || 0)) {
                  await this.db.update(TABLES.LEAVE_BALANCES, { ROWID: String(existing[0].ROWID), total_allocated: alloc, opening_balance: cf, remaining_days: alloc });
                }
              } else {
                await this.db.insert(TABLES.LEAVE_BALANCES, {
                  tenant_id:       String(tenantId),
                  user_id:         uid,
                  leave_type_id:   ltId,
                  year,
                  total_allocated: alloc,
                  opening_balance: cf,
                  remaining_days:  alloc,
                  used_days:       0,
                  pending_days:    0,
                });
                balancesCreated++;
              }
            } catch (_) {}
          }
        }

        // 3. Seed leave requests — random past requests per user
        let reqCreated = 0, reqFailed = 0;
        const reqCount = Math.min(500, modules.leaves);
        for (let i = 0; i < reqCount; i++) {
          const rand     = rng(Date.now() + i * 7411 + 77);
          const user     = pick(users, rand);
          const lt       = pick(leaveTypeRows, rand);
          if (!lt) { reqFailed++; continue; }
          try {
            const startDate = dateInRange(date_from, date_to, rand);
            const days      = Math.floor(1 + rand() * 3); // 1–3 days
            const endMs     = new Date(startDate).getTime() + (days - 1) * 86400000;
            const endDate   = new Date(endMs).toISOString().split('T')[0];
            const status    = pick(['PENDING','APPROVED','APPROVED','APPROVED','REJECTED'], rand);
            await this.db.insert(TABLES.LEAVE_REQUESTS, {
              tenant_id:      String(tenantId),
              user_id:        String(user.ROWID),
              leave_type_id:  String(lt.ROWID),
              start_date:     startDate,
              end_date:       endDate,
              days_count:     days,
              reason:         pick(LEAVE_REASONS, rand),
              is_half_day:      rand() > 0.85 ? 'true' : 'false',
              half_day_session: 'MORNING',
              status,
              reviewer_notes: status === 'REJECTED' ? 'Insufficient team coverage during this period.' : '',
            });
            reqCreated++;
          } catch (_) { reqFailed++; }
        }

        report.leaves = {
          leave_types:    leaveTypeRows.length,
          balances_created: balancesCreated,
          requests_created: reqCreated,
          failed:           reqFailed,
          created:          reqCreated,
        };
      }

      // ── Attendance Records ─────────────────────────────────────────────────────
      if (modules.attendance > 0) {
        const days = Math.min(60, modules.attendance); // treat count as "days back to seed"
        let created = 0, failed = 0;

        // Build list of work-days (Mon–Fri) going back `days` calendar days from today
        const workDays = [];
        const todayMs = new Date();
        for (let d = 1; d <= days; d++) {
          const dt  = new Date(todayMs);
          dt.setDate(todayMs.getDate() - d);
          const dow = dt.getDay(); // 0=Sun 6=Sat
          if (dow === 0 || dow === 6) continue;
          workDays.push(dt.toISOString().split('T')[0]);
        }

        for (const user of users) {
          const uid = String(user.ROWID);
          for (const dateStr of workDays) {
            const rand = rng(parseInt(uid, 10) * 31337 + new Date(dateStr).getTime() / 86400000);
            // 10% chance the user is absent on any given day
            if (rand() < 0.10) continue;

            try {
              // Already exists? Skip.
              const exists = await this.db.findWhere(TABLES.ATTENDANCE_RECORDS, tenantId,
                `user_id = '${uid}' AND attendance_date = '${dateStr}'`, { limit: 1 });
              if (exists.length > 0) continue;

              const isWfh    = rand() < 0.30;
              const isLate   = rand() < 0.15;
              // Check-in: 08:30–10:30 (late if > 09:15)
              const ciHour   = isLate ? 9 + Math.floor(rand() * 2) : 8;
              const ciMin    = Math.floor(rand() * 60);
              const ciSec    = Math.floor(rand() * 60);
              // Check-out: 17:00–20:00
              const coHour   = 17 + Math.floor(rand() * 3);
              const coMin    = Math.floor(rand() * 60);
              const coSec    = Math.floor(rand() * 60);

              const pad = (n) => String(n).padStart(2, '0');
              const checkIn  = `${dateStr} ${pad(ciHour)}:${pad(ciMin)}:${pad(ciSec)}`;
              const checkOut = `${dateStr} ${pad(coHour)}:${pad(coMin)}:${pad(coSec)}`;
              const workHours = parseFloat(((coHour * 60 + coMin) - (ciHour * 60 + ciMin)) / 60).toFixed(2);

              const status = isWfh ? 'WFH' : isLate ? 'LATE' : 'PRESENT';

              await this.db.insert(TABLES.ATTENDANCE_RECORDS, {
                tenant_id:            String(tenantId),
                user_id:              uid,
                attendance_date:      dateStr,
                check_in_time:        checkIn,
                check_out_time:       checkOut,
                work_hours:           parseFloat(workHours),
                status,
                is_wfh:               isWfh ? 'true' : 'false',
                wfh_reason:           isWfh ? 'Working from home' : '',
                check_in_ip:          '10.0.0.1',
                is_location_verified: 'false',
                override_reason:      '',
              });
              created++;
            } catch (_) { failed++; }
          }
        }
        report.attendance = { days_back: days, users: users.length, created, failed };
      }

      const totalCreated = Object.values(report).reduce((s, r) => s + (r.created || 0), 0);
      return ResponseHelper.success(res, { report, totalCreated }, `Seeded ${totalCreated} records successfully`);
    } catch (err) {
      console.error('[DataSeedController.run]', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/data-seed/clear
   * Body: { modules: [...], confirm: true }
   */
  async clear(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { modules = [], confirm } = req.body;

      if (!confirm)
        return ResponseHelper.validationError(res, 'Must set confirm: true to clear data');

      const MODULE_TABLES = {
        projects:        TABLES.PROJECTS,
        actions:         TABLES.ACTIONS,
        blockers:        TABLES.BLOCKERS,
        standups:        TABLES.STANDUP_ENTRIES,
        eod:             TABLES.EOD_ENTRIES,
        milestones:      TABLES.MILESTONES,
        decisions:       TABLES.DECISIONS,
        risks:           TABLES.RISKS,
        issues:          TABLES.ISSUES,
        dependencies:    TABLES.DEPENDENCIES,
        assumptions:     TABLES.ASSUMPTIONS,
        sprints:         TABLES.SPRINTS,
        tasks:           TABLES.TASKS,
        teams:           TABLES.TEAMS,
        time_entries:    TABLES.TIME_ENTRIES,
        time_approvals:  TABLES.TIME_APPROVAL_REQUESTS,
        leave_types:     TABLES.LEAVE_TYPES,
        leave_requests:  TABLES.LEAVE_REQUESTS,
        leave_balances:  TABLES.LEAVE_BALANCES,
        attendance:      TABLES.ATTENDANCE_RECORDS,
        user_profiles:   TABLES.USER_PROFILES,
        badge_defs:      TABLES.BADGE_DEFINITIONS,
        badges:          TABLES.USER_BADGES,
      };

      const report = {};
      for (const mod of modules) {
        const table = MODULE_TABLES[mod];
        if (!table) continue;
        try {
          const rows = await this.db.findWhere(table, tenantId, '', { limit: 200 });
          let deleted = 0;
          for (const row of rows) {
            try { await this.db.delete(table, String(row.ROWID)); deleted++; } catch (_) {}
          }
          report[mod] = { deleted };
        } catch (e) {
          report[mod] = { error: e.message };
        }
      }

      return ResponseHelper.success(res, { report }, 'Selected modules cleared');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/data-seed/stats
   */
  async stats(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const counts = {};
      const MODULE_TABLES = {
        users:          TABLES.USERS,
        projects:       TABLES.PROJECTS,
        milestones:     TABLES.MILESTONES,
        actions:        TABLES.ACTIONS,
        blockers:       TABLES.BLOCKERS,
        decisions:      TABLES.DECISIONS,
        risks:          TABLES.RISKS,
        issues:         TABLES.ISSUES,
        dependencies:   TABLES.DEPENDENCIES,
        assumptions:    TABLES.ASSUMPTIONS,
        standups:       TABLES.STANDUP_ENTRIES,
        eod:            TABLES.EOD_ENTRIES,
        sprints:        TABLES.SPRINTS,
        tasks:          TABLES.TASKS,
        teams:          TABLES.TEAMS,
        time_entries:   TABLES.TIME_ENTRIES,
        time_approvals: TABLES.TIME_APPROVAL_REQUESTS,
        leave_types:    TABLES.LEAVE_TYPES,
        leave_requests: TABLES.LEAVE_REQUESTS,
        leave_balances: TABLES.LEAVE_BALANCES,
        attendance:     TABLES.ATTENDANCE_RECORDS,
        user_profiles:  TABLES.USER_PROFILES,
        badge_defs:     TABLES.BADGE_DEFINITIONS,
        badges:         TABLES.USER_BADGES,
      };
      for (const [key, table] of Object.entries(MODULE_TABLES)) {
        try { counts[key] = await this.db.countWhere(table, tenantId, ''); }
        catch (_) { counts[key] = 0; }
      }
      return ResponseHelper.success(res, { counts });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = DataSeedController;
