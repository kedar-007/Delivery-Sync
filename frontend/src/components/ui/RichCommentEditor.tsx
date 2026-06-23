import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link, Code, Quote, Type, ChevronDown, Check, X,
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface RichCommentEditorProps {
  value: string;
  onChange: (html: string) => void;
  onMentionsChange?: (ids: string[]) => void;
  users?: User[];
  /** IDs of users who are members of this task (assignees + creator). When provided the
   *  mention dropdown shows task members first and non-members in a separate "Others" section. */
  taskMemberIds?: string[];
  placeholder?: string;
  minHeight?: number;
  onCtrlEnter?: () => void;
}

const FONT_SIZES = ['10', '12', '13', '14', '16', '18', '20', '24'];

const COLORS = [
  { label: 'Black',   hex: '#111827' },
  { label: 'Gray',    hex: '#6b7280' },
  { label: 'Red',     hex: '#ef4444' },
  { label: 'Orange',  hex: '#f97316' },
  { label: 'Amber',   hex: '#d97706' },
  { label: 'Green',   hex: '#16a34a' },
  { label: 'Blue',    hex: '#2563eb' },
  { label: 'Indigo',  hex: '#4f46e5' },
  { label: 'Purple',  hex: '#7c3aed' },
  { label: 'Pink',    hex: '#db2777' },
  { label: 'Teal',    hex: '#0d9488' },
  { label: 'White',   hex: '#ffffff' },
];

function getMentionIds(html: string): string[] {
  const d = document.createElement('div');
  d.innerHTML = html;
  return Array.from(d.querySelectorAll('[data-mention-id]'))
    .map((s) => s.getAttribute('data-mention-id') ?? '')
    .filter(Boolean);
}

function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
}

