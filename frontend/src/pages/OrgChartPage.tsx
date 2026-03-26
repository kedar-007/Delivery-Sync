import React, { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Search, List, GitBranch, UserPlus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import UserAvatar from '../components/ui/UserAvatar';
import Badge from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useOrgHierarchy, useSetManager } from '../hooks/usePeople';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgUser {
  id: string;
  user_id?: string;
  name: string;
  email?: string;
  designation?: string;
  department?: string;
  avatar_url?: string;
  reporting_manager_id?: string | null;
  reporting_manager_name?: string;
}

interface SetManagerForm {
  user_id: string;
  manager_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['TENANT_ADMIN', 'PMO'];
const MAX_DEPTH = 5;

const getUserId = (u: OrgUser) => u.user_id ?? u.id;

// ─── OrgNode (Recursive Tree) ─────────────────────────────────────────────────

interface OrgNodeProps {
  user: OrgUser;
  allUsers: OrgUser[];
  depth: number;
  searchQuery: string;
  onSetManager?: (user: OrgUser) => void;
  isAdmin: boolean;
}

const OrgNode: React.FC<OrgNodeProps> = ({
  user,
  allUsers,
  depth,
  searchQuery,
  onSetManager,
  isAdmin,
}) => {
  const [expanded, setExpanded] = useState(true);
  const uid = getUserId(user);

  const children = useMemo(
    () =>
      allUsers.filter(
        (u) => u.reporting_manager_id === uid
      ),
    [allUsers, uid]
  );

  const hasChildren = children.length > 0;

  // Highlight match
  const nameMatch =
    !searchQuery ||
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.designation?.toLowerCase().includes(searchQuery.toLowerCase());

  // Even if this node doesn't match, show it if any descendant matches
  const hasMatchingDescendant = useCallback(
    (userId: string): boolean => {
      const kids = allUsers.filter((u) => u.reporting_manager_id === userId);
      if (!searchQuery) return true;
      return kids.some(
        (k) =>
          k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          k.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          k.designation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hasMatchingDescendant(getUserId(k))
      );
    },
    [allUsers, searchQuery]
  );

  const visible = !searchQuery || nameMatch || hasMatchingDescendant(uid);
  if (!visible) return null;
  if (depth > MAX_DEPTH) return null;

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 20 }}>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg group transition-colors ${
          nameMatch && searchQuery
            ? 'bg-blue-50 border border-blue-200'
            : 'hover:bg-gray-50'
        }`}
      >
        {/* Expand toggle (only if has children) */}
        <button
          className={`w-4 h-4 shrink-0 flex items-center justify-center text-gray-400 transition-transform ${
            hasChildren ? 'cursor-pointer hover:text-gray-600' : 'invisible'
          } ${!expanded && hasChildren ? '' : ''}`}
          onClick={() => hasChildren && setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren && (
            <span
              className={`inline-block transition-transform text-xs font-bold ${
                expanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
          )}
        </button>

        <UserAvatar
          name={user.name}
          avatarUrl={user.avatar_url}
          size="sm"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">
              {user.name}
            </span>
            {user.designation && (
              <span className="text-xs text-gray-500 truncate">
                {user.designation}
              </span>
            )}
            {user.department && (
              <Badge variant="gray">{user.department}</Badge>
            )}
            {hasChildren && (
              <span className="text-xs text-blue-500">
                {children.length} direct report{children.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {user.email && (
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          )}
        </div>

        {isAdmin && onSetManager && (
          <button
            onClick={() => onSetManager(user)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-700 shrink-0"
            title="Set manager"
          >
            <UserPlus size={14} />
          </button>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="border-l-2 border-gray-100 ml-5">
          {children.map((child) => (
            <OrgNode
              key={getUserId(child)}
              user={child}
              allUsers={allUsers}
              depth={depth + 1}
              searchQuery={searchQuery}
              onSetManager={onSetManager}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Tree View ────────────────────────────────────────────────────────────────

const TreeView = ({
  users,
  searchQuery,
  onSetManager,
  isAdmin,
}: {
  users: OrgUser[];
  searchQuery: string;
  onSetManager: (user: OrgUser) => void;
  isAdmin: boolean;
}) => {
  // Root users = no manager or manager not found in list
  const userIds = useMemo(() => new Set(users.map(getUserId)), [users]);

  const rootUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !u.reporting_manager_id ||
          !userIds.has(u.reporting_manager_id)
      ),
    [users, userIds]
  );

  if (rootUsers.length === 0) {
    return (
      <EmptyState
        title="No hierarchy data"
        description="No reporting relationships found."
        icon={<GitBranch size={36} />}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {rootUsers.map((user) => (
        <OrgNode
          key={getUserId(user)}
          user={user}
          allUsers={users}
          depth={0}
          searchQuery={searchQuery}
          onSetManager={onSetManager}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
};

// ─── List View ────────────────────────────────────────────────────────────────

const ListView = ({
  users,
  searchQuery,
  onSetManager,
  isAdmin,
}: {
  users: OrgUser[];
  searchQuery: string;
  onSetManager: (user: OrgUser) => void;
  isAdmin: boolean;
}) => {
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) ||
        u.designation?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No employees found"
        description="Try a different search term."
        icon={<List size={36} />}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                Employee
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                Designation
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                Department
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                Reports To
              </th>
              {isAdmin && (
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((user) => (
              <tr key={getUserId(user)} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      name={user.name}
                      avatarUrl={user.avatar_url}
                      size="sm"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      {user.email && (
                        <p className="text-xs text-gray-400">{user.email}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {user.designation ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {user.department ? (
                    <Badge variant="gray">{user.department}</Badge>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {user.reporting_manager_name ?? (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UserPlus size={13} />}
                      onClick={() => onSetManager(user)}
                    >
                      Set Manager
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Set Manager Modal ────────────────────────────────────────────────────────

const SetManagerModal = ({
  target,
  allUsers,
  open,
  onClose,
}: {
  target: OrgUser | null;
  allUsers: OrgUser[];
  open: boolean;
  onClose: () => void;
}) => {
  const setManager = useSetManager();
  const [error, setError] = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<SetManagerForm>({
      values: target
        ? { user_id: getUserId(target), manager_id: '' }
        : undefined,
    });

  React.useEffect(() => {
    if (!open) {
      reset();
      setError('');
    }
  }, [open, reset]);

  const eligibleManagers = useMemo(
    () =>
      allUsers.filter(
        (u) => !target || getUserId(u) !== getUserId(target)
      ),
    [allUsers, target]
  );

  const onSubmit = async (data: SetManagerForm) => {
    setError('');
    try {
      await setManager.mutateAsync(data);
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to set manager.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set Manager — ${target?.name ?? ''}`}
      size="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {/* User ID (pre-filled, read-only display) */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Employee
          </label>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <UserAvatar name={target?.name ?? ''} size="xs" />
            <span className="text-sm text-gray-700">{target?.name}</span>
          </div>
          <input type="hidden" {...register('user_id')} />
        </div>

        {/* Manager picker */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Reporting Manager <span className="text-red-500">*</span>
          </label>
          <select
            {...register('manager_id', { required: 'Please select a manager' })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select manager…</option>
            {eligibleManagers.map((u) => (
              <option key={getUserId(u)} value={getUserId(u)}>
                {u.name}
                {u.designation ? ` — ${u.designation}` : ''}
              </option>
            ))}
          </select>
          {errors.manager_id && (
            <p className="text-xs text-red-600 mt-1">
              {errors.manager_id.message}
            </p>
          )}
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            Save
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type ViewMode = 'tree' | 'list';

const OrgChartPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  const [view, setView] = useState<ViewMode>('tree');
  const [search, setSearch] = useState('');
  const [managerTarget, setManagerTarget] = useState<OrgUser | null>(null);

  const { data, isLoading, error } = useOrgHierarchy();

  const users: OrgUser[] = useMemo(() => {
    const raw = Array.isArray(data) ? data : [];
    return raw;
  }, [data]);

  if (isLoading) return (
    <Layout>
      <Header title="Organization Chart" subtitle="View your company's reporting structure" />
      <div className="p-6"><PageSkeleton /></div>
    </Layout>
  );

  if (error) return (
    <Layout>
      <Header title="Organization Chart" subtitle="View your company's reporting structure" />
      <div className="p-6">
        <Alert type="error" message="Failed to load organization hierarchy." />
      </div>
    </Layout>
  );

  return (
    <Layout>
      <Header
        title="Organization Chart"
        subtitle="View your company's reporting structure"
      />
      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Search */}
          <div className="relative w-72">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by name, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={() => setView('tree')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                view === 'tree'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <GitBranch size={14} />
              Tree
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                view === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-900">{users.length}</span> employees
          {search && (
            <>
              <span>·</span>
              <span>
                filtering by{' '}
                <span className="font-medium text-blue-600">"{search}"</span>
              </span>
            </>
          )}
        </div>

        {/* Content */}
        {users.length === 0 ? (
          <EmptyState
            title="No employees found"
            description="The organization directory is empty. Invite team members to get started."
            icon={<GitBranch size={36} />}
            action={
              isAdmin ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<UserPlus size={14} />}
                  onClick={() => window.location.href = `/${tenantSlug}/admin`}
                >
                  Invite Users
                </Button>
              ) : undefined
            }
          />
        ) : view === 'tree' ? (
          <TreeView
            users={users}
            searchQuery={search}
            onSetManager={setManagerTarget}
            isAdmin={isAdmin}
          />
        ) : (
          <ListView
            users={users}
            searchQuery={search}
            onSetManager={setManagerTarget}
            isAdmin={isAdmin}
          />
        )}
      </div>

      {/* Set Manager Modal */}
      <SetManagerModal
        target={managerTarget}
        allUsers={users}
        open={!!managerTarget}
        onClose={() => setManagerTarget(null)}
      />
    </Layout>
  );
};

export default OrgChartPage;
