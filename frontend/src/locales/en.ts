export interface Translations {
  nav: {
    dashboard: string; portfolio: string; projects: string; milestones: string;
    dailyUpdates: string; submitStandup: string; submitEod: string;
    actions: string; blockers: string; raidRegister: string; decisions: string;
    reports: string; admin: string; settings: string; profile: string; signOut: string;
    // sidebar groups
    dailyWork: string; people: string; assets: string; reportsAi: string;
    executive: string; administration: string; bugReports: string; helpDocs: string;
    // projects children
    allProjects: string; myTasks: string; sprintBoards: string; backlog: string;
    // daily work children
    standup: string; eod: string; timeTracking: string;
    // people children
    attendance: string; leave: string; teams: string; directory: string;
    orgChart: string; announcements: string; peopleSettings: string;
    // admin children
    userManagement: string; auditLogs: string; configWorkflows: string; dataSeeder: string;
    // executive children
    ceoDashboard: string; ctoDashboard: string;
    // reports children
    teamActivity: string; aiInsights: string;
  };
  common: {
    save: string; cancel: string; create: string; edit: string; delete: string;
    remove: string; close: string; back: string; loading: string; saving: string;
    search: string; filter: string; all: string; none: string; yes: string; no: string;
    reset: string; apply: string; confirm: string; success: string; error: string;
    required: string; optional: string; new: string; preview: string; view: string;
    noData: string; actions: string;
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
    language: {
      title: string; subtitle: string; label: string; changeNote: string;
    };
    preview: { title: string; subtitle: string; };
  };
  profile: {
    title: string; subtitle: string; picture: string; name: string; email: string;
    role: string; status: string; auth: string; userId: string; saveChanges: string;
    uploadPhoto: string; uploadHint: string; emailNote: string; roleNote: string;
    pictureUpdated: string; profileSaved: string;
  };
}

const en: Translations = {
  nav: {
    dashboard: 'Dashboard', portfolio: 'Portfolio', projects: 'Projects',
    milestones: 'Milestones', dailyUpdates: 'Daily Updates',
    submitStandup: 'Submit Standup', submitEod: 'Submit EOD',
    actions: 'Actions', blockers: 'Blockers', raidRegister: 'RAID Register',
    decisions: 'Decisions', reports: 'Reports', admin: 'Admin',
    settings: 'Settings', profile: 'My Profile', signOut: 'Sign out',
    dailyWork: 'Daily Work', people: 'People', assets: 'Assets',
    reportsAi: 'Reports & AI', executive: 'Executive',
    administration: 'Administration', bugReports: 'Bug Reports', helpDocs: 'Help & Docs',
    allProjects: 'All Projects', myTasks: 'My Tasks', sprintBoards: 'Sprint Boards', backlog: 'Backlog',
    standup: 'Standup', eod: 'EOD', timeTracking: 'Time Tracking',
    attendance: 'Attendance', leave: 'Leave', teams: 'Teams', directory: 'Directory',
    orgChart: 'Org Chart', announcements: 'Announcements', peopleSettings: 'People Settings',
    userManagement: 'User Management', auditLogs: 'Audit Logs', configWorkflows: 'Config & Workflows', dataSeeder: 'Data Seeder',
    ceoDashboard: 'CEO Dashboard', ctoDashboard: 'CTO Dashboard',
    teamActivity: 'Team Activity', aiInsights: 'AI Insights',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    create: 'Create',
    edit: 'Edit',
    delete: 'Delete',
    remove: 'Remove',
    close: 'Close',
    back: 'Back',
    loading: 'Loading…',
    saving: 'Saving…',
    search: 'Search',
    filter: 'Filter',
    all: 'All',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    reset: 'Reset',
    apply: 'Apply',
    confirm: 'Confirm',
    success: 'Success',
    error: 'Error',
    required: 'Required',
    optional: 'Optional',
    new: 'New',
    preview: 'Preview',
    view: 'View',
    noData: 'No data found.',
    actions: 'Actions',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Customise your workspace appearance and preferences',
    theme: {
      title: 'Appearance',
      subtitle: 'Choose your preferred theme and colour scheme',
      themeLabel: 'Colour Theme',
      autoTheme: 'Auto theme',
      autoThemeDesc: 'Automatically switch based on time of day (dark after 8 PM)',
      density: 'Interface Density',
      compact: 'Compact',
      default: 'Default',
      comfortable: 'Comfortable',
      fontSize: 'Font Size',
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
      reset: 'Reset to defaults',
      accentLabel: 'Accent colour',
    },
    sidebar: {
      title: 'Sidebar',
      subtitle: 'Reorder and show/hide navigation items',
      collapse: 'Start collapsed',
      collapseDesc: 'Sidebar opens in icon-only mode on page load',
      items: 'Menu Items',
      resetOrder: 'Reset order',
      visible: 'Visible',
      hidden: 'Hidden',
      navOrder: 'Navigation order',
      dragHint: 'Drag the grip handle to reorder. Toggle the eye to show or hide.',
    },
    language: {
      title: 'Language',
      subtitle: 'Choose your preferred display language',
      label: 'Interface Language',
      changeNote: 'Language changes apply instantly without a page reload.',
    },
    preview: {
      title: 'Typography preview',
      subtitle: 'Live preview of your font and density settings',
    },
    saved: 'Preferences saved',
  },
  profile: {
    title: 'My Profile',
    subtitle: 'Manage your account settings and profile picture',
    picture: 'Profile Picture',
    name: 'Display Name',
    email: 'Email',
    role: 'Role',
    status: 'Status',
    auth: 'Authentication',
    userId: 'User ID',
    saveChanges: 'Save changes',
    uploadPhoto: 'Upload new photo',
    uploadHint: 'JPG, PNG or GIF · Max 2 MB · Auto-resized to 256×256',
    emailNote: 'Email is managed by Zoho and cannot be changed here.',
    roleNote: 'Contact your admin to change your role.',
    pictureUpdated: 'Profile picture updated',
    profileSaved: 'Profile saved successfully',
  },
} as const;

export default en;
