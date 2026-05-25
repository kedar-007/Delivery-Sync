import React from 'react';

/**
 * MarkdownText — visual renderer for AI-generated content.
 *
 * Handles only what the GLM/LLM responses actually produce:
 *   **bold**, *italic*, `code`, # / ## / ### headings, paragraph breaks,
 *   bullet lists (- / *), and numbered lists (1. 2. 3.).
 *
 * Custom JSX markers (colored dots, gradient numbered chips, accent bars
 * for section headers) — no reliance on CSS list-style which Tailwind's
 * preflight strips. Not a general-purpose markdown engine.
 */

type Accent = 'indigo' | 'violet' | 'blue' | 'amber' | 'emerald';

type Props = {
  text: string;
  /** Wrapper className applied to the outer container. */
  className?: string;
  /** Accent color used for headings, bullets, and number chips. Default: indigo. */
  accent?: Accent;
};

const ACCENT: Record<Accent, {
  headingText: string;
  headingBar:  string;
  bullet:      string;
  numberBg:    string;
  numberText:  string;
  italic:      string;
  code:        string;
  strong:      string;
}> = {
  indigo: {
    headingText: 'text-indigo-700',
    headingBar:  'from-indigo-500 to-purple-500',
    bullet:      'bg-indigo-500',
    numberBg:    'bg-gradient-to-br from-indigo-500 to-purple-500',
    numberText:  'text-white',
    italic:      'text-indigo-600',
    code:        'bg-indigo-50 text-indigo-700 border-indigo-100',
    strong:      'text-gray-900',
  },
  violet: {
    headingText: 'text-violet-700',
    headingBar:  'from-violet-500 to-fuchsia-500',
    bullet:      'bg-violet-500',
    numberBg:    'bg-gradient-to-br from-violet-500 to-fuchsia-500',
    numberText:  'text-white',
    italic:      'text-violet-600',
    code:        'bg-violet-50 text-violet-700 border-violet-100',
    strong:      'text-gray-900',
  },
  blue: {
    headingText: 'text-blue-700',
    headingBar:  'from-blue-500 to-cyan-500',
    bullet:      'bg-blue-500',
    numberBg:    'bg-gradient-to-br from-blue-500 to-cyan-500',
    numberText:  'text-white',
    italic:      'text-blue-600',
    code:        'bg-blue-50 text-blue-700 border-blue-100',
    strong:      'text-gray-900',
  },
  amber: {
    headingText: 'text-amber-700',
    headingBar:  'from-amber-500 to-orange-500',
    bullet:      'bg-amber-500',
    numberBg:    'bg-gradient-to-br from-amber-500 to-orange-500',
    numberText:  'text-white',
    italic:      'text-amber-700',
    code:        'bg-amber-50 text-amber-700 border-amber-100',
    strong:      'text-amber-900',
  },
  emerald: {
    headingText: 'text-emerald-700',
    headingBar:  'from-emerald-500 to-teal-500',
    bullet:      'bg-emerald-500',
    numberBg:    'bg-gradient-to-br from-emerald-500 to-teal-500',
    numberText:  'text-white',
    italic:      'text-emerald-700',
    code:        'bg-emerald-50 text-emerald-700 border-emerald-100',
    strong:      'text-gray-900',
  },
};

const MarkdownText: React.FC<Props> = ({ text, className = '', accent = 'indigo' }) => {
  if (!text) return null;
  const c = ACCENT[accent];
  const blocks = parseBlocks(text);
  return (
    <div className={`space-y-3 leading-relaxed ${className}`}>
      {blocks.map((block, i) => renderBlock(block, i, c))}
    </div>
  );
};

export default MarkdownText;

// ─── Block parsing ─────────────────────────────────────────────────────────

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'section'; text: string }              // a line that's just **Bold** — treated as a mini-heading
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string };

const BOLD_ONLY = /^\*\*([^*]+?):?\*\*\s*$/;       // matches "**Heading**" or "**Heading:**"

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Heading
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].replace(/:?\s*$/, '') });
      i++;
      continue;
    }

    // Line that is JUST bold (e.g. "**Complexity & Risk**") → render as section header
    const sectionOnly = BOLD_ONLY.exec(trimmed);
    if (sectionOnly) {
      blocks.push({ kind: 'section', text: sectionOnly[1] });
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Paragraph: gather contiguous non-blank lines that aren't another block
    const buf: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (/^(#{1,3})\s+/.test(next)) break;
      if (BOLD_ONLY.test(next))      break;
      if (/^[-*]\s+/.test(next))     break;
      if (/^\d+\.\s+/.test(next))    break;
      buf.push(next);
      i++;
    }
    blocks.push({ kind: 'p', text: buf.join(' ') });
  }

  return blocks;
}

// ─── Block rendering ───────────────────────────────────────────────────────

type C = typeof ACCENT[Accent];

function renderBlock(block: Block, key: number, c: C): React.ReactNode {
  switch (block.kind) {
    case 'heading': {
      const sz =
        block.level === 1 ? 'text-base' :
        block.level === 2 ? 'text-sm'   :
                            'text-sm';
      return (
        <div key={key} className="flex items-center gap-2 pt-1">
          <span className={`inline-block w-1 h-4 rounded-full bg-gradient-to-b ${c.headingBar}`} />
          <span className={`${sz} font-bold ${c.headingText} uppercase tracking-wide`}>
            {renderInline(block.text, c)}
          </span>
        </div>
      );
    }
    case 'section':
      return (
        <div key={key} className="flex items-center gap-2 pt-1">
          <span className={`inline-block w-1 h-4 rounded-full bg-gradient-to-b ${c.headingBar}`} />
          <span className={`text-xs font-bold ${c.headingText} uppercase tracking-wider`}>
            {block.text}
          </span>
        </div>
      );
    case 'ul':
      return (
        <ul key={key} className="space-y-1.5">
          {block.items.map((it, j) => (
            <li key={j} className="flex items-start gap-2.5">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${c.bullet}`} />
              <span className="flex-1">{renderInline(it, c)}</span>
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="space-y-1.5">
          {block.items.map((it, j) => (
            <li key={j} className="flex items-start gap-2.5">
              <span className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${c.numberBg} ${c.numberText} shadow-sm`}>
                {j + 1}
              </span>
              <span className="flex-1 pt-0.5">{renderInline(it, c)}</span>
            </li>
          ))}
        </ol>
      );
    case 'p':
      return <p key={key}>{renderInline(block.text, c)}</p>;
  }
}

// ─── Inline parsing: **bold**, *italic*, `code` ────────────────────────────
// Bold MUST be matched before italic since they share `*`.

function renderInline(text: string, c: C): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      out.push(
        <strong key={`b${k++}`} className={`font-semibold ${c.strong}`}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      out.push(
        <code key={`c${k++}`} className={`px-1.5 py-0.5 rounded border text-[0.85em] font-mono ${c.code}`}>
          {token.slice(1, -1)}
        </code>
      );
    } else {
      out.push(
        <em key={`i${k++}`} className={`italic ${c.italic}`}>
          {token.slice(1, -1)}
        </em>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
