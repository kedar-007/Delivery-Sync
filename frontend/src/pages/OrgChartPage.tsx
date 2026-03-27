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

/* ─── Types ─────────────────────────────────────────────────────────────── */

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

interface LayoutNode {
  user: OrgUser;
  depth: number;
  x: number;
  y: number;
  children: LayoutNode[];
  isCollapsed: boolean;
  hasRealChildren: boolean;
}

interface LayoutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

interface TooltipState {
  user: OrgUser;
  mouseX: number;
  mouseY: number;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const ADMIN_ROLES = ['TENANT_ADMIN', 'PMO'];
const MAX_DEPTH = 8;

// Node dimensions
const NODE_W = 124;
const NODE_H = 160;
const AVATAR_SIZE = 72;
const H_GAP = 48;
const V_GAP = 80;
const PAD_X = 80;
const PAD_Y = 50;

// Depth-based border colors matching the reference image
const DEPTH_COLORS = [
  '#374151', // 0: charcoal (CEO)
  '#ef4444', // 1: red-orange
  '#f59e0b', // 2: amber
  '#0ea5e9', // 3: sky/teal
  '#22c55e', // 4: green
  '#a855f7', // 5: purple
  '#f97316', // 6: orange
];

const getColor = (depth: number) => DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
const getUserId = (u: OrgUser) => u.user_id ?? u.id;

/* ─── Layout Algorithm ───────────────────────────────────────────────────── */

function buildTree(
  userId: string,
  allUsers: OrgUser[],
  depth: number,
  collapsedSet: Set<string>,
  visited = new Set<string>(),
): LayoutNode | null {
  if (visited.has(userId) || depth > MAX_DEPTH) return null;
  visited.add(userId);

  const user = allUsers.find(u => getUserId(u) === userId);
  if (!user) return null;

  const isCollapsed = collapsedSet.has(userId);
  const childUsers = allUsers.filter(u => u.reporting_manager_id === userId);
  const hasRealChildren = childUsers.length > 0;

  const children = isCollapsed
    ? []
    : childUsers
        .map(c => buildTree(getUserId(c), allUsers, depth + 1, collapsedSet, new Set(visited)))
        .filter((n): n is LayoutNode => n !== null);

  return { user, depth, x: 0, y: 0, children, isCollapsed, hasRealChildren };
}

function subtreeWidth(node: LayoutNode): number {
  if (node.children.length === 0) return NODE_W;
  const total = node.children.reduce(
    (sum, child, i) => sum + subtreeWidth(child) + (i > 0 ? H_GAP : 0),
    0,
  );
  return Math.max(NODE_W, total);
}

function assignPositions(node: LayoutNode, left: number, depth: number): void {
  node.y = PAD_Y + depth * (NODE_H + V_GAP);
  const sw = subtreeWidth(node);
  node.x = left + (sw - NODE_W) / 2;
  let childLeft = left;
  for (const child of node.children) {
    const csw = subtreeWidth(child);
    assignPositions(child, childLeft, depth + 1);
    childLeft += csw + H_GAP;
  }
}

function flattenTree(node: LayoutNode): LayoutNode[] {
  return [node, ...node.children.flatMap(flattenTree)];
}

function collectLines(node: LayoutNode, lines: LayoutLine[]): void {
  const px = node.x + NODE_W / 2;
  // Start the line from the bottom of the avatar circle
  const py = node.y + AVATAR_SIZE + 4;
  for (const child of node.children) {
    lines.push({
      x1: px,
      y1: py,
      x2: child.x + NODE_W / 2,
      y2: child.y,
      color: getColor(child.depth),
    });
    collectLines(child, lines);
  }
}

/* ─── OrgNodeCard ────────────────────────────────────────────────────────── */

const OrgNodeCard: React.FC<{
  layoutNode: LayoutNode;
  allUsers: OrgUser[];
  onToggle: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onSetManager: (user: OrgUser) => void;
  isAdmin: boolean;
  isMatch: boolean;
  isDimmed: boolean;
  isDragging: boolean;
  setTooltip: (t: TooltipState | null) => void;
}> = ({
  layoutNode,
  onToggle,
  onDragStart,
  onDrop,
  isAdmin,
  isMatch,
  isDimmed,
  isDragging,
  setTooltip,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const { user, depth, isCollapsed, hasRealChildren } = layoutNode;
  const uid = getUserId(user);
  const color = getColor(depth);

  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        position: 'absolute',
        left: layoutNode.x + PAD_X,
        top: layoutNode.y,
        width: NODE_W,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: isDimmed ? 0.25 : isDragging ? 0.55 : 1,
        transition: 'opacity 0.2s',
        cursor: isAdmin ? 'grab' : 'default',
        userSelect: 'none',
        zIndex: isDragOver ? 20 : 2,
      }}
      draggable={isAdmin}
      onDragStart={() => onDragStart(uid)}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); onDrop(uid); }}
      onMouseEnter={e => setTooltip({ user, mouseX: e.clientX, mouseY: e.clientY })}
      onMouseMove={e => setTooltip({ user, mouseX: e.clientX, mouseY: e.clientY })}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Avatar circle */}
      <div
        onClick={() => hasRealChildren && onToggle(uid)}
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: '50%',
          border: `4px solid ${isDragOver ? '#3b82f6' : color}`,
          boxShadow: isDragOver
            ? `0 0 0 4px rgba(59,130,246,0.35), 0 6px 20px ${color}60`
            : isMatch
            ? `0 0 0 4px rgba(59,130,246,0.3), 0 4px 14px ${color}50`
            : `0 4px 14px ${color}45`,
          overflow: 'hidden',
          backgroundColor: '#f9fafb',
          transition: 'all 0.2s',
          transform: isDragOver ? 'scale(1.12)' : 'scale(1)',
          cursor: hasRealChildren ? 'pointer' : isAdmin ? 'grab' : 'default',
          flexShrink: 0,
        }}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${color}22, ${color}55)`,
              color,
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Expand / collapse button */}
      {hasRealChildren && (
        <button
          onClick={e => { e.stopPropagation(); onToggle(uid); }}
          style={{
            marginTop: -10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: color,
            color: 'white',
            border: '2px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            zIndex: 5,
            boxShadow: '0 2px 6px rgba(0,0,0,0.22)',
            lineHeight: 1,
          }}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      )}

      {/* Name */}
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#111827',
          textAlign: 'center',
          marginTop: hasRealChildren ? 5 : 9,
          lineHeight: 1.3,
          maxWidth: NODE_W,
          padding: '0 6px',
          wordBreak: 'break-word',
        }}
      >
        {user.name}
      </p>

      {/* Designation */}
      {user.designation && (
        <p
          style={{
            fontSize: 10,
            color: '#6b7280',
            textAlign: 'center',
            marginTop: 2,
            lineHeight: 1.3,
            maxWidth: NODE_W,
            padding: '0 4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={user.designation}
        >
          {user.designation}
        </p>
      )}

      {/* Department pill */}
      {user.department && (
        <div
          style={{
            marginTop: 4,
            fontSize: 9,
            color,
            background: `${color}18`,
            borderRadius: 10,
            padding: '2px 8px',
            fontWeight: 600,
            maxWidth: NODE_W - 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.department}
        </div>
      )}
    </div>
  );
};

/* ─── VisualOrgChart ─────────────────────────────────────────────────────── */

const VisualOrgChart: React.FC<{
  users: OrgUser[];
  searchQuery: string;
  onSetManager: (user: OrgUser) => void;
  onDirectSetManager: (userId: string, managerId: string) => void;
  isAdmin: boolean;
}> = ({ users, searchQuery, onSetManager, onDirectSetManager, isAdmin }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleToggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => {
      if (dragId && dragId !== targetId) {
        onDirectSetManager(dragId, targetId);
      }
      setDragId(null);
    },
    [dragId, onDirectSetManager],
  );

  const { flatNodes, lines, totalW, totalH } = useMemo(() => {
    const userIds = new Set(users.map(getUserId));
    const rootUsers = users.filter(
      u => !u.reporting_manager_id || !userIds.has(u.reporting_manager_id),
    );

    // Fallback: if no roots detected (e.g. circular), treat first user as root
    if (rootUsers.length === 0 && users.length > 0) {
      rootUsers.push(users[0]);
    }

    let startX = 0;
    const roots: LayoutNode[] = [];
    for (const ru of rootUsers) {
      const tree = buildTree(getUserId(ru), users, 0, collapsed);
      if (!tree) continue;
      const sw = subtreeWidth(tree);
      assignPositions(tree, startX, 0);
      startX += sw + H_GAP;
      roots.push(tree);
    }

    if (roots.length === 0) return { flatNodes: [], lines: [], totalW: 600, totalH: 400 };

    const allFlat = roots.flatMap(flattenTree);
    const allLines: LayoutLine[] = [];
    roots.forEach(r => collectLines(r, allLines));

    const maxRight = allFlat.reduce((m, n) => Math.max(m, n.x + NODE_W), 0);
    const maxBottom = allFlat.reduce((m, n) => Math.max(m, n.y + NODE_H), 0);

    return {
      flatNodes: allFlat,
      lines: allLines,
      totalW: maxRight + PAD_X * 2,
      totalH: maxBottom + PAD_Y,
    };
  }, [users, collapsed]);

  // Search: dim non-matching nodes rather than hiding (tree structure must remain readable)
  const matchSet = useMemo(() => {
    if (!searchQuery) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      flatNodes
        .filter(
          n =>
            n.user.name.toLowerCase().includes(q) ||
            n.user.designation?.toLowerCase().includes(q) ||
            n.user.department?.toLowerCase().includes(q) ||
            n.user.email?.toLowerCase().includes(q),
        )
        .map(n => getUserId(n.user)),
    );
  }, [flatNodes, searchQuery]);

  if (users.length === 0) {
    return (
      <EmptyState
        title="No hierarchy data"
        description="No reporting relationships found."
        icon={<GitBranch size={36} />}
      />
    );
  }

  return (
    <>
      <div
        className="overflow-auto rounded-xl border border-gray-200 bg-gray-50"
        style={{ maxHeight: '72vh' }}
        onDragEnd={() => setDragId(null)}
      >
        <div
          style={{
            position: 'relative',
            width: Math.max(totalW, 600),
            height: Math.max(totalH, 400),
          }}
        >
          {/* SVG connecting lines */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: PAD_X,
              width: totalW,
              height: totalH,
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            {lines.map((line, i) => {
              const midY = (line.y1 + line.y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${line.x1} ${line.y1} C ${line.x1} ${midY}, ${line.x2} ${midY}, ${line.x2} ${line.y2}`}
                  fill="none"
                  stroke="#d1d5db"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {flatNodes.map(layoutNode => {
            const uid = getUserId(layoutNode.user);
            const isMatch = matchSet ? matchSet.has(uid) : false;
            const isDimmed = !!matchSet && !isMatch;
            return (
              <OrgNodeCard
                key={uid}
                layoutNode={layoutNode}
                allUsers={users}
                onToggle={handleToggle}
                onDragStart={setDragId}
                onDrop={handleDrop}
                onSetManager={onSetManager}
                isAdmin={isAdmin}
                isMatch={isMatch}
                isDimmed={isDimmed}
                isDragging={dragId === uid}
                setTooltip={setTooltip}
              />
            );
          })}
        </div>
      </div>

      {/* Fixed-position tooltip (avoids overflow clipping) */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tooltip.mouseX + 18, window.innerWidth - 300),
            top: Math.max(tooltip.mouseY - 14, 10),
            zIndex: 9999,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
            minWidth: 200,
            maxWidth: 280,
            pointerEvents: 'none',
          }}
        >
          <p className="font-semibold text-gray-900 text-sm leading-snug">{tooltip.user.name}</p>
          {tooltip.user.designation && (
            <p className="text-xs text-gray-600 mt-0.5">{tooltip.user.designation}</p>
          )}
          {tooltip.user.department && (
            <p className="text-xs text-blue-600 mt-0.5">{tooltip.user.department}</p>
          )}
          {tooltip.user.email && (
            <p className="text-xs text-gray-500 mt-1.5">✉ {tooltip.user.email}</p>
          )}
          {tooltip.user.reporting_manager_name && (
            <p className="text-xs text-gray-400 mt-1">
              Reports to: {tooltip.user.reporting_manager_name}
            </p>
          )}
          {isAdmin && (
            <p className="text-xs text-blue-400 mt-2 pt-1.5 border-t border-gray-100">
              Drag to reassign · Click avatar to collapse
            </p>
          )}
        </div>
      )}
    </>
  );
};

