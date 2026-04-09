import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  page, totalPages, total, pageSize, onPageChange, className,
}) => {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Build visible page numbers: always show first, last, current ±1
  const pages: (number | '...')[] = [];
  const addPage = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };
  addPage(1);
  if (page > 3) pages.push('...');
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) addPage(i);
  if (page < totalPages - 2) pages.push('...');
  if (totalPages > 1) addPage(totalPages);

  return (
    <div className={clsx('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="text-[var(--ds-text-muted)]">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded hover:bg-[var(--ds-surface-raised)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-[var(--ds-text-muted)]">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={clsx(
                'min-w-[28px] h-7 rounded text-xs font-medium transition-colors',
                p === page
                  ? 'bg-[var(--ds-primary)] text-white'
                  : 'hover:bg-[var(--ds-surface-raised)] text-[var(--ds-text)]',
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded hover:bg-[var(--ds-surface-raised)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
