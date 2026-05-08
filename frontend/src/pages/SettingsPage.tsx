import React, { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check, RotateCcw, Eye, EyeOff, Sun, Moon, GripVertical, Palette, Globe,
  LayoutDashboard, Type, Layers, MapPin,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import { useTheme, THEME_PRESETS } from '../contexts/ThemeContext';
import { useI18n, LOCALES, LocaleCode } from '../contexts/I18nContext';
import { useSidebar } from '../contexts/SidebarContext';
import { ACCENT_COLORS } from '../lib/themes';
import type { DensityLevel, FontSizeLevel } from '../lib/themes';
import { useAuth } from '../contexts/AuthContext';
import { useOfficeLocations } from '../hooks/useAdmin';
import { useUpdateMyLocation } from '../hooks/useUsers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SectionHeader = ({ icon: Icon, title, subtitle }: {
  icon: React.ElementType; title: string; subtitle?: string;
}) => (
  <div className="flex items-start gap-3 px-6 py-5 border-b" style={{ borderColor: `rgb(var(--ds-border))` }}>
    <div
      className="mt-0.5 p-2 rounded-lg"
      style={{ backgroundColor: `rgb(var(--ds-primary) / 0.1)` }}
    >
      <Icon size={16} style={{ color: `rgb(var(--ds-primary))` }} />
    </div>
    <div>
      <h3 className="text-sm font-semibold" style={{ color: `rgb(var(--ds-text))` }}>{title}</h3>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: `rgb(var(--ds-text-muted))` }}>{subtitle}</p>}
    </div>
  </div>
);

const Section = ({ icon, title, subtitle, children }: {
  icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode;
}) => (
  <div
    className="rounded-2xl border shadow-sm overflow-hidden"
    style={{ backgroundColor: `rgb(var(--ds-surface))`, borderColor: `rgb(var(--ds-border))` }}
  >
    <SectionHeader icon={icon} title={title} subtitle={subtitle} />
    <div className="p-6">{children}</div>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-widest mb-3"
    style={{ color: `rgb(var(--ds-text-muted))` }}>
    {children}
  </p>
);

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
    className="relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2"
    style={{
      borderColor: active ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
      backgroundColor: active ? `rgb(var(--ds-primary) / 0.08)` : `rgb(var(--ds-surface-hover))`,
    }}
  >
    <span className="text-2xl" role="img" aria-hidden="true">{emoji}</span>
    <div className="flex items-center gap-1">
      {isDark ? <Moon size={9} style={{ color: `rgb(var(--ds-text-muted))` }} />
        : <Sun size={9} style={{ color: `rgb(var(--ds-text-muted))` }} />}
      <span className="text-xs font-medium" style={{ color: `rgb(var(--ds-text))` }}>{name}</span>
    </div>
    {active && (
      <div
        className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `rgb(var(--ds-primary))` }}
      >
        <Check size={9} color="white" />
      </div>
    )}
  </button>
);

// ─── Toggle switch ────────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void;
  label: string; description?: string;
}) => (
  <label className="flex items-start gap-4 cursor-pointer">
    <div className="flex-1">
      <p className="text-sm font-medium" style={{ color: `rgb(var(--ds-text))` }}>{label}</p>
      {description && <p className="text-xs mt-0.5" style={{ color: `rgb(var(--ds-text-muted))` }}>{description}</p>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 shrink-0 mt-0.5"
      style={{ backgroundColor: checked ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))` }}
    >
      <span
        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  </label>
);

// ─── Accent swatch ────────────────────────────────────────────────────────────

const AccentSwatch = ({ color, label, active, onClick }: {
  color: string; label: string; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={`${label} accent`}
    aria-pressed={active}
    className={`w-8 h-8 rounded-full border-2 transition-all focus:outline-none focus-visible:ring-2 ${color}`}
    style={{
      borderColor: active ? `rgb(var(--ds-text))` : 'transparent',
      boxShadow: active ? `0 0 0 2px rgb(var(--ds-surface)), 0 0 0 4px rgb(var(--ds-text) / 0.7)` : undefined,
      transform: active ? 'scale(1.15)' : 'scale(1)',
    }}
  >
    {active && <Check size={12} color="white" className="mx-auto" />}
  </button>
);

// ─── Sortable sidebar item ────────────────────────────────────────────────────

const SortableNavItem = ({
  item, onToggle, visibleLabel, hiddenLabel,
}: {
  item: { key: string; visible: boolean; order: number };
  onToggle: () => void;
  visibleLabel: string;
  hiddenLabel: string;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        backgroundColor: item.visible ? `rgb(var(--ds-surface-hover))` : `rgb(var(--ds-bg))`,
        borderColor: isDragging ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
        opacity: isDragging ? 0.5 : item.visible ? 1 : 0.55,
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        className="p-0.5 rounded cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Drag to reorder ${item.key}`}
        style={{ color: `rgb(var(--ds-text-muted))` }}
        tabIndex={-1}
      >
        <GripVertical size={14} />
      </button>

      <span className="flex-1 text-sm font-medium select-none" style={{ color: `rgb(var(--ds-text))` }}>
        {item.key}
      </span>

      <span className="text-xs mr-1 select-none" style={{ color: `rgb(var(--ds-text-muted))` }}>
        {item.visible ? visibleLabel : hiddenLabel}
      </span>

      <button
        onClick={onToggle}
        aria-label={item.visible ? `Hide ${item.key}` : `Show ${item.key}`}
        className="p-1.5 rounded-lg transition-colors hover:opacity-80"
        style={{ color: `rgb(var(--ds-text-muted))` }}
      >
        {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    </div>
  );
};

