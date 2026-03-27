import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus, Pin, Globe, User, Users, Bell, ChevronDown, ChevronUp,
  Pencil, Trash2, Sparkles, BellRing,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format, parseISO } from 'date-fns';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal, { ModalActions } from '../components/ui/Modal';
import { PageSkeleton } from '../components/ui/Skeleton';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useMarkAnnouncementRead,
} from '../hooks/usePeople';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'GLOBAL' | 'ROLE_TARGETED' | 'USER_TARGETED' | string;
  subtype: 'GENERAL' | 'INTERNAL' | 'FESTIVAL' | string;
  festivalKey?: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | string;
  isPinned: boolean;
  expiresAt?: string;
  createdAt: string;
  isRead?: boolean;
  authorName?: string;
  targetRoles?: string[];
  targetUserIds?: string[];
}

interface AnnouncementForm {
  title: string;
  content: string;
  type: string;
  subtype: string;
  festival_key?: string;
  is_pinned: boolean;
  priority: string;
  expires_at?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTHOR_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];

const ALL_ROLES = [
  { value: 'TENANT_ADMIN', label: 'Tenant Admin' },
  { value: 'PMO', label: 'PMO' },
  { value: 'DELIVERY_LEAD', label: 'Delivery Lead' },
  { value: 'TEAM_LEAD', label: 'Team Lead' },
  { value: 'SENIOR_DEV', label: 'Senior Developer' },
  { value: 'DEV', label: 'Developer' },
  { value: 'EMPLOYEE', label: 'Employee' },
];

