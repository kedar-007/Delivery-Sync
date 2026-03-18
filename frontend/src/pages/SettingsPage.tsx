import React, { useState } from 'react';
import { Check, RotateCcw, ChevronUp, ChevronDown, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useTheme, THEME_PRESETS } from '../contexts/ThemeContext';
import { useI18n, LOCALES, LocaleCode } from '../contexts/I18nContext';
import { useSidebar } from '../contexts/SidebarContext';
import type { DensityLevel, FontSizeLevel } from '../lib/themes';

// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section = ({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) => (
  <div
    className="rounded-2xl border shadow-sm overflow-hidden"
    style={{ backgroundColor: `rgb(var(--ds-surface))`, borderColor: `rgb(var(--ds-border))` }}
  >
    <div className="px-6 py-5 border-b" style={{ borderColor: `rgb(var(--ds-border))` }}>
      <h3 className="text-sm font-semibold" style={{ color: `rgb(var(--ds-text))` }}>{title}</h3>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: `rgb(var(--ds-text-muted))` }}>{subtitle}</p>}
    </div>
    <div className="p-6">{children}</div>
  </div>
);

// ─── Pill button ──────────────────────────────────────────────────────────────

const Pill = ({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="px-4 py-2 rounded-lg text-sm font-medium border transition-all focus:outline-none focus-visible:ring-2"
    style={{
      backgroundColor: active ? `rgb(var(--ds-primary))` : `rgb(var(--ds-surface-hover))`,
      color: active ? `rgb(var(--ds-text-inverse))` : `rgb(var(--ds-text))`,
      borderColor: active ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
    }}
  >
    {children}
  </button>
);

// ─── Theme card ───────────────────────────────────────────────────────────────

const ThemeCard = ({ id, name, emoji, isDark, active, onSelect }: {
  id: string; name: string; emoji: string; isDark: boolean;
  active: boolean; onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    aria-pressed={active}
    aria-label={`Select ${name} theme`}
    className="relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 group"
    style={{
      borderColor: active ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
      backgroundColor: active ? `rgb(var(--ds-primary) / 0.06)` : `rgb(var(--ds-surface-hover))`,
    }}
  >
    <div className="text-2xl" role="img" aria-hidden="true">{emoji}</div>
    <div className="flex items-center gap-1">
      {isDark ? <Moon size={10} /> : <Sun size={10} />}
      <span className="text-xs font-medium" style={{ color: `rgb(var(--ds-text))` }}>{name}</span>
    </div>
    {active && (
      <div
        className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `rgb(var(--ds-primary))` }}
      >
        <Check size={10} color="white" />
      </div>
    )}
  </button>
);

// ─── Toggle switch ────────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void;
  label: string; description?: string;
}) => (
  <label className="flex items-start gap-4 cursor-pointer group">
    <div className="flex-1">
      <p className="text-sm font-medium" style={{ color: `rgb(var(--ds-text))` }}>{label}</p>
      {description && <p className="text-xs mt-0.5" style={{ color: `rgb(var(--ds-text-muted))` }}>{description}</p>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 shrink-0 mt-0.5`}
      style={{ backgroundColor: checked ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))` }}
    >
      <span
        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  </label>
);

// ─── Main Settings page ───────────────────────────────────────────────────────

