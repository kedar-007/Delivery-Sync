import React, { useState } from 'react';
import { NavLink, useLocation, useParams, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FolderKanban, AlertTriangle, CheckSquare,
  Shield, FileText, Settings, LogOut, ChevronDown, ChevronRight,
  Clock, BookOpen, Briefcase, X, Milestone, ClipboardList, CalendarDays, Megaphone,
  PanelLeftClose, PanelLeftOpen, Users, Sparkles,
  Timer, Package, BarChart3, GitBranch, FlaskConical, ScrollText, Trash2, Activity,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyProfile } from '../../hooks/useUsers';
import { useSidebar } from '../../contexts/SidebarContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFestival } from '../../contexts/FestivalContext';
import { useModulePermissions } from '../../hooks/useModulePermissions';
import { hasPermission, PERMISSIONS } from '../../utils/permissions';
import type { CurrentUser } from '../../types';
import UserAvatar from '../ui/UserAvatar';
import BrandLogo from '../ui/BrandLogo';

// ─── Nav item definition ──────────────────────────────────────────────────────
// Gate nav items with `permission` (from user.permissions) — NOT hardcoded roles.
// Only TENANT_ADMIN vs TEAM_MEMBER exists in Catalyst; all real access is via org roles.

interface NavItem {
  label: string;
  to?: string;
  icon: React.ReactNode;
  children?: NavItem[];
  permission?: string;    // hide item unless user has this permission
  permissions?: string[]; // hide item unless user has ANY of these permissions
  moduleKey?: string;     // gated by super-admin module toggle
  tourId?: string;        // data-tour anchor for the app tour
}

const NAV_ITEMS: NavItem[] = [
  // ── Core ──────────────────────────────────────────────────────────────────────
  { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={18} />, tourId: 'nav-dashboard' },

  // ── Projects ──────────────────────────────────────────────────────────────────
  // Direct link to the card grid; in-section navigation is the horizontal
  // SectionTabs (see SectionTabs.tsx) rather than a collapsible submenu.
  { label: 'Projects', to: '/projects', icon: <FolderKanban size={18} />, permission: PERMISSIONS.PROJECT_READ, moduleKey: 'projects', tourId: 'nav-projects' },

  // ── Daily Work ────────────────────────────────────────────────────────────────
  { label: 'Daily Work', to: '/standup', icon: <Clock size={18} />, permission: PERMISSIONS.STANDUP_SUBMIT, moduleKey: 'daily-work', tourId: 'nav-daily-work' },

  // ── People ────────────────────────────────────────────────────────────────────
  { label: 'People', to: '/directory', icon: <Users size={18} />, permission: PERMISSIONS.TEAM_READ, moduleKey: 'people', tourId: 'nav-people' },

  // ── Assets ────────────────────────────────────────────────────────────────────
  { label: 'Assets', to: '/assets', icon: <Package size={18} />, permission: PERMISSIONS.ASSET_READ, moduleKey: 'assets' },

  // ── Reports & AI ──────────────────────────────────────────────────────────────
  {
    label: 'Reports & AI', icon: <BarChart3 size={18} />, permission: PERMISSIONS.REPORT_READ, moduleKey: 'reports', tourId: 'nav-reports',
    children: [
      { label: 'Reports',            to: '/reports',            icon: <FileText size={16} />,  permission: PERMISSIONS.REPORT_READ },
{ label: 'Team Activity',      to: '/team-activity',      icon: <Timer size={16} />,     permission: PERMISSIONS.TIME_ANALYTICS },
      { label: 'AI Insights',        to: '/ai-insights',        icon: <Sparkles size={16} />,  permission: PERMISSIONS.REPORT_READ, moduleKey: 'ai' },
      { label: 'AI Performance',     to: '/ai-performance',     icon: <BarChart3 size={16} />, permissions: [PERMISSIONS.AI_PERFORMANCE_SELF, PERMISSIONS.AI_PERFORMANCE, PERMISSIONS.AI_TEAM_ANALYSIS], moduleKey: 'ai' },
    ],
  },

  // ── Executive ─────────────────────────────────────────────────────────────────
  // No parent permission — child-level permissions handle visibility per role.
  // Group auto-hides when all children are invisible.
  {
    label: 'Executive', icon: <Briefcase size={18} />, moduleKey: 'executive',
    children: [
      { label: 'Portfolio',     to: '/portfolio',     icon: <Briefcase size={16} />,       permission: PERMISSIONS.ORG_ROLE_READ },
      { label: 'CEO Dashboard', to: '/ceo-dashboard', icon: <Briefcase size={16} />,       permission: PERMISSIONS.CEO_DASHBOARD },
      { label: 'CTO Dashboard', to: '/cto-dashboard', icon: <LayoutDashboard size={16} />, permission: PERMISSIONS.CTO_DASHBOARD },
    ],
  },

  // ── Administration ────────────────────────────────────────────────────────────
  // No parent permission — auto-hides when all children are invisible (like Executive).
  // Each child is gated individually so HR/IT roles can access People Settings
  // without needing ADMIN_USERS.
  {
    label: 'Administration', icon: <Settings size={18} />,
    children: [
      { label: 'User Management',    to: '/admin',           icon: <Users size={16} />,        permission: PERMISSIONS.ADMIN_USERS },
      { label: 'People Settings',    to: '/people-settings', icon: <Shield size={16} />,       permissions: [PERMISSIONS.LEAVE_ADMIN, PERMISSIONS.LOCATION_ADMIN, PERMISSIONS.IP_CONFIG_WRITE] },
      { label: 'Audit Logs',          to: '/audit-logs',      icon: <ScrollText size={16} />,   permission: PERMISSIONS.ADMIN_USERS },
      { label: 'Config & Workflows', to: '/admin-config',    icon: <GitBranch size={16} />,    permission: PERMISSIONS.ADMIN_USERS },
      { label: 'Recycle Bin',        to: '/recycle-bin',     icon: <Trash2 size={16} />,       permission: PERMISSIONS.ADMIN_USERS },
      { label: 'Background Jobs',    to: '/background-jobs', icon: <Activity size={16} />,     permissions: [PERMISSIONS.ADMIN_JOBS_VIEW, PERMISSIONS.ADMIN_USERS] },
      { label: 'Data Seeder',        to: '/data-seed',       icon: <FlaskConical size={16} />, permission: PERMISSIONS.DATA_SEED },
    ],
  },
  // ── Support ───────────────────────────────────────────────────────────────────
  { label: 'Bug Reports', to: '/bug-reports', icon: <AlertTriangle size={18} />, tourId: 'nav-bugs' },

  // ── Help ──────────────────────────────────────────────────────────────────────
  { label: 'Help & Docs', to: '/help', icon: <BookOpen size={18} /> },
];

