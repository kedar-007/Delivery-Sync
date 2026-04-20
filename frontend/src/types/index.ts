// ─── Auth / User ─────────────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'DELIVERY_LEAD' | 'TEAM_MEMBER' | 'PMO' | 'EXEC' | 'CLIENT';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  status: UserStatus;
  orgRoleId?: string | null;
  orgRoleName?: string | null;
  permissions?: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  invitedBy?: string;
  createdAt?: string;
  orgRoleId?: string | null;
}

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  subscriptionPlan: string;
  status: string;
  settings: Record<string, unknown>;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export type RAGStatus = 'RED' | 'AMBER' | 'GREEN';
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export interface Project {
  id: string;
  name: string;
  description?: string;
  ragStatus: RAGStatus;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  ownerUserId?: string;
  memberCount?: number;
}

export interface ProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  userRole: UserRole;
  projectRole: 'LEAD' | 'MEMBER' | 'OBSERVER';
  addedBy?: string;
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: MilestoneStatus;
  ownerUserId?: string;
  completionDate?: string;
}

// ─── Standup ──────────────────────────────────────────────────────────────────

export interface StandupEntry {
  id: string;
  projectId: string;
  userId: string;
  userName?: string;
  date: string;
  yesterday: string;
  today: string;
  blockers?: string;
  status: string;
  submittedAt?: string;
}

export interface StandupRollupDay {
  date: string;
  entries: StandupEntry[];
  entryCount: number;
}

// ─── EOD ──────────────────────────────────────────────────────────────────────

export type Mood = 'GREEN' | 'YELLOW' | 'RED';

export interface EodEntry {
  id: string;
  projectId: string;
  userId: string;
  userName?: string;
  date: string;
  accomplishments: string;
  plannedTomorrow?: string;
  blockers?: string;
  progressPercentage: number;
  mood: Mood;
  submittedAt?: string;
}

export interface EodRollupDay {
  date: string;
  entries: EodEntry[];
  entryCount: number;
  avgProgress: number;
}

// ─── Action ───────────────────────────────────────────────────────────────────

export type ActionStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Action {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  ownerUserId: string;
  assignedBy?: string;
  dueDate: string;
  status: ActionStatus;
  priority: Priority;
  source?: string;
  isOverdue?: boolean;
}

// ─── Blocker ──────────────────────────────────────────────────────────────────

export type BlockerStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';

export interface Blocker {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  severity: Priority;
  status: BlockerStatus;
  ownerUserId: string;
  raisedBy?: string;
  resolution?: string;
  resolvedDate?: string;
  escalatedTo?: string;
  ageDays?: number;
}

// ─── RAID ─────────────────────────────────────────────────────────────────────

export interface Risk {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  probability: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  mitigation?: string;
  ownerUserId: string;
  status: string;
}

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  severity: Priority;
  ownerUserId: string;
  status: string;
}

export interface Dependency {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  dependencyType: 'INTERNAL' | 'EXTERNAL';
  dependentOn?: string;
  dueDate?: string;
  ownerUserId: string;
  status: string;
}

export interface Assumption {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  impactIfWrong?: string;
  ownerUserId: string;
  status: string;
}

// ─── Decision ─────────────────────────────────────────────────────────────────

export interface Decision {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  decisionDate: string;
  madeBy?: string;
  impact?: string;
  rationale?: string;
  status: string;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface Report {
  id: string;
  projectId: string;
  reportType: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  periodStart: string;
  periodEnd: string;
  generatedBy?: string;
  generatedAt?: string;
  summary: ReportSummary;
}

export interface ReportSummary {
  projectName: string;
  ragStatus: RAGStatus;
  period: { start: string; end: string };
  standups: { total: number; uniqueContributors: number; submissionRate: string };
  eods: { total: number; avgProgressPercentage: number };
  actions: { total: number; completed: number; open: number; overdue: number; completionRate: number };
  blockers: { total: number; open: number; resolved: number; critical: number };
  milestones: { total: number; completed: number; delayed: number; upcoming: number };
  decisionsCount: number;
  keyBlockers: Array<{ title: string; severity: string }>;
  overdueActionsPreview: Array<{ title: string; dueDate: string }>;
  upcomingMilestones: Array<{ title: string; dueDate: string; status: string }>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  projects: Project[];
  ragSummary: { RED: number; AMBER: number; GREEN: number };
  missingStandups: Array<{ id: string; name: string }>;
  missingEod: Array<{ id: string; name: string }>;
  overdueActions: Array<{ id: string; title: string; dueDate: string; priority: string; projectId: string }>;
  criticalBlockers: Array<{ id: string; title: string; severity: string; status: string; projectId: string }>;
  stats: {
    totalProjects: number;
    overdueActionsCount: number;
    criticalBlockersCount: number;
    missingStandupsCount: number;
    missingEodCount: number;
  };
}

export interface ProjectDashboard {
  project: Project;
  stats: {
    totalStandups: number;
    totalEods: number;
    openActions: number;
    overdueActions: number;
    openBlockers: number;
    criticalBlockers: number;
    totalMilestones: number;
    delayedMilestones: number;
    totalMembers: number;
  };
  recentStandups: StandupEntry[];
  recentEods: EodEntry[];
  openActionsPreview: Action[];
  openBlockersPreview: Blocker[];
  milestones: Milestone[];
}

export interface PortfolioDashboard {
  summary: {
    totalProjects: number;
    redProjects: number;
    amberProjects: number;
    greenProjects: number;
    delayedMilestones: number;
    openBlockers: number;
    overdueActions: number;
  };
  projectsByRAG: {
    RED: Array<{ id: string; name: string; endDate: string }>;
    AMBER: Array<{ id: string; name: string; endDate: string }>;
    GREEN: Array<{ id: string; name: string; endDate: string }>;
  };
  delayedMilestones: Milestone[];
  topBlockers: Blocker[];
}

// ─── API Response Envelope ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}