// ─── Saved flash ──────────────────────────────────────────────────────────────

const SavedBadge = ({ show, label }: { show: boolean; label: string }) =>
  show ? (
    <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium animate-pulse">
      <Check size={14} /> {label}
    </span>
  ) : null;

// ─── Settings content (exported for use in AdminPage settings tab) ────────────

export const SettingsContent = () => {
  const {
    themeId, setThemeId, density, setDensity, fontSize, setFontSize,
    autoTheme, setAutoTheme, accentId, setAccentId, resetToDefault,
  } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const { collapsed, setCollapsed, items, toggleItem, reorderItems, resetItems } = useSidebar();
  const { user, refetch: refetchUser } = useAuth();
  const { data: officeLocations = [] } = useOfficeLocations();
  const updateMyLocation = useUpdateMyLocation();

  const [saved, setSaved] = useState(false);
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) { reorderItems(String(active.id), String(over.id)); flash(); }
  };
  const sortedItems = [...items].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">

      {/* ── Appearance ───────────────────────────────────────────────────────── */}
      <Section icon={Palette} title={t('settings.theme.title')} subtitle={t('settings.theme.subtitle')}>
        <div className="space-y-7">

          <div>
            <Label>{t('settings.theme.themeLabel')}</Label>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {THEME_PRESETS.map((p) => (
                <ThemeCard key={p.id} id={p.id} name={p.name} emoji={p.emoji} isDark={p.isDark}
                  active={themeId === p.id} onSelect={() => { setThemeId(p.id); flash(); }} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>{t('settings.theme.accentLabel')}</Label>
              {accentId && (
                <button onClick={() => { setAccentId(null); flash(); }}
                  className="text-xs flex items-center gap-1 px-2 py-0.5 rounded border transition-colors"
                  style={{ color: `rgb(var(--ds-text-muted))`, borderColor: `rgb(var(--ds-border))` }}>
                  <RotateCcw size={10} /> {t('common.reset')}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {ACCENT_COLORS.map((ac) => (
                <AccentSwatch key={ac.id} color={ac.color} label={ac.label} active={accentId === ac.id}
                  onClick={() => { setAccentId(accentId === ac.id ? null : ac.id); flash(); }} />
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: `rgb(var(--ds-text-muted))` }}>
              Overrides the primary colour for the selected theme. Click the active swatch to remove.
            </p>
          </div>

          <Toggle checked={autoTheme} onChange={(v) => { setAutoTheme(v); flash(); }}
            label={t('settings.theme.autoTheme')} description={t('settings.theme.autoThemeDesc')} />

          <div>
            <Label>{t('settings.theme.density')}</Label>
            <div className="flex gap-2 flex-wrap">
              {(['compact', 'default', 'comfortable'] as DensityLevel[]).map((d) => (
                <Pill key={d} active={density === d} onClick={() => { setDensity(d); flash(); }}>
                  {t(`settings.theme.${d}` as any)}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <Label>{t('settings.theme.fontSize')}</Label>
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'sm' as FontSizeLevel, label: `${t('settings.theme.small')} (13px)` },
                { id: 'md' as FontSizeLevel, label: `${t('settings.theme.medium')} (15px)` },
                { id: 'lg' as FontSizeLevel, label: `${t('settings.theme.large')} (17px)` },
              ]).map(({ id, label }) => (
                <Pill key={id} active={fontSize === id} onClick={() => { setFontSize(id); flash(); }}>{label}</Pill>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t flex items-center justify-between"
            style={{ borderColor: `rgb(var(--ds-border))` }}>
            <button onClick={() => { resetToDefault(); resetItems(); flash(); }}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80"
              style={{ color: `rgb(var(--ds-text-muted))`, borderColor: `rgb(var(--ds-border))` }}>
              <RotateCcw size={13} /> {t('settings.theme.reset')}
            </button>
            <SavedBadge show={saved} label={t('settings.saved')} />
          </div>
        </div>
      </Section>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <Section icon={LayoutDashboard} title={t('settings.sidebar.title')} subtitle={t('settings.sidebar.subtitle')}>
        <div className="space-y-5">
          <Toggle checked={collapsed} onChange={(v) => { setCollapsed(v); flash(); }}
            label={t('settings.sidebar.collapse')} description={t('settings.sidebar.collapseDesc')} />
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t('settings.sidebar.navOrder')}</Label>
              <button onClick={() => { resetItems(); flash(); }}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors"
                style={{ color: `rgb(var(--ds-text-muted))`, borderColor: `rgb(var(--ds-border))` }}>
                <RotateCcw size={11} /> {t('settings.sidebar.resetOrder')}
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: `rgb(var(--ds-text-muted))` }}>
              {t('settings.sidebar.dragHint')}
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedItems.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {sortedItems.map((item) => (
                    <SortableNavItem key={item.key} item={item}
                      onToggle={() => { toggleItem(item.key); flash(); }}
                      visibleLabel={t('settings.sidebar.visible')} hiddenLabel={t('settings.sidebar.hidden')} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </Section>

      {/* ── Language ─────────────────────────────────────────────────────────── */}
      <Section icon={Globe} title={t('settings.language.title')} subtitle={t('settings.language.subtitle')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.entries(LOCALES) as [LocaleCode, typeof LOCALES[LocaleCode]][]).map(([code, loc]) => (
              <button key={code} onClick={() => { setLocale(code); flash(); }} aria-pressed={locale === code}
                className="flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2"
                style={{
                  borderColor: locale === code ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
                  backgroundColor: locale === code ? `rgb(var(--ds-primary) / 0.07)` : `rgb(var(--ds-surface-hover))`,
                }}>
                <span className="text-xl shrink-0" role="img" aria-label={loc.label}>{loc.flag}</span>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: `rgb(var(--ds-text))` }}>{loc.label}</p>
                  <p className="text-xs" style={{ color: `rgb(var(--ds-text-muted))` }}>{code.toUpperCase()}</p>
                </div>
                {locale === code && <Check size={13} className="ml-auto shrink-0" style={{ color: `rgb(var(--ds-primary))` }} />}
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: `rgb(var(--ds-text-muted))` }}>
            {t('settings.language.changeNote')}
          </p>
        </div>
      </Section>

      {/* ── Office Location ──────────────────────────────────────────────────── */}
      <Section icon={MapPin} title="Office Location" subtitle="Your assigned seating location — shown on your profile and used for the holiday calendar">
        {(officeLocations as any[]).length === 0 ? (
          <p className="text-sm" style={{ color: `rgb(var(--ds-text-muted))` }}>No office locations configured yet. Ask your admin to set them up.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(officeLocations as any[]).map((loc: any) => {
              const isActive = user?.officeLocationId === loc.id;
              return (
                <button key={loc.id} onClick={() => updateMyLocation.mutate(loc.id, { onSuccess: () => refetchUser() })}
                  className="flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all focus:outline-none"
                  style={{
                    borderColor: isActive ? `rgb(var(--ds-primary))` : `rgb(var(--ds-border))`,
                    backgroundColor: isActive ? `rgb(var(--ds-primary) / 0.07)` : `rgb(var(--ds-surface-hover))`,
                  }}>
                  <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: isActive ? `rgb(var(--ds-primary))` : `rgb(var(--ds-text-muted))` }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: `rgb(var(--ds-text))` }}>{loc.name}</p>
                    {loc.country && <p className="text-xs" style={{ color: `rgb(var(--ds-text-muted))` }}>{loc.country}</p>}
                  </div>
                  {isActive && <Check size={13} className="ml-auto shrink-0 mt-0.5" style={{ color: `rgb(var(--ds-primary))` }} />}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs mt-3" style={{ color: `rgb(var(--ds-text-muted))` }}>
          Your selection is saved automatically. Your admin can also assign your location from User Management.
        </p>
      </Section>

    </div>
  );
};

// ─── Page (standalone /settings route) ───────────────────────────────────────

const SettingsPage = () => {
  const { t } = useI18n();
  return (
    <Layout>
      <Header title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="p-6 max-w-3xl">
        <SettingsContent />
      </div>
    </Layout>
  );
};

export default SettingsPage;
