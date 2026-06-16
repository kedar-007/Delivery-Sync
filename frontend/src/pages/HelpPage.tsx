import React, { useState } from 'react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useI18n } from '../contexts/I18nContext';
import {
  BookOpen, ChevronDown, ChevronRight, LayoutDashboard, FolderKanban,
  CheckSquare, GitBranch, ClipboardList, Users, Package,
  BarChart3, CalendarDays,
  Timer, Settings, Search, Info,
  Bell, Bot, Trophy, TrendingUp, Bug, Wifi, Lightbulb,
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
    <div className="border border-ds-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-ds-surface hover:bg-ds-surface-hover text-left transition-colors"
      >
        <span className="text-sm font-medium text-ds-text">{label}</span>
        {open ? <ChevronDown size={15} className="text-ds-text-muted shrink-0" /> : <ChevronRight size={15} className="text-ds-text-muted shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-ds-surface border-t border-ds-border text-sm text-ds-text-muted leading-relaxed space-y-2">
          {content}
        </div>
      )}
    </div>
  );
};

// ─── Reusable little widgets ──────────────────────────────────────────────────

const Tip = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex gap-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-lg px-3 py-2 text-indigo-700 dark:text-indigo-300 text-xs">
      <Info size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
};

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => {
  return (
    <div className="flex gap-2.5">
      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <span>{children}</span>
    </div>
  );
};

// `Example` block — used heavily across the doc to ground each concept in a
// concrete real-world scenario. Visually distinct from Tip so users learn the
// idea before reading the how-to steps.
const Example = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg px-3 py-2 text-emerald-800 dark:text-emerald-300 text-xs">
      <Lightbulb size={13} className="shrink-0 mt-0.5" />
      <div><strong className="font-semibold">Example:</strong> {children}</div>
    </div>
  );
};

// ─── Documentation data ───────────────────────────────────────────────────────
//
// Permission-driven model: the app uses only two real roles (TEAM_MEMBER and
// TENANT_ADMIN) and gates every capability through permissions assigned via
// org roles. The help text below describes WHAT each feature is and how to
// use it without naming any specific role — if you can see the menu item,
// you have permission to use it; if a button is hidden, your org role
// doesn't grant that capability and you should ask an admin.

