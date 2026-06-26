import React from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { hasPermission, PERMISSIONS } from '../../utils/permissions';

// Horizontal, route-aware tab bar shown at the top of the content area for the
// Projects / Daily Work / People sections. Replaces the old collapsible sidebar
// submenus (#7/#9/#10). Rendered once in Layout, so every page in a section
// gets the tab bar without page-level changes.

interface Tab { label: string; to: string; permission?: string; permissions?: string[] }
interface Section { key: string; paths: string[]; tabs: Tab[] }

const SECTIONS: Section[] = [
  {
    key: 'projects',
    paths: ['/projects', '/my-tasks', '/sprints', '/milestones', '/backlog', '/actions', '/blockers', '/raid', '/decisions'],
    tabs: [
      { label: 'All Projects',  to: '/projects',   permission: PERMISSIONS.PROJECT_READ },
      { label: 'My Tasks',      to: '/my-tasks',   permission: PERMISSIONS.TASK_READ },
      { label: 'Sprint Boards', to: '/sprints',    permission: PERMISSIONS.SPRINT_READ },
      { label: 'Milestones',    to: '/milestones', permission: PERMISSIONS.MILESTONE_READ },
      { label: 'Backlog',       to: '/backlog',    permission: PERMISSIONS.TASK_READ },
      { label: 'Actions',       to: '/actions',    permission: PERMISSIONS.ACTION_READ },
      { label: 'Blockers',      to: '/blockers',   permission: PERMISSIONS.BLOCKER_READ },
      { label: 'RAID Register', to: '/raid',       permission: PERMISSIONS.RAID_READ },
      { label: 'Decisions',     to: '/decisions',  permission: PERMISSIONS.DECISION_READ },
    ],
  },
  {
    key: 'daily-work',
    paths: ['/standup', '/eod', '/time-tracking'],
    tabs: [
      { label: 'Standup',       to: '/standup',       permission: PERMISSIONS.STANDUP_SUBMIT },
      { label: 'EOD',           to: '/eod',           permission: PERMISSIONS.EOD_SUBMIT },
      { label: 'Time Tracking', to: '/time-tracking', permission: PERMISSIONS.TIME_WRITE },
    ],
  },
  {
    key: 'people',
    paths: ['/attendance', '/leave', '/teams', '/directory', '/org-chart', '/announcements'],
    tabs: [
      { label: 'Team Members',  to: '/directory',     permission: PERMISSIONS.TEAM_READ },
      { label: 'Teams',         to: '/teams',         permission: PERMISSIONS.TEAM_READ },
      { label: 'Org Chart',     to: '/org-chart',     permission: PERMISSIONS.ORG_READ },
      { label: 'Attendance',    to: '/attendance',    permission: PERMISSIONS.ATTENDANCE_READ },
      { label: 'Leave',         to: '/leave',         permission: PERMISSIONS.LEAVE_READ },
      { label: 'Announcements', to: '/announcements', permission: PERMISSIONS.ANNOUNCEMENT_READ },
    ],
  },
];

export default function SectionTabs() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const { navStyle } = useSidebar();
  const location = useLocation();

  // In 'classic' nav mode the section nav lives in the sidebar submenus, so the
  // horizontal tab bar is hidden.
  if (navStyle === 'classic') return null;

  // Strip the leading /:tenantSlug so we can match against section paths.
  const rest = '/' + location.pathname.replace(/^\/+/, '').split('/').slice(1).join('/');

  const section = SECTIONS.find((s) => s.paths.some((p) => rest === p || rest.startsWith(p + '/')));
  if (!section || !tenantSlug) return null;

  const visibleTabs = section.tabs.filter((tab) => {
    if (tab.permission && !hasPermission(user, tab.permission as never)) return false;
    if (tab.permissions && !tab.permissions.some((p) => hasPermission(user, p as never))) return false;
    return true;
  });
  if (visibleTabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-ds-border bg-ds-surface overflow-x-auto shrink-0">
      {visibleTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={`/${tenantSlug}${tab.to}`}
          end={tab.to === '/projects'}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-ds-text-muted hover:text-ds-text hover:border-ds-border'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