function isEffectivelyEmpty(html: string): boolean {
  if (!html) return true;
  return !html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function renderRichContent(
  content: string,
  users: { id?: string; name?: string }[],
): React.ReactNode {
  if (!content) return null;
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return (
      <div
        className="rich-content leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-500 [&_pre]:bg-gray-100 [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:bg-gray-100 [&_code]:rounded [&_code]:px-1 [&_code]:text-xs [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_span[data-mention]]:inline-flex [&_span[data-mention]]:items-center [&_span[data-mention]]:bg-indigo-100 [&_span[data-mention]]:text-indigo-700 [&_span[data-mention]]:rounded-md [&_span[data-mention]]:px-1.5 [&_span[data-mention]]:font-semibold [&_span[data-mention]]:text-[1em] [&_span[data-mention]]:leading-none [&_span[data-mention]]:mx-0.5"
        dangerouslySetInnerHTML={{ __html: sanitize(content) }}
      />
    );
  }
  const parts = content.split(/(@[A-Za-z][A-Za-z ]*[A-Za-z]|@[A-Za-z]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const candidate = part.slice(1).trim();
          const matched = users.find(
            (u) => (u.name ?? '').toLowerCase() === candidate.toLowerCase(),
          );
          if (matched) {
            return (
              <span key={i} className="inline text-indigo-600 font-semibold bg-indigo-50 rounded px-1">
                @{matched.name}
              </span>
            );
          }
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export default function RichCommentEditor({
  value,
  onChange,
  onMentionsChange,
  users = [],
  taskMemberIds,
  placeholder = 'Write a comment… Type @ to mention someone',
  minHeight = 100,
  onCtrlEnter,
}: RichCommentEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [isEmpty, setIsEmpty] = useState(true);

  // Pickers
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState('14');

  // Inline link input
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  // @mention
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState({ x: 0, y: 0 });
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const initialized = useRef(false);

  /* ── Initialize ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!initialized.current && editorRef.current) {
      if (value) editorRef.current.innerHTML = value;
      setIsEmpty(isEffectivelyEmpty(value));
      initialized.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!value && editorRef.current && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = '';
      setIsEmpty(true);
    }
  }, [value]);

  /* ── Save selection whenever it changes ─────────────────────── */
  useEffect(() => {
    const save = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const editor = editorRef.current;
      if (!editor) return;
      try {
        if (editor.contains(range.commonAncestorContainer) || editor === range.commonAncestorContainer) {
          savedRangeRef.current = range.cloneRange();
        }
      } catch {}
    };
    document.addEventListener('selectionchange', save);
    return () => document.removeEventListener('selectionchange', save);
  }, []);

  /* ── Update toolbar active states ───────────────────────────── */
  const updateActiveFormats = useCallback(() => {
    try {
      const f = new Set<string>();
      if (document.queryCommandState('bold'))               f.add('bold');
      if (document.queryCommandState('italic'))             f.add('italic');
      if (document.queryCommandState('underline'))          f.add('underline');
      if (document.queryCommandState('strikeThrough'))      f.add('strike');
      if (document.queryCommandState('insertUnorderedList'))f.add('ul');
      if (document.queryCommandState('insertOrderedList'))  f.add('ol');
      if (document.queryCommandState('justifyCenter'))      f.add('center');
      if (document.queryCommandState('justifyRight'))       f.add('right');
      if (document.queryCommandState('justifyFull'))        f.add('justify');
      setActiveFormats(f);
    } catch {}
  }, []);

  /* ── Core format executor ────────────────────────────────────── */
  const execFormat = useCallback(
    (cmd: string, val?: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      // 1. Focus editor
      editor.focus();

      // 2. Restore saved selection (critical — toolbar click may clear it)
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
        }
      }

      // 3. Enable CSS-based formatting (spans instead of deprecated tags)
      try { document.execCommand('styleWithCSS', false, 'true'); } catch {}

      // 4. Execute
      try { document.execCommand(cmd, false, val ?? undefined); } catch {}

      // 5. Update state
      updateActiveFormats();
      const html = editor.innerHTML;
      onChange(html);
      setIsEmpty(isEffectivelyEmpty(html));
      onMentionsChange?.(getMentionIds(html));
    },
    [onChange, onMentionsChange, updateActiveFormats],
  );

  /* ── Font size ──────────────────────────────────────────────── */
  const applyFontSize = useCallback(
    (size: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
      }

      // execCommand fontSize uses 1-7 scale; use a sentinel then replace
      try { document.execCommand('fontSize', false, '7'); } catch {}
      editor.querySelectorAll('font[size="7"]').forEach((el) => {
        const span = document.createElement('span');
        span.style.fontSize = `${size}px`;
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      });

      setCurrentFontSize(size);
      setShowFontSize(false);
      const html = editor.innerHTML;
      onChange(html);
    },
    [onChange],
  );

  /* ── Link insertion ─────────────────────────────────────────── */
  const openLinkInput = () => {
    setShowLinkInput(true);
    setLinkUrl('');
    setShowColorPicker(false);
    setShowFontSize(false);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  };

  const confirmLink = () => {
    if (linkUrl.trim()) {
      const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
      execFormat('createLink', url);
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const cancelLink = () => {
    setShowLinkInput(false);
    setLinkUrl('');
  };

  /* ── Input handler ──────────────────────────────────────────── */
  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    onChange(html);
    setIsEmpty(isEffectivelyEmpty(html));
    updateActiveFormats();
    onMentionsChange?.(getMentionIds(html));

    // @mention detection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMentionQuery(null); return; }
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); return; }
    const textBefore = (container.textContent ?? '').slice(0, range.startOffset);
    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx !== -1) {
      const q = textBefore.slice(atIdx + 1);
      if (!q.includes(' ') && q.length <= 20) {
        setMentionQuery(q);
        setMentionHighlight(0);
        const rect = range.getBoundingClientRect();
        const edRect = editor.getBoundingClientRect();
        setMentionPos({ x: Math.max(0, rect.left - edRect.left), y: rect.bottom - edRect.top + 4 });
        return;
      }
    }
    setMentionQuery(null);
  }, [onChange, onMentionsChange, updateActiveFormats]);

  /* ── @mention insertion ─────────────────────────────────────── */
  const memberIdSet = React.useMemo(() => new Set(taskMemberIds ?? []), [taskMemberIds]);
  const hasMemberFilter = (taskMemberIds?.length ?? 0) > 0;

  const { mentionMembers, mentionOthers } = React.useMemo(() => {
    if (mentionQuery === null) return { mentionMembers: [], mentionOthers: [] };
    const q = mentionQuery.toLowerCase();
    const matches = users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
    if (!hasMemberFilter) return { mentionMembers: matches.slice(0, 8), mentionOthers: [] };
    const members = matches.filter((u) => memberIdSet.has(u.id)).slice(0, 6);
    const others  = matches.filter((u) => !memberIdSet.has(u.id)).slice(0, 4);
    return { mentionMembers: members, mentionOthers: others };
  }, [mentionQuery, users, hasMemberFilter, memberIdSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // flat list used for keyboard highlight index
  const filteredUsers = [...mentionMembers, ...mentionOthers];

  const insertMention = useCallback(
    (user: User) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      if (container.nodeType !== Node.TEXT_NODE) return;
      const text = container.textContent ?? '';
      const offset = range.startOffset;
      const atIdx = text.slice(0, offset).lastIndexOf('@');
      const before = text.slice(0, atIdx);
      const after = text.slice(offset);

      const span = document.createElement('span');
      span.setAttribute('data-mention', 'true');
      span.setAttribute('data-mention-id', user.id);
      span.contentEditable = 'false';
      span.className = 'inline-flex items-center bg-indigo-100 text-indigo-700 rounded-md px-1.5 font-semibold select-none mx-0.5';
      span.textContent = `@${user.name}`;

      const beforeNode = document.createTextNode(before);
      const afterNode = document.createTextNode(' ' + after);
      (container as Text).replaceWith(beforeNode, span, afterNode);

      const nr = document.createRange();
      nr.setStart(afterNode, 1);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);

      setMentionQuery(null);
      const html = editor.innerHTML;
      onChange(html);
      setIsEmpty(false);
      onMentionsChange?.(getMentionIds(html));
    },
    [onChange, onMentionsChange],
  );

  /* ── Keyboard ───────────────────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onCtrlEnter?.(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); execFormat('bold'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); execFormat('italic'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'u') { e.preventDefault(); execFormat('underline'); return; }

      // Mention picker navigation
      if (mentionQuery !== null && filteredUsers.length > 0) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight((h) => Math.min(h + 1, filteredUsers.length - 1)); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionHighlight((h) => Math.max(h - 1, 0)); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredUsers[mentionHighlight]); return; }
        if (e.key === 'Escape') { setMentionQuery(null); return; }
      }

      // Single-backspace removal of mention chips.
      // contentEditable=false spans normally need TWO backspaces (first selects, second deletes)
      // which breaks multi-mention removal. Handle it explicitly instead.
      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.getRangeAt(0).collapsed) {
          const range = sel.getRangeAt(0);
          const { startContainer, startOffset } = range;
          let candidate: ChildNode | null = null;

          if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
            candidate = startContainer.previousSibling;
          } else if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
            candidate = (startContainer as Element).childNodes[startOffset - 1];
          }

          if (candidate instanceof Element && candidate.getAttribute('data-mention') === 'true') {
            e.preventDefault();
            const prevSibling = candidate.previousSibling;
            candidate.parentNode?.removeChild(candidate);

            // Reposition cursor: end of the node before the removed span
            if (prevSibling) {
              const nr = document.createRange();
              if (prevSibling.nodeType === Node.TEXT_NODE) {
                nr.setStart(prevSibling, prevSibling.textContent?.length ?? 0);
              } else {
                const parent = prevSibling.parentNode!;
                nr.setStart(parent, Array.from(parent.childNodes).indexOf(prevSibling as ChildNode) + 1);
              }
              nr.collapse(true);
              sel.removeAllRanges();
              sel.addRange(nr);
            }

            const html = editorRef.current!.innerHTML;
            onChange(html);
            setIsEmpty(isEffectivelyEmpty(html));
            onMentionsChange?.(getMentionIds(html));
            return;
          }
        }
      }
    },
    [execFormat, filteredUsers, insertMention, mentionHighlight, mentionQuery, onCtrlEnter, onChange, onMentionsChange],
  );

  /* ── Close pickers on outside click ────────────────────────── */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-rce-picker]')) {
        setShowColorPicker(false);
        setShowFontSize(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="border border-ds-border rounded-xl overflow-visible bg-ds-bg focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400 transition-all">

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-px px-2 py-1.5 border-b border-ds-border bg-ds-surface rounded-t-xl">

        {/* Formatting */}
        <Btn active={activeFormats.has('bold')}   onCmd={() => execFormat('bold')}        title="Bold (⌘B)"><Bold size={13} /></Btn>
        <Btn active={activeFormats.has('italic')} onCmd={() => execFormat('italic')}      title="Italic (⌘I)"><Italic size={13} /></Btn>
        <Btn active={activeFormats.has('underline')} onCmd={() => execFormat('underline')} title="Underline (⌘U)"><Underline size={13} /></Btn>
        <Btn active={activeFormats.has('strike')} onCmd={() => execFormat('strikeThrough')} title="Strikethrough"><Strikethrough size={13} /></Btn>

        <Sep />

        {/* Font size */}
        <div className="relative" data-rce-picker>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowFontSize((v) => !v); setShowColorPicker(false); }}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[11px] font-medium text-ds-text hover:bg-ds-surface-hover transition-colors min-w-[44px]"
            title="Font Size"
          >
            {currentFontSize}<span className="text-[9px] text-ds-text-muted">px</span><ChevronDown size={9} className="ml-0.5 text-ds-text-muted" />
          </button>
          {showFontSize && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-ds-surface border border-ds-border rounded-xl shadow-xl py-1 min-w-[72px]">
              {FONT_SIZES.map((s) => (
                <button key={s} type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyFontSize(s); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-ds-surface-hover transition-colors ${s === currentFontSize ? 'text-indigo-600 font-semibold' : 'text-ds-text'}`}
                >
                  {s}px
                  {s === currentFontSize && <Check size={10} className="text-indigo-500" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text color */}
        <div className="relative" data-rce-picker>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowColorPicker((v) => !v); setShowFontSize(false); }}
            className="p-1.5 rounded hover:bg-ds-surface-hover transition-colors flex flex-col items-center gap-0.5"
            title="Text Color"
          >
            <Type size={12} className="text-ds-text" />
            <div className="w-4 h-1 rounded-full bg-indigo-600" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-ds-surface border border-ds-border rounded-xl shadow-xl p-3 w-[176px]">
              <p className="text-[10px] text-ds-text-muted font-semibold uppercase tracking-wider mb-2">Text Color</p>
              <div className="grid grid-cols-6 gap-1.5">
                {COLORS.map((c) => (
                  <button key={c.hex} type="button"
                    onMouseDown={(e) => { e.preventDefault(); execFormat('foreColor', c.hex); setShowColorPicker(false); }}
                    className="w-6 h-6 rounded-lg border-2 border-white shadow-sm hover:scale-110 transition-transform ring-1 ring-black/10 focus:outline-none"
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <Sep />

        {/* Lists */}
        <Btn active={activeFormats.has('ul')} onCmd={() => execFormat('insertUnorderedList')} title="Bullet List"><List size={13} /></Btn>
        <Btn active={activeFormats.has('ol')} onCmd={() => execFormat('insertOrderedList')} title="Numbered List"><ListOrdered size={13} /></Btn>

        <Sep />

        {/* Alignment */}
        <Btn onCmd={() => execFormat('justifyLeft')}   title="Align Left">   <AlignLeft size={13} /></Btn>
        <Btn active={activeFormats.has('center')} onCmd={() => execFormat('justifyCenter')} title="Center"><AlignCenter size={13} /></Btn>
        <Btn active={activeFormats.has('right')}  onCmd={() => execFormat('justifyRight')} title="Align Right"><AlignRight size={13} /></Btn>
        <Btn active={activeFormats.has('justify')}onCmd={() => execFormat('justifyFull')}  title="Justify"><AlignJustify size={13} /></Btn>

        <Sep />

        {/* Blocks & Link */}
        <Btn onCmd={() => execFormat('formatBlock', 'blockquote')} title="Block Quote"><Quote size={13} /></Btn>
        <Btn onCmd={() => execFormat('formatBlock', 'pre')} title="Code Block"><Code size={13} /></Btn>
        <Btn onCmd={openLinkInput} title="Insert Link"><Link size={13} /></Btn>
      </div>

      {/* ── Link Input Row ────────────────────────────────────── */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-ds-border bg-indigo-50/60">
          <Link size={13} className="text-indigo-500 shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmLink(); }
              if (e.key === 'Escape') cancelLink();
            }}
            placeholder="https://example.com"
            className="flex-1 text-sm bg-transparent border-none outline-none text-ds-text placeholder:text-ds-text-muted"
          />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); confirmLink(); }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
            <Check size={11} /> Apply
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); cancelLink(); }}
            className="p-1 text-ds-text-muted hover:text-red-500 transition-colors rounded">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Editor area ───────────────────────────────────────── */}
      <div className="relative">
        {isEmpty && (
          <div className="absolute top-3 left-3 right-3 text-ds-text-muted text-sm pointer-events-none select-none leading-relaxed">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={updateActiveFormats}
          onMouseUp={updateActiveFormats}
          style={{ minHeight }}
          className="px-3 py-3 text-sm text-ds-text outline-none leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-500 [&_blockquote]:my-1 [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:text-xs [&_pre]:font-mono [&_pre]:overflow-x-auto [&_pre]:my-1"
        />

        {/* @Mention dropdown */}
        {mentionQuery !== null && filteredUsers.length > 0 && (
          <div
            className="absolute z-50 bg-ds-surface border border-ds-border rounded-xl shadow-xl overflow-hidden"
            style={{ left: Math.max(0, mentionPos.x), top: mentionPos.y, minWidth: 220, maxWidth: 280 }}
          >
            {/* Task Members section */}
            {mentionMembers.length > 0 && (
              <>
                <div className="px-3 py-1.5 border-b border-ds-border bg-ds-surface-hover/40">
                  <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide">Task Members</p>
                </div>
                {mentionMembers.map((u, idx) => (
                  <MentionRow key={u.id} user={u} highlighted={idx === mentionHighlight} onSelect={() => insertMention(u)} />
                ))}
              </>
            )}

            {/* Others section — non-task-members or all when no filter */}
            {mentionOthers.length > 0 && (
              <>
                <div className={`px-3 py-1.5 border-ds-border bg-ds-surface-hover/20 ${mentionMembers.length > 0 ? 'border-t' : ''}`}>
                  <p className="text-[10px] text-ds-text-muted font-semibold uppercase tracking-wide">
                    {hasMemberFilter ? 'Others' : 'Users'}
                  </p>
                </div>
                {mentionOthers.map((u, idx) => (
                  <MentionRow
                    key={u.id}
                    user={u}
                    highlighted={mentionMembers.length + idx === mentionHighlight}
                    onSelect={() => insertMention(u)}
                    dimmed
                  />
                ))}
              </>
            )}

            {/* No filter — single list */}
            {mentionOthers.length === 0 && mentionMembers.length === 0 && null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function MentionRow({
  user, highlighted, onSelect, dimmed = false,
}: {
  user: User;
  highlighted: boolean;
  onSelect: () => void;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left ${
        highlighted ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-ds-surface-hover'
      } ${dimmed ? 'opacity-75' : ''}`}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <span className="w-7 h-7 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
          {user.name[0]?.toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ds-text truncate">{user.name}</p>
        <p className="text-[10px] text-ds-text-muted truncate">{user.email}</p>
      </div>
    </button>
  );
}

function Btn({
  children, onCmd, active, title,
}: {
  children: React.ReactNode;
  onCmd: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus / selection intact
        onCmd();
      }}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
          : 'text-ds-text hover:bg-ds-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-ds-border mx-0.5 shrink-0" />;
}
