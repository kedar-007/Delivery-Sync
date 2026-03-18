import React from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-purple-100 text-purple-700',
  gray: 'bg-gray-100 text-gray-600',
};

const Badge = ({ children, variant = 'default', className }: BadgeProps) => (
  <span
    className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      variantClasses[variant],
      className
    )}
  >
    {children}
  </span>
);

export default Badge;

// ─── RAG Badge ────────────────────────────────────────────────────────────────

export const RAGBadge = ({ status }: { status: 'RED' | 'AMBER' | 'GREEN' | string }) => {
  const map: Record<string, { label: string; classes: string }> = {
    RED: { label: 'Red', classes: 'bg-red-100 text-red-700 border border-red-300' },
    AMBER: { label: 'Amber', classes: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
    GREEN: { label: 'Green', classes: 'bg-green-100 text-green-700 border border-green-300' },
  };
  const cfg = map[status] || { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold', cfg.classes)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', {
        'bg-red-500': status === 'RED',
        'bg-yellow-500': status === 'AMBER',
        'bg-green-500': status === 'GREEN',
      })} />
      {cfg.label}
    </span>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

export const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, BadgeVariant> = {
    ACTIVE: 'success', OPEN: 'warning', IN_PROGRESS: 'info', DONE: 'success',
    RESOLVED: 'success', COMPLETED: 'success', CANCELLED: 'gray', ESCALATED: 'danger',
    DELAYED: 'danger', PENDING: 'gray', INVITED: 'info', INACTIVE: 'gray',
    CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'gray',
    VALID: 'success', INVALID: 'danger', UNDER_REVIEW: 'warning',
    IMPLEMENTED: 'success', REVERSED: 'danger', MITIGATED: 'success',
  };
  return <Badge variant={map[status] || 'default'}>{status.replace(/_/g, ' ')}</Badge>;
};