const SettingsPage = () => {
  const { themeId, setThemeId, density, setDensity, fontSize, setFontSize, autoTheme, setAutoTheme, resetToDefault } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const { collapsed, setCollapsed, items, toggleItem, moveItem, resetItems } = useSidebar();
  const [saved, setSaved] = useState(false);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetToDefault();
    resetItems();
    flash();
  };

  return (
    <Layout>
      <Header
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <div className="p-6 max-w-3xl space-y-6">

        {/* ── Appearance ────────────────────────────────────────────────────── */}
        <Section title={t('settings.theme.title')} subtitle={t('settings.theme.subtitle')}>
          <div className="space-y-6">

            {/* Theme presets */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3"
                style={{ color: `rgb(var(--ds-text-muted))` }}>
                {t('settings.theme.themeLabel')}
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {THEME_PRESETS.map((p) => (
                  <ThemeCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    emoji={p.emoji}
                    isDark={p.isDark}
                    active={themeId === p.id}
                    onSelect={() => { setThemeId(p.id); flash(); }}
                  />
                ))}
              </div>
            </div>

            {/* Auto theme */}
            <Toggle
              checked={autoTheme}
              onChange={(v) => { setAutoTheme(v); flash(); }}
              label={t('settings.theme.autoTheme')}
              description={t('settings.theme.autoThemeDesc')}
            />

            {/* Density */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: `rgb(var(--ds-text-muted))` }}>
                {t('settings.theme.density')}
              </p>
              <div className="flex gap-2 flex-wrap">
                {(['compact', 'default', 'comfortable'] as DensityLevel[]).map((d) => (
                  <Pill key={d} active={density === d} onClick={() => { setDensity(d); flash(); }}>
                    {t(`settings.theme.${d}` as any)}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: `rgb(var(--ds-text-muted))` }}>
                {t('settings.theme.fontSize')}
              </p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'sm' as FontSizeLevel, label: t('settings.theme.small') },
                  { id: 'md' as FontSizeLevel, label: t('settings.theme.medium') },
                  { id: 'lg' as FontSizeLevel, label: t('settings.theme.large') },
                ].map(({ id, label }) => (
                  <Pill key={id} active={fontSize === id} onClick={() => { setFontSize(id); flash(); }}>
                    {label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="pt-2 border-t flex items-center justify-between"
              style={{ borderColor: `rgb(var(--ds-border))` }}>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors"
                style={{ color: `rgb(var(--ds-text-muted))`, borderColor: `rgb(var(--ds-border))` }}
              >
                <RotateCcw size={14} /> {t('settings.theme.reset')}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <Check size={14} /> {t('settings.saved')}
                </span>
              )}
            </div>
          </div>
        </Section>

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <Section title={t('settings.sidebar.title')} subtitle={t('settings.sidebar.subtitle')}>
          <div className="space-y-5">

            {/* Collapse toggle */}
            <Toggle
              checked={collapsed}
              onChange={(v) => { setCollapsed(v); flash(); }}
              label={t('settings.sidebar.collapse')}
              description={t('settings.sidebar.collapseDesc')}
            />

            {/* Menu items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: `rgb(var(--ds-text-muted))` }}>
                  {t('settings.sidebar.items')}
                </p>
                <button
                  onClick={() => { resetItems(); flash(); }}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors"
                  style={{ color: `rgb(var(--ds-text-muted))`, borderColor: `rgb(var(--ds-border))` }}
                >
                  <RotateCcw size={11} /> {t('settings.sidebar.resetOrder')}
                </button>
              </div>

              <div className="space-y-1.5">
                {[...items].sort((a, b) => a.order - b.order).map((item, idx, arr) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                    style={{
                      backgroundColor: item.visible ? `rgb(var(--ds-surface-hover))` : `rgb(var(--ds-bg))`,
                      borderColor: `rgb(var(--ds-border))`,
                      opacity: item.visible ? 1 : 0.5,
                    }}
                  >
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveItem(item.key, 'up')}
                        disabled={idx === 0}
                        aria-label={`Move ${item.key} up`}
                        className="p-0.5 rounded transition-opacity disabled:opacity-20"
                        style={{ color: `rgb(var(--ds-text-muted))` }}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => moveItem(item.key, 'down')}
                        disabled={idx === arr.length - 1}
                        aria-label={`Move ${item.key} down`}
                        className="p-0.5 rounded transition-opacity disabled:opacity-20"
                        style={{ color: `rgb(var(--ds-text-muted))` }}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>

                    <span className="flex-1 text-sm font-medium" style={{ color: `rgb(var(--ds-text))` }}>
                      {item.key}
                    </span>

                    <span className="text-xs" style={{ color: `rgb(var(--ds-text-muted))` }}>
                      {item.visible ? t('settings.sidebar.visible') : t('settings.sidebar.hidden')}
                    </span>

                    {/* Visibility toggle */}
                    <button
                      onClick={() => { toggleItem(item.key); flash(); }}
                      aria-label={item.visible ? `Hide ${item.key}` : `Show ${item.key}`}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: `rgb(var(--ds-text-muted))` }}
                    >
                      {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Language ──────────────────────────────────────────────────────── */}
        <Section title={t('settings.language.title')} subtitle={t('settings.language.subtitle')}>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3"
                style={{ color: `rgb(var(--ds-text-muted))` }}>
                {t('settings.language.label')}
              </p>
              <div className="flex flex-wrap gap-3">
                {(Object.entries(LOCALES) as [LocaleCode, typeof LOCALES[LocaleCode]][]).map(([code, loc]) => (
                  <button
                    key={code}
                    onClick={() => { setLocale(code); flash(); }}
                    aria-pressed={locale === code}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 min-w-[140px]"
                    style={{
                      borderColor: locale === code ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
                      backgroundColor: locale === code ? `rgb(var(--ds-primary) / 0.06)` : `rgb(var(--ds-surface-hover))`,
                    }}
                  >
                    <span className="text-xl" role="img" aria-label={loc.label}>{loc.flag}</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold" style={{ color: `rgb(var(--ds-text))` }}>{loc.label}</p>
                      <p className="text-xs" style={{ color: `rgb(var(--ds-text-muted))` }}>{code.toUpperCase()}</p>
                    </div>
                    {locale === code && (
                      <Check size={14} className="ml-auto" style={{ color: `rgb(var(--ds-primary))` }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs" style={{ color: `rgb(var(--ds-text-muted))` }}>
              {t('settings.language.changeNote')}
            </p>
          </div>
        </Section>

      </div>
    </Layout>
  );
};

export default SettingsPage;
