import React, { useState } from 'react';
import { NavLink, useLocation, useParams, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FolderKanban, CheckSquare, AlertTriangle,
  Shield, FileText, Settings, LogOut, ChevronDown, ChevronRight,
  Milestone, ClipboardList, Clock, BookOpen, Briefcase, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyProfile } from '../../hooks/useUsers';
import UserAvatar from '../ui/UserAvatar';

interface NavItem {
  label: string;
  to?: string;
  icon: React.ReactNode;
  children?: NavItem[];
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Portfolio', to: '/portfolio', icon: <Briefcase size={18} />, roles: ['TENANT_ADMIN', 'PMO', 'EXEC'] },
  { label: 'Projects', to: '/projects', icon: <FolderKanban size={18} /> },
  { label: 'Milestones', to: '/milestones', icon: <Milestone size={18} /> },
  {
    label: 'Daily Updates', icon: <Clock size={18} />,
    children: [
      { label: 'Submit Standup', to: '/standup', icon: <ClipboardList size={16} /> },
      { label: 'Submit EOD', to: '/eod', icon: <BookOpen size={16} /> },
    ],
  },
  { label: 'Actions', to: '/actions', icon: <CheckSquare size={18} /> },
  { label: 'Blockers', to: '/blockers', icon: <AlertTriangle size={18} /> },
  { label: 'RAID Register', to: '/raid', icon: <Shield size={18} /> },
  { label: 'Decisions', to: '/decisions', icon: <BookOpen size={18} /> },
  { label: 'Reports', to: '/reports', icon: <FileText size={18} /> },
  { label: 'Admin', to: '/admin', icon: <Settings size={18} />, roles: ['TENANT_ADMIN'] },
];

const SidebarNavItem = ({ item, onClose }: { item: NavItem; onClose?: () => void }) => {
  const location = useLocation();
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.to && location.pathname.startsWith(c.to)) ?? false
  );

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={clsx(
            'sidebar-item w-full justify-between',
            'text-gray-300 hover:bg-blue-800 hover:text-white'
          )}
        >
          <span className="flex items-center gap-3">{item.icon}{item.label}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {expanded && (
          <div className="ml-4 mt-1 space-y-0.5">
            {item.children.map((child) => (
              <SidebarNavItem key={child.to || child.label} item={child} onClose={onClose} />
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
      className={({ isActive }) =>
        clsx('sidebar-item', isActive ? 'sidebar-item-active' : 'sidebar-item-inactive')
      }
    >
      {item.icon}
      <span>{item.label}</span>
    </NavLink>
  );
};

const Sidebar = ({ onClose }: { onClose?: () => void }) => {
  const { user, logout } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: profile } = useMyProfile();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  const prefixedItems = visibleItems.map((item) => ({
    ...item,
    to: item.to ? `/${tenantSlug}${item.to}` : undefined,
    children: item.children?.map((child) => ({
      ...child,
      to: child.to ? `/${tenantSlug}${child.to}` : undefined,
    })),
  }));

  return (
    <aside className="w-60 shrink-0 bg-blue-900 flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-blue-800 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Delivery Sync</h1>
          <p className="text-blue-300 text-xs mt-0.5 truncate">{user?.tenantName || 'Delivery Intelligence'}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-blue-300 hover:text-white rounded transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {prefixedItems.map((item) => (
          <SidebarNavItem key={item.to || item.label} item={item} onClose={onClose} />
        ))}
      </nav>

      {/* User Footer */}
      <div className="px-3 py-3 border-t border-blue-800">
        <Link to={`/${tenantSlug}/profile`} onClick={onClose}
          className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-blue-800 transition-colors group mb-1">
          <UserAvatar
            name={user?.name ?? ''}
            avatarUrl={profile?.avatarUrl}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate group-hover:text-blue-100">{user?.name}</p>
            <p className="text-xs text-blue-300 truncate">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
        </Link>
        <button onClick={logout} title="Sign out"
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-blue-300 hover:text-white hover:bg-blue-800 rounded-lg transition-colors">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