/* ─── ListView ────────────────────────────────────────────────────────────── */

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
      u =>
        u.name.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) ||
        u.designation?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
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
            {filtered.map(user => (
              <tr key={getUserId(user)} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar name={user.name} avatarUrl={user.avatar_url} size="sm" />
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      {user.email && <p className="text-xs text-gray-400">{user.email}</p>}
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
                  {user.reporting_manager_name ?? <span className="text-gray-300">—</span>}
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

/* ─── SetManagerModal ─────────────────────────────────────────────────────── */

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SetManagerForm>({
    values: target ? { user_id: getUserId(target), manager_id: '' } : undefined,
  });

  React.useEffect(() => {
    if (!open) {
      reset();
      setError('');
    }
  }, [open, reset]);

  const eligibleManagers = useMemo(
    () => allUsers.filter(u => !target || getUserId(u) !== getUserId(target)),
    [allUsers, target],
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
    <Modal open={open} onClose={onClose} title={`Set Manager — ${target?.name ?? ''}`} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Employee</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <UserAvatar name={target?.name ?? ''} size="xs" />
            <span className="text-sm text-gray-700">{target?.name}</span>
          </div>
          <input type="hidden" {...register('user_id')} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Reporting Manager <span className="text-red-500">*</span>
          </label>
          <select
            {...register('manager_id', { required: 'Please select a manager' })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select manager…</option>
            {eligibleManagers.map(u => (
              <option key={getUserId(u)} value={getUserId(u)}>
                {u.name}
                {u.designation ? ` — ${u.designation}` : ''}
              </option>
            ))}
          </select>
          {errors.manager_id && (
            <p className="text-xs text-red-600 mt-1">{errors.manager_id.message}</p>
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

type ViewMode = 'chart' | 'list';

const OrgChartPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  const [view, setView] = useState<ViewMode>('chart');
  const [search, setSearch] = useState('');
  const [managerTarget, setManagerTarget] = useState<OrgUser | null>(null);

  const { data, isLoading, error } = useOrgHierarchy();
  const setManager = useSetManager();

  const users: OrgUser[] = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Called when admin drags a node onto another (direct reassign without modal)
  const handleDirectSetManager = useCallback(
    async (userId: string, managerId: string) => {
      try {
        await setManager.mutateAsync({ user_id: userId, manager_id: managerId });
      } catch (_) {
        // noop — mutation already shows errors via toast/query state
      }
    },
    [setManager],
  );

  if (isLoading)
    return (
      <Layout>
        <Header title="Organization Chart" subtitle="View your company's reporting structure" />
        <div className="p-6">
          <PageSkeleton />
        </div>
      </Layout>
    );

  if (error)
    return (
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
              onChange={e => setSearch(e.target.value)}
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
              onClick={() => setView('chart')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                view === 'chart' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <GitBranch size={14} />
              Chart
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>

        {/* Summary bar */}
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
          {view === 'chart' && isAdmin && (
            <>
              <span>·</span>
              <span className="text-gray-400">Drag nodes to reassign reporting lines</span>
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
                  onClick={() => (window.location.href = `/${tenantSlug}/admin`)}
                >
                  Invite Users
                </Button>
              ) : undefined
            }
          />
        ) : view === 'chart' ? (
          <VisualOrgChart
            users={users}
            searchQuery={search}
            onSetManager={setManagerTarget}
            onDirectSetManager={handleDirectSetManager}
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

      {/* Set Manager Modal (for manual selection) */}
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
