import React, { useState } from 'react';
import { NavLink, useLocation, useParams, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FolderKanban, CheckSquare, AlertTriangle,
  Shield, FileText, Settings, LogOut, ChevronDown, ChevronRight,
  Milestone, ClipboardList, Clock, BookOpen, Briefcase, X,
  PanelLeftClose, PanelLeftOpen, Users, Sparkles, CalendarDays,
  Timer, Package, Award, BarChart3, Megaphone, GitBranch, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyProfile } from '../../hooks/useUsers';
import { useSidebar } from '../../contexts/SidebarContext';
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
  permission?: string; // hide item unless user has this permission
  moduleKey?: string;  // gated by super-admin module toggle
}

const NAV_ITEMS: NavItem[] = [
  // ── Core ──────────────────────────────────────────────────────────────────────
  { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={18} /> },

  // ── Projects ──────────────────────────────────────────────────────────────────
  {
    label: 'Projects', icon: <FolderKanban size={18} />, permission: PERMISSIONS.PROJECT_READ, moduleKey: 'projects',
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

  // ── Daily Work ────────────────────────────────────────────────────────────────
  {
    label: 'Daily Work', icon: <Clock size={18} />, permission: PERMISSIONS.STANDUP_SUBMIT, moduleKey: 'projects',
    children: [
      { label: 'Standup',       to: '/standup',       icon: <ClipboardList size={16} />, permission: PERMISSIONS.STANDUP_SUBMIT },
      { label: 'EOD',           to: '/eod',           icon: <BookOpen size={16} />,      permission: PERMISSIONS.EOD_SUBMIT },
      { label: 'Time Tracking', to: '/time-tracking', icon: <Timer size={16} />,         permission: PERMISSIONS.TIME_WRITE, moduleKey: 'time' },
    ],
  },

  // ── People ────────────────────────────────────────────────────────────────────
  {
    label: 'People', icon: <Users size={18} />, permission: PERMISSIONS.TEAM_READ, moduleKey: 'people',
    children: [
      { label: 'Attendance',    to: '/attendance',    icon: <CalendarDays size={16} />, permission: PERMISSIONS.ATTENDANCE_READ },
      { label: 'Leave',         to: '/leave',         icon: <CalendarDays size={16} />, permission: PERMISSIONS.LEAVE_READ },
      { label: 'Teams',         to: '/teams',         icon: <Users size={16} />,        permission: PERMISSIONS.TEAM_READ },
      { label: 'Directory',     to: '/directory',     icon: <Users size={16} />,        permission: PERMISSIONS.TEAM_READ },
      { label: 'Org Chart',     to: '/org-chart',     icon: <GitBranch size={16} />,    permission: PERMISSIONS.ORG_READ },
      { label: 'Announcements', to: '/announcements', icon: <Megaphone size={16} />,    permission: PERMISSIONS.ANNOUNCEMENT_READ },
      { label: 'IP Restrictions', to: '/ip-config',  icon: <Shield size={16} />,       permission: PERMISSIONS.IP_CONFIG_WRITE },
    ],
  },

  // ── Assets ────────────────────────────────────────────────────────────────────
  { label: 'Assets', to: '/assets', icon: <Package size={18} />, permission: PERMISSIONS.ASSET_READ, moduleKey: 'assets' },

  // ── Reports & AI ──────────────────────────────────────────────────────────────
  {
    label: 'Reports & AI', icon: <BarChart3 size={18} />, permission: PERMISSIONS.REPORT_READ, moduleKey: 'reports',
    children: [
      { label: 'Reports',            to: '/reports',            icon: <FileText size={16} />,  permission: PERMISSIONS.REPORT_READ },
      { label: 'Enterprise Reports', to: '/enterprise-reports', icon: <BarChart3 size={16} />, permission: PERMISSIONS.ORG_ROLE_READ },
      { label: 'AI Insights',        to: '/ai-insights',        icon: <Sparkles size={16} />,  permission: PERMISSIONS.REPORT_READ, moduleKey: 'ai' },
    ],
  },

  // ── Executive ─────────────────────────────────────────────────────────────────
  // Visible to anyone whose org role grants ORG_ROLE_READ (EXEC, PMO, CEO, etc.)
  {
    label: 'Executive', icon: <Briefcase size={18} />, permission: PERMISSIONS.ORG_ROLE_READ, moduleKey: 'exec',
    children: [
      { label: 'Portfolio',     to: '/portfolio',     icon: <Briefcase size={16} /> },
      { label: 'CEO Dashboard', to: '/ceo-dashboard', icon: <Briefcase size={16} /> },
      { label: 'CTO Dashboard', to: '/cto-dashboard', icon: <LayoutDashboard size={16} /> },
    ],
  },

  // ── Administration ────────────────────────────────────────────────────────────
  // Visible to anyone whose org role grants ADMIN_USERS (TENANT_ADMIN or CEO-level org roles)
  {
    label: 'Administration', icon: <Settings size={18} />, permission: PERMISSIONS.ADMIN_USERS,
    children: [
      { label: 'User Management',    to: '/admin',        icon: <Users size={16} /> },
      { label: 'Config & Workflows', to: '/admin-config', icon: <GitBranch size={16} /> },
      { label: 'IP Restrictions',    to: '/ip-config',    icon: <Shield size={16} />, permission: PERMISSIONS.IP_CONFIG_WRITE },
      { label: 'Data Seeder',        to: '/data-seed',    icon: <FlaskConical size={16} /> },
    ],
  },
  // ── Help ──────────────────────────────────────────────────────────────────────
  { label: 'Help & Docs', to: '/help', icon: <BookOpen size={18} /> },
];

// ─── Single nav item ──────────────────────────────────────────────────────────

const SidebarNavItem = ({
  item, collapsed, onClose, user, modules,
}: {
  item: NavItem; collapsed: boolean; onClose?: () => void; user?: CurrentUser | null; modules: Record<string, boolean>;
}) => {
  const location = useLocation();
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.to && location.pathname.includes(c.to)) ?? false,
  );

  if (item.children) {
    // Filter children by permission and module key
    const visibleChildren = item.children.filter((c) => {
      if (c.permission && !hasPermission(user, c.permission as any)) return false;
      if (c.moduleKey && !(modules as Record<string, boolean>)[c.moduleKey]) return false;
      return true;
    });
    if (visibleChildren.length === 0) return null;

    return (
      <div className="mb-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          title={collapsed ? item.label : undefined}
          aria-expanded={expanded}
          className={clsx(
            'sidebar-item w-full',
            collapsed ? 'justify-center px-0' : 'justify-between',
            'sidebar-item-inactive',
          )}
        >
          <span className={clsx('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
            {item.icon}
            {!collapsed && <span className="font-medium">{item.label}</span>}
          </span>
          {!collapsed && (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        </button>
        {expanded && !collapsed && (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2"
            style={{ borderColor: 'rgba(var(--ds-sidebar-text), 0.1)' }}>
            {visibleChildren.map((child) => (
              <SidebarNavItem key={child.to || child.label} item={child} collapsed={false} onClose={onClose} user={user} modules={modules} />
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
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={({ isActive }) =>
        clsx(
          'sidebar-item text-sm',
          collapsed ? 'justify-center px-0' : '',
          isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
        )
      }
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar = ({ onClose }: { onClose?: () => void }) => {
  const { user, logout } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: profile } = useMyProfile();
  const { collapsed, toggleCollapsed, items } = useSidebar();
  const { festival } = useFestival();
  const modules = useModulePermissions();

  // Filter nav items by permission and module toggle.
  // No hardcoded role arrays — access is entirely driven by org role permissions.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.permission && !hasPermission(user, item.permission as any)) return false;
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
        'border-r',
      )}
      style={{
        backgroundColor: `rgb(var(--ds-sidebar-bg))`,
        borderColor: festival ? festival.sidebarAccent : `rgb(var(--ds-sidebar-border))`,
        borderRightWidth: festival ? 2 : 1,
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
          {/* Desktop collapse toggle */}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="hidden lg:flex p-1.5 rounded-lg opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}
            >
              <PanelLeftClose size={15} />
            </button>
          )}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              className="hidden lg:flex p-1.5 rounded-lg opacity-40 hover:opacity-80 transition-opacity"
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
          title={collapsed ? 'Settings' : undefined}
          aria-label="Settings"
          className={clsx(
            'sidebar-item mb-1 sidebar-item-inactive',
            collapsed && 'justify-center px-0',
          )}
        >
          <Settings size={16} />
          {!collapsed && <span className="text-xs">Settings</span>}
        </Link>

        {/* Profile link */}
        <Link
          to={`/${tenantSlug}/profile`}
          onClick={onClose}
          title={collapsed ? user?.name : undefined}
          aria-label="My profile"
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
          title={collapsed ? 'Sign out' : undefined}
          aria-label="Sign out"
          className={clsx(
            'sidebar-item w-full sidebar-item-inactive',
            collapsed && 'justify-center px-0',
          )}
        >
          <LogOut size={14} />
          {!collapsed && <span className="text-xs">Sign out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
