'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, FolderOpen } from 'lucide-react';

export interface ProjectOption {
  id: string;
  name: string;
  ragStatus?: string;
  status?: string;
}

interface ProjectPickerProps {
  projects: ProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  placeholder?: string;
}

const RAG_DOT: Record<string, string> = {
  RED:   'bg-red-500',
  AMBER: 'bg-amber-400',
  GREEN: 'bg-green-500',
};

const ProjectPicker = ({
  projects,
  value,
  onChange,
  placeholder = 'Search project…',
}: ProjectPickerProps) => {
  const [open, setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = projects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = projects.find((p) => p.id === value);

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
        className={`w-full flex items-center gap-2 text-left min-h-[40px] px-3 py-2 rounded-lg border bg-ds-surface text-sm transition-all
          ${!value
            ? 'border-amber-300 ring-1 ring-amber-200 hover:border-amber-400'
            : 'border-ds-border hover:border-blue-400 focus:ring-2 focus:ring-blue-500'
          }`}
      >
        {selected ? (
          <>
            {selected.ragStatus && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${RAG_DOT[selected.ragStatus] ?? 'bg-ds-text-muted'}`} />
            )}
            <FolderOpen size={14} className="text-indigo-500 shrink-0" />
            <span className="flex-1 text-ds-text truncate font-medium">{selected.name}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') onChange(''); }}
              className="ml-1 text-ds-text-muted hover:text-ds-text shrink-0"
              title="Clear"
            >
              <X size={13} />
            </span>
          </>
        ) : (
          <>
            <Search size={14} className="text-amber-400 shrink-0" />
            <span className="flex-1 text-ds-text-muted">{placeholder}</span>
          </>
        )}
        <ChevronDown
          size={14}
          className={`text-ds-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-ds-surface rounded-xl border border-ds-border shadow-xl overflow-hidden min-w-[260px]">
          <div className="p-2 border-b border-ds-border">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-text-muted pointer-events-none" />
              <input
                autoFocus
                className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg border border-ds-border bg-ds-surface text-ds-text placeholder:text-ds-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Search projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-ds-surface-hover transition-colors text-left
                  ${value === p.id ? 'bg-ds-surface-hover' : ''}`}
              >
                {p.ragStatus && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${RAG_DOT[p.ragStatus] ?? 'bg-ds-text-muted'}`} />
                )}
                <FolderOpen size={14} className="text-ds-text-muted shrink-0" />
                <span className="flex-1 text-sm text-ds-text truncate">{p.name}</span>
                {p.status && (
                  <span className="text-xs text-ds-text-muted shrink-0 bg-ds-surface-hover px-1.5 py-0.5 rounded capitalize">
                    {p.status.toLowerCase()}
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-ds-text-muted text-center py-5">No projects found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectPicker;
