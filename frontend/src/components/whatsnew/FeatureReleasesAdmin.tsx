import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, Sparkles } from 'lucide-react';
import Modal, { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import MarkdownEditor from '../ui/MarkdownEditor';
import EmptyState from '../ui/EmptyState';
import { useConfirm } from '../ui/ConfirmDialog';
import {
  useManageReleases,
  useCreateRelease,
  useUpdateRelease,
  usePublishRelease,
  useDeleteRelease,
  FeatureRelease,
} from '../../hooks/useFeatureReleases';
import { PRESET_GIFS, toDataUri, resolveMedia } from './presetGifs';
import SeenByModal from './SeenByModal';

const CATEGORIES = ['NEW', 'IMPROVEMENT', 'FIX', 'BETA'];

interface FormState {
  title: string;
  category: string;
  version: string;
  media_url: string;
  cta_label: string;
  cta_route: string;
  description: string;
  is_published: boolean;
}

const emptyForm: FormState = {
  title: '', category: 'NEW', version: '', media_url: '',
  cta_label: 'Try it', cta_route: '', description: '', is_published: false,
};

const isTrue = (v: unknown) => v === true || String(v).toLowerCase() === 'true';

const FeatureReleasesAdmin = () => {
  const { data, isLoading } = useManageReleases();
  const releases = data?.releases ?? [];
  const totalUsers = data?.totalUsers ?? 0;
  const createRelease = useCreateRelease();
  const updateRelease = useUpdateRelease();
  const publishRelease = usePublishRelease();
  const deleteRelease = useDeleteRelease();
  const { confirm } = useConfirm();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [seenFor, setSeenFor] = useState<{ id: string; title: string } | null>(null);

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (r: FeatureRelease) => {
    setEditId(r.ROWID);
    setForm({
      title: r.title ?? '', category: (r.category || 'NEW').toUpperCase(), version: r.version ?? '',
      media_url: r.media_url ?? '', cta_label: r.cta_label ?? 'Try it', cta_route: r.cta_route ?? '',
      description: r.description ?? '', is_published: isTrue(r.is_published),
    });
    setOpen(true);
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) return;
    const payload = { ...form, title: form.title.trim() };
    if (editId) await updateRelease.mutateAsync({ id: editId, data: payload });
    else await createRelease.mutateAsync(payload);
    setOpen(false);
  };

  const onDelete = async (r: FeatureRelease) => {
    const ok = await confirm({ title: 'Delete release', message: `"${r.title}" will be permanently deleted.`, confirmText: 'Delete', variant: 'danger' });
    if (ok) deleteRelease.mutate(r.ROWID);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Sparkles size={15} className="text-blue-500" /> Feature Releases</h3>
          <p className="text-xs text-gray-500 mt-0.5">Publish "What's New" updates that every user sees in-app.</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>New Release</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : releases.length === 0 ? (
        <EmptyState title="No releases yet" description="Create your first release to announce a new feature." />
      ) : (
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {releases.map((r) => (
            <div key={r.ROWID} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700">
                {(r.category || 'NEW').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{r.title} {r.version && <span className="text-gray-400 font-normal">v{r.version}</span>}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  {isTrue(r.is_published) ? 'Published' : 'Draft'}
                  {isTrue(r.is_published) && (
                    <button
                      type="button"
                      onClick={() => setSeenFor({ id: r.ROWID, title: r.title })}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-blue-600 hover:underline"
                      title="See who has viewed this"
                    >
                      · <Eye size={11} /> Seen by {r.seen_count ?? 0}{totalUsers ? ` of ${totalUsers}` : ''}
                    </button>
                  )}
                </p>
              </div>
              <button
                onClick={() => publishRelease.mutate({ id: r.ROWID, publish: !isTrue(r.is_published) })}
                title={isTrue(r.is_published) ? 'Unpublish' : 'Publish'}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  isTrue(r.is_published) ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {isTrue(r.is_published) ? <Eye size={13} /> : <EyeOff size={13} />}
                {isTrue(r.is_published) ? 'Live' : 'Draft'}
              </button>
              <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md"><Edit2 size={14} /></button>
              <button onClick={() => onDelete(r)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 rounded-md"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Release' : 'New Release'} size="xl" closeOnBackdropClick={false}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="e.g. Task Work Hour Distribution" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Version <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className="form-input" placeholder="2.1" value={form.version} onChange={(e) => set('version', e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} />
                Publish now
              </label>
            </div>
          </div>
          <div>
            <label className="form-label">Description <span className="text-gray-400 font-normal">(Markdown — what it is &amp; how to use it)</span></label>
            <MarkdownEditor value={form.description} onChange={(v) => set('description', v)} placeholder="Describe the feature and how to use it…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Try-it button label</label>
              <input className="form-input" placeholder="Try it" value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Try-it route <span className="text-gray-400 font-normal">(e.g. /my-tasks)</span></label>
              <input className="form-input" placeholder="/my-tasks" value={form.cta_route} onChange={(e) => set('cta_route', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Graphic <span className="text-gray-400 font-normal">(pick a preset animation or paste an image/GIF URL)</span></label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_GIFS.map((g) => {
                const token = `preset:${g.key}`;
                const active = form.media_url === token;
                return (
                  <button
                    type="button"
                    key={g.key}
                    onClick={() => set('media_url', active ? '' : token)}
                    title={g.label}
                    className={`relative overflow-hidden rounded-lg border-2 transition-colors ${active ? 'border-blue-500' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <img src={toDataUri(g.svg)} alt={g.label} className="h-14 w-28 object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[9px] font-semibold text-center py-0.5">{g.label}</span>
                  </button>
                );
              })}
            </div>
            <input className="form-input" placeholder="https://…  (or use a preset above)" value={form.media_url.startsWith('preset:') ? '' : form.media_url} onChange={(e) => set('media_url', e.target.value)} />
            {form.media_url && (
              <img
                src={resolveMedia(form.media_url)}
                alt="preview"
                className="mt-2 max-h-40 w-full rounded-lg border border-gray-200 object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
        </div>
        <ModalActions>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={createRelease.isPending || updateRelease.isPending} disabled={!form.title.trim()}>
            {editId ? 'Save Changes' : 'Create Release'}
          </Button>
        </ModalActions>
      </Modal>

      <SeenByModal releaseId={seenFor?.id ?? null} releaseTitle={seenFor?.title} onClose={() => setSeenFor(null)} />
    </div>
  );
};

export default FeatureReleasesAdmin;
