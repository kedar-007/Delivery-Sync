import React from 'react';

const GRAD: Record<string, string> = {
  A: 'from-rose-400 to-pink-600', B: 'from-orange-400 to-red-500',
  C: 'from-amber-400 to-orange-500', D: 'from-yellow-400 to-amber-500',
  E: 'from-lime-400 to-green-500', F: 'from-green-400 to-teal-500',
  G: 'from-teal-400 to-cyan-500', H: 'from-cyan-400 to-blue-500',
  I: 'from-blue-400 to-indigo-500', J: 'from-indigo-400 to-violet-500',
  K: 'from-violet-400 to-purple-500', L: 'from-purple-400 to-fuchsia-500',
  M: 'from-fuchsia-400 to-pink-500', N: 'from-pink-400 to-rose-500',
  O: 'from-sky-400 to-blue-500', P: 'from-emerald-400 to-green-500',
  Q: 'from-cyan-500 to-teal-600', R: 'from-blue-500 to-indigo-600',
  S: 'from-violet-500 to-purple-600', T: 'from-green-500 to-emerald-600',
  U: 'from-amber-500 to-yellow-600', V: 'from-red-400 to-rose-500',
  W: 'from-indigo-400 to-blue-500', X: 'from-teal-400 to-green-500',
  Y: 'from-pink-400 to-fuchsia-500', Z: 'from-purple-400 to-indigo-500',
};

export const gradFor = (name: string) =>
  GRAD[(name?.[0] ?? 'A').toUpperCase()] ?? 'from-blue-500 to-violet-600';

interface UserAvatarProps {
  name?: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

const UserAvatar = ({ name = '', avatarUrl, size = 'sm', className = '' }: UserAvatarProps) => {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const sz = SIZES[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sz} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sz} rounded-full bg-gradient-to-br ${gradFor(name)} flex items-center justify-center text-white font-bold shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
};

export default UserAvatar;
