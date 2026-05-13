import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
}

// Surface + border come from the theme tokens (--ds-surface, --ds-border) so
// the card adapts to every theme — including the dark "Midnight" / "Aurora"
// themes where a hardcoded white card would punch a glaring hole through
// the dark background.
const Card = ({ children, className, padding = true, onClick }: CardProps) => (
  <div
    className={clsx('bg-ds-surface rounded-xl border border-ds-border shadow-sm', padding && 'p-5', className)}
    onClick={onClick}
  >
    {children}
  </div>
);

export const CardHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={clsx('flex items-center justify-between mb-4', className)}>{children}</div>
);

export const CardTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={clsx('text-base font-semibold text-ds-text', className)}>{children}</h3>
);

export const StatCard = ({
  label, value, sublabel, icon, color = 'blue',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'red' | 'green' | 'amber' | 'purple';
}) => {
  // Accent backgrounds stay literal — they're semantic colours used to
  // categorise the stat (red for overdue, green for healthy, etc.) and should
  // look consistent across themes rather than morph into surface colours.
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
    green: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300',
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-ds-text-muted">{label}</p>
          <p className="text-2xl font-bold text-ds-text mt-1">{value}</p>
          {sublabel && <p className="text-xs text-ds-text-muted opacity-70 mt-0.5">{sublabel}</p>}
        </div>
        {icon && (
          <div className={clsx('p-2.5 rounded-lg', colorMap[color])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

export default Card;
