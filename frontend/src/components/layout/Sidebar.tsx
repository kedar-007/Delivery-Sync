import React, { useState } from 'react';
import { NavLink, useLocation, useParams, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FolderKanban, CheckSquare, AlertTriangle,
  Shield, FileText, Settings, LogOut, ChevronDown, ChevronRight,
  Milestone, ClipboardList, Clock, BookOpen, Briefcase, X,
  PanelLeftClose, PanelLeftOpen, Users, Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyProfile } from '../../hooks/useUsers';
import { useSidebar } from '../../contexts/SidebarContext';
import UserAvatar from '../ui/UserAvatar';

// ─── Nav item definition ──────────────────────────────────────────────────────

interface NavItem {
  label: string;
  to?: string;
  icon: React.ReactNode;
  children?: NavItem[];
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     to: '/dashboard',  icon: <LayoutDashboard size={18} /> },
  { label: 'Portfolio',     to: '/portfolio',  icon: <Briefcase size={18} />,      roles: ['TENANT_ADMIN', 'PMO', 'EXEC'] },
  { label: 'Projects',      to: '/projects',   icon: <FolderKanban size={18} /> },
  { label: 'Milestones',    to: '/milestones', icon: <Milestone size={18} /> },
  {
    label: 'Daily Updates', icon: <Clock size={18} />,
    children: [
      { label: 'Submit Standup', to: '/standup', icon: <ClipboardList size={16} /> },
      { label: 'Submit EOD',     to: '/eod',     icon: <BookOpen size={16} /> },
    ],
  },
  { label: 'Actions',       to: '/actions',    icon: <CheckSquare size={18} /> },
  { label: 'Blockers',      to: '/blockers',   icon: <AlertTriangle size={18} /> },
  { label: 'RAID Register', to: '/raid',       icon: <Shield size={18} /> },
  { label: 'Decisions',     to: '/decisions',  icon: <BookOpen size={18} /> },
  { label: 'Teams',         to: '/teams',       icon: <Users size={18} />,    roles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC', 'TEAM_MEMBER'] },
  { label: 'Reports',       to: '/reports',    icon: <FileText size={18} /> },
  { label: 'AI Insights',   to: '/ai-insights', icon: <Sparkles size={18} />, roles: ['TENANT_ADMIN', 'DELIVERY_LEAD', 'PMO', 'EXEC', 'TEAM_MEMBER', 'CLIENT'] },
  {
    label: 'Executive', icon: <Briefcase size={18} />, roles: ['TENANT_ADMIN', 'PMO', 'EXEC'],
    children: [
      { label: 'CEO Dashboard', to: '/ceo-dashboard', icon: <Briefcase size={16} /> },
      { label: 'CTO Dashboard', to: '/cto-dashboard', icon: <LayoutDashboard size={16} /> },
    ],
  },
  { label: 'Admin',         to: '/admin',      icon: <Settings size={18} />, roles: ['TENANT_ADMIN'] },
];

// ─── Single nav item ──────────────────────────────────────────────────────────

const SidebarNavItem = ({
  item, collapsed, onClose,
}: {
  item: NavItem; collapsed: boolean; onClose?: () => void;
}) => {
  const location = useLocation();
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.to && location.pathname.includes(c.to)) ?? false,
  );

  if (item.children) {
    return (
      <div>
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
            {!collapsed && item.label}
          </span>
          {!collapsed && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </button>
        {expanded && !collapsed && (
          <div className="ml-4 mt-1 space-y-0.5">
            {item.children.map((child) => (
              <SidebarNavItem key={child.to || child.label} item={child} collapsed={false} onClose={onClose} />
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
          'sidebar-item',
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

  // Filter by role
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

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
        borderColor: `rgb(var(--ds-sidebar-border))`,
      }}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div
        className="px-3 py-4 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: `rgb(var(--ds-sidebar-border))` }}
      >
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight truncate"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}>
              {user?.tenantName || 'My Organisation'}
            </h1>
            <p className="text-[11px] mt-0.5 truncate font-medium tracking-wide uppercase opacity-50"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}>
              Delivery Sync
            </p>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {/* Mobile close */}
          {onClose && (
            <button onClick={onClose} aria-label="Close sidebar"
              className="lg:hidden p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}>
              <X size={16} />
            </button>
          )}
          {/* Desktop collapse toggle */}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: `rgb(var(--ds-sidebar-text))` }}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className={clsx('flex-1 overflow-y-auto py-3 space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}
        role="navigation">
        {prefixedItems.map((item) => (
          <SidebarNavItem
            key={item.to || item.label}
            item={item}
            collapsed={collapsed}
            onClose={onClose}
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
                {user?.role?.replace(/_/g, ' ')}
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
