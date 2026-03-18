import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import UserAvatar, { gradFor } from './UserAvatar';
import { Mail, Briefcase, Users } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  DELIVERY_LEAD:      'bg-blue-100 text-blue-700',
  PROJECT_MANAGER:    'bg-blue-100 text-blue-700',
  SCRUM_MASTER:       'bg-indigo-100 text-indigo-700',
  PRODUCT_OWNER:      'bg-violet-100 text-violet-700',
  TECH_LEAD:          'bg-cyan-100 text-cyan-700',
  DEVELOPER:          'bg-green-100 text-green-700',
  SENIOR_DEVELOPER:   'bg-emerald-100 text-emerald-700',
  BUSINESS_ANALYST:   'bg-purple-100 text-purple-700',
  TESTER:             'bg-orange-100 text-orange-700',
  DESIGNER:           'bg-pink-100 text-pink-700',
  DEVOPS_ENGINEER:    'bg-gray-200 text-gray-700',
  STAKEHOLDER:        'bg-yellow-100 text-yellow-700',
  OBSERVER:           'bg-gray-100 text-gray-500',
  TENANT_ADMIN:       'bg-red-100 text-red-700',
  TEAM_MEMBER:        'bg-green-100 text-green-700',
  PMO:                'bg-indigo-100 text-indigo-700',
  EXEC:               'bg-amber-100 text-amber-700',
  CLIENT:             'bg-teal-100 text-teal-700',
  LEAD:               'bg-blue-100 text-blue-700',
  MEMBER:             'bg-gray-100 text-gray-600',
};

function formatRole(role?: string) {
  if (!role) return '';
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface UserHoverCardProps {
  name: string;
  role?: string;
  projectRole?: string;
  team?: string;
  email?: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

interface CardPos { top: number; left: number; placement: 'above' | 'below' }

const CARD_WIDTH = 280;
const CARD_HEIGHT = 240; // approximate

const UserHoverCard = ({
  name, role, projectRole, team, email, avatarUrl, size = 'sm', children,
}: UserHoverCardProps) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<CardPos>({ top: 0, left: 0, placement: 'above' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: center on trigger, clamp to viewport
    let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    left = Math.max(8, Math.min(left, vw - CARD_WIDTH - 8));

    // Vertical: prefer above; fall back to below if not enough space
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const placement: 'above' | 'below' = spaceAbove >= CARD_HEIGHT + 12 || spaceAbove >= spaceBelow
      ? 'above' : 'below';

    const top = placement === 'above'
      ? rect.top - CARD_HEIGHT - 10
      : rect.bottom + 10;

    setPos({ top, left, placement });
  };

  const open = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    computePos();
    timerRef.current = setTimeout(() => setShow(true), 180);
  };

  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 120);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const displayRole = projectRole || role;

  const card = show ? ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: CARD_WIDTH,
      minWidth: CARD_WIDTH,
        zIndex: 9999,
      }}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {/* Arrow */}
      {pos.placement === 'above' ? (
        <div style={{
          position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '7px solid white',
          filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.08))',
        }} />
      ) : (
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderBottom: '7px solid white',
          filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.08))',
        }} />
      )}

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)' }}>

        {/* Gradient header */}
        <div className={`bg-gradient-to-br ${gradFor(name)} px-5 pt-5 pb-14 relative`}>
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.4) 0%, transparent 60%)' }} />
        </div>

        {/* Avatar — overlaps header */}
        <div className="flex justify-center -mt-9 mb-2 relative">
          <div className="ring-4 ring-white rounded-full shadow-lg">
            <UserAvatar name={name} avatarUrl={avatarUrl} size="xl" />
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 text-center">
          <p className="text-sm font-bold text-gray-900 leading-tight">{name || '—'}</p>
          {email && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center justify-center gap-1 truncate">
              <Mail size={9} />{email}
            </p>
          )}

          {/* Role badges */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            {displayRole && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${ROLE_COLORS[displayRole] ?? 'bg-gray-100 text-gray-600'}`}>
                <Briefcase size={9} />{formatRole(displayRole)}
              </span>
            )}
            {projectRole && role && projectRole !== role && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600'}`}>
                {formatRole(role)}
              </span>
            )}
            {team && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                <Users size={9} />{team}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {children ?? <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />}
      {card}
    </div>
  );
};

export default UserHoverCard;