// Classic (collapsible submenu) versions of the three refactored sections.
// Used when the user picks the "Classic" navigation style in Settings; in the
// default "Tabs" style these sections are direct links + horizontal SectionTabs.
const CLASSIC_SECTIONS: Record<string, NavItem> = {
  'Projects': {
    label: 'Projects', icon: <FolderKanban size={18} />, permission: PERMISSIONS.PROJECT_READ, moduleKey: 'projects', tourId: 'nav-projects',
    children: [
      { label: 'All Projects',  to: '/projects',    icon: <FolderKanban size={16} />, permission: PERMISSIONS.PROJECT_READ },
      { label: 'My Tasks',      to: '/my-tasks',    icon: <CheckSquare size={16} />,  permission: PERMISSIONS.TASK_READ },
      { label: 'Sprint Boards', to: '/sprints',     icon: <GitBranch size={16} />,    permission: PERMISSIONS.SPRINT_READ },
      { label: 'Milestones',    to: '/milestones',  icon: <Milestone size={16} />,    permission: PERMISSIONS.MILESTONE_READ },
      { label: 'Backlog',       to: '/backlog',     icon: <ClipboardList size={16} />,permission: PERMISSIONS.TASK_READ },
      { label: 'Actions',       to: '/actions',     icon: <CheckSquare size={16} />,  permission: PERMISSIONS.ACTION_READ },
      { label: 'Blockers',      to: '/blockers',    icon: <AlertTriangle size={16} />,permission: PERMISSIONS.BLOCKER_READ },
      { label: 'RAID Register', to: '/raid',        icon: <Shield size={16} />,       permission: PERMISSIONS.RAID_READ },
      { label: 'Decisions',     to: '/decisions',   icon: <BookOpen size={16} />,     permission: PERMISSIONS.DECISION_READ },
    ],
  },
  'Daily Work': {
    label: 'Daily Work', icon: <Clock size={18} />, permission: PERMISSIONS.STANDUP_SUBMIT, moduleKey: 'daily-work', tourId: 'nav-daily-work',
    children: [
      { label: 'Standup',       to: '/standup',       icon: <ClipboardList size={16} />, permission: PERMISSIONS.STANDUP_SUBMIT },
      { label: 'EOD',           to: '/eod',           icon: <BookOpen size={16} />,      permission: PERMISSIONS.EOD_SUBMIT },
      { label: 'Time Tracking', to: '/time-tracking', icon: <Timer size={16} />,         permission: PERMISSIONS.TIME_WRITE, moduleKey: 'time' },
    ],
  },
  'People': {
    label: 'People', icon: <Users size={18} />, permission: PERMISSIONS.TEAM_READ, moduleKey: 'people', tourId: 'nav-people',
    children: [
      { label: 'Attendance',    to: '/attendance',    icon: <CalendarDays size={16} />, permission: PERMISSIONS.ATTENDANCE_READ },
      { label: 'Leave',         to: '/leave',         icon: <CalendarDays size={16} />, permission: PERMISSIONS.LEAVE_READ },
      { label: 'Teams',         to: '/teams',         icon: <Users size={16} />,        permission: PERMISSIONS.TEAM_READ },
      { label: 'Directory',     to: '/directory',     icon: <Users size={16} />,        permission: PERMISSIONS.TEAM_READ },
      { label: 'Org Chart',     to: '/org-chart',     icon: <GitBranch size={16} />,    permission: PERMISSIONS.ORG_READ },
      { label: 'Announcements', to: '/announcements', icon: <Megaphone size={16} />,    permission: PERMISSIONS.ANNOUNCEMENT_READ },
    ],
  },
};