const SECTIONS: Section[] = [
  // ─── Dashboard ────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    icon: <LayoutDashboard size={18} />,
    title: 'Dashboard',
    color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300',
    intro: 'Your home screen — a live overview of project health, work-in-flight, and what needs attention today.',
    items: [
      {
        label: 'What you see on the Dashboard',
        content: (
          <>
            <p>The dashboard pulls from every project you can see and shows:</p>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li><strong>RAG summary</strong> — count of projects by Red / Amber / Green health</li>
              <li><strong>Open blockers and actions</strong> assigned to you or your team</li>
              <li><strong>Recent standup and EOD submissions</strong></li>
              <li><strong>Upcoming milestones</strong> in the next 30 days</li>
              <li><strong>Sprint velocity</strong> and task-completion trends</li>
              <li><strong>Attendance widget</strong> with check-in / check-out and break tracking</li>
            </ul>
            <Example>
              You open the app at 9 AM. The dashboard tells you: <em>2 tasks due today</em>, <em>1 blocker raised overnight</em>, and <em>your sprint is 60% complete</em> — so you know exactly where to start.
            </Example>
          </>
        ),
      },
      {
        label: 'What each card means',
        content: (
          <>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>RAG cards</strong> — clicking <em>Red projects (3)</em> filters the Projects page to show only those three.</li>
              <li><strong>My Tasks</strong> — clicking a task opens the detail panel directly.</li>
              <li><strong>Standups missed</strong> — shows team members who haven't posted today; click a name to jump to their profile.</li>
            </ul>
            <Tip>Cards you don't have permission to view are hidden — your dashboard adapts to your access.</Tip>
          </>
        ),
      },
    ],
  },

  // ─── Projects ─────────────────────────────────────────────────────────────
  {
    id: 'projects',
    icon: <FolderKanban size={18} />,
    title: 'Projects',
    color: 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300',
    intro: 'The top-level container for any body of work. Everything else — sprints, tasks, milestones, blockers, decisions — lives inside a project.',
    items: [
      {
        label: 'What a Project is',
        content: (
          <>
            <p>A <strong>Project</strong> is a long-running effort with a team, a goal, and a start/end date. Use one project per deliverable or per client engagement, not per task.</p>
            <Example>
              "OpsPulse v2.0" is a project. It contains 6 sprints, 120 tasks, 4 milestones (Alpha, Beta, RC, GA), a dozen blockers raised and resolved, and a team of 8.
            </Example>
            <p>Each project tracks its own:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Team membership (who can see and work on it)</li>
              <li>RAG health (overall risk indicator)</li>
              <li>Sprints, tasks, milestones</li>
              <li>RAID register (Risks, Assumptions, Issues, Dependencies)</li>
              <li>Decisions log</li>
              <li>Standup and EOD submissions filtered to this project</li>
            </ul>
          </>
        ),
      },
      {
        label: 'Creating a project',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Projects → All Projects</strong> and click <strong>New Project</strong>.</Step>
            <Step n={2}>Fill in: <strong>Name</strong>, <strong>Description</strong>, <strong>Start Date</strong>, <strong>End Date</strong>, and initial <strong>RAG Status</strong>.</Step>
            <Step n={3}>Click <strong>Create</strong>. You're automatically added as the project owner and can invite team members next.</Step>
            <Tip>RAG: Green = on track, Amber = at risk but recoverable, Red = critical attention needed.</Tip>
          </div>
        ),
      },
      {
        label: 'Adding people to a project',
        content: (
          <div className="space-y-2">
            <p>Open the project and go to the <strong>Team</strong> tab.</p>
            <Step n={1}>Click <strong>Add Member</strong>.</Step>
            <Step n={2}>Search and pick someone from the platform's user list.</Step>
            <Step n={3}>Pick the project role — what they can do <em>inside this project</em>:</Step>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li><strong>Lead</strong> — manages the project day-to-day, can edit settings, add members, change RAG.</li>
              <li><strong>Member</strong> — works on tasks, submits standups, raises blockers.</li>
              <li><strong>Observer</strong> — read-only access to dashboards and reports.</li>
            </ul>
            <Tip>Only users already invited to the platform appear in the search. To invite a brand-new user, an admin must add them first via Administration → User Management.</Tip>
          </div>
        ),
      },
      {
        label: 'Updating the RAG status',
        content: (
          <div className="space-y-2">
            <Step n={1}>Open the project detail page.</Step>
            <Step n={2}>Click the coloured RAG chip next to the project name.</Step>
            <Step n={3}>Pick the new status and write a <strong>reason</strong> — this is logged for audit so leadership can see why health changed.</Step>
            <Example>
              You move from Green → Amber and write <em>"Key backend engineer on 2-week leave; sprint capacity reduced 30%"</em>. Six weeks later you can answer the question "why was June Amber?" without guessing.
            </Example>
          </div>
        ),
      },
      {
        label: 'Milestones inside a project',
        content: (
          <div className="space-y-2">
            <p>A <strong>Milestone</strong> is a major project checkpoint with a fixed target date — typically a release, demo, or external deadline.</p>
            <Example>
              "Beta release to pilot customers — June 15" is a milestone. It groups all the work that has to be done before that date. If June 1 arrives and 40% of the tasks tagged to this milestone are still TODO, your dashboard flags it red.
            </Example>
            <p>Add one via the project's <strong>Milestones</strong> tab → <strong>Add Milestone</strong>. Enter title, optional description, and due date. Mark <strong>COMPLETED</strong> when delivered.</p>
            <Tip>Only the milestone's creator, the assigned owner, or an admin can edit or change a milestone's status — this prevents team-mates from accidentally rewriting commitments made by leadership.</Tip>
          </div>
        ),
      },
    ],
  },

  // ─── Sprints & Sprint Board ───────────────────────────────────────────────
  {
    id: 'sprints',
    icon: <GitBranch size={18} />,
    title: 'Sprints & Sprint Board',
    color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300',
    intro: 'A Sprint is a short, time-boxed delivery cycle. The Sprint Board is the Kanban view that visualises a sprint\'s tasks in TODO → IN_PROGRESS → IN_REVIEW → DONE columns.',
    items: [
      {
        label: 'What a Sprint is',
        content: (
          <>
            <p>A <strong>Sprint</strong> is a fixed-length iteration (usually 1–2 weeks) where the team commits to completing a specific set of tasks. Sprints belong to a project and contain tasks.</p>
            <Example>
              "Sprint 12: Mobile checkout polish" runs from Mar 1 → Mar 14, contains 18 tasks totalling 34 story points, and has the goal: <em>"Ship one-tap reorder and Apple Pay improvements."</em>
            </Example>
          </>
        ),
      },
      {
        label: 'Creating a sprint',
        content: (
          <div className="space-y-2">
            <Step n={1}>From the project go to the <strong>Sprints</strong> tab (or click <strong>Sprint Boards</strong> in the sidebar).</Step>
            <Step n={2}>Click <strong>New Sprint</strong>.</Step>
            <Step n={3}>Enter sprint name (e.g. "Sprint 7"), goal, start/end dates, and optionally a capacity (story points the team can absorb).</Step>
            <Step n={4}>Click <strong>Create</strong>. The sprint starts in <strong>PLANNING</strong> status.</Step>
            <Tip>Only one sprint can be ACTIVE per project at a time. Click <strong>Start Sprint</strong> when you're ready to begin — team members are notified.</Tip>
          </div>
        ),
      },
      {
        label: 'Working on the Sprint Board',
        content: (
          <div className="space-y-2">
            <p>The board has four columns: <strong>TODO</strong>, <strong>IN_PROGRESS</strong>, <strong>IN_REVIEW</strong>, <strong>DONE</strong>.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Drag a card</strong> from one column to another to change its status.</li>
              <li><strong>+ Add Task</strong> at the top of any column to create a task directly there.</li>
              <li>Click a card to open the task detail panel (full description, time log, comments, AI insights).</li>
              <li>Use the timer button on the task detail to track time as you work.</li>
            </ul>
            <Example>
              You finish coding "Apple Pay integration", drag the card from IN_PROGRESS to IN_REVIEW. The task owner (a senior who created it) gets an email and a notification so they can review the PR.
            </Example>
          </div>
        ),
      },
      {
        label: 'Completing a sprint',
        content: (
          <div className="space-y-2">
            <p>When the sprint end date arrives and all work is finished, click <strong>Complete Sprint</strong>.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>The sprint moves to <strong>COMPLETED</strong> status.</li>
              <li>Velocity is computed as the sum of story points of all DONE tasks.</li>
              <li>Unfinished tasks (still TODO / IN_PROGRESS / IN_REVIEW) are <strong>not</strong> auto-moved — drag them to the next sprint manually or back to the backlog.</li>
            </ul>
          </div>
        ),
      },
    ],
  },

  // ─── My Tasks ─────────────────────────────────────────────────────────────
  {
    id: 'mytasks',
    icon: <CheckSquare size={18} />,
    title: 'My Tasks',
    color: 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
    intro: 'Your personal task inbox — every task assigned to you or created by you, across every project. The fastest way to see "what should I be working on?"',
    items: [
      {
        label: 'What a Task is',
        content: (
          <>
            <p>A <strong>Task</strong> is a single unit of work — a feature to build, a bug to fix, a chore to handle. It belongs to a project, optionally to a sprint, has assignees, status, priority, and a due date.</p>
            <Example>
              "Implement password-reset flow" is a Task. It sits in the <em>OpsPulse</em> project under <em>Sprint 7</em>, assigned to Priya, priority HIGH, due Friday, status IN_PROGRESS.
            </Example>
          </>
        ),
      },
      {
        label: 'How tasks appear here',
        content: (
          <>
            <p>A task shows up in <strong>My Tasks</strong> when either:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Your user ID is in the task's <strong>Assignees</strong> list, OR</li>
              <li>You <strong>created</strong> the task</li>
            </ul>
            <Tip>Tasks with status CANCELLED are hidden. Everything else (TODO / IN_PROGRESS / IN_REVIEW / DONE) is shown.</Tip>
          </>
        ),
      },
      {
        label: 'Creating a task',
        content: (
          <div className="space-y-2">
            <Step n={1}>Click <strong>New Task</strong> at the top right.</Step>
            <Step n={2}>Pick the <strong>Project</strong>.</Step>
            <Step n={3}>Fill in: <strong>Title</strong> (required), description, type (Task / Story / Bug / Epic / Subtask), priority, assignees, story points, due date.</Step>
            <Step n={4}>Click <strong>Create</strong>. Each assignee gets an email + in-app notification.</Step>
            <Tip>Multiple assignees are supported. The first assignee is treated as the primary owner for notifications and reminders.</Tip>
          </div>
        ),
      },
      {
        label: 'Editing a task',
        content: (
          <>
            <p>Open a task → click <strong>Edit</strong>. You can edit a task's details (title, description, due date, priority, assignees) only if you're the <strong>creator</strong> of the task or an admin.</p>
            <p>If you're just an assignee, you can still:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Change the <strong>status</strong> (move it through TODO → IN_PROGRESS → DONE)</li>
              <li>Log time against the task</li>
              <li>Post comments</li>
            </ul>
            <Tip>This rule prevents juniors from accidentally rewriting tasks that seniors raised — the original definition stays intact.</Tip>
          </>
        ),
      },
      {
        label: 'Task types — when to use which',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>TASK</strong> — standard work item, default choice.</li>
            <li><strong>STORY</strong> — user-facing feature framed from the user's perspective ("As a customer I want to…").</li>
            <li><strong>BUG</strong> — a defect to fix. Filter the board by BUG to triage backlog quality.</li>
            <li><strong>EPIC</strong> — a large body of work that spans multiple sprints, broken into smaller tasks.</li>
            <li><strong>SUBTASK</strong> — a child of another task, used for splitting work without a full new task card.</li>
          </ul>
        ),
      },
      {
        label: 'Task detail panel',
        content: (
          <>
            <p>Open any task to see tabs on the right:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Activity</strong> — comments thread; post updates so everyone stays in the loop.</li>
              <li><strong>Time Log</strong> — log hours worked on this specific task, or use the Start Timer button to track live.</li>
              <li><strong>AI Insights</strong> — an AI-generated summary, blockers detection, and suggestions.</li>
            </ul>
          </>
        ),
      },
    ],
  },

  // ─── Backlog ──────────────────────────────────────────────────────────────
  {
    id: 'backlog',
    icon: <ClipboardList size={18} />,
    title: 'Backlog',
    color: 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300',
    intro: 'The queue of tasks that aren\'t in a sprint yet. Use it to capture upcoming work and prioritise what gets pulled into the next sprint.',
    items: [
      {
        label: 'What the Backlog is',
        content: (
          <>
            <p>The <strong>Backlog</strong> is everything you want to do <em>eventually</em> but haven't committed to a sprint yet. Tasks here have no sprint assigned.</p>
            <Example>
              "Add SSO support" sits in the backlog for 3 sprints while higher-priority work ships first. When capacity opens up, you drag it into Sprint 14.
            </Example>
          </>
        ),
      },
      {
        label: 'Managing the backlog',
        content: (
          <>
            <ul className="list-disc pl-4 space-y-1">
              <li>Create tasks directly in the backlog when you don't know which sprint they'll land in.</li>
              <li>Drag a task from the backlog into a sprint to commit to it.</li>
              <li>Drag tasks up or down to re-order by priority.</li>
            </ul>
            <Tip>Run a short backlog-grooming session each week so the top of the list is always ready-to-pull. Tasks should have a clear title and a rough estimate before they leave the backlog.</Tip>
          </>
        ),
      },
    ],
  },

  // ─── Standup & EOD ────────────────────────────────────────────────────────
  {
    id: 'standup',
    icon: <ClipboardList size={18} />,
    title: 'Standup & EOD',
    color: 'bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300',
    intro: 'Daily standup at the start of the day, end-of-day report at the end. Keeps the team aligned without forcing a sync meeting.',
    items: [
      {
        label: 'What a Standup is',
        content: (
          <>
            <p>A <strong>Standup</strong> is a short daily check-in answering three questions:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>What did you do <strong>yesterday</strong>?</li>
              <li>What will you do <strong>today</strong>?</li>
              <li>Any <strong>blockers</strong>?</li>
            </ul>
            <Example>
              At 9:30 AM Priya posts: <em>Yesterday — Finished password reset API. Today — Wire it to the email service. Blockers — Need SMTP credentials for the test environment.</em> Her lead sees the blocker before lunch and unblocks her.
            </Example>
          </>
        ),
      },
      {
        label: 'Submitting a standup',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Daily Work → Standup</strong>.</Step>
            <Step n={2}>Pick the project, fill in yesterday / today / blockers.</Step>
            <Step n={3}>Click <strong>Submit Standup</strong>.</Step>
            <Tip>You can backdate up to 7 days if you forgot to submit. Future-dated entries are blocked. You can also dictate via the voice input button instead of typing.</Tip>
          </div>
        ),
      },
      {
        label: 'EOD reports',
        content: (
          <div className="space-y-2">
            <p>An <strong>EOD</strong> is your evening summary — what you finished, what's still in flight, blockers, and any notes for tomorrow.</p>
            <Step n={1}>Go to <strong>Daily Work → EOD</strong>.</Step>
            <Step n={2}>Fill in the form. The AI auto-fill button can pre-populate today's accomplishments from your task activity.</Step>
            <Step n={3}>Click <strong>Submit</strong>.</Step>
            <Example>
              You log 8 hours of work, mark 2 tasks DONE, and note <em>"PR up for review, needs approval from architecture for the schema change"</em>. Your manager reads it overnight and approves first thing the next morning.
            </Example>
          </div>
        ),
      },
      {
        label: 'Team Standups view',
        content: (
          <>
            <p>If you have the <strong>view team standups</strong> capability, the <strong>Team Standups</strong> tab shows submissions from peers in teams you're in or lead.</p>
            <p>Use the filter bar at the top to narrow by:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Date — Today / Yesterday / This Week / custom range</li>
              <li>Project</li>
              <li>Team member</li>
            </ul>
            <Tip>Long histories paginate automatically. Use the rows-per-page selector to control how many entries you see at once.</Tip>
          </>
        ),
      },
    ],
  },

  // ─── Time Tracking ────────────────────────────────────────────────────────
  {
    id: 'timetracking',
    icon: <Timer size={18} />,
    title: 'Time Tracking',
    color: 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-300',
    intro: 'Log hours worked against projects and tasks. Supports manual entry, live timers, and approval workflow for billable hours.',
    items: [
      {
        label: 'Logging a time entry',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Daily Work → Time Tracking</strong>.</Step>
            <Step n={2}>Click <strong>Log Time</strong>.</Step>
            <Step n={3}>Pick a <strong>Project</strong>, then the specific <strong>Task</strong> (mandatory).</Step>
            <Step n={4}>Enter the <strong>date</strong>, <strong>hours</strong> (minimum 0.25), and a <strong>description</strong> of what you did.</Step>
            <Step n={5}>Toggle <strong>Billable</strong> if these hours bill back to a client.</Step>
            <Step n={6}>Click <strong>Submit</strong>.</Step>
            <Example>
              Tuesday afternoon you spent 3.5 hours pairing on the checkout bug. You log: project = <em>OpsPulse Web</em>, task = <em>Fix Stripe 3DS retry</em>, hours = 3.5, description = <em>Reproduced + fixed retry loop, pair with Aman</em>, billable = on.
            </Example>
          </div>
        ),
      },
      {
        label: 'Using the live timer',
        content: (
          <>
            <p>In any task's detail panel click <strong>Start Timer</strong> to begin a running clock. The timer keeps going across page navigation. Click <strong>Stop Timer</strong> when you're done — a time entry is created with the elapsed duration automatically pre-filled. You can edit before saving.</p>
            <Tip>The timer survives accidental browser refresh — it picks up the previous start time. Don't worry if you forget to stop it overnight; you'll be prompted to adjust the duration.</Tip>
          </>
        ),
      },
      {
        label: 'Approving time entries',
        content: (
          <p>If you have the time approval capability, the <strong>Approvals</strong> tab shows entries submitted by your team. Review the description, hours, and billable status, then approve or reject. Approved entries lock so the submitter can't edit them retroactively.</p>
        ),
      },
      {
        label: 'Filtering & pagination',
        content: (
          <p>The My Time Log tab supports date presets (Today / Yesterday / This Week / All Time), custom ranges, project filter, status filter, and pagination with a rows-per-page selector. Use the <strong>Clear filters</strong> button to reset everything in one click.</p>
        ),
      },
    ],
  },

  // ─── Actions, Blockers, RAID, Decisions ───────────────────────────────────
  {
    id: 'actions',
    icon: <CheckSquare size={18} />,
    title: 'Actions, Blockers, RAID & Decisions',
    color: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300',
    intro: 'Four artefact types that record different aspects of project life — follow-ups, impediments, risk register, and key choices. Together they give leadership the audit trail they need.',
    items: [
      {
        label: 'Actions — follow-ups from meetings or reviews',
        content: (
          <>
            <p>An <strong>Action</strong> is a commitment captured from a discussion: a meeting, a review, a retro. Different from a Task in that it's about a <em>specific commitment</em> rather than build work — though it can lead to a task.</p>
            <Example>
              Sprint retro on Friday: the team agrees <em>"DevOps must run a load test on the checkout endpoint before next deploy."</em> You log an Action: owner = DevOps lead, due = next Wednesday, priority = HIGH. The owner gets emailed, the action shows on their dashboard, and on Wednesday you can see if it was done.
            </Example>
            <p>Action fields: title, description, owner, due date, priority (Critical / High / Medium / Low), status (Open / In Progress / Done / Cancelled).</p>
            <Tip>Only the action's creator, the assignee, or an admin can edit an action. Delete is restricted to the creator or admin — even the assignee can't make an action disappear out from under the person who raised it.</Tip>
          </>
        ),
      },
      {
        label: 'Blockers — impediments to flag urgently',
        content: (
          <>
            <p>A <strong>Blocker</strong> is anything stopping work from progressing. Log them as soon as they appear so leads can help unblock fast.</p>
            <Example>
              Wednesday morning: <em>"Waiting on legal review of T&Cs draft — blocks launch of new pricing page."</em> You raise a Blocker with Impact = HIGH, owner = Legal, related project = <em>Pricing Refresh</em>. It pops on the lead's dashboard immediately.
            </Example>
            <p>Each blocker has: title, description, impact (HIGH / MEDIUM / LOW), resolution owner, status.</p>
            <Tip>Open blockers surface on the main dashboard with a red counter so leadership notices them within minutes, not days.</Tip>
          </>
        ),
      },
      {
        label: 'RAID Register — formal risk tracking',
        content: (
          <>
            <p><strong>RAID</strong> = Risks, Assumptions, Issues, Dependencies. Use the register on bigger / regulated projects where you need a documented risk trail.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Risk</strong> — something that <em>might</em> go wrong. <Example>"Key dev planning to leave in 4 weeks — sprint 14 may slip if knowledge transfer doesn't happen."</Example></li>
              <li><strong>Assumption</strong> — a belief being treated as fact, not yet validated. <Example>"Assuming users will tolerate a 2-second page load — we have no UX research to confirm this yet."</Example></li>
              <li><strong>Issue</strong> — something that <em>has</em> already gone wrong. <Example>"Payment provider had a 4-hour outage on Apr 12, blocked all checkouts."</Example></li>
              <li><strong>Dependency</strong> — reliance on someone else delivering first. <Example>"Need DevOps to provision the new database cluster by sprint end before we can run migrations."</Example></li>
            </ul>
            <p>Each entry has probability, impact, mitigation plan, owner, and status. Only the creator, the assigned owner, or an admin can edit a RAID entry — protects the audit trail from accidental rewrites.</p>
          </>
        ),
      },
      {
        label: 'Decisions Log — record the why',
        content: (
          <>
            <p>The <strong>Decisions Log</strong> records significant choices made during the project along with the rationale. Future-you and new joiners thank present-you.</p>
            <Example>
              <em>"Apr 12 — Decided to use Postgres instead of MongoDB. Reason: relational data with strong tenant isolation; ops team already operates Postgres. Decided by: Tech Lead. Alternatives considered: MongoDB, DynamoDB."</em>
            </Example>
            <p>Fields: title, description, decision date, rationale, impact, status. Only the decision owner or an admin can amend a decision after it's logged.</p>
          </>
        ),
      },
    ],
  },

  // ─── People ───────────────────────────────────────────────────────────────
  {
    id: 'people',
    icon: <Users size={18} />,
    title: 'People — Attendance, Leave & Directory',
    color: 'bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-300',
    intro: 'Manage attendance, time off, work-from-home requests, the employee directory, and the org chart.',
    items: [
      {
        label: 'Attendance — check-in / check-out / breaks',
        content: (
          <div className="space-y-2">
            <p>The attendance widget tracks your working day: clock-in, clock-out, lunch break, short breaks.</p>
            <Step n={1}>Click <strong>Check In</strong> when you start the day.</Step>
            <Step n={2}>Click <strong>Lunch</strong> or <strong>Short Break</strong> to pause; click again to resume.</Step>
            <Step n={3}>Click <strong>Check Out</strong> when you're done.</Step>
            <Tip>The header shows a live timer of total worked time so you always know your hours. A warning appears if you try to check out — once you do, you can't check in again the same day, so use breaks for short pauses instead.</Tip>
          </div>
        ),
      },
      {
        label: 'Leave requests',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>People → Leave</strong>.</Step>
            <Step n={2}>Click <strong>Apply Leave</strong>.</Step>
            <Step n={3}>Pick leave type (Annual / Sick / Personal / Unpaid), from-date, to-date, and a reason.</Step>
            <Step n={4}>Submit. Your manager sees it in their Approvals queue.</Step>
            <Example>
              You apply for 3 days annual leave: Aug 10–12, reason = <em>"Family wedding."</em> Manager approves the same day. Your balance auto-decreases by 3 days.
            </Example>
            <p>While the request is PENDING you can cancel it yourself. Once APPROVED, only an admin can revoke it.</p>
          </div>
        ),
      },
      {
        label: 'WFH requests',
        content: (
          <p>Different from leave — you're still working, just from home. Same flow: pick the date, write a reason, submit. Lead approves or rejects.</p>
        ),
      },
      {
        label: 'Employee Directory',
        content: (
          <p>The Directory tab lists every active user with their role, department, skills, contact info, badges, and leaderboard position. Use the search bar to find a colleague — handy when you need to know who owns what skill or who to ping about an area.</p>
        ),
      },
      {
        label: 'Org Chart',
        content: (
          <p>Shows the reporting hierarchy as a tree. Admins can set a user's manager via the <strong>Set Manager</strong> button on any user's card. This drives the Subordinates data scope — managers can see their direct reports' standups, time logs, and tasks.</p>
        ),
      },
      {
        label: 'Announcements',
        content: (
          <>
            <p>Admins can publish announcements visible across the platform:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Global</strong> — everyone in the org</li>
              <li><strong>Role-targeted</strong> — only users with specific roles see it</li>
              <li><strong>User-targeted</strong> — specific users only</li>
            </ul>
            <p>Announcements can be pinned (always at the top) and given an expiry date so they auto-disappear.</p>
            <Example>
              Pin a global announcement: <em>"Office closed Friday Jul 4 for the public holiday."</em> Expires Saturday so it doesn't clutter the bell afterward.
            </Example>
          </>
        ),
      },
    ],
  },

  // ─── Assets ───────────────────────────────────────────────────────────────
  {
    id: 'assets',
    icon: <Package size={18} />,
    title: 'Asset Management',
    color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
    intro: 'Track company hardware, software licences, and other assets. Handle assignments, requests, returns, and maintenance.',
    items: [
      {
        label: 'What an Asset is',
        content: (
          <>
            <p>An <strong>Asset</strong> is any company-owned item that needs to be tracked — laptops, monitors, phones, headsets, software licences, vehicles, access cards.</p>
            <Example>
              A 14-inch MacBook Pro, asset tag <em>FT-LAP-0142</em>, serial <em>C02XK1ABCDEF</em>, bought Jun 2023 for ₹2,10,000, currently assigned to Priya, returnable on her last working day.
            </Example>
          </>
        ),
      },
      {
        label: 'Adding an asset',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Assets</strong> → <strong>Add Asset</strong>.</Step>
            <Step n={2}>Fill in name, asset tag (must be unique), category (Hardware / Software / Vehicle / Other), serial number, purchase date, purchase cost.</Step>
            <Step n={3}>Set initial status: AVAILABLE / ASSIGNED / IN_MAINTENANCE / RETIRED.</Step>
          </div>
        ),
      },
      {
        label: 'Assigning to a user',
        content: (
          <div className="space-y-2">
            <Step n={1}>Open the asset and click <strong>Assign</strong>.</Step>
            <Step n={2}>Pick the user and optionally a return date.</Step>
            <Step n={3}>Click <strong>Assign</strong>. Status changes to ASSIGNED, and the user sees the asset on their profile.</Step>
          </div>
        ),
      },
      {
        label: 'Asset requests',
        content: (
          <p>Anyone can request an asset via <strong>Request Asset</strong> — say which item or category and why. Admins see pending requests in the Requests tab and approve or reject. The user is notified either way.</p>
        ),
      },
      {
        label: 'Maintenance log',
        content: (
          <p>Log maintenance records on any asset (date, description, cost, technician). While in maintenance, the asset shows as IN_MAINTENANCE and can't be assigned out.</p>
        ),
      },
    ],
  },

  // ─── Reports & AI ─────────────────────────────────────────────────────────
  {
    id: 'reports',
    icon: <BarChart3 size={18} />,
    title: 'Reports & AI Insights',
    color: 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
    intro: 'Generate project reports, view AI-driven insights, and share executive-friendly summaries.',
    items: [
      {
        label: 'Generating a report',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Reports & AI → Reports</strong>.</Step>
            <Step n={2}>Click <strong>New Report</strong>, pick a project and report type (Status / Sprint / Team Performance / Executive).</Step>
            <Step n={3}>Click <strong>Generate</strong>. The AI compiles the report from live project data — sprint velocity, RAID items, blockers, milestones, team workload.</Step>
            <Step n={4}>Share the report via the public share link (no login needed) or export to PDF.</Step>
            <Example>
              Friday afternoon you generate a <em>"Sprint Status Report"</em> for Sprint 12. The AI summarises completion %, key risks, top blockers, and notable wins. You paste the share link in the stakeholder email — they open it on a phone, no login.
            </Example>
          </div>
        ),
      },
      {
        label: 'AI Insights',
        content: (
          <>
            <p>Reports & AI → <strong>AI Insights</strong> gives you on-demand analysis powered by the LLM:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Project health summaries written in plain English</li>
              <li>Risk identification from overdue tasks, open blockers, and RAID items</li>
              <li>Sprint velocity trends with anomaly callouts</li>
              <li>Team workload distribution and burnout warnings</li>
            </ul>
            <Tip>AI insights also appear inline on individual task cards (under the AI Insights tab) and on the executive dashboards.</Tip>
          </>
        ),
      },
      {
        label: 'Executive Dashboards',
        content: (
          <>
            <p>Two flavours, visible to users with the executive view capability:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>CEO Dashboard</strong> — portfolio-wide RAG, financial summary, resource utilisation, KPIs.</li>
              <li><strong>CTO Dashboard</strong> — sprint velocity across all teams, code quality signals, tech debt, deployment cadence.</li>
            </ul>
          </>
        ),
      },
      {
        label: 'Enterprise Reports',
        content: (
          <p>Cross-project analytics for portfolio-level reviews: utilisation heatmaps, budget vs actuals, team performance trends, portfolio-level risk summary. Exportable to PDF.</p>
        ),
      },
    ],
  },

  // ─── Team Analytics ───────────────────────────────────────────────────────
  {
    id: 'team-analytics',
    icon: <TrendingUp size={18} />,
    title: 'Team Analytics',
    color: 'bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300',
    intro: 'Detailed analytics about your team\'s velocity, workload, attendance, and delivery cadence.',
    items: [
      {
        label: 'What you can analyse',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Sprint velocity</strong> — story points completed per sprint, with trend line.</li>
            <li><strong>Task completion rate</strong> — % of tasks shipped within their due date.</li>
            <li><strong>Workload distribution</strong> — tasks and points per person, useful for spotting overload.</li>
            <li><strong>Standup / EOD submission rate</strong> — discipline indicator.</li>
            <li><strong>Blocker trends</strong> — count raised vs resolved per week.</li>
            <li><strong>Time logged vs estimated</strong> — actuals against the story-point estimates.</li>
          </ul>
        ),
      },
      {
        label: 'Individual breakdown',
        content: (
          <p>Click any team member's name in the workload chart to drill into their numbers: tasks assigned vs completed, average cycle time, attendance + leave summary, standup consistency. Useful for one-on-ones.</p>
        ),
      },
    ],
  },

  // ─── Notifications ────────────────────────────────────────────────────────
  {
    id: 'notifications',
    icon: <Bell size={18} />,
    title: 'Notifications',
    color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300',
    intro: 'Real-time in-app alerts plus emails for task assignments, blockers, sprint events, reminders, and more.',
    items: [
      {
        label: 'The notification bell',
        content: (
          <>
            <p>The <strong>bell icon</strong> in the top-right shows your unread count. Click to open the panel.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Unread notifications have a blue dot and are highlighted.</li>
              <li>Click the <strong>✓</strong> icon on a notification to mark it read.</li>
              <li>Click the <strong>trash</strong> icon to delete one.</li>
              <li>Click <strong>Mark all read</strong> to clear all unread at once.</li>
            </ul>
          </>
        ),
      },
      {
        label: 'Types of notifications',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Task Assignment</strong> — you've been assigned a new task.</li>
            <li><strong>Task Status Change</strong> — a task you created moved to a new status.</li>
            <li><strong>Blocker Added / Escalated</strong> — a blocker affecting your project.</li>
            <li><strong>Member Added</strong> — added to a new project or team.</li>
            <li><strong>Standup / EOD Reminder</strong> — daily nudge if you haven't submitted yet.</li>
            <li><strong>Action Overdue</strong> — an action item you own is past its due date.</li>
            <li><strong>Daily Summary</strong> — morning digest of pending items.</li>
          </ul>
        ),
      },
      {
        label: 'Mute the chime',
        content: (
          <p>Click the small bell icon inside the notification panel header to mute the audio. New notifications still arrive — only the chime is silenced. Your mute preference is saved per browser.</p>
        ),
      },
      {
        label: 'Real-time push',
        content: (
          <>
            <p>While you're active in the browser, new notifications stream in instantly — no refresh. A chime plays (unless muted), the badge updates automatically.</p>
            <Tip>Push needs browser permission. If you blocked it earlier, reset via Site Settings → Notifications in your browser.</Tip>
          </>
        ),
      },
    ],
  },

  // ─── AI Bot ───────────────────────────────────────────────────────────────
  {
    id: 'bot',
    icon: <Bot size={18} />,
    title: 'AI Bot / Assistant',
    color: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    intro: 'Chat with your project data in natural language. Ask questions, create tasks, get summaries — without clicking through menus.',
    items: [
      {
        label: 'Opening the bot',
        content: (
          <p>Click the <strong>robot icon</strong> in the top-right header. The bot already knows who you are, what tenant you're in, and what you can see — no setup needed.</p>
        ),
      },
      {
        label: 'What you can ask',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li><em>"What tasks are assigned to me?"</em> — lists your open tasks.</li>
            <li><em>"Summarise OpsPulse v2.0"</em> — health, blockers, sprint status.</li>
            <li><em>"Who hasn't submitted standup today?"</em> — attendance + standup status.</li>
            <li><em>"What's overdue on the Mobile project?"</em> — overdue tasks and actions.</li>
            <li><em>"How many hours did I log this week?"</em> — personal time summary.</li>
            <li><em>"Create a bug task in Sprint 3 of Mobile: Login crash on iOS 17, assigned to Aman, high priority, due Friday"</em> — bot drafts the task, you confirm.</li>
          </ul>
        ),
      },
      {
        label: 'Limitations',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li>The bot is read + create only — it can't delete or destructively change data.</li>
            <li>Answers are based on your live data at the moment you ask.</li>
            <li>Multi-step bulk actions (e.g. "move every TODO task to next sprint") need to be done manually.</li>
          </ul>
        ),
      },
    ],
  },

  // ─── Badges & Leaderboard ─────────────────────────────────────────────────
  {
    id: 'badges',
    icon: <Trophy size={18} />,
    title: 'Badges & Leaderboard',
    color: 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-300',
    intro: 'Earn badges for consistency and good engineering habits. Compete on the leaderboard.',
    items: [
      {
        label: 'How badges are earned',
        content: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Task Finisher</strong> — 10 / 50 / 100 tasks completed.</li>
            <li><strong>Standup Streak</strong> — 5 / 10 / 30 days of consecutive standup submissions.</li>
            <li><strong>EOD Streak</strong> — consistent EOD reporting.</li>
            <li><strong>Sprint MVP</strong> — most story points in a sprint.</li>
            <li><strong>Zero Blocker</strong> — completed a sprint without raising blockers.</li>
            <li><strong>Early Bird</strong> — 7 consecutive standups before 9 AM.</li>
            <li><strong>Time Tracker</strong> — time logged every working day for a week.</li>
          </ul>
        ),
      },
      {
        label: 'Leaderboard',
        content: (
          <div className="space-y-2">
            <p>Go to <strong>People → Directory → Leaderboard</strong>. Users are ranked by total badge points (badges have Bronze / Silver / Gold tiers with increasing weight).</p>
            <Tip>The leaderboard resets monthly. An all-time view is also available for long-term recognition.</Tip>
          </div>
        ),
      },
      {
        label: 'Your badge profile',
        content: (
          <p>Click your avatar → <strong>Profile</strong> to see your earned badges, current streaks, and rank. Badges are also displayed on your Directory card so colleagues can see your wins.</p>
        ),
      },
    ],
  },

  // ─── IP whitelisting ──────────────────────────────────────────────────────
  {
    id: 'ip-config',
    icon: <Wifi size={18} />,
    title: 'IP Whitelisting',
    color: 'bg-slate-50 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300',
    intro: 'Restrict platform access to approved IP addresses or networks. Only admins can configure this.',
    items: [
      {
        label: 'What it does',
        content: (
          <>
            <p>When enabled, only users connecting from <strong>whitelisted IPs or CIDR ranges</strong> can access the API. Everyone else is blocked at the gateway.</p>
            <Example>
              You whitelist <em>10.0.0.0/24</em> (office LAN) and <em>52.6.128.0/24</em> (VPN). A team member connecting from a café WiFi is blocked at the login step.
            </Example>
          </>
        ),
      },
      {
        label: 'Adding an IP rule',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Administration → IP Configuration</strong>.</Step>
            <Step n={2}>Click <strong>Add IP Rule</strong>.</Step>
            <Step n={3}>Enter a single IP (e.g. <code>203.0.113.42</code>) or a CIDR range (e.g. <code>10.0.0.0/24</code>).</Step>
            <Step n={4}>Add a label (e.g. <em>"Office VPN"</em>) and save.</Step>
          </div>
        ),
      },
      {
        label: 'Enabling whitelisting',
        content: (
          <>
            <p>Use the <strong>Enable IP Restrictions</strong> toggle at the top of the page. <strong>Before enabling</strong>, confirm your own current IP is already in the list — otherwise you'll lock yourself out.</p>
          </>
        ),
      },
    ],
  },

  // ─── Bug Reporting ────────────────────────────────────────────────────────
  {
    id: 'bug-reporting',
    icon: <Bug size={18} />,
    title: 'Bug Reporting',
    color: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300',
    intro: 'Found a platform issue? Send a structured bug report to the platform team directly from the app.',
    items: [
      {
        label: 'How to report a bug',
        content: (
          <div className="space-y-2">
            <Step n={1}>Click the <strong>bug icon</strong> in the top-right header.</Step>
            <Step n={2}>Describe what happened, what you expected, and which page is affected.</Step>
            <Step n={3}>Attach a screenshot if you have one.</Step>
            <Step n={4}>Click <strong>Submit Report</strong>.</Step>
            <Tip>Your browser, OS, and the current page URL are bundled automatically so the platform team can reproduce the issue.</Tip>
          </div>
        ),
      },
      {
        label: 'After you submit',
        content: (
          <p>The report goes to the platform support team. You'll get a confirmation email and can track the status from your Bug Reports tab. The support team can reply directly on the report — those replies arrive as in-app notifications.</p>
        ),
      },
    ],
  },

  // ─── Administration ───────────────────────────────────────────────────────
  {
    id: 'admin',
    icon: <Settings size={18} />,
    title: 'Administration',
    color: 'bg-ds-surface-hover text-ds-text-muted',
    intro: 'User management, org roles, permissions, workflows, and platform settings. Visible only to administrators.',
    items: [
      {
        label: 'How access control works',
        content: (
          <>
            <p>The platform uses a permission-based access model rather than rigid roles:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Org roles</strong> are defined per tenant (e.g. "Delivery Lead", "QA Engineer", "Finance Reviewer") — you choose the names.</li>
              <li>Each org role is granted a set of <strong>permissions</strong> (e.g. "create project", "approve leave", "view team standups").</li>
              <li>Users are assigned an org role, which gives them all that role's permissions. Individual overrides can grant or revoke specific permissions per user.</li>
            </ul>
            <Tip>If a button or menu item is hidden for you, it means your org role doesn't grant that permission. Ask an admin to either add the permission to your role or apply an individual override.</Tip>
          </>
        ),
      },
      {
        label: 'Inviting a new user',
        content: (
          <div className="space-y-2">
            <Step n={1}>Go to <strong>Administration → User Management</strong>.</Step>
            <Step n={2}>Click <strong>Invite User</strong>.</Step>
            <Step n={3}>Enter the email and select an <strong>org role</strong> from your tenant's list (or leave as default).</Step>
            <Step n={4}>Send. The user receives an email and activates their account on first login.</Step>
            <Example>
              You invite <em>finance@yourorg.com</em> with org role <em>"Finance Reviewer"</em>. That role only has the time-approval and reports-view permissions — so the user can review timesheets and read reports but can't create projects or edit tasks.
            </Example>
          </div>
        ),
      },
      {
        label: 'Org roles & permissions',
        content: (
          <>
            <p>Go to <strong>Administration → Org Roles</strong>:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Create / edit roles</strong> — name them after your org's reality (Project Manager, Tech Lead, Junior Engineer, etc.)</li>
              <li><strong>Permissions</strong> — check the boxes for each capability the role should have, grouped by module (Projects, Tasks, Time, People, Admin…).</li>
              <li><strong>Data scope</strong> — for each role choose what data they see: their own only, their direct subordinates, their team peers, or the whole organisation.</li>
              <li><strong>Assign users</strong> — pick which users have this role.</li>
            </ul>
          </>
        ),
      },
      {
        label: 'Individual permission overrides',
        content: (
          <p>To grant or revoke a single permission for one user without changing their org role, open the user's profile in Administration and toggle the override. Useful for one-off cases like granting "approve leave" to a senior IC for the duration of a holiday cover.</p>
        ),
      },
      {
        label: 'Workflows & feature flags',
        content: (
          <>
            <p>Administration → <strong>Config & Workflows</strong>:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Feature Flags</strong> — turn whole modules on/off per tenant.</li>
              <li><strong>Approval Workflows</strong> — configure who approves what (leave, asset requests, time entries).</li>
              <li><strong>Notification Settings</strong> — which events email vs in-app only.</li>
              <li><strong>IP Whitelisting</strong> — see its own section above.</li>
            </ul>
          </>
        ),
      },
    ],
  },

  // ─── Settings ─────────────────────────────────────────────────────────────
  {
    id: 'settings',
    icon: <CalendarDays size={18} />,
    title: 'Profile & Settings',
    color: 'bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300',
    intro: 'Personalise your profile, theme, language, and notification preferences.',
    items: [
      {
        label: 'Editing your profile',
        content: (
          <>
            <p>Click your avatar in the bottom-left, then <strong>Profile</strong>:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Update name, department, job title, phone, manager.</li>
              <li>Add skills — these show on your Directory card and help colleagues find you for the right work.</li>
              <li>Upload a profile photo (used everywhere your name appears).</li>
            </ul>
          </>
        ),
      },
      {
        label: 'Themes',
        content: (
          <>
            <p>Click the sun/moon icon in the header to toggle between light and dark mode. For more options go to <strong>Settings → Themes</strong> — pick from Light, Dark, Midnight, Ocean, Sunset, Forest, Slate, Rose, Aurora, Violet, and a custom accent.</p>
            <Tip>Your theme choice is saved per device, so your phone and laptop can use different themes.</Tip>
          </>
        ),
      },
      {
        label: 'Language',
        content: (
          <p>Click the flag icon in the header to switch UI language. Available languages depend on your tenant's configuration.</p>
        ),
      },
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [, setActiveSection] = useState<string | null>(null);

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
      <Header title={t('nav.helpDocs')} subtitle="How to use every feature in DSV OpsPulse" />
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-muted" />
          <input
            type="text"
            placeholder={t('common.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-ds-border rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 bg-ds-surface text-ds-text"
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
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-ds-border bg-ds-surface hover:border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors text-center"
              >
                <span className={`p-2 rounded-lg ${s.color}`}>{s.icon}</span>
                <span className="text-[10px] font-medium text-ds-text-muted leading-tight">{s.title.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sections */}
        {filtered.map((section) => (
          <div key={section.id} id={`section-${section.id}`} className="bg-ds-surface border border-ds-border rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-ds-border">
              <span className={`p-2 rounded-xl ${section.color}`}>{section.icon}</span>
              <div>
                <h2 className="text-base font-semibold text-ds-text">{section.title}</h2>
                <p className="text-xs text-ds-text-muted mt-0.5">{section.intro}</p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {section.items.map((item) => (
                <AccordionItem key={item.label} label={item.label} content={item.content} />
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-ds-text-muted">
            <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('common.noResults')}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