const FESTIVAL_OPTIONS = [
  { value: 'DIWALI',    label: '🪔 Diwali' },
  { value: 'CHRISTMAS', label: '🎄 Christmas' },
  { value: 'HOLI',      label: '🌈 Holi' },
  { value: 'EID',       label: '🌙 Eid' },
  { value: 'NEW_YEAR',  label: '🎆 New Year' },
  { value: 'NAVRATRI',  label: '💃 Navratri' },
  { value: 'DUSSEHRA',  label: '🏹 Dussehra' },
  { value: 'PONGAL',    label: '🍯 Pongal' },
  { value: 'EASTER',    label: '🐣 Easter' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};

const formatRelative = (iso?: string) => {
  if (!iso) return '';
  try { return format(parseISO(iso), 'dd MMM yyyy, hh:mm a'); } catch { return iso ?? ''; }
};

const typeIcon = (type: string) => {
  if (type === 'GLOBAL') return <Globe size={13} />;
  if (type === 'ROLE_TARGETED') return <Users size={13} />;
  return <User size={13} />;
};

const typeVariant = (type: string): 'default' | 'info' | 'gray' => {
  if (type === 'GLOBAL') return 'default';
  if (type === 'ROLE_TARGETED') return 'info';
  return 'gray';
};

const priorityVariant = (priority: string): 'danger' | 'warning' | 'gray' => {
  if (priority === 'CRITICAL') return 'danger';
  if (priority === 'HIGH') return 'warning';
  return 'gray';
};

const festivalEmoji = (key?: string) => {
  const found = FESTIVAL_OPTIONS.find(f => f.value === key);
  return found ? found.label.split(' ')[0] : '✨';
};

// ── Announcement Card ─────────────────────────────────────────────────────────

interface AnnouncementCardProps {
  announcement: Announcement;
  canManage: boolean;
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
}

const AnnouncementCard = ({ announcement: a, canManage, onEdit, onDelete }: AnnouncementCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const markRead = useMarkAnnouncementRead();

  const handleToggle = () => {
    if (!expanded && !a.isRead) markRead.mutate(a.id);
    setExpanded((v) => !v);
  };

  const isFestival = a.subtype === 'FESTIVAL';
  const isInternal = a.subtype === 'INTERNAL';

  return (
    <Card
      className={`transition-all ${
        isFestival
          ? 'border-purple-200 bg-purple-50/40'
          : isInternal
          ? 'border-amber-200 bg-amber-50/30'
          : !a.isRead
          ? 'border-blue-200 bg-blue-50/30'
          : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <div className="mt-1.5 shrink-0">
          {!a.isRead ? (
            <span className="block w-2.5 h-2.5 rounded-full bg-blue-500" />
          ) : (
            <span className="block w-2.5 h-2.5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isFestival && (
                <span className="text-lg leading-none">{festivalEmoji(a.festivalKey)}</span>
              )}
              <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
              {a.isPinned && (
                <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                  <Pin size={11} />
                  <span className="hidden sm:inline">Pinned</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {/* Subtype badge */}
              {isFestival && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                  <Sparkles size={11} /> Festival
                </span>
              )}
              {isInternal && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                  <BellRing size={11} /> Internal
                </span>
              )}
              <Badge variant={typeVariant(a.type)}>
                <span className="inline-flex items-center gap-1">
                  {typeIcon(a.type)}
                  {a.type.replace(/_/g, ' ')}
                </span>
              </Badge>
              {a.priority !== 'NORMAL' && (
                <Badge variant={priorityVariant(a.priority)}>{a.priority}</Badge>
              )}
            </div>
          </div>

          {/* Target info */}
          {a.type === 'ROLE_TARGETED' && a.targetRoles && a.targetRoles.length > 0 && (
            <p className="text-xs text-blue-600 mb-1">
              Roles: {a.targetRoles.join(', ')}
            </p>
          )}

          {/* Content */}
          <p className={`text-sm text-gray-600 ${expanded ? '' : 'line-clamp-2'}`}>{a.content}</p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              <span>{formatRelative(a.createdAt)}</span>
              {a.authorName && <span>· {a.authorName}</span>}
              {a.expiresAt && (
                <span className="text-amber-600">· Expires {formatDate(a.expiresAt)}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {canManage && (
                <>
                  <button
                    onClick={() => onEdit(a)}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(a.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
              <button
                onClick={handleToggle}
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// ── Create / Edit Modal ───────────────────────────────────────────────────────

interface AnnouncementModalProps {
  open: boolean;
  onClose: () => void;
  editing: Announcement | null;
}

const AnnouncementModal = ({ open, onClose, editing }: AnnouncementModalProps) => {
  const [formError, setFormError] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);

  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const { data: usersData = [] } = useUsers();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementForm>({
    defaultValues: { type: 'GLOBAL', subtype: 'GENERAL', priority: 'NORMAL', is_pinned: false },
  });

  const selectedType = watch('type');
  const selectedSubtype = watch('subtype');

  React.useEffect(() => {
    if (editing) {
      reset({
        title: editing.title,
        content: editing.content,
        type: editing.type,
        subtype: editing.subtype ?? 'GENERAL',
        festival_key: editing.festivalKey ?? '',
        priority: editing.priority,
        is_pinned: editing.isPinned,
        expires_at: editing.expiresAt?.slice(0, 10) ?? undefined,
      });
      setTargetRoles(editing.targetRoles ?? []);
      setTargetUserIds(editing.targetUserIds ?? []);
    } else {
      reset({ type: 'GLOBAL', subtype: 'GENERAL', priority: 'NORMAL', is_pinned: false });
      setTargetRoles([]);
      setTargetUserIds([]);
    }
    setFormError('');
  }, [editing, open, reset]);

  const toggleRole = (role: string) => {
    setTargetRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleUser = (id: string) => {
    setTargetUserIds(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  };

  const onSubmit = async (data: AnnouncementForm) => {
    try {
      setFormError('');
      const payload = {
        ...data,
        target_roles: selectedType === 'ROLE_TARGETED' ? targetRoles : [],
        target_user_ids: selectedType === 'USER_TARGETED' ? targetUserIds : [],
      };
      if (editing) {
        await updateAnnouncement.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createAnnouncement.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Announcement' : 'New Announcement'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && <Alert type="error" message={formError} />}

        <div>
          <label className="form-label">Title *</label>
          <input
            className="form-input"
            placeholder="Announcement title…"
            {...register('title', { required: 'Title is required' })}
          />
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>

        <div>
          <label className="form-label">Content *</label>
          <textarea
            className="form-textarea"
            rows={4}
            placeholder="Write your announcement here…"
            {...register('content', { required: 'Content is required' })}
          />
          {errors.content && <p className="form-error">{errors.content.message}</p>}
        </div>

        {/* Type + Subtype row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Audience</label>
            <select className="form-select" {...register('type')}>
              <option value="GLOBAL">🌐 Global (everyone)</option>
              <option value="ROLE_TARGETED">👥 Role Targeted</option>
              <option value="USER_TARGETED">👤 User Targeted</option>
            </select>
          </div>
          <div>
            <label className="form-label">Announcement Type</label>
            <select className="form-select" {...register('subtype')}>
              <option value="GENERAL">📢 General</option>
              <option value="INTERNAL">🔔 Internal (banner)</option>
              <option value="FESTIVAL">✨ Festival (full screen)</option>
            </select>
          </div>
        </div>

        {/* Role targeting */}
        {selectedType === 'ROLE_TARGETED' && (
          <div>
            <label className="form-label">Target Roles *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              {ALL_ROLES.map(r => (
                <label key={r.value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={targetRoles.includes(r.value)}
                    onChange={() => toggleRole(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {targetRoles.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Select at least one role</p>
            )}
          </div>
        )}

        {/* User targeting */}
        {selectedType === 'USER_TARGETED' && (
          <div>
            <label className="form-label">Target Users *</label>
            <div className="max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
              {(usersData as Array<{ id: string; name: string; email: string }>).map(u => (
                <label key={u.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={targetUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  <span className="font-medium">{u.name}</span>
                  <span className="text-gray-400 text-xs">{u.email}</span>
                </label>
              ))}
            </div>
            {targetUserIds.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Select at least one user</p>
            )}
          </div>
        )}

        {/* Festival key */}
        {selectedSubtype === 'FESTIVAL' && (
          <div>
            <label className="form-label">Festival</label>
            <select className="form-select" {...register('festival_key')}>
              <option value="">Select festival…</option>
              {FESTIVAL_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Festival announcements show a full-screen themed overlay for all users when they log in.
            </p>
          </div>
        )}

        {selectedSubtype === 'INTERNAL' && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            🔔 Internal announcements appear as a banner at the top of the screen for all targeted users.
          </div>
        )}

        {/* Priority + Expires */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Priority</label>
            <select className="form-select" {...register('priority')}>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div>
            <label className="form-label">Expires At</label>
            <input type="date" className="form-input" {...register('expires_at')} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_pinned"
            className="rounded border-gray-300"
            {...register('is_pinned')}
          />
          <label htmlFor="is_pinned" className="text-sm text-gray-700 cursor-pointer inline-flex items-center gap-1">
            <Pin size={13} className="text-amber-500" />
            Pin this announcement
          </label>
        </div>

        <ModalActions>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>
            {editing ? 'Save Changes' : 'Publish'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AnnouncementsPage = () => {
  useParams<{ tenantSlug: string }>();
  const { user } = useAuth();
  const canManage = AUTHOR_ROLES.includes(user?.role ?? '');

  const [showModal, setShowModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const { data, isLoading, error } = useAnnouncements();
  const deleteAnnouncement = useDeleteAnnouncement();

  const rawAnnouncements: Announcement[] = (data as Announcement[]) ?? [];

  const announcements = [...rawAnnouncements].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const unreadCount = announcements.filter((a) => !a.isRead).length;

  const openCreate = () => { setEditingAnnouncement(null); setShowModal(true); };
  const openEdit = (a: Announcement) => { setEditingAnnouncement(a); setShowModal(true); };
  const handleModalClose = () => { setShowModal(false); setEditingAnnouncement(null); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteError('');
      await deleteAnnouncement.mutateAsync(deleteTarget);
      setDeleteTarget(null);
    } catch (err: unknown) {
      setDeleteError((err as Error).message);
    }
  };

  if (isLoading) return <Layout><PageSkeleton /></Layout>;

  return (
    <Layout>
      <Header
        title="Announcements"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread announcement${unreadCount !== 1 ? 's' : ''}`
            : `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''}`
        }
        actions={
          canManage ? (
            <Button onClick={openCreate} icon={<Plus size={16} />}>New Announcement</Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-4">
        {error && <Alert type="error" message={(error as Error).message} />}

        {announcements.length === 0 ? (
          <EmptyState
            title="No announcements"
            description="Important updates and news will appear here."
            icon={<Bell size={40} />}
            action={
              canManage ? (
                <Button onClick={openCreate} icon={<Plus size={16} />}>Create First Announcement</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={(id) => { setDeleteTarget(id); setDeleteError(''); }}
              />
            ))}
          </div>
        )}
      </div>

      <AnnouncementModal open={showModal} onClose={handleModalClose} editing={editingAnnouncement} />

      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        title="Delete Announcement"
        size="sm"
      >
        <div className="space-y-4">
          {deleteError && <Alert type="error" message={deleteError} />}
          <p className="text-sm text-gray-600">
            Are you sure you want to delete this announcement? This action cannot be undone.
          </p>
          <ModalActions>
            <Button variant="outline" type="button" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleteAnnouncement.isPending} onClick={handleDelete}>Delete</Button>
          </ModalActions>
        </div>
      </Modal>
    </Layout>
  );
};

export default AnnouncementsPage;
