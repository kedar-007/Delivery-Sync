
export interface Translations {
  nav: {
    dashboard: string; portfolio: string; projects: string; milestones: string;
    dailyUpdates: string; submitStandup: string; submitEod: string;
    actions: string; blockers: string; raidRegister: string; decisions: string;
    reports: string; admin: string; settings: string; profile: string; signOut: string;
    dailyWork: string; people: string; assets: string; reportsAi: string;
    executive: string; administration: string; bugReports: string; helpDocs: string;
    allProjects: string; myTasks: string; sprintBoards: string; backlog: string;
    standup: string; eod: string; timeTracking: string;
    attendance: string; leave: string; teams: string; directory: string;
    orgChart: string; announcements: string; peopleSettings: string;
    userManagement: string; auditLogs: string; configWorkflows: string; dataSeeder: string;
    ceoDashboard: string; ctoDashboard: string;
    teamActivity: string; aiInsights: string;
  };
  common: {
    save: string; cancel: string; create: string; edit: string; delete: string;
    remove: string; close: string; back: string; loading: string; saving: string;
    search: string; filter: string; all: string; none: string; yes: string; no: string;
    reset: string; apply: string; confirm: string; success: string; error: string;
    required: string; optional: string; preview: string; view: string;
    noData: string; actions: string;
    add: string; update: string; submit: string; upload: string; download: string;
    export: string; refresh: string; clear: string; open: string;
    approve: string; reject: string; resolve: string; assign: string;
    start: string; complete: string;
    active: string; inactive: string;
    today: string; yesterday: string; thisWeek: string; lastWeek: string; thisMonth: string;
    days: string; hours: string; minutes: string;
    noResults: string; notFound: string; loadMore: string; viewAll: string;
    send: string; sort: string;
    previous: string; next: string;
    moreItems: string; showMore: string; showLess: string;
    saveSuccess: string; updateSuccess: string; createSuccess: string;
    operationFailed: string; tryAgain: string;
    total: string; percentage: string; average: string;
    high: string; medium: string; low: string; critical: string;
    priority: string; status: string; dueDate: string;
    name: string; description: string; title: string; type: string;
    notes: string; comments: string; tags: string;
    new: string;
    rename: string; duplicate: string; archive: string;
    optional2: string;
    searchPlaceholder: string;
    confirmDeleteTitle: string; confirmDeleteDesc: string;
    na: string;
  };
  dashboard: {
    greeting: string;
    attendance: {
      title: string; notCheckedIn: string; checkInNow: string;
      timeSinceCheckIn: string; checkedInAt: string; checkOut: string;
      labelIn: string; labelOut: string; labelHours: string;
    };
    myTasks: {
      title: string; active: string; overdue: string; dueSoon: string;
      viewAll: string; allCaughtUp: string; noTasks: string;
      overdueSection: string; moreTasks: string; donePct: string;
    };
    quickActions: { title: string; };
    leaveBalance: {
      title: string; low: string; applyLeave: string; daysRemaining: string; pending: string;
    };
    pendingLeaves: { title: string; review: string; morePending: string; };
    teamAttendance: {
      title: string; fullView: string; currentlyIn: string; notYetCheckedIn: string;
      office: string; wfh: string; notIn: string; teamMembers: string;
    };
    badges: { title: string; viewProfile: string; more: string; };
    announcements: { title: string; viewAll: string; };
    projects: {
      title: string; viewAll: string; atRisk: string; caution: string; healthy: string;
      noProjects: string; noProjectsDesc: string; viewAllCount: string;
    };
    activityTrend: {
      title: string; submissionRate: string; view: string;
      standupsToday: string; eodsToday: string; standups7d: string; rate7d: string;
      noActivity: string; noActivityDesc: string;
    };
    blockerSeverity: {
      title: string; open: string; viewAll: string;
      noBlockers: string; teamClean: string; viewBoard: string; topBlockers: string;
    };
    projectHealth: {
      title: string; portfolioAvg: string; viewProjects: string;
      noProjects: string; noProjectsDesc: string; createProject: string;
      active: string; atRisk: string; caution: string; healthy: string;
      healthByProject: string; deliveryHealth: string;
      milestonesCompleted: string; milestonesOverdue: string; dueIn7Days: string;
      actionCompletion: string; projectsDone: string;
    };
    overdueActions: { title: string; viewAll: string; allClear: string; due: string; };
    criticalBlockers: { title: string; viewAll: string; noCritical: string; };
    alerts: {
      notCheckedIn: string; hasBlockers: string; overdueTasks: string;
      noStandup: string; noEod: string; pendingLeaveReqs: string;
    };
  };
  projects: {
    title: string; new: string; searchPlaceholder: string;
    noProjects: string; noProjectsDesc: string;
    modal: {
      createTitle: string; renameTitle: string; nameLabel: string;
      namePlaceholder: string; descLabel: string; descPlaceholder: string;
      startDate: string; endDate: string; ragStatus: string;
      ragGreen: string; ragAmber: string; ragRed: string; create: string; save: string;
    };
    detail: {
      overview: string; tasks: string; milestones: string; blockers: string;
      actions: string; raid: string; decisions: string; reports: string;
      editProject: string; archiveProject: string;
      startDate: string; endDate: string; status: string; health: string;
    };
  };
  tasks: {
    title: string; myTasks: string; new: string; noTasks: string; noTasksDesc: string;
    status: { todo: string; inProgress: string; inReview: string; done: string; };
    priority: { critical: string; high: string; medium: string; low: string; };
    daysOverdue: string; overdue: string; dueSoon: string;
    modal: {
      createTitle: string; editTitle: string; titleLabel: string;
      descLabel: string; assignee: string; dueDate: string;
      priority: string; status: string; project: string; create: string; save: string;
    };
  };
  sprints: {
    title: string; new: string; board: string; backlog: string;
    status: { planning: string; active: string; completed: string; };
    noSprints: string; startSprint: string; completeSprint: string; addTask: string;
    modal: {
      createTitle: string; nameLabel: string; goal: string;
      startDate: string; endDate: string; create: string;
    };
    velocity: string; burndown: string; progress: string;
  };
  standup: {
    title: string; submit: string; update: string; new: string; subtitle: string;
    form: {
      yesterday: string; today: string; yesterdayFull: string; todayFull: string;
      blockers: string; project: string; date: string; projectRequired: string; dateRequired: string;
      noBlockers: string; voiceInput: string; aiSuggest: string;
      labelYesterday: string; labelToday: string; labelBlockers: string;
      selectProject: string; yesterdayPlaceholder: string; todayPlaceholder: string;
      blockersPlaceholder: string; backdateHint: string;
    };
    tabs: { myToday: string; teamToday: string; history: string; mySubmissions: string; teamStandups: string; };
    alreadySubmitted: string; alreadySubmittedDesc: string;
    editMode: string; editStandup: string; editingStandup: string; viewTeam: string;
    searchPlaceholder: string; noEntries: string; noEntriesDesc: string;
    noSearchResults: string; noSearchResultsDesc: string; searchInputPlaceholder: string;
    aiAnalysis: string; rollupTitle: string;
    selectProject: string; selectProjectDesc: string;
    noStandupsRange: string; noStandupsRangeDesc: string;
    submittedToday: string; submittedFor: string; updatedSuccess: string;
    hoverToEdit: string; teamViewInfo: string;
    noTeamRange: string; noTeamRangeDesc: string;
    showingRange: string; rowsPerPage: string;
    updateCount: string; updateCountPlural: string; teamMember: string;
  };
  eod: {
    title: string; submit: string; update: string; new: string; subtitle: string;
    form: {
      accomplished: string; planned: string; blockers: string;
      project: string; date: string; mood: string;
      progressLabel: string; backdateHint: string;
      accomplishedPlaceholder: string; plannedPlaceholder: string; blockersPlaceholder: string;
    };
    tabs: { myToday: string; teamToday: string; history: string; };
    alreadySubmitted: string; noEntries: string;
    submittedFor: string; hoverToEdit: string;
    noEodsDate: string; noEodsDateDesc: string; noEodsAll: string; noEodsAllDesc: string;
    teamViewInfo: string; noTeamRange: string;
    showingRange: string; rowsPerPage: string;
    selectProject: string; selectProjectDesc: string; noEodsRangeDesc: string;
    avgProgress: string; donePct: string; customPreset: string;
    allProjects: string; allUsers: string; teamMember: string;
  };
  blockers: {
    title: string; new: string; noBlockers: string; noBlockersDesc: string;
    status: { open: string; resolved: string; pending: string; };
    severity: { critical: string; high: string; medium: string; low: string; };
    modal: {
      createTitle: string; titleLabel: string; descLabel: string;
      project: string; owner: string; severity: string;
      resolveTitle: string; resolution: string; create: string; resolve: string;
      renameTitle: string; save: string;
    };
    resolvedOn: string; raisedBy: string;
  };
  actions: {
    title: string; new: string; noActions: string; noActionsDesc: string;
    status: { open: string; inProgress: string; completed: string; overdue: string; };
    priority: { critical: string; high: string; medium: string; low: string; };
    modal: {
      createTitle: string; editTitle: string; titleLabel: string;
      descLabel: string; project: string; owner: string;
      dueDate: string; priority: string; status: string; create: string; save: string;
    };
    dueOn: string; ownedBy: string; viewDetail: string;
  };
  milestones: {
    title: string; new: string; noMilestones: string; noMilestonesDesc: string;
    status: { pending: string; inProgress: string; completed: string; overdue: string; atRisk: string; };
    modal: {
      createTitle: string; editTitle: string; titleLabel: string;
      descLabel: string; dueDate: string; project: string; create: string; save: string;
    };
    dueOn: string; completedOn: string; dependencies: string; progress: string;
  };
  raid: {
    title: string; new: string; noItems: string;
    types: { risk: string; assumption: string; issue: string; dependency: string; };
    impact: { high: string; medium: string; low: string; };
    status: { open: string; closed: string; mitigated: string; };
    modal: {
      createTitle: string; editTitle: string; itemType: string; titleLabel: string;
      descLabel: string; impact: string; probability: string;
      mitigation: string; owner: string; dueDate: string; create: string; save: string;
    };
  };
  decisions: {
    title: string; new: string; noDecisions: string;
    modal: {
      createTitle: string; titleLabel: string; descLabel: string;
      rationale: string; outcome: string; owner: string;
      project: string; date: string; create: string; save: string;
    };
  };
  reports: {
    title: string; generate: string; download: string; noReports: string;
    types: { sprint: string; project: string; team: string; executive: string; };
    filters: { dateRange: string; project: string; team: string; };
    teamActivity: { title: string; subtitle: string; };
    aiInsights: { title: string; subtitle: string; };
    shareLink: string; copied: string; notFound: string;
    period: string; actionCompletion: string; avgProgress: string;
    contributors: string; openBlockers: string;
    submissionRate: string; completionRate: string;
    teamEngagement: string; standupSubmissions: string;
    uniqueContributors: string; decisionsLogged: string;
    overdueActions: string; keyBlockers: string;
    upcoming: string; delayed: string; generatedBy: string;
  };
  attendance: {
    title: string; checkIn: string; checkOut: string; markWfh: string;
    status: { present: string; absent: string; wfh: string; late: string; halfDay: string; };
    summary: { present: string; absent: string; wfh: string; late: string; totalHours: string; };
    tabs: { today: string; myRecord: string; team: string; summary: string; wfh: string; };
    notCheckedIn: string; checkedIn: string; checkedOut: string;
    liveNow: string; anomalies: string;
    wfhRequest: { title: string; date: string; reason: string; submit: string; pending: string; approved: string; rejected: string; };
    export: string; download: string;
  };
  leave: {
    title: string; apply: string; noLeave: string;
    status: { pending: string; approved: string; rejected: string; cancelled: string; };
    balance: { title: string; remaining: string; used: string; total: string; pending: string; };
    form: {
      leaveType: string; startDate: string; endDate: string;
      reason: string; halfDay: string; submit: string;
    };
    tabs: { myRequests: string; team: string; balance: string; };
    approve: string; reject: string; cancel: string;
    days: string; from: string; to: string;
  };
  timeTracking: {
    title: string; logTime: string; noLogs: string;
    form: {
      project: string; task: string; date: string;
      hours: string; description: string; submit: string;
    };
    tabs: { myLogs: string; team: string; summary: string; };
    totalHours: string; billable: string; nonBillable: string;
    thisWeek: string; lastWeek: string; thisMonth: string;
    export: string;
  };
  teams: {
    title: string; new: string; noTeams: string;
    members: string; membersLabel: string; lead: string; addMember: string; removeMember: string;
    removeMemberConfirm: string; addTeam: string; projectRole: string; addTeamNote: string; role: string;
    modal: { createTitle: string; nameLabel: string; descLabel: string; lead: string; create: string; };
  };
  directory: {
    title: string; searchPlaceholder: string; noResults: string;
    individual: string;
    filters: { department: string; role: string; status: string; };
    card: { contact: string; viewProfile: string; };
    orgChart: string;
  };
  announcements: {
    title: string; new: string; noAnnouncements: string;
    priority: { high: string; medium: string; low: string; };
    modal: {
      createTitle: string; editTitle: string; titleLabel: string;
      content: string; priority: string; targetAudience: string;
      expiresAt: string; create: string; save: string;
    };
  };
  admin: {
    title: string;
    tabs: { users: string; roles: string; config: string; workflows: string; audit: string; };
    users: {
      title: string; invite: string; noUsers: string;
      role: string; status: string; lastActive: string;
      deactivate: string; activate: string; changeRole: string; permissions: string;
    };
    config: { title: string; save: string; orgName: string; timezone: string; };
    audit: { title: string; noLogs: string; action: string; user: string; timestamp: string; };
  };
  // assets uses a broad record so the page can evolve keys without requiring
  // every locale to be updated in lockstep. Missing keys fall back to the key string.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: Record<string, any>;
  bugs: {
    title: string; new: string; noBugs: string;
    severity: { critical: string; high: string; medium: string; low: string; };
    status: { open: string; inProgress: string; resolved: string; closed: string; wontFix: string; };
    modal: {
      createTitle: string; editTitle: string; titleLabel: string;
      descLabel: string; severity: string; assignee: string;
      project: string; steps: string; expected: string; actual: string;
      create: string; save: string;
    };
  };
  ai: {
    title: string; subtitle: string; analyze: string; generating: string;
    tabs: { health: string; productivity: string; blockers: string; retrospective: string; };
    healthCheck: { title: string; subtitle: string; analyze: string; analyzing: string; };
    productivity: { title: string; subtitle: string; analyze: string; analyzing: string; };
    blockerDetection: { title: string; subtitle: string; scan: string; scanning: string; };
    retrospective: { title: string; subtitle: string; generate: string; generating: string; };
    nlq: { placeholder: string; search: string; searching: string; noResults: string; };
    noInsights: string; regenerate: string;
    performance: { title: string; analyzing: string; };
  };
  settings: {
    title: string; subtitle: string; saved: string;
    theme: {
      title: string; subtitle: string; themeLabel: string;
      autoTheme: string; autoThemeDesc: string;
      density: string; compact: string; default: string; comfortable: string;
      fontSize: string; small: string; medium: string; large: string; reset: string;
      accentLabel: string;
    };
    sidebar: {
      title: string; subtitle: string; collapse: string; collapseDesc: string;
      items: string; resetOrder: string; visible: string; hidden: string;
      navOrder: string; dragHint: string;
    };
    language: { title: string; subtitle: string; label: string; changeNote: string; };
    preview: { title: string; subtitle: string; };
    peopleSettingsSubtitle: string;
    officeLocations: string; leaveTypes: string; leaveBalances: string;
    companyCalendar: string; accrualPolicy: string;
    ipRestrictions: string; geoRestrictions: string; zoneRestrictions: string; workShifts: string;
    leaveHr: string; attendanceSecurity: string; adminOnly: string; adminOnlyDesc: string;
  };
  orgSetup: {
    title: string; subtitle: string;
    stepOrganisation: string; stepReview: string;
    orgDetails: string; orgDetailsDesc: string;
    workspaceSlug: string; slugHint: string;
    reviewTitle: string; reviewDesc: string;
    yourRole: string; plan: string; orgAdmin: string;
    orgCreated: string; redirecting: string;
  };
  profile: {
    title: string; subtitle: string; picture: string; name: string; email: string;
    role: string; status: string; auth: string; userId: string; saveChanges: string;
    uploadPhoto: string; uploadHint: string; emailNote: string; roleNote: string;
    pictureUpdated: string; profileSaved: string;
  };
  validation: {
    required: string; minLength: string; maxLength: string; email: string;
    cannotBeBlank: string; invalidDate: string; futureDate: string; pastDate: string;
    positiveNumber: string; invalidFormat: string;
  };
  errors: {
    generic: string; network: string; unauthorized: string; forbidden: string;
    notFound: string; serverError: string; loadFailed: string; saveFailed: string;
    accessRevoked: string; accessRevokedDesc: string; contactAdmin: string;
    whatThisMeans: string; zohoStillActive: string; appAccessRemoved: string;
    adminCanRestore: string; contactAdminEmail: string;
  };
  statuses: {
    active: string; inactive: string; pending: string; approved: string; rejected: string;
    completed: string; inProgress: string; todo: string; done: string;
    open: string; closed: string; resolved: string; onTrack: string; atRisk: string;
    offTrack: string; planning: string; onHold: string; cancelled: string;
    present: string; absent: string; wfh: string; late: string;
    green: string; amber: string; red: string;
    critical: string; high: string; medium: string; low: string;
    checkedIn: string; checkedOut: string; notCheckedIn: string;
  };
}
