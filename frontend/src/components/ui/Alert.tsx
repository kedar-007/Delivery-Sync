import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

type AlertType = 'error' | 'success' | 'info' | 'warning';

interface AlertProps {
  type?: AlertType;
  message: string;
  className?: string;
}

const config: Record<AlertType, { icon: React.ReactNode; classes: string }> = {
  error: { icon: <AlertCircle size={16} />, classes: 'bg-red-50 text-red-700 border-red-200' },
  success: { icon: <CheckCircle size={16} />, classes: 'bg-green-50 text-green-700 border-green-200' },
  info: { icon: <Info size={16} />, classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  warning: { icon: <AlertTriangle size={16} />, classes: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
};

const Alert = ({ type = 'info', message, className }: AlertProps) => {
  const { icon, classes } = config[type];
  return (
    <div className={clsx('flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm', classes, className)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{message}</span>
    </div>
  );
};

export default Alert;
