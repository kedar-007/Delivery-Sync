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
}: {
  value: string;
  onChange: (val: string) => void;
  height?: number;
  placeholder?: string;
}) {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  return (
    <div data-color-mode={mode}>
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={height}
        preview="edit"
        textareaProps={{ placeholder: placeholder ?? 'Write a description… (Markdown supported)' }}
      />
    </div>
  );
}

// Read-only renderer for stored Markdown (bold, italic, lists, task checkboxes,
// code blocks, links, images, tables via GFM).
export function MarkdownView({ source, className }: { source?: string | null; className?: string }) {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  return (
    <div data-color-mode={mode} className={className}>
      <MDEditor.Markdown source={source ?? ''} style={{ background: 'transparent', fontSize: '0.875rem' }} />
    </div>
  );
}
