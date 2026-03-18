import React from 'react';
import { clsx } from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };

const Spinner = ({ size = 'md', className }: SpinnerProps) => (
  <svg
    className={clsx('animate-spin text-blue-600', sizeMap[size], className)}
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export const PageLoader = () => (
  <div className="flex h-full items-center justify-center py-20">
    <Spinner size="lg" />
  </div>
);

export default Spinner;
