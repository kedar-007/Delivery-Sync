import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Settings, Sun, Moon, X, BellRing, Bug } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n, LOCALES, LocaleCode } from '../../contexts/I18nContext';
import UserAvatar from '../ui/UserAvatar';
import NotificationBell from '../ui/NotificationBell';
import AttendanceWidget from '../ui/AttendanceWidget';
import ReportBugWidget from '../bugs/ReportBugWidget';
import { useMyProfile } from '../../hooks/useUsers';
import { useAnnouncements, useMarkAnnouncementRead } from '../../hooks/usePeople';
import { useFestival } from '../../contexts/FestivalContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

// ── Internal Announcement Banner ──────────────────────────────────────────────
const InternalBanner = () => {
  const { data } = useAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const all: any[] = Array.isArray(data) ? data : [];
  const internals = all.filter(
    a => a.subtype === 'INTERNAL' && !a.isRead && !dismissed.has(a.id)
  );

  if (internals.length === 0) return null;

  const a = internals[0]; // show the highest-priority unread internal one

  const dismiss = () => {
    markRead.mutate(a.id);
    setDismissed(prev => new Set(Array.from(prev).concat(a.id)));
  };

  const priorityStyle =
    a.priority === 'CRITICAL'
      ? { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '#ef4444' }
      : a.priority === 'HIGH'
      ? { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '#f59e0b' }
      : { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '#3b82f6' };

  return (
    <div
      style={{
        background: priorityStyle.bg,
        borderBottom: `1px solid ${priorityStyle.border}`,
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 40,
      }}
    >
      <BellRing size={15} style={{ color: priorityStyle.icon, flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: 13, color: priorityStyle.text, fontWeight: 500, lineHeight: 1.4 }}>
        <span style={{ fontWeight: 700 }}>{a.title}:</span>{' '}
        <span style={{ fontWeight: 400 }}>{a.content}</span>
        {internals.length > 1 && (
          <span style={{ fontWeight: 600, marginLeft: 8, opacity: 0.7 }}>
            +{internals.length - 1} more
          </span>
        )}
      </p>
      <button
        onClick={dismiss}
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          cursor: 'pointer', color: priorityStyle.icon, padding: 4, borderRadius: 4,
          display: 'flex', alignItems: 'center', opacity: 0.7,
          transition: 'opacity 0.2s',
        }}
        title="Dismiss"
      >
        <X size={15} />
      </button>
    </div>
  );
};

// ── Header ────────────────────────────────────────────────────────────────────
const Header = ({ title, subtitle, actions }: HeaderProps) => {
  const { user } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { isDark, setThemeId } = useTheme();
  const { locale, setLocale } = useI18n();
  const { data: profile } = useMyProfile();
  const { festival } = useFestival();
  const [bugOpen, setBugOpen] = useState(false);

  const toggleDark = () => setThemeId(isDark ? 'default' : 'dark');

  return (
    <div>
      {/* Festival gradient stripe */}
      {festival && (
        <div
          aria-hidden="true"
          style={{
            height: 3,
            background: festival.headerGradient,
            backgroundSize: '200% 100%',
            animation: 'hstripe 4s linear infinite',
          }}
        />
      )}
      <header
        className="border-b px-6 py-4 shrink-0"
        style={{
          backgroundColor: `rgb(var(--ds-surface))`,
          borderColor: `rgb(var(--ds-border))`,
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: `rgb(var(--ds-text))` }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm mt-0.5 truncate" style={{ color: `rgb(var(--ds-text-muted))` }}>
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <AttendanceWidget />
            <button
              onClick={toggleDark}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg transition-colors"
              style={{ color: `rgb(var(--ds-text-muted))` }}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as LocaleCode)}
                aria-label="Change language"
                className="appearance-none text-xs px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: `rgb(var(--ds-surface))`,
                  color: `rgb(var(--ds-text-muted))`,
                  borderColor: `rgb(var(--ds-border))`,
                }}
              >
                {(Object.entries(LOCALES) as [LocaleCode, typeof LOCALES[LocaleCode]][]).map(([code, loc]) => (
                  <option key={code} value={code}>{loc.flag} {loc.label}</option>
                ))}
              </select>
            </div>
            <NotificationBell />
            <button
              onClick={() => setBugOpen(true)}
              title="Report a bug or give feedback"
              className="p-2 rounded-lg transition-colors"
              style={{ color: `rgb(var(--ds-text-muted))` }}
            >
              <Bug size={18} />
            </button>
            <Link to={`/${tenantSlug}/settings`} aria-label="Settings" className="p-2 rounded-lg transition-colors" style={{ color: `rgb(var(--ds-text-muted))` }}>
              <Settings size={18} />
            </Link>
            <Link to={`/${tenantSlug}/profile`} aria-label="My profile">
              <UserAvatar name={user?.name ?? ''} avatarUrl={profile?.avatarUrl} size="sm" />
            </Link>
          </div>
        </div>
      </header>
      <InternalBanner />
      {user && <ReportBugWidget open={bugOpen} onOpenChange={setBugOpen} />}
    </div>
  );
};

export default Header;
