import React, { useState } from 'react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import {
  BookOpen, ChevronDown, ChevronRight, LayoutDashboard, FolderKanban,
  CheckSquare, GitBranch, ClipboardList, Clock, Users, Package,
  BarChart3, Sparkles, Shield, AlertTriangle, CalendarDays, Megaphone,
  Timer, Milestone, Settings, Search, Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  color: string;
  intro: string;
  items: {
    label: string;
    content: React.ReactNode;
  }[];
}

// ─── Accordion item ───────────────────────────────────────────────────────────

const AccordionItem = ({ label, content }: { label: string; content: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 text-left transition-colors"
      >
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-white border-t border-gray-100 text-sm text-gray-600 leading-relaxed space-y-2">
          {content}
        </div>
      )}
    </div>
  );
};

// ─── Tip box ──────────────────────────────────────────────────────────────────

const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-indigo-700 text-xs">
    <Info size={13} className="shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="flex gap-2.5">
    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
    <span>{children}</span>
  </div>
);

// ─── Documentation data ────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: 'dashboard',
    icon: <LayoutDashboard size={18} />,
    title: 'Dashboard',
    color: 'bg-blue-50 text-blue-600',
    intro: 'The Dashboard is your home screen — a real-time overview of project health, tasks, and key metrics for your organisation.',
    items: [
      {
        label: 'What you see on the Dashboard',
        content: (
          <>
            <p>The dashboard shows:</p>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li><strong>RAG Summary</strong> – count of projects by Red / Amber / Green status</li>
              <li><strong>Open Blockers & Actions</strong> – items needing attention</li>
              <li><strong>Recent Standup submissions</strong></li>
              <li><strong>Upcoming milestones</strong> in the next 30 days</li>
              <li><strong>Sprint velocity</strong> and task completion trends</li>
            </ul>
          </>
        ),
      },
      {
        label: 'Role differences',
        content: (
          <>
            <p><strong>TENANT_ADMIN / PMO / EXEC:</strong> See all projects and team-wide metrics.</p>
            <p><strong>DELIVERY_LEAD:</strong> See projects they are members of.</p>
            <p><strong>TEAM_MEMBER:</strong> See only tasks assigned to them and their project.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'projects',
    icon: <FolderKanban size={18} />,
    title: 'Projects',
    color: 'bg-purple-50 text-purple-600',
    intro: 'Projects are the top-level container for all work. Each project has sprints, tasks, milestones, and a team.',
    items: [
      {
        label: 'Creating a project',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Projects → All Projects</strong> and click <strong>New Project</strong>.</Step>
            <Step n={2}>Fill in: <strong>Name</strong> (required), <strong>Description</strong>, <strong>Start Date</strong>, <strong>End Date</strong>, and <strong>RAG Status</strong> (Green / Amber / Red).</Step>
            <Step n={3}>Click <strong>Create</strong>. You are automatically added as <strong>Delivery Lead</strong>.</Step>
            <Tip>RAG Status reflects the overall health: Green = on track, Amber = at risk, Red = critical issue.</Tip>
          </div>
        ),
      },
      {
        label: 'Project team / members',
        content: (
          <div className="space-y-2">
            <p>Open a project → <strong>Team</strong> tab to add members. Assign a role:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>DELIVERY_LEAD</strong> – manages the project day-to-day</li>
              <li><strong>TEAM_MEMBER</strong> – works on tasks in the project</li>
              <li><strong>CLIENT</strong> – read-only visibility</li>
            </ul>
            <Tip>Only users who have been invited to the platform (via Admin → Invite) can be added to projects.</Tip>
          </div>
        ),
      },
      {
        label: 'Updating RAG status',
        content: (
          <div className="space-y-2">
            <Step n={1}>Open the project detail page.</Step>
            <Step n={2}>Click the coloured RAG badge at the top.</Step>
            <Step n={3}>Select the new status and provide a <strong>reason</strong> (mandatory for audit trail).</Step>
          </div>
        ),
      },
      {
        label: 'Milestones',
        content: (
          <div className="space-y-2">
            <p>Milestones track major deliverables with a due date.</p>
            <Step n={1}>Inside a project go to the <strong>Milestones</strong> tab and click <strong>Add Milestone</strong>.</Step>
            <Step n={2}>Enter a <strong>Title</strong>, optional <strong>Description</strong>, and a <strong>Due Date</strong>.</Step>
            <Step n={3}>Mark milestones as <strong>COMPLETED</strong> when done.</Step>
            <Tip>Overdue milestones appear in red on the dashboard to flag risk.</Tip>
          </div>
        ),
      },
    ],
  },
  {
    id: 'sprints',
    icon: <GitBranch size={18} />,
    title: 'Sprints & Sprint Board',
    color: 'bg-green-50 text-green-600',
    intro: 'Sprints are time-boxed iterations (e.g. 2 weeks). The Sprint Board is a Kanban view of all tasks in a sprint.',
    items: [
      {
        label: 'Creating a sprint',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Projects → [Your Project] → Sprints</strong> or click <strong>Sprint Boards</strong> in the sidebar.</Step>
            <Step n={2}>Click <strong>New Sprint</strong>.</Step>
            <Step n={3}>Enter: <strong>Sprint Name</strong> (e.g. "Sprint 1"), <strong>Goal</strong>, <strong>Start Date</strong>, <strong>End Date</strong>, and optional <strong>Capacity Points</strong>.</Step>
            <Step n={4}>Click <strong>Create Sprint</strong>. Status starts as <strong>PLANNING</strong>.</Step>
            <Tip>Only one sprint can be ACTIVE at a time per project. Start it when you are ready to begin work.</Tip>
          </div>
        ),
      },
      {
        label: 'Starting and completing a sprint',
        content: (
          <div className="space-y-2">
            <p>In PLANNING status, click <strong>Start Sprint</strong> to make it ACTIVE. All team members are notified.</p>
            <p>When all work is done, click <strong>Complete Sprint</strong>. Velocity is calculated from story points of DONE tasks.</p>
          </div>
        ),
      },
      {
        label: 'Creating tasks on the Sprint Board',
        content: (
          <div className="space-y-2">
            <Step n={1}>Click the <strong>+ Add Task</strong> button in any column (TODO, IN_PROGRESS, IN_REVIEW, DONE).</Step>
            <Step n={2}>Fill in: <strong>Title</strong> (required), <strong>Description</strong>, <strong>Type</strong> (Task / Story / Bug / Epic), <strong>Priority</strong>, <strong>Assignees</strong> (multi-select), <strong>Story Points</strong>, <strong>Due Date</strong>.</Step>
            <Step n={3}>Click <strong>Create Task</strong>.</Step>
            <Tip>Assignees must be users invited to the platform. Select them from the dropdown. Multiple assignees are supported.</Tip>
          </div>
        ),
      },
      {
        label: 'Moving tasks between columns',
        content: (
          <p>Drag a task card from one column to another, or open the task and change the <strong>Status</strong> field in the edit form. Both update the database immediately.</p>
        ),
      },
      {
        label: 'Editing a task',
        content: (
          <div className="space-y-2">
            <Step n={1}>Click the <strong>Edit</strong> (pencil) icon on a task card or open the task detail and click Edit.</Step>
            <Step n={2}>Update any fields including reassigning to different team members.</Step>
            <Step n={3}>Click <strong>Save Changes</strong>.</Step>
            <Tip>If you clear the Assignees list and save, the task becomes unassigned. Make sure you keep assignees selected if you want them to see the task in their My Tasks.</Tip>
          </div>
        ),
      },
      {
        label: 'Task types explained',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>TASK</strong> – Standard work item</li>
            <li><strong>STORY</strong> – User-facing feature (Agile user story)</li>
            <li><strong>BUG</strong> – A defect to be fixed</li>
            <li><strong>EPIC</strong> – Large body of work broken into smaller tasks</li>
            <li><strong>SUBTASK</strong> – Child of another task</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: 'mytasks',
    icon: <CheckSquare size={18} />,
    title: 'My Tasks',
    color: 'bg-indigo-50 text-indigo-600',
    intro: 'My Tasks is your personal task inbox — shows every task assigned to you or created by you across all projects.',
    items: [
      {
        label: 'How tasks appear here',
        content: (
          <div className="space-y-2">
            <p>A task appears in My Tasks if:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Your user ID is in the task's <strong>Assignees</strong> list, OR</li>
              <li>You <strong>created</strong> the task</li>
            </ul>
            <Tip>Tasks with status CANCELLED are hidden. All other statuses (TODO, IN_PROGRESS, IN_REVIEW, DONE) are shown.</Tip>
          </div>
        ),
      },
      {
        label: 'Creating a task from My Tasks',
        content: (
          <div className="space-y-2">
            <Step n={1}>Click <strong>New Task</strong> (top right).</Step>
            <Step n={2}>Select the <strong>Project</strong> (required).</Step>
            <Step n={3}>Fill in Title, Description, Priority, Assignees, Due Date, Story Points.</Step>
            <Step n={4}>Click <strong>Create Task</strong>.</Step>
            <Tip>Admins and Delivery Leads can assign tasks to any team member. The assigned users will see the task in their My Tasks view.</Tip>
          </div>
        ),
      },
      {
        label: 'Task detail panel',
        content: (
          <div className="space-y-2">
            <p>Click any task to open the detail panel on the right. Tabs available:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Activity</strong> – comments thread; add a comment and press Post (or Ctrl+Enter)</li>
              <li><strong>Time Log</strong> – log hours worked on this specific task</li>
              <li><strong>AI Insights</strong> – AI-generated summary and suggestions for the task</li>
            </ul>
          </div>
        ),
      },
      {
        label: 'Filtering tasks',
        content: (
          <p>Use the <strong>Status</strong>, <strong>Priority</strong>, and <strong>Project</strong> filter pills at the top of the page to narrow down your task list. The search box filters by task title.</p>
        ),
      },
    ],
  },
  {
    id: 'backlog',
    icon: <ClipboardList size={18} />,
    title: 'Backlog',
    color: 'bg-orange-50 text-orange-600',
    intro: 'The Backlog holds all tasks not yet assigned to a sprint. Use it to plan future work.',
    items: [
      {
        label: 'Managing the backlog',
        content: (
          <div className="space-y-2">
            <p>Tasks in the backlog have <strong>sprint_id = 0</strong> (no sprint). From here you can:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Create new tasks without a sprint assignment</li>
              <li>Drag tasks into a sprint to move them</li>
              <li>Prioritise by dragging items up/down</li>
            </ul>
            <Tip>When creating a sprint, move relevant backlog tasks into it before starting the sprint.</Tip>
          </div>
        ),
      },
    ],
  },
  {
    id: 'standup',
    icon: <ClipboardList size={18} />,
    title: 'Standup & EOD',
    color: 'bg-teal-50 text-teal-600',
    intro: 'Daily standup and end-of-day (EOD) reports keep the team aligned on what\'s happening each day.',
    items: [
      {
        label: 'Submitting a standup',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Daily Work → Standup</strong>.</Step>
            <Step n={2}>Answer the three questions: <strong>What did you do yesterday?</strong> / <strong>What will you do today?</strong> / <strong>Any blockers?</strong></Step>
            <Step n={3}>Click <strong>Submit Standup</strong>.</Step>
            <Tip>You can submit once per day. The team lead can see all submissions on the same page.</Tip>
          </div>
        ),
      },
      {
        label: 'Submitting an EOD report',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Daily Work → EOD</strong>.</Step>
            <Step n={2}>Summarise what you completed, what is pending, and any notes for tomorrow.</Step>
            <Step n={3}>Click <strong>Submit EOD</strong>.</Step>
          </div>
        ),
      },
    ],
  },
  {
    id: 'timetracking',
    icon: <Timer size={18} />,
    title: 'Time Tracking',
    color: 'bg-yellow-50 text-yellow-600',
    intro: 'Log hours worked on projects and tasks. View timesheets by week or month.',
    items: [
      {
        label: 'Logging a time entry',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Daily Work → Time Tracking</strong>.</Step>
            <Step n={2}>Click <strong>Log Time</strong>.</Step>
            <Step n={3}>Select <strong>Project</strong> (required), optional <strong>Task</strong>, enter <strong>Date</strong>, <strong>Hours</strong> (min 0.25), and a <strong>Description</strong>.</Step>
            <Step n={4}>Toggle <strong>Billable</strong> if this time is billable to the client.</Step>
            <Step n={5}>Click <strong>Submit</strong>.</Step>
            <Tip>One entry per day per project is allowed. If you need to add more hours to the same project on the same day, edit the existing entry.</Tip>
          </div>
        ),
      },
      {
        label: 'Timer (start/stop)',
        content: (
          <p>In the <strong>My Tasks</strong> task detail panel, click <strong>Start Timer</strong> to begin a running timer. Click <strong>Stop Timer</strong> to save the time as a log entry automatically.</p>
        ),
      },
      {
        label: 'Approving time entries (managers)',
        content: (
          <div className="space-y-2">
            <p>Admins and PMOs can see all time entries in the <strong>Time Tracking</strong> page under the <strong>Team</strong> tab.</p>
            <p>Select entries and click <strong>Approve</strong> to change their status from DRAFT to APPROVED.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'actions',
    icon: <CheckSquare size={18} />,
    title: 'Actions, Blockers & RAID',
    color: 'bg-red-50 text-red-600',
    intro: 'Track action items, blockers, risks, assumptions, issues, and decisions across all projects.',
    items: [
      {
        label: 'Actions',
        content: (
          <div className="space-y-2">
            <p>Actions are follow-up items from meetings or reviews. Each action has:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Title</strong> and description of what needs to be done</li>
              <li><strong>Owner</strong> – person responsible</li>
              <li><strong>Due Date</strong></li>
              <li><strong>Priority</strong> (Critical / High / Medium / Low)</li>
              <li><strong>Status</strong> (Open / In Progress / Done / Cancelled)</li>
            </ul>
          </div>
        ),
      },
      {
        label: 'Blockers',
        content: (
          <div className="space-y-2">
            <p>Blockers are impediments stopping progress. Log them here so leads can help resolve them.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Link to a <strong>Project</strong></li>
              <li>Set <strong>Impact</strong> (HIGH / MEDIUM / LOW)</li>
              <li>Assign a <strong>Resolution Owner</strong></li>
            </ul>
            <Tip>Open blockers are shown on the Dashboard to flag them to leadership immediately.</Tip>
          </div>
        ),
      },
      {
        label: 'RAID Register',
        content: (
          <div className="space-y-2">
            <p>RAID = Risks, Assumptions, Issues, Dependencies. Use the RAID Register to document project risks formally.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Risk</strong> – Something that might go wrong</li>
              <li><strong>Assumption</strong> – A belief being treated as fact</li>
              <li><strong>Issue</strong> – A problem that has already happened</li>
              <li><strong>Dependency</strong> – External dependency the project relies on</li>
            </ul>
            <p>Each entry has an <strong>Impact</strong>, <strong>Probability</strong>, <strong>Mitigation</strong> plan, and <strong>Owner</strong>.</p>
          </div>
        ),
      },
      {
        label: 'Decisions Log',
        content: (
          <p>Record key decisions made during the project with rationale, date, and who made the decision. This creates an audit trail for future reference.</p>
        ),
      },
    ],
  },
  {
    id: 'people',
    icon: <Users size={18} />,
    title: 'People — Attendance, Leave & Directory',
    color: 'bg-pink-50 text-pink-600',
    intro: 'Manage your team\'s presence, time off, and people information.',
    items: [
      {
        label: 'Marking attendance',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>People → Attendance</strong>.</Step>
            <Step n={2}>Click <strong>Mark Attendance</strong> for today.</Step>
            <Step n={3}>Select status: <strong>PRESENT</strong>, <strong>WFH</strong>, <strong>HALF_DAY</strong>, or <strong>ABSENT</strong>.</Step>
            <Tip>Attendance can be marked once per day. Admins can mark attendance on behalf of users.</Tip>
          </div>
        ),
      },
      {
        label: 'Applying for leave',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>People → Leave</strong>.</Step>
            <Step n={2}>Click <strong>Apply Leave</strong>.</Step>
            <Step n={3}>Select <strong>Leave Type</strong> (Annual / Sick / Personal / Unpaid), <strong>From Date</strong>, <strong>To Date</strong>, and a <strong>Reason</strong>.</Step>
            <Step n={4}>Submit. Your manager will see it as PENDING and can Approve or Reject.</Step>
          </div>
        ),
      },
      {
        label: 'Employee Directory',
        content: (
          <p>The <strong>Directory</strong> tab in People shows all active users with their role, department, skills, and contact info. Use the search bar to find colleagues. Badges and leaderboard scores are also displayed here.</p>
        ),
      },
      {
        label: 'Org Chart',
        content: (
          <p>The <strong>Org Chart</strong> shows the reporting hierarchy. Admins can set a user's manager via the <strong>Set Manager</strong> button on any user's card in the org chart view.</p>
        ),
      },
      {
        label: 'Announcements',
        content: (
          <div className="space-y-2">
            <p>Admins can publish announcements to:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>GLOBAL</strong> – everyone in the organisation</li>
              <li><strong>ROLE_TARGETED</strong> – specific roles only</li>
              <li><strong>USER_TARGETED</strong> – specific users only</li>
            </ul>
            <p>Announcements can be <strong>pinned</strong> (appear at the top) and have an optional <strong>expiry date</strong>.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'assets',
    icon: <Package size={18} />,
    title: 'Asset Management',
    color: 'bg-amber-50 text-amber-600',
    intro: 'Track company hardware, software licences, and other assets. Manage assignments, maintenance, and requests.',
    items: [
      {
        label: 'Adding an asset',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Assets</strong> and click <strong>Add Asset</strong>.</Step>
            <Step n={2}>Enter: <strong>Name</strong>, <strong>Asset Tag</strong> (unique ID), <strong>Category</strong> (Hardware / Software / Vehicle / Other), <strong>Serial Number</strong>, <strong>Purchase Date</strong>, <strong>Purchase Cost</strong>.</Step>
            <Step n={3}>Set <strong>Status</strong>: AVAILABLE, ASSIGNED, IN_MAINTENANCE, RETIRED.</Step>
          </div>
        ),
      },
      {
        label: 'Assigning an asset to a user',
        content: (
          <div className="space-y-2">
            <Step n={1}>Open the asset and click <strong>Assign</strong>.</Step>
            <Step n={2}>Select the <strong>User</strong> and an optional <strong>Return Date</strong>.</Step>
            <Step n={3}>Click <strong>Assign</strong>. The asset status changes to ASSIGNED.</Step>
          </div>
        ),
      },
      {
        label: 'Asset requests',
        content: (
          <p>Team members can request assets via <strong>Request Asset</strong>. Admins see pending requests in the <strong>Requests</strong> tab and can approve or reject them.</p>
        ),
      },
      {
        label: 'Maintenance scheduling',
        content: (
          <p>Log maintenance records for assets (date, description, cost, technician). Assets in maintenance are flagged as IN_MAINTENANCE and unavailable for assignment.</p>
        ),
      },
    ],
  },
  {
    id: 'reports',
    icon: <BarChart3 size={18} />,
    title: 'Reports & AI Insights',
    color: 'bg-cyan-50 text-cyan-600',
    intro: 'Generate project reports, track KPIs, and use AI to get instant insights on project health and risks.',
    items: [
      {
        label: 'Generating a report',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Reports & AI → Reports</strong>.</Step>
            <Step n={2}>Click <strong>New Report</strong>, select a <strong>Project</strong> and <strong>Report Type</strong> (Status / Sprint / Team Performance / Executive).</Step>
            <Step n={3}>Click <strong>Generate</strong>. The AI compiles the report from live project data.</Step>
            <Step n={4}>Share the report via the <strong>Share</strong> link — it's publicly accessible without login.</Step>
          </div>
        ),
      },
      {
        label: 'AI Insights',
        content: (
          <div className="space-y-2">
            <p>Go to <strong>Reports & AI → AI Insights</strong> to get AI-generated analysis:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Project health summaries</li>
              <li>Risk identification from RAID items and overdue tasks</li>
              <li>Sprint velocity trends</li>
              <li>Team workload analysis</li>
            </ul>
            <Tip>AI Insights also appear on individual tasks (in the task detail panel) and the CEO / CTO dashboards.</Tip>
          </div>
        ),
      },
      {
        label: 'CEO & CTO Dashboards',
        content: (
          <div className="space-y-2">
            <p><strong>CEO Dashboard</strong> – Executive portfolio view: project RAG overview, financial metrics, resource utilisation, strategic KPIs.</p>
            <p><strong>CTO Dashboard</strong> – Technical health view: sprint velocity, code quality metrics, technical debt items, deployment frequency.</p>
            <Tip>These dashboards are visible to TENANT_ADMIN, PMO, EXEC, and DELIVERY_LEAD roles only.</Tip>
          </div>
        ),
      },
      {
        label: 'Enterprise Reports',
        content: (
          <p>Enterprise Reports provide cross-project analytics: utilisation heatmaps, budget vs actuals, team performance trends, and portfolio-level risk summaries. Export to PDF or share a link.</p>
        ),
      },
    ],
  },
  {
    id: 'admin',
    icon: <Settings size={18} />,
    title: 'Administration',
    color: 'bg-gray-100 text-gray-600',
    intro: 'Manage users, roles, and platform configuration. Only TENANT_ADMIN can access this section.',
    items: [
      {
        label: 'Inviting a new user',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Administration → User Management</strong>.</Step>
            <Step n={2}>Click <strong>Invite User</strong>.</Step>
            <Step n={3}>Enter their <strong>Email</strong> and select a <strong>Role</strong>:</Step>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li><strong>TENANT_ADMIN</strong> – Full access, can manage everything</li>
              <li><strong>PMO</strong> – Programme Manager: sees all projects, generates reports</li>
              <li><strong>EXEC</strong> – Executive: read-only dashboards and reports</li>
              <li><strong>DELIVERY_LEAD</strong> – Project lead: manages their projects and team</li>
              <li><strong>TEAM_MEMBER</strong> – Developer/designer: works on assigned tasks</li>
              <li><strong>CLIENT</strong> – External: read-only view of selected projects</li>
            </ul>
            <Step n={4}>The user receives an email. When they first log in, they accept the invite and their account activates.</Step>
          </div>
        ),
      },
      {
        label: 'Config & Workflows',
        content: (
          <div className="space-y-2">
            <p>Go to <strong>Administration → Config & Workflows</strong> to configure:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Feature Flags</strong> – Enable or disable platform features per tenant</li>
              <li><strong>Custom Workflows</strong> – Define approval flows for leaves, assets, or reports</li>
              <li><strong>Custom Forms</strong> – Create additional data-capture forms for your organisation</li>
              <li><strong>Notification Settings</strong> – Control which events send email or in-app notifications</li>
            </ul>
          </div>
        ),
      },
      {
        label: 'Profile settings',
        content: (
          <div className="space-y-2">
            <p>Each user can update their own profile via the avatar → <strong>Profile</strong> or <strong>Settings</strong>:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Update <strong>Name</strong>, <strong>Department</strong>, <strong>Job Title</strong>, <strong>Phone</strong></li>
              <li>Add <strong>Skills</strong> (shown on the Directory and Leaderboard)</li>
              <li>Upload a <strong>Profile Photo</strong> (avatar URL)</li>
              <li>Change <strong>Theme</strong> (light / dark / system)</li>
            </ul>
          </div>
        ),
      },
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const filtered = SECTIONS.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.intro.toLowerCase().includes(q) ||
      s.items.some((i) => i.label.toLowerCase().includes(q))
    );
  });

  return (
    <Layout>
      <Header title="Help & Documentation" subtitle="How to use every feature in Delivery Sync" />
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search documentation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          />
        </div>

        {/* Quick nav */}
        {!search && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSection(s.id);
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50 transition-colors text-center"
              >
                <span className={`p-2 rounded-lg ${s.color}`}>{s.icon}</span>
                <span className="text-[10px] font-medium text-gray-600 leading-tight">{s.title.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sections */}
        {filtered.map((section) => (
          <div key={section.id} id={`section-${section.id}`} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {/* Section header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <span className={`p-2 rounded-xl ${section.color}`}>{section.icon}</span>
              <div>
                <h2 className="text-base font-semibold text-gray-800">{section.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{section.intro}</p>
              </div>
            </div>
            {/* Items */}
            <div className="p-4 space-y-2">
              {section.items.map((item) => (
                <AccordionItem key={item.label} label={item.label} content={item.content} />
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No results for "{search}"</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
