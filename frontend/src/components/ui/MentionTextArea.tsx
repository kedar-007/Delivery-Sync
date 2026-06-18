import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AtSign } from 'lucide-react';

export interface MentionUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange: (userIds: string[]) => void;
  users: MentionUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function MentionTextArea({
  value, onChange, onMentionsChange, users,
  placeholder = 'Add a comment… Type @ to mention someone',
  rows = 2, className = '', onKeyDown,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [query, setQuery]               = useState('');
  const [atIndex, setAtIndex]           = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  // Fixed-position coords so the dropdown escapes overflow-clipping parents
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const filtered = users.filter((u) =>
    query === '' || u.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6);

  const openDropdown = useCallback(() => {
    if (!textareaRef.current) return;
    const rect = textareaRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.min(224, rect.width),
      zIndex: 9999,
    });
  }, []);

  const commitMention = useCallback((user: MentionUser) => {
    if (atIndex === null) return;
    const before   = value.slice(0, atIndex);
    const after    = value.slice(atIndex + 1 + query.length);
    const inserted = `@${user.name} `;
    onChange(before + inserted + after);

    const next = new Set(mentionedIds);
    next.add(user.id);
    setMentionedIds(next);
    onMentionsChange(Array.from(next));

    setShowDropdown(false);
    setAtIndex(null);
    setQuery('');

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  }, [atIndex, query, value, mentionedIds, onChange, onMentionsChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onChange(val);

    const textBefore = val.slice(0, cursor);
    // Match @ followed by word chars only (space ends the mention query)
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setAtIndex(cursor - match[0].length);
      setQuery(match[1]);
      setSelectedIndex(0);
      setShowDropdown(true);
      openDropdown();
    } else {
      setShowDropdown(false);
      setAtIndex(null);
      setQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        commitMention(filtered[selectedIndex]);
        return;
      }
      if (e.key === 'Enter' && showDropdown) {
        e.preventDefault();
        commitMention(filtered[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowDropdown(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  // Reposition if the page scrolls while dropdown is open
  useEffect(() => {
    if (!showDropdown) return;
    const reposition = () => openDropdown();
    window.addEventListener('scroll', reposition, true);
    return () => window.removeEventListener('scroll', reposition, true);
  }, [showDropdown, openDropdown]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current && !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset tracked mentions when value is cleared externally
  useEffect(() => {
    if (value === '') {
      setMentionedIds(new Set());
      onMentionsChange([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 resize-none ${className}`}
      />

      {/* Subtle @ hint */}
      <div className="absolute bottom-2 right-2 pointer-events-none">
        <AtSign size={11} className="text-gray-300" />
      </div>

      {/* Dropdown rendered with fixed positioning to escape overflow:hidden parents */}
      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            <AtSign size={9} /> Mention someone
          </div>
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitMention(u); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${i === selectedIndex ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'}`}
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt={u.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                  {u.name[0]?.toUpperCase()}
                </span>
              )}
              <span className="font-medium truncate">{u.name}</span>
              {u.email && (
                <span className="text-gray-400 truncate text-[10px] ml-auto shrink-0">
                  {u.email.split('@')[0]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
