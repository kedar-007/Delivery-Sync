import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  Settings, GitMerge, ToggleLeft, ToggleRight, Shield, FileText,
  CalendarDays, Award, Plus, Trash2, Edit2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronRight, Zap, Flag, Users,
  Lock, Unlock, RefreshCw, Info, Star, GripVertical, Search,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal, { ModalActions } from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import { PageSkeleton } from '../components/ui/Skeleton';
import {
  useWorkflows, useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow, useActivateWorkflow,
  useFeatureFlags, useCreateFeatureFlag, useUpdateFeatureFlag,
  useFormConfigs, useCreateFormConfig, useUpdateFormConfig,
  useLeaveTypes, useCreateLeaveType, useUpdateLeaveType,
  useBadgeDefinitions, useCreateBadgeDefinition, useUpdateBadgeDefinition,
  useOrgRoles, useAllPermissions, useSetOrgRolePermissions,
} from '../hooks/useAdminConfig';
import { adminConfigApi } from '../lib/api';
import { useConfirm } from '../components/ui/ConfirmDialog';

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'workflows',   label: 'Workflows',      icon: GitMerge },
  { key: 'features',    label: 'Feature Flags',  icon: Flag },
  { key: 'forms',       label: 'Form Configs',   icon: FileText },
  { key: 'permissions', label: 'Permissions',    icon: Shield },
  { key: 'leave-types', label: 'Leave Types',    icon: CalendarDays },
  { key: 'badges',      label: 'Badge Catalog',  icon: Award },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Helper constants ──────────────────────────────────────────────────────────

const ENTITY_TYPES = ['task', 'blocker', 'leave', 'asset_request', 'time_entry'];
const BADGE_CATEGORIES = ['PERFORMANCE', 'COLLABORATION', 'INNOVATION', 'LEADERSHIP', 'SPECIAL'];
const BADGE_LEVELS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
const ROLES = ['OWNER', 'TENANT_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'MEMBER', 'VIEWER'];
const LEVEL_COLORS: Record<string, string> = {
  BRONZE:   'bg-amber-100 text-amber-800 border-amber-200',
  SILVER:   'bg-slate-100 text-slate-700 border-slate-300',
  GOLD:     'bg-yellow-100 text-yellow-800 border-yellow-200',
  PLATINUM: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

// ── Permissions definition ────────────────────────────────────────────────────

const PERMISSIONS = [
  { key: 'tasks.create',           label: 'Create Tasks',           group: 'Tasks' },
  { key: 'tasks.edit',             label: 'Edit Tasks',             group: 'Tasks' },
  { key: 'tasks.delete',           label: 'Delete Tasks',           group: 'Tasks' },
  { key: 'tasks.assign',           label: 'Assign Tasks',           group: 'Tasks' },
  { key: 'sprints.manage',         label: 'Manage Sprints',         group: 'Sprints' },
  { key: 'time.approve',           label: 'Approve Time Entries',   group: 'Time' },
  { key: 'time.log',               label: 'Log Time',               group: 'Time' },
  { key: 'leave.approve',          label: 'Approve Leave',          group: 'Leave' },
  { key: 'leave.request',          label: 'Request Leave',          group: 'Leave' },
  { key: 'assets.manage',          label: 'Manage Assets',          group: 'Assets' },
  { key: 'users.manage',           label: 'Manage Users',           group: 'Admin' },
  { key: 'config.manage',          label: 'Manage Config',          group: 'Admin' },
  { key: 'reports.view',           label: 'View Reports',           group: 'Reports' },
  { key: 'announcements.create',   label: 'Create Announcements',   group: 'Comms' },
];

// ── Status color palette ──────────────────────────────────────────────────────

const STATUS_COLORS = [
  { label: 'Gray',   value: '#6b7280' },
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Red',    value: '#ef4444' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Indigo', value: '#6366f1' },
];

// ── Status item type ──────────────────────────────────────────────────────────

interface StatusItem {
  id: string;
  name: string;
  color: string;
  is_terminal: boolean;
}

interface TransitionItem {
  id: string;
  from: string;
  to: string;
  requires_role: string;
}

interface FormFieldItem {
  id: string;
  fieldId: string;
  label: string;
  type: string;
  required: boolean;
}

// ── Sortable status card ──────────────────────────────────────────────────────

function SortableStatusCard({
  status,
  index,
  onUpdate,
  onRemove,
}: {
  status: StatusItem;
  index: number;
  onUpdate: (id: string, field: keyof StatusItem, value: any) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: status.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
      <button
        type="button"
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className="text-xs text-gray-400 w-5 flex-shrink-0 font-mono">{index + 1}</span>
      <input
        className="form-input text-sm py-1 flex-1"
        placeholder="Status name"
        value={status.name}
        onChange={(e) => onUpdate(status.id, 'name', e.target.value)}
      />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {STATUS_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onUpdate(status.id, 'color', c.value)}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c.value,
              borderColor: status.color === c.value ? '#1e1b4b' : 'transparent',
            }}
          />
        ))}
      </div>
      <label className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0 cursor-pointer">
        <input
          type="checkbox"
          className="w-3.5 h-3.5 rounded"
          checked={status.is_terminal}
          onChange={(e) => onUpdate(status.id, 'is_terminal', e.target.checked)}
        />
        Terminal
      </label>
      <button
        type="button"
        onClick={() => onRemove(status.id)}
        className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Workflow visual builder ───────────────────────────────────────────────────

