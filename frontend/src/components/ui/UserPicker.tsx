import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import UserAvatar from './UserAvatar';

export interface UserOption {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string;
}

interface UserPickerProps {
  users: UserOption[];
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  excludeIds?: string[];
  allowEmpty?: boolean;
}

const UserPicker = ({
  users,
  value,
  onChange,
  placeholder = 'Assign to\u2026',
  excludeIds = [],
  allowEmpty = false,
}: UserPickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const available = users.filter((u) => !excludeIds.includes(u.id));
  const filtered = available.filter(
    (u) =>
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(search.toLowerCase())
  );
  const selected = users.find((u) => u.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="form-select w-full flex items-center gap-2 text-left min-h-[38px]"
      >
        {selected ? (
          <>
            <UserAvatar name={selected.name} avatarUrl={selected.avatarUrl} size="xs" />
            <span className="flex-1 text-sm text-ds-text truncate">{selected.name}</span>
            {selected.role && (
              <span className="text-xs text-ds-text-muted shrink-0 hidden sm:block">
                {selected.role.replace(/_/g, ' ')}
              </span>
            )}
            {allowEmpty && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') onChange(''); }}
                className="ml-1 text-ds-text-muted hover:text-ds-text"
              >
                <X size={12} />
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 text-sm text-ds-text-muted">{placeholder}</span>
        )}
        <ChevronDown
          size={14}
          className={`text-ds-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-ds-surface rounded-xl border border-ds-border shadow-xl overflow-hidden">
          <div className="p-2 border-b border-ds-border">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-text-muted pointer-events-none"
              />
              <input
                autoFocus
                className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg border border-ds-border bg-ds-surface text-ds-text placeholder:text-ds-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => select('')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-ds-surface-hover transition-colors ${!value ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
              >
                <div className="w-5 h-5 rounded-full bg-ds-surface-hover flex items-center justify-center shrink-0">
                  <span className="text-ds-text-muted text-xs">-</span>
                </div>
                <span className="text-sm text-ds-text-muted">Unassigned</span>
              </button>
            )}
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => select(u.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-ds-surface-hover transition-colors ${value === u.id ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
              >
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                <span className="flex-1 text-sm text-ds-text text-left truncate">{u.name}</span>
                {u.role && (
                  <span className="text-xs text-ds-text-muted shrink-0 bg-ds-surface-hover px-1.5 py-0.5 rounded">
                    {u.role.replace(/_/g, ' ')}
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-ds-text-muted text-center py-5">No users found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserPicker;
