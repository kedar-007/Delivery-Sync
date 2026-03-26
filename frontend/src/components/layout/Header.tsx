import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Settings, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n, LOCALES, LocaleCode } from '../../contexts/I18nContext';
import UserAvatar from '../ui/UserAvatar';
import NotificationBell from '../ui/NotificationBell';
import AttendanceWidget from '../ui/AttendanceWidget';
import { useMyProfile } from '../../hooks/useUsers';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const Header = ({ title, subtitle, actions }: HeaderProps) => {
  const { user } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { isDark, setThemeId, themeId } = useTheme();
  const { locale, setLocale } = useI18n();
  const { data: profile } = useMyProfile();

  const toggleDark = () => {
    if (isDark) {
      // Return to default light theme
      setThemeId('default');
    } else {
      setThemeId('dark');
    }
  };

  return (
    <header
      className="border-b px-6 py-4 shrink-0"
      style={{
        backgroundColor: `rgb(var(--ds-surface))`,
        borderColor: `rgb(var(--ds-border))`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Title */}
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

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {actions}

          {/* Attendance widget */}
          <AttendanceWidget />

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-lg transition-colors"
            style={{ color: `rgb(var(--ds-text-muted))` }}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Language switcher */}
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
                <option key={code} value={code}>
                  {loc.flag} {loc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notifications */}
          <NotificationBell />

          {/* Settings shortcut */}
          <Link
            to={`/${tenantSlug}/settings`}
            aria-label="Settings"
            className="p-2 rounded-lg transition-colors"
            style={{ color: `rgb(var(--ds-text-muted))` }}
            title="Settings"
          >
            <Settings size={18} />
          </Link>

          {/* User avatar */}
          <Link to={`/${tenantSlug}/profile`} aria-label="My profile">
            <UserAvatar name={user?.name ?? ''} avatarUrl={profile?.avatarUrl} size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