function WorkflowBuilder({
  statuses,
  transitions,
  onStatusesChange,
  onTransitionsChange,
}: {
  statuses: StatusItem[];
  transitions: TransitionItem[];
  onStatusesChange: (s: StatusItem[]) => void;
  onTransitionsChange: (t: TransitionItem[]) => void;
}) {
  const addStatus = () => {
    const newStatus: StatusItem = {
      id: `s_${Date.now()}`,
      name: '',
      color: '#6b7280',
      is_terminal: false,
    };
    onStatusesChange([...statuses, newStatus]);
  };

  const updateStatus = (id: string, field: keyof StatusItem, value: any) => {
    onStatusesChange(statuses.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const removeStatus = (id: string) => {
    onStatusesChange(statuses.filter((s) => s.id !== id));
    onTransitionsChange(transitions.filter((t) => {
      const name = statuses.find((s) => s.id === id)?.name;
      return t.from !== name && t.to !== name;
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = statuses.findIndex((s) => s.id === active.id);
      const newIndex = statuses.findIndex((s) => s.id === over.id);
      onStatusesChange(arrayMove(statuses, oldIndex, newIndex));
    }
  };

  const addTransition = () => {
    const newTrans: TransitionItem = {
      id: `t_${Date.now()}`,
      from: statuses[0]?.name ?? '',
      to: statuses[1]?.name ?? '',
      requires_role: '',
    };
    onTransitionsChange([...transitions, newTrans]);
  };

  const updateTransition = (id: string, field: keyof TransitionItem, value: string) => {
    onTransitionsChange(transitions.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const removeTransition = (id: string) => {
    onTransitionsChange(transitions.filter((t) => t.id !== id));
  };

  const statusNames = statuses.map((s) => s.name).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Statuses */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Statuses</label>
          <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} onClick={addStatus}>
            Add Status
          </Button>
        </div>
        {statuses.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
            No statuses yet — click "Add Status"
          </div>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {statuses.map((s, i) => (
                  <SortableStatusCard
                    key={s.id}
                    status={s}
                    index={i}
                    onUpdate={updateStatus}
                    onRemove={removeStatus}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Transitions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Transitions</label>
          <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} onClick={addTransition} disabled={statusNames.length < 2}>
            Add Transition
          </Button>
        </div>
        {transitions.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
            No transitions yet
          </div>
        ) : (
          <div className="space-y-2">
            {transitions.map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <select
                  className="form-select text-sm py-1 flex-1"
                  value={t.from}
                  onChange={(e) => updateTransition(t.id, 'from', e.target.value)}
                >
                  <option value="">From…</option>
                  {statusNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-gray-400 font-bold flex-shrink-0">→</span>
                <select
                  className="form-select text-sm py-1 flex-1"
                  value={t.to}
                  onChange={(e) => updateTransition(t.id, 'to', e.target.value)}
                >
                  <option value="">To…</option>
                  {statusNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select
                  className="form-select text-sm py-1 flex-1"
                  value={t.requires_role}
                  onChange={(e) => updateTransition(t.id, 'requires_role', e.target.value)}
                >
                  <option value="">Any role</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => removeTransition(t.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workflows Tab ─────────────────────────────────────────────────────────────

function WorkflowsTab() {
  const { data, isLoading } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const activateWorkflow = useActivateWorkflow();

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem]     = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [wfName, setWfName]             = useState('');
  const [wfEntityType, setWfEntityType] = useState('');
  const [wfStatuses, setWfStatuses]     = useState<StatusItem[]>([]);
  const [wfTransitions, setWfTransitions] = useState<TransitionItem[]>([]);

  const form = useForm<{ name: string; entity_type: string }>();

  const workflows = Array.isArray(data) ? data : (data as any)?.data ?? [];

  const resetBuilder = () => {
    setWfName('');
    setWfEntityType('');
    setWfStatuses([]);
    setWfTransitions([]);
  };

  const buildPayload = () => {
    const statusesJson = wfStatuses.map((s, i) => ({
      name: s.name,
      color: s.color,
      is_terminal: s.is_terminal,
      position: i + 1,
    }));
    const transitionsJson = wfTransitions.map((t) => ({
      from: t.from,
      to: t.to,
      requires_role: t.requires_role || null,
    }));
    return {
      name: wfName,
      entity_type: wfEntityType,
      statuses: JSON.stringify(statusesJson),
      transitions: JSON.stringify(transitionsJson),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wfName || !wfEntityType) return;
    const payload = buildPayload();
    if (editItem) {
      updateWorkflow.mutate(
        { id: editItem.id, data: payload },
        { onSuccess: () => { setEditItem(null); resetBuilder(); } },
      );
    } else {
      createWorkflow.mutate(payload, {
        onSuccess: () => { setShowCreate(false); resetBuilder(); },
      });
    }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setWfName(item.name);
    setWfEntityType(item.entityType ?? '');
    setWfStatuses(
      (item.statuses ?? []).map((s: any, i: number) => ({
        id: `s_${i}_${Date.now()}`,
        name: s.name,
        color: s.color ?? '#6b7280',
        is_terminal: s.is_terminal ?? false,
      })),
    );
    setWfTransitions(
      (item.transitions ?? []).map((t: any, i: number) => ({
        id: `t_${i}_${Date.now()}`,
        from: t.from,
        to: t.to,
        requires_role: t.requires_role ?? '',
      })),
    );
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    resetBuilder();
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Workflow Configurations</h3>
          <p className="text-sm text-gray-500 mt-0.5">Define custom statuses and transitions for each entity type</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => { setShowCreate(true); resetBuilder(); }}>
          New Workflow
        </Button>
      </div>

      {workflows.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <GitMerge size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No workflows configured yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf: any) => (
            <div key={wf.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === wf.id ? null : wf.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedId === wf.id
                    ? <ChevronDown size={14} className="text-gray-400" />
                    : <ChevronRight size={14} className="text-gray-400" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{wf.name}</span>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{wf.entityType}</span>
                      {wf.isDefault && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Default</span>}
                      {wf.isActive && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 size={9} />Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(wf.statuses ?? []).length} statuses · {(wf.transitions ?? []).length} transitions
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {!wf.isActive && (
                    <Button size="sm" variant="secondary" onClick={() => activateWorkflow.mutate(wf.id)} loading={activateWorkflow.isPending}>
                      Activate
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Edit2 size={13} />} onClick={() => openEdit(wf)} />
                  <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => deleteWorkflow.mutate(wf.id)} loading={deleteWorkflow.isPending} />
                </div>
              </div>

              {expandedId === wf.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Statuses</div>
                      <div className="space-y-1.5">
                        {(wf.statuses ?? []).map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color ?? '#6366f1' }} />
                            <span className="font-medium text-gray-700">{s.name}</span>
                            {s.is_terminal && (
                              <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">terminal</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Transitions</div>
                      <div className="space-y-1.5">
                        {(wf.transitions ?? []).map((t: any, i: number) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                            <span className="font-medium text-gray-700">{t.from}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-medium text-gray-700">{t.to}</span>
                            {t.requires_role && (
                              <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded ml-1">{t.requires_role}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={showCreate || !!editItem}
        onClose={closeModal}
        title={editItem ? 'Edit Workflow' : 'Create Workflow'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                placeholder="e.g., Bug Tracking"
                value={wfName}
                onChange={(e) => setWfName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Entity Type *</label>
              <select
                className="form-select"
                value={wfEntityType}
                onChange={(e) => setWfEntityType(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <WorkflowBuilder
            statuses={wfStatuses}
            transitions={wfTransitions}
            onStatusesChange={setWfStatuses}
            onTransitionsChange={setWfTransitions}
          />

          <ModalActions>
            <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createWorkflow.isPending || updateWorkflow.isPending}>
              {editItem ? 'Save Changes' : 'Create Workflow'}
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
}

// ── Feature Flags Tab ─────────────────────────────────────────────────────────

function FeatureFlagsTab() {
  const { data, isLoading } = useFeatureFlags();
  const createFlag = useCreateFeatureFlag();
  const updateFlag = useUpdateFeatureFlag();

  const [showCreate, setShowCreate]         = useState(false);
  const [featureName, setFeatureName]       = useState('');
  const [isEnabled, setIsEnabled]           = useState(false);
  const [enabledRoles, setEnabledRoles]     = useState<string[]>([]);
  const [configText, setConfigText]         = useState('{}');

  const flags = Array.isArray(data) ? data : (data as any)?.data ?? [];

  const toggle = (flag: any) => {
    updateFlag.mutate({ flagName: flag.featureName, data: { is_enabled: !flag.isEnabled } });
  };

  const resetForm = () => {
    setFeatureName('');
    setIsEnabled(false);
    setEnabledRoles([]);
    setConfigText('{}');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createFlag.mutate(
      {
        feature_name: featureName,
        is_enabled: isEnabled,
        config: configText || '{}',
        enabled_for_roles: JSON.stringify(enabledRoles),
      },
      { onSuccess: () => { setShowCreate(false); resetForm(); } },
    );
  };

  const toggleRole = (role: string) => {
    setEnabledRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Feature Flags</h3>
          <p className="text-sm text-gray-500 mt-0.5">Enable or disable features per tenant without deployments</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => { setShowCreate(true); resetForm(); }}>
          New Flag
        </Button>
      </div>

      <div className="space-y-2">
        {flags.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Flag size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No feature flags configured</p>
          </div>
        ) : (
          flags.map((flag: any) => (
            <div
              key={flag.id ?? flag.featureName}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${flag.isEnabled ? 'bg-green-50' : 'bg-gray-100'}`}>
                  <Zap size={14} className={flag.isEnabled ? 'text-green-600' : 'text-gray-400'} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{flag.featureName}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {(flag.enabledForRoles ?? []).length > 0
                      ? `Roles: ${(flag.enabledForRoles ?? []).join(', ')}`
                      : 'All roles'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${flag.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {flag.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={() => toggle(flag)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${flag.isEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}
                  title={flag.isEnabled ? 'Disable feature' : 'Enable feature'}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${flag.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Create Feature Flag"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Feature Key *</label>
            <input
              className="form-input font-mono"
              placeholder="e.g., ai_insights_enabled"
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_enabled_ff"
              className="w-4 h-4 rounded"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
            />
            <label htmlFor="is_enabled_ff" className="text-sm text-gray-700">Enable immediately</label>
          </div>

          {/* Role multi-select checkboxes */}
          <div>
            <label className="form-label">Enabled For Roles <span className="font-normal text-gray-400">(leave all unchecked = all roles)</span></label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className={`flex items-center gap-2 text-xs rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    enabledRoles.includes(role)
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-indigo-600"
                    checked={enabledRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Config (JSON)</label>
            <textarea
              className="form-textarea font-mono text-xs"
              rows={3}
              placeholder="{}"
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
            />
          </div>
          <ModalActions>
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createFlag.isPending}>Create Flag</Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
}

// ── Form Configs Tab ──────────────────────────────────────────────────────────

const FORM_TYPES  = ['task_create', 'standup', 'leave_request', 'asset_request'];
const FIELD_TYPES = ['text', 'textarea', 'select', 'date', 'number', 'checkbox', 'radio', 'file'];

function FormFieldBuilder({
  fields,
  onChange,
}: {
  fields: FormFieldItem[];
  onChange: (f: FormFieldItem[]) => void;
}) {
  const addField = () => {
    onChange([
      ...fields,
      { id: `f_${Date.now()}`, fieldId: '', label: '', type: 'text', required: false },
    ]);
  };

  const update = (id: string, key: keyof FormFieldItem, value: any) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  };

  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="form-label mb-0">Fields</label>
        <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} onClick={addField}>
          Add Field
        </Button>
      </div>
      {fields.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
          No fields yet — click "Add Field"
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f, idx) => (
            <div key={f.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 font-mono w-5 flex-shrink-0">{idx + 1}</span>
              <input
                className="form-input text-sm py-1 w-28 flex-shrink-0"
                placeholder="field_id"
                value={f.fieldId}
                onChange={(e) => update(f.id, 'fieldId', e.target.value)}
              />
              <input
                className="form-input text-sm py-1 flex-1"
                placeholder="Label"
                value={f.label}
                onChange={(e) => update(f.id, 'label', e.target.value)}
              />
              <select
                className="form-select text-sm py-1 w-28 flex-shrink-0"
                value={f.type}
                onChange={(e) => update(f.id, 'type', e.target.value)}
              >
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded"
                  checked={f.required}
                  onChange={(e) => update(f.id, 'required', e.target.checked)}
                />
                Req.
              </label>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormConfigsTab() {
  const { data, isLoading } = useFormConfigs();
  const createForm = useCreateFormConfig();
  const updateForm = useUpdateFormConfig();

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem]     = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formType, setFormType]         = useState('');
  const [formFields, setFormFields]     = useState<FormFieldItem[]>([]);
  const [validations, setValidations]   = useState('{}');

  const formConfigs = Array.isArray(data) ? data : (data as any)?.data ?? [];

  const resetBuilder = () => {
    setFormType('');
    setFormFields([]);
    setValidations('{}');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldsJson = formFields.map((f, i) => ({
      id: f.fieldId,
      label: f.label,
      type: f.type,
      required: f.required,
      order: i + 1,
    }));
    const payload = {
      form_type: formType,
      fields: JSON.stringify(fieldsJson),
      validations: validations || '{}',
    };
    if (editItem) {
      updateForm.mutate({ id: editItem.id, data: payload }, { onSuccess: () => { setEditItem(null); resetBuilder(); } });
    } else {
      createForm.mutate(payload, { onSuccess: () => { setShowCreate(false); resetBuilder(); } });
    }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setFormType(item.formType ?? '');
    setFormFields(
      (item.fields ?? []).map((f: any, i: number) => ({
        id: `f_${i}_${Date.now()}`,
        fieldId: f.id ?? '',
        label: f.label ?? '',
        type: f.type ?? 'text',
        required: f.required ?? false,
      })),
    );
    setValidations(JSON.stringify(item.validations ?? {}, null, 2));
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditItem(null);
    resetBuilder();
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Form Configurations</h3>
          <p className="text-sm text-gray-500 mt-0.5">Customise forms with dynamic fields and validations</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => { setShowCreate(true); resetBuilder(); }}>
          New Form Config
        </Button>
      </div>

      <div className="space-y-3">
        {formConfigs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <FileText size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No form configs yet</p>
          </div>
        ) : (
          formConfigs.map((fc: any) => (
            <div key={fc.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === fc.id ? null : fc.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedId === fc.id
                    ? <ChevronDown size={14} className="text-gray-400" />
                    : <ChevronRight size={14} className="text-gray-400" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{fc.formType}</span>
                      <span className="text-xs text-gray-400">v{fc.version}</span>
                      {fc.isActive && <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">Active</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{(fc.fields ?? []).length} fields configured</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" icon={<Edit2 size={13} />} onClick={() => openEdit(fc)} />
                </div>
              </div>
              {expandedId === fc.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="mt-3 space-y-1.5">
                    {(fc.fields ?? []).map((f: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <span className="font-mono text-indigo-600">{f.id}</span>
                        <span className="text-gray-600">{f.label}</span>
                        <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{f.type}</span>
                        {f.required && <span className="text-red-500">required</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        open={showCreate || !!editItem}
        onClose={closeModal}
        title={editItem ? 'Edit Form Config' : 'Create Form Config'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="form-label">Form Type *</label>
            <select
              className="form-select"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {FORM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <FormFieldBuilder fields={formFields} onChange={setFormFields} />

          <div>
            <label className="form-label">Validations (JSON)</label>
            <textarea
              className="form-textarea font-mono text-xs"
              rows={3}
              placeholder='{"field_id": {"min": 3, "max": 255}}'
              value={validations}
              onChange={(e) => setValidations(e.target.value)}
            />
          </div>

          <ModalActions>
            <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createForm.isPending || updateForm.isPending}>
              {editItem ? 'Save Changes' : 'Create Form Config'}
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
}

// ── Permissions Tab (Org Roles) ────────────────────────────────────────────────

function PermissionsTab() {
  const { data: rolesData, isLoading: rolesLoading } = useOrgRoles();
  const { data: permsData, isLoading: permsLoading } = useAllPermissions();
  const setRolePerms = useSetOrgRolePermissions();

  const [search, setSearch]         = useState('');
  const [permSearch, setPermSearch] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editRole, setEditRole]     = useState<null | { id: string; name: string; color: string }>(null);
  const [checked, setChecked]       = useState<Record<string, boolean>>({});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: any[]                                        = (rolesData as any)?.roles ?? [];
  const permGroups: { group: string; keys: string[] }[]    = (permsData as any)?.groups ?? [];
  const totalPerms                                          = permGroups.reduce((n, g) => n + g.keys.length, 0);

  const visibleRoles = search.trim()
    ? roles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : roles;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openEdit = (role: any) => {
    const initial: Record<string, boolean> = {};
    permGroups.forEach(({ keys }) => keys.forEach((k) => { initial[k] = (role.permissions ?? []).includes(k); }));
    setChecked(initial);
    setPermSearch('');
    setEditRole({ id: role.id, name: role.name, color: role.color });
  };

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => {
    if (!editRole) return;
    const permissions = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    setRolePerms.mutate({ roleId: editRole.id, permissions }, { onSuccess: () => setEditRole(null) });
  };

  // Permission groups filtered by modal search
  const filteredGroups = permGroups
    .map(({ group, keys }) => ({
      group,
      keys: permSearch.trim() ? keys.filter((k) => k.toLowerCase().includes(permSearch.toLowerCase())) : keys,
    }))
    .filter(({ keys }) => keys.length > 0);

  if (rolesLoading || permsLoading) return <PageSkeleton />;

  return (
    <div>
      {/* Header + role search */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Role Permissions</h3>
          <p className="text-sm text-gray-500 mt-0.5">Set which permissions each org role has access to</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search roles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
      </div>

      {roles.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No org roles found. Create roles in Administration → User Management.
        </div>
      ) : visibleRoles.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No roles match "{search}"</div>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {visibleRoles.map((role: any) => {
            const perms: string[] = role.permissions ?? [];
            return (
              <div key={role.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                    <span className="text-sm font-semibold text-gray-900">{role.name}</span>
                    <span className="text-xs text-gray-400">{perms.length}/{totalPerms} permissions</span>
                    {role.userCount > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" icon={<Edit2 size={13} />} onClick={() => openEdit(role)}>
                    Edit Permissions
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {permGroups.map(({ group, keys }) => {
                    const enabled = keys.filter((k) => perms.includes(k)).length;
                    return (
                      <div key={group} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{group}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          enabled === keys.length ? 'bg-green-100 text-green-700'
                          : enabled === 0         ? 'bg-gray-100 text-gray-400'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {enabled}/{keys.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit permissions modal */}
      <Modal
        open={!!editRole}
        onClose={() => setEditRole(null)}
        title={`Permissions — ${editRole?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-3">
          {/* Permission search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search permissions…"
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          {/* Select / deselect helpers */}
          <div className="flex items-center gap-3 text-xs">
            <button className="text-indigo-600 hover:text-indigo-800" onClick={() => {
              setChecked((prev) => {
                const next = { ...prev };
                filteredGroups.forEach(({ keys }) => keys.forEach((k) => { next[k] = true; }));
                return next;
              });
            }}>Select all visible</button>
            <span className="text-gray-300">·</span>
            <button className="text-gray-500 hover:text-gray-700" onClick={() => {
              setChecked((prev) => {
                const next = { ...prev };
                filteredGroups.forEach(({ keys }) => keys.forEach((k) => { next[k] = false; }));
                return next;
              });
            }}>Deselect all visible</button>
            <span className="ml-auto text-gray-400">
              {Object.values(checked).filter(Boolean).length} selected
            </span>
          </div>

          {/* Groups + checkboxes */}
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {filteredGroups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No permissions match "{permSearch}"</p>
            ) : filteredGroups.map(({ group, keys }) => (
              <div key={group}>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                  <span>{group}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="normal-case font-normal text-gray-400">
                    {keys.filter((k) => checked[k]).length}/{keys.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {keys.map((key) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm ${
                        checked[key]
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600 flex-shrink-0"
                        checked={!!checked[key]}
                        onChange={() => toggle(key)}
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{key.replace(/_/g, ' ')}</div>
                        <div className="text-[10px] font-mono text-gray-400 truncate">{key}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ModalActions>
            <Button variant="secondary" onClick={() => setEditRole(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={setRolePerms.isPending} icon={<Lock size={13} />}>
              Save Permissions
            </Button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  );
}

// ── Leave Types Tab ────────────────────────────────────────────────────────────

interface LeaveTypeForm {
  name: string;
  code: string;
  days_per_year: number;
  carry_forward_days: number;
  min_days: number;
  max_days: number;
  notice_days: number;
  requires_approval: boolean;
  is_paid: boolean;
  is_active: boolean;
}

function LeaveTypesTab() {
  const { data, isLoading } = useLeaveTypes();
  const createType = useCreateLeaveType();
  const updateType = useUpdateLeaveType();

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem]     = useState<any | null>(null);

  const form = useForm<LeaveTypeForm>({
    defaultValues: {
      days_per_year: 12,
      carry_forward_days: 0,
      min_days: 0.5,
      max_days: 30,
      notice_days: 1,
      requires_approval: true,
      is_paid: true,
      is_active: true,
    },
  });

  const types = Array.isArray(data) ? data : (data as any)?.data ?? [];

  const onSubmit = form.handleSubmit((d) => {
    if (editItem) {
      updateType.mutate({ id: editItem.id, data: d }, { onSuccess: () => setEditItem(null) });
    } else {
      createType.mutate(d, { onSuccess: () => { setShowCreate(false); form.reset(); } });
    }
  });

  const openEdit = (item: any) => {
    setEditItem(item);
    form.reset({
      name: item.name,
      code: item.code,
      days_per_year: item.daysPerYear,
      carry_forward_days: item.carryForwardDays,
      min_days: item.minDays,
      max_days: item.maxDays,
      notice_days: item.noticeDays,
      requires_approval: item.requiresApproval,
      is_paid: item.isPaid,
      is_active: item.isActive,
    });
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Leave Types</h3>
          <p className="text-sm text-gray-500 mt-0.5">Configure leave categories, allocations and policies</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => { setShowCreate(true); form.reset(); }}>
          Add Leave Type
        </Button>
      </div>

      {types.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <CalendarDays size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No leave types configured yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {types.map((lt: any) => (
            <div
              key={lt.id}
              className={`bg-white border rounded-xl px-4 py-3 ${lt.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <span className="text-sm font-bold text-indigo-600">{lt.code}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{lt.name}</span>
                      {lt.isPaid && <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">Paid</span>}
                      {!lt.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lt.daysPerYear} days/year · Carry forward: {lt.carryForwardDays} · Notice: {lt.noticeDays} day{lt.noticeDays !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={<Edit2 size={13} />} onClick={() => openEdit(lt)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreate || !!editItem}
        onClose={() => { setShowCreate(false); setEditItem(null); form.reset(); }}
        title={editItem ? 'Edit Leave Type' : 'Add Leave Type'}
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Name *</label>
              <input className="form-input" placeholder="e.g., Casual Leave" {...form.register('name', { required: true })} />
            </div>
            <div>
              <label className="form-label">Code *</label>
              <input className="form-input" placeholder="e.g., CL" {...form.register('code', { required: true })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Days / Year *</label>
              <input type="number" step="0.5" className="form-input" {...form.register('days_per_year', { required: true, valueAsNumber: true })} />
            </div>
            <div>
              <label className="form-label">Carry Forward</label>
              <input type="number" step="0.5" className="form-input" {...form.register('carry_forward_days', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="form-label">Notice Days</label>
              <input type="number" className="form-input" {...form.register('notice_days', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Min Days</label>
              <input type="number" step="0.5" className="form-input" {...form.register('min_days', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="form-label">Max Days</label>
              <input type="number" step="0.5" className="form-input" {...form.register('max_days', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex gap-6">
            {[
              { name: 'requires_approval' as const, label: 'Requires Approval' },
              { name: 'is_paid' as const,           label: 'Paid Leave' },
              { name: 'is_active' as const,          label: 'Active' },
            ].map(({ name, label }) => (
              <label key={name} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600" {...form.register(name)} />
                {label}
              </label>
            ))}
          </div>
          <ModalActions>
            <Button variant="secondary" onClick={() => { setShowCreate(false); setEditItem(null); form.reset(); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createType.isPending || updateType.isPending}>
              {editItem ? 'Save Changes' : 'Add Leave Type'}
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
}

// ── Badge Catalog Tab ──────────────────────────────────────────────────────────

interface BadgeForm {
  name: string;
  category: string;
  level: string;
  description: string;
  is_auto_awardable: boolean;
}

function BadgeCatalogTab() {
  const { data, isLoading } = useBadgeDefinitions();
  const createBadge = useCreateBadgeDefinition();
  const updateBadge = useUpdateBadgeDefinition();

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem]     = useState<any | null>(null);
  const [filterCat, setFilterCat]   = useState('');

  const form = useForm<BadgeForm>({
    defaultValues: { level: 'BRONZE', category: 'PERFORMANCE', is_auto_awardable: false },
  });

  const badges = (Array.isArray(data) ? data : (data as any)?.data ?? []).filter(
    (b: any) => !filterCat || b.category === filterCat,
  );

  const onSubmit = form.handleSubmit((d) => {
    if (editItem) {
      updateBadge.mutate({ id: editItem.id, data: d }, { onSuccess: () => setEditItem(null) });
    } else {
      createBadge.mutate(d, { onSuccess: () => { setShowCreate(false); form.reset(); } });
    }
  });

  const openEdit = (item: any) => {
    setEditItem(item);
    form.reset({
      name: item.name,
      category: item.category,
      level: item.level,
      description: item.description,
      is_auto_awardable: item.isAutoAwardable,
    });
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Badge Catalog</h3>
          <p className="text-sm text-gray-500 mt-0.5">Create and manage recognition badges for team members</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">All Categories</option>
            {BADGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => { setShowCreate(true); form.reset(); }}>
            New Badge
          </Button>
        </div>
      </div>

      {badges.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Award size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No badges in the catalog yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {badges.map((badge: any) => (
            <div
              key={badge.id}
              className={`bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 transition-colors ${!badge.isActive ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center">
                    <Star size={16} className="text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{badge.name}</div>
                    <div className="text-xs text-gray-500">{badge.category}</div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={<Edit2 size={12} />} onClick={() => openEdit(badge)} />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${LEVEL_COLORS[badge.level] ?? ''}`}>{badge.level}</span>
                {badge.isAutoAwardable && (
                  <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded flex items-center gap-1">
                    <Zap size={9} />Auto
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{badge.description}</p>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreate || !!editItem}
        onClose={() => { setShowCreate(false); setEditItem(null); form.reset(); }}
        title={editItem ? 'Edit Badge' : 'Create Badge'}
        size="md"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="form-label">Badge Name *</label>
            <input className="form-input" placeholder="e.g., Sprint Champion" {...form.register('name', { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Category *</label>
              <select className="form-select" {...form.register('category', { required: true })}>
                {BADGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Level *</label>
              <select className="form-select" {...form.register('level', { required: true })}>
                {BADGE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Description *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="What must a team member do to earn this badge?"
              {...form.register('description', { required: true })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600" {...form.register('is_auto_awardable')} />
            Auto-awardable (AI can award this badge automatically)
          </label>
          <ModalActions>
            <Button variant="secondary" onClick={() => { setShowCreate(false); setEditItem(null); form.reset(); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createBadge.isPending || updateBadge.isPending}>
              {editItem ? 'Save Changes' : 'Create Badge'}
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminConfigPage() {
  const { confirm: openConfirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<TabKey>('workflows');
  const [seeding, setSeeding]   = useState(false);
  const [seedMsg, setSeedMsg]   = useState('');

  const handleSeedDemo = useCallback(async () => {
    const ok = await openConfirm({ title: 'Seed Demo Data', message: 'This will insert demo projects, sprints, tasks, and time entries into your tenant. This cannot be undone.', confirmText: 'Seed Data', variant: 'warning' });
    if (!ok) return;
    setSeeding(true); setSeedMsg('');
    try {
      const result = await adminConfigApi.seed.demo();
      const s = result?.summary ?? {};
      setSeedMsg(`✓ Seeded: ${s.projects ?? 0} projects, ${s.sprints ?? 0} sprints, ${s.tasks ?? 0} tasks, ${s.timeEntries ?? 0} time entries, ${s.actions ?? 0} actions, ${s.blockers ?? 0} blockers`);
    } catch (e: unknown) {
      setSeedMsg(`Error: ${(e as Error).message}`);
    } finally { setSeeding(false); }
  }, [openConfirm]);

  const tabContent: Record<TabKey, React.ReactNode> = {
    workflows:     <WorkflowsTab />,
    features:      <FeatureFlagsTab />,
    forms:         <FormConfigsTab />,
    permissions:   <PermissionsTab />,
    'leave-types': <LeaveTypesTab />,
    badges:        <BadgeCatalogTab />,
  };

  return (
    <Layout>
      <Header
        title="Admin Configuration"
        subtitle="Manage workflows, feature flags, permissions, leave types and badge catalog"
      />

      <div className="flex gap-6 px-6 mt-2">
        {/* Vertical tab nav */}
        <div className="w-52 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={[
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                    active
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      : 'text-gray-600 hover:bg-gray-100',
                  ].join(' ')}
                >
                  <Icon size={15} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Info size={12} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">Admin Only</span>
            </div>
            <p className="text-xs text-amber-600">Changes here affect all users in this tenant. Review before saving.</p>
          </div>

          {/* Seed Demo Data */}
          <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-indigo-700 mb-1.5">Demo Data</p>
            <p className="text-xs text-indigo-500 mb-2">Insert sample projects, sprints, tasks & time entries for testing.</p>
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={11} className={seeding ? 'animate-spin' : ''} />
              {seeding ? 'Seeding…' : 'Seed Demo Data'}
            </button>
            {seedMsg && (
              <p className={`text-[10px] mt-1.5 ${seedMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {seedMsg}
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-8">
          {tabContent[activeTab]}
        </div>
      </div>
    </Layout>
  );
}