// ─── Single nav item ──────────────────────────────────────────────────────────

const SidebarNavItem = ({
  item, collapsed, onClose, user, modules, navLabel, onExpandSidebar,
}: {
  item: NavItem; collapsed: boolean; onClose?: () => void; user?: CurrentUser | null;
  modules: Record<string, boolean>; navLabel: (label: string) => string;
  // When the sidebar is collapsed, parent items can't reveal their children
  // inline — they'd be hidden by the !collapsed gate below. Calling this
  // expands the sidebar so the children actually become visible after the
  // click. Leaf items don't need it (they navigate directly).
  onExpandSidebar?: () => void;
}) => {
  const location = useLocation();
  const displayLabel = navLabel(item.label);
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.to && location.pathname.includes(c.to)) ?? false,
  );

  if (item.children) {
    const visibleChildren = item.children.filter((c) => {
      if (c.permission && !hasPermission(user, c.permission as any)) return false;
      if (c.permissions && !c.permissions.some((p) => hasPermission(user, p as any))) return false;
      if (c.moduleKey && !(modules as Record<string, boolean>)[c.moduleKey]) return false;
      return true;
    });
    if (visibleChildren.length === 0) return null;

    const handleParentClick = () => {
      if (collapsed) {
        // Open the sidebar first, then make sure this group is expanded so
        // the children actually appear instead of staying hidden behind the
        // !collapsed gate below.
        onExpandSidebar?.();
        setExpanded(true);
      } else {
        setExpanded(!expanded);
      }
    };

    return (
      <div className="mb-0.5">
        <button
          onClick={handleParentClick}
          title={collapsed ? displayLabel : undefined}
          aria-expanded={expanded}
          data-tour={item.tourId}
          className={clsx(
            'sidebar-item w-full',
            collapsed ? 'justify-center px-0' : 'justify-between',
            'sidebar-item-inactive',
          )}
        >
          <span className={clsx('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
            {item.icon}
            {!collapsed && <span className="font-medium">{displayLabel}</span>}
          </span>
          {!collapsed && (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} className="rtl:scale-x-[-1]" />)}
        </button>
        {expanded && !collapsed && (
          <div className="ms-3 mt-0.5 space-y-0.5 border-s ps-2"
            style={{ borderColor: 'rgba(var(--ds-sidebar-text), 0.1)' }}>
            {visibleChildren.map((child) => (
              <SidebarNavItem key={child.to || child.label} item={child} collapsed={false} onClose={onClose} user={user} modules={modules} navLabel={navLabel} onExpandSidebar={onExpandSidebar} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to!}
      onClick={onClose}
      title={collapsed ? displayLabel : undefined}
      aria-label={displayLabel}
      data-tour={item.tourId}
      className={({ isActive }) =>
        clsx(
          'sidebar-item text-sm',
          collapsed ? 'justify-center px-0' : '',
          isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
        )
      }
    >
      {item.icon}
      {!collapsed && <span>{displayLabel}</span>}
    </NavLink>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar = ({ onClose }: { onClose?: () => void }) => {
  const { user, logout } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: profile } = useMyProfile();
  const { collapsed, toggleCollapsed, setCollapsed, items, navStyle } = useSidebar();
  const { festival } = useFestival();
  const modules = useModulePermissions();
  const { t } = useI18n();

  const navLabel = (label: string): string => {
    const map: Record<string, string> = {
      'Dashboard':          t('nav.dashboard'),
      'Projects':           t('nav.projects'),
      'All Projects':       t('nav.allProjects'),
      'My Tasks':           t('nav.myTasks'),
      'Sprint Boards':      t('nav.sprintBoards'),
      'Milestones':         t('nav.milestones'),
      'Backlog':            t('nav.backlog'),
      'Actions':            t('nav.actions'),
      'Blockers':           t('nav.blockers'),
      'RAID Register':      t('nav.raidRegister'),
      'Decisions':          t('nav.decisions'),
      'Daily Work':         t('nav.dailyWork'),
      'Standup':            t('nav.standup'),
      'EOD':                t('nav.eod'),
      'Time Tracking':      t('nav.timeTracking'),
      'People':             t('nav.people'),
      'Attendance':         t('nav.attendance'),
      'Leave':              t('nav.leave'),
      'Teams':              t('nav.teams'),
      'Directory':          t('nav.directory'),
      'Org Chart':          t('nav.orgChart'),
      'Announcements':      t('nav.announcements'),
      'People Settings':    t('nav.peopleSettings'),
      'Assets':             t('nav.assets'),
      'Reports & AI':       t('nav.reportsAi'),
      'Reports':            t('nav.reports'),
      'Team Activity':      t('nav.teamActivity'),
      'AI Insights':        t('nav.aiInsights'),
      'Executive':          t('nav.executive'),
      'Portfolio':          t('nav.portfolio'),
      'CEO Dashboard':      t('nav.ceoDashboard'),
      'CTO Dashboard':      t('nav.ctoDashboard'),
      'Administration':     t('nav.administration'),
      'User Management':    t('nav.userManagement'),
      'Audit Logs':         t('nav.auditLogs'),
      'Config & Workflows': t('nav.configWorkflows'),
      'Data Seeder':        t('nav.dataSeeder'),
      'Bug Reports':        t('nav.bugReports'),
      'Help & Docs':        t('nav.helpDocs'),
    };
    return map[label] ?? label;
  };

  // In 'classic' nav style, swap the three refactored sections for their
  // collapsible-submenu versions; otherwise use the direct links from NAV_ITEMS.
  const baseItems = navStyle === 'classic'
    ? NAV_ITEMS.map((it) => CLASSIC_SECTIONS[it.label] ?? it)
    : NAV_ITEMS;

  // Filter nav items by permission and module toggle.
  // No hardcoded role arrays — access is entirely driven by org role permissions.
  const visibleItems = baseItems.filter((item) => {
    if (item.permission && !hasPermission(user, item.permission as any)) return false;
    if (item.permissions && !item.permissions.some((p) => hasPermission(user, p as any))) return false;
    if (item.moduleKey && !(modules as Record<string, boolean>)[item.moduleKey]) return false;
    return true;
  });

  // Apply saved order + visibility from SidebarContext
  const orderedItems = visibleItems
    .map((navItem) => {
      const pref = items.find((p) => p.key === navItem.label);
      return { navItem, order: pref?.order ?? 999, visible: pref?.visible ?? true };
    })
    .filter((i) => i.visible)
    .sort((a, b) => a.order - b.order)
    .map((i) => i.navItem);

  // Prefix with tenantSlug
  const prefixedItems = orderedItems.map((item) => ({
    ...item,
    to: item.to ? `/${tenantSlug}${item.to}` : undefined,
    children: item.children?.map((child) => ({
      ...child,
      to: child.to ? `/${tenantSlug}${child.to}` : undefined,
    })),
  }));

  const w = collapsed ? 'w-16' : 'w-60';

  return (
    <aside
      className={clsx(
        w, 'shrink-0 flex flex-col h-full transition-all duration-200',
        'border-e',
      )}
      style={{
        backgroundColor: `rgb(var(--ds-sidebar-bg))`,
        borderColor: festival ? festival.sidebarAccent : `rgb(var(--ds-sidebar-border))`,
        borderInlineEndWidth: festival ? 2 : 1,
      }}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div
        className="px-3 py-3 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: `rgb(var(--ds-sidebar-border))` }}
      >
        {collapsed ? (
          /* Collapsed: mark only, centred */
          <div className="flex flex-col items-center w-full gap-1">
            <BrandLogo variant="mark" height={34} />
            {festival && (
              <span title={festival.name} aria-label={festival.name} style={{ fontSize: 13, lineHeight: 1 }}>
                {festival.emoji}
              </span>
            )}
          </div>
        ) : (
          /* Expanded: mark + org name + product badge */
          <div className="min-w-0 flex items-center gap-2.5 flex-1">
            <BrandLogo variant="mark" height={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1
                  className="font-semibold text-sm leading-tight truncate"
                  style={{ color: `rgb(var(--ds-sidebar-text))` }}
                >
                  {user?.tenantName || 'My Organisation'}
                </h1>
                {festival && (
                  <span title={festival.name} aria-label={festival.name} style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>
                    {festival.emoji}
                  </span>
                )}
              </div>
              {/* Product name pill — uses theme accent so it matches every colour preset */}
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                style={{
                  background: 'rgba(var(--ds-accent), 0.12)',
                  border: '1px solid rgba(var(--ds-accent), 0.25)',
                }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'rgb(var(--ds-accent))',
                  flexShrink: 0, display: 'inline-block',
                }} />
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgb(var(--ds-accent))',
                  lineHeight: 1,
                }}>
                  DSV OpsPulse
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Mobile close */}
          {onClose && (
            <button onClick={onClose} aria-label="Close sidebar"
              className="lg:hidden p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}>
              <X size={16} />
            </button>
          )}
          {/* Desktop collapse toggle — icons flip in RTL */}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="hidden lg:flex p-1.5 rounded-lg opacity-40 hover:opacity-80 transition-opacity rtl:scale-x-[-1]"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}
            >
              <PanelLeftClose size={15} />
            </button>
          )}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              className="hidden lg:flex p-1.5 rounded-lg opacity-40 hover:opacity-80 transition-opacity rtl:scale-x-[-1]"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={clsx('flex-1 overflow-y-auto py-2 space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}
        role="navigation">
        {prefixedItems.map((item) => (
          <SidebarNavItem
            key={item.to || item.label}
            item={item}
            collapsed={collapsed}
            onClose={onClose}
            user={user}
            modules={modules as Record<string, boolean>}
            navLabel={navLabel}
            onExpandSidebar={() => setCollapsed(false)}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className={clsx('border-t py-2 shrink-0', collapsed ? 'px-1.5' : 'px-2')}
        style={{ borderColor: `rgb(var(--ds-sidebar-border))` }}>

        {/* Settings link */}
        <Link
          to={`/${tenantSlug}/settings`}
          onClick={onClose}
          title={collapsed ? t('nav.settings') : undefined}
          aria-label={t('nav.settings')}
          data-tour="nav-settings"
          className={clsx(
            'sidebar-item mb-1 sidebar-item-inactive',
            collapsed && 'justify-center px-0',
          )}
        >
          <Settings size={16} />
          {!collapsed && <span className="text-xs">{t('nav.settings')}</span>}
        </Link>

        {/* Profile link */}
        <Link
          to={`/${tenantSlug}/profile`}
          onClick={onClose}
          title={collapsed ? user?.name : undefined}
          aria-label="My profile"
          data-tour="nav-profile"
          className={clsx(
            'flex items-center rounded-xl hover:opacity-90 transition-opacity mb-1',
            collapsed ? 'justify-center p-2' : 'gap-2.5 p-2',
          )}
        >
          <UserAvatar name={user?.name ?? ''} avatarUrl={profile?.avatarUrl} size="sm" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate"
                style={{ color: `rgb(var(--ds-sidebar-text))` }}>
                {user?.name}
              </p>
              <p className="text-xs opacity-60 truncate"
                style={{ color: `rgb(var(--ds-sidebar-text))` }}>
                {user?.orgRoleName ?? user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
          )}
        </Link>

        {/* Sign out */}
        <button onClick={logout}
          title={collapsed ? t('nav.signOut') : undefined}
          aria-label={t('nav.signOut')}
          className={clsx(
            'sidebar-item w-full sidebar-item-inactive',
            collapsed && 'justify-center px-0',
          )}
        >
          <LogOut size={14} />
          {!collapsed && <span className="text-xs">{t('nav.signOut')}</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
