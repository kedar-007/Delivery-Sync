import React from 'react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import { useTheme } from '../../contexts/ThemeContext';

// Markdown editor for task descriptions — ships with a toolbar (bold, italic,
// link, checklist, code, etc.) and a built-in edit/preview toggle. Controlled
// component: pass value/onChange (use with react-hook-form's <Controller>).
export default function MarkdownEditor({
  value,
  onChange,
  height = 220,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (val: string) => void;
  height?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const len = (value ?? '').length;
  const over = maxLength != null && len > maxLength;
  return (
    <div data-color-mode={mode}>
      <MDEditor
        value={value}
        // Hard-cap the length: the native textarea blocks typing past maxLength,
        // and we trim on change so a paste can't slip over the limit either.
        onChange={(v) => onChange(maxLength != null ? (v ?? '').slice(0, maxLength) : (v ?? ''))}
        height={height}
        preview="edit"
        textareaProps={{ placeholder: placeholder ?? 'Write a description… (Markdown supported)', maxLength }}
      />
      {maxLength != null && (
        <div className={`mt-1 text-right text-[11px] ${over ? 'text-red-600' : 'text-ds-text-muted'}`}>
          {len} / {maxLength}
        </div>
      )}
    </div>
  );
}

// Read-only renderer for stored Markdown (bold, italic, lists, task checkboxes,
// code blocks, links, images, tables via GFM).
export function MarkdownView({ source, className, maxHeight }: { source?: string | null; className?: string; maxHeight?: number }) {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  return (
    <div
      data-color-mode={mode}
      className={className}
      style={maxHeight != null ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      <MDEditor.Markdown source={source ?? ''} style={{ background: 'transparent', fontSize: '0.875rem' }} />
    </div>
  );
}
