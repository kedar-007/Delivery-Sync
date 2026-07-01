import React, { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import Modal from '../ui/Modal';
import UserAvatar from '../ui/UserAvatar';
import { useReleaseSeenStatus, SeenPerson } from '../../hooks/useFeatureReleases';

interface Props {
  releaseId: string | null;
  releaseTitle?: string;
  onClose: () => void;
}

const fmtWhen = (s?: string) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const PersonRow = ({ p, seen }: { p: SeenPerson; seen: boolean }) => (
  <div className="flex items-center gap-3 px-1 py-2">
    <UserAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm text-ds-text">{p.name}</p>
      {p.email && <p className="truncate text-[11px] text-ds-text-muted">{p.email}</p>}
    </div>
    {seen ? (
      <span className="flex items-center gap-1 text-[11px] text-green-600 whitespace-nowrap">
        <Clock size={11} /> {fmtWhen(p.seen_at)}
      </span>
    ) : (
      <span className="text-[11px] text-ds-text-muted">Not yet</span>
    )}
  </div>
);

const SeenByModal = ({ releaseId, releaseTitle, onClose }: Props) => {
  const { data, isLoading } = useReleaseSeenStatus(releaseId);
  const [tab, setTab] = useState<'seen' | 'not'>('seen');

  const seen = data?.seen ?? [];
  const notSeen = data?.notSeen ?? [];
  const list = tab === 'seen' ? seen : notSeen;

  return (
    <Modal open={!!releaseId} onClose={onClose} title="Seen by" size="md">
      {releaseTitle && <p className="-mt-3 mb-3 truncate text-sm text-ds-text-muted">{releaseTitle}</p>}

      {/* Segmented tabs */}
      <div className="mb-2 flex rounded-lg bg-ds-surface-hover p-0.5 text-sm">
        <button
          onClick={() => setTab('seen')}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === 'seen' ? 'bg-ds-surface text-ds-text shadow-sm' : 'text-ds-text-muted'}`}
        >
          <span className="inline-flex items-center gap-1"><Check size={13} className="text-green-600" /> Seen ({seen.length})</span>
        </button>
        <button
          onClick={() => setTab('not')}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === 'not' ? 'bg-ds-surface text-ds-text shadow-sm' : 'text-ds-text-muted'}`}
        >
          Not seen ({notSeen.length})
        </button>
      </div>

      <div className="max-h-[55vh] divide-y divide-ds-border overflow-y-auto">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-ds-text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-ds-text-muted">
            {tab === 'seen' ? 'No one has seen this yet.' : 'Everyone has seen this 🎉'}
          </p>
        ) : (
          list.map((p) => <PersonRow key={p.id} p={p} seen={tab === 'seen'} />)
        )}
      </div>
    </Modal>
  );
};

export default SeenByModal;
