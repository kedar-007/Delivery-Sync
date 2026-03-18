import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = ({
  title = 'No data found',
  description = 'Nothing to show here yet.',
  icon,
  action,
}: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-14 text-center">
    <div className="text-gray-300 mb-3">{icon || <Inbox size={40} />}</div>
    <h3 className="text-sm font-medium text-gray-900">{title}</h3>
    <p className="text-sm text-gray-500 mt-1 max-w-xs">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default EmptyState;
