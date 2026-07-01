import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  ThemePreset, DensityLevel, FontSizeLevel,
  THEME_PRESETS, getPreset, getSystemThemeId, getTimeBasedThemeId,
  DENSITY_SCALE, FONT_SIZE_BASE, ACCENT_COLORS,
} from '../lib/themes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  themeId: string;
  theme: ThemePreset;
  setThemeId: (id: string) => void;
  density: DensityLevel;
  setDensity: (d: DensityLevel) => void;
  fontSize: FontSizeLevel;
  setFontSize: (f: FontSizeLevel) => void;
  autoTheme: boolean;
  setAutoTheme: (v: boolean) => void;
  isDark: boolean;
  toggleDark: () => void;
  accentId: string | null;
  setAccentId: (id: string | null) => void;
  resetToDefault: () => void;
}

interface StoredPrefs {
  themeId?: string;
  /** Last non-dark theme the user picked — restored when toggling dark mode off. */
  lightThemeId?: string;
  density?: DensityLevel;
  fontSize?: FontSizeLevel;
  autoTheme?: boolean;
  accentId?: string | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
};

// ─── CSS variable applier ─────────────────────────────────────────────────────

function applyTheme(
  preset: ThemePreset,
  density: DensityLevel,
  fontSize: FontSizeLevel,
  accentId?: string | null,
) {
  const root = document.documentElement;

  // 1. Apply colour tokens as CSS variables
  Object.entries(preset.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // 2. Accent color override (overrides --ds-primary from theme)
  if (accentId) {
    const accent = ACCENT_COLORS.find((a) => a.id === accentId);
    if (accent) {
      root.style.setProperty('--ds-primary', accent.rgb);
      root.style.setProperty('--ds-primary-hover', accent.hoverRgb);
    }
  }

  // 3. Dark / light class for Tailwind dark: variants
  root.classList.toggle('dark', preset.isDark);

  // 4. Density scale (controls padding/gap multiplier via CSS var)
  root.style.setProperty('--ds-density', DENSITY_SCALE[density]);

  // 5. Base font size
  root.style.setProperty('--ds-font-base', FONT_SIZE_BASE[fontSize]);
  root.style.fontSize = FONT_SIZE_BASE[fontSize];
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'ds_theme_prefs';

const readPrefs = (): StoredPrefs => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
};

const writePrefs = (patch: Partial<StoredPrefs>) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), ...patch }));

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeIdState] = useState<string>('default');
  const [density, setDensityState] = useState<DensityLevel>('default');
  const [fontSize, setFontSizeState] = useState<FontSizeLevel>('md');
  const [autoTheme, setAutoThemeState] = useState(false);
  const [accentId, setAccentIdState] = useState<string | null>(null);
  // Remembers the last light theme so the dark toggle can restore it instead of
  // always falling back to the blue 'default'.
  const [lightThemeId, setLightThemeId] = useState<string>('default');

  // ── Bootstrap from localStorage on first render ───────────────────────────
  useEffect(() => {
    const prefs = readPrefs();
    const auto = prefs.autoTheme ?? false;
    const d = prefs.density ?? 'default';
    const f = prefs.fontSize ?? 'md';
    const acc = prefs.accentId ?? null;

    let resolvedId: string;
    if (auto) {
      resolvedId = getTimeBasedThemeId();
    } else {
      resolvedId = prefs.themeId ?? getSystemThemeId();
    }

    // Derive the light-theme memory: explicit pref, else the saved theme if it's
    // light, else the default.
    const savedLight =
      prefs.lightThemeId ??
      (prefs.themeId && !getPreset(prefs.themeId).isDark ? prefs.themeId : 'default');

    setThemeIdState(resolvedId);
    setDensityState(d);
    setFontSizeState(f);
    setAutoThemeState(auto);
    setAccentIdState(acc);
    setLightThemeId(savedLight);
    applyTheme(getPreset(resolvedId), d, f, acc);
  }, []);

  // ── System theme-change listener ──────────────────────────────────────────
  useEffect(() => {
    if (!autoTheme) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const id = getTimeBasedThemeId();
      setThemeIdState(id);
      applyTheme(getPreset(id), density, fontSize);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [autoTheme, density, fontSize]);

  // ── Public setters (each persists to localStorage) ────────────────────────
  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    applyTheme(getPreset(id), density, fontSize, accentId);
    // Remember the last light theme so toggling dark off restores it.
    if (!getPreset(id).isDark) {
      setLightThemeId(id);
      writePrefs({ themeId: id, lightThemeId: id });
    } else {
      writePrefs({ themeId: id });
    }
  }, [density, fontSize, accentId]);

  const toggleDark = useCallback(() => {
    setThemeId(getPreset(themeId).isDark ? lightThemeId : 'dark');
  }, [themeId, lightThemeId, setThemeId]);

  const setDensity = useCallback((d: DensityLevel) => {
    setDensityState(d);
    applyTheme(getPreset(themeId), d, fontSize, accentId);
    writePrefs({ density: d });
  }, [themeId, fontSize, accentId]);

  const setFontSize = useCallback((f: FontSizeLevel) => {
    setFontSizeState(f);
    applyTheme(getPreset(themeId), density, f, accentId);
    writePrefs({ fontSize: f });
  }, [themeId, density, accentId]);

  const setAutoTheme = useCallback((v: boolean) => {
    setAutoThemeState(v);
    writePrefs({ autoTheme: v });
    if (v) {
      const id = getTimeBasedThemeId();
      setThemeIdState(id);
      applyTheme(getPreset(id), density, fontSize, accentId);
    }
  }, [density, fontSize, accentId]);

  const setAccentId = useCallback((id: string | null) => {
    setAccentIdState(id);
    applyTheme(getPreset(themeId), density, fontSize, id);
    writePrefs({ accentId: id });
  }, [themeId, density, fontSize]);

  const resetToDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setThemeIdState('default');
    setDensityState('default');
    setFontSizeState('md');
    setAutoThemeState(false);
    setAccentIdState(null);
    setLightThemeId('default');
    applyTheme(getPreset('default'), 'default', 'md', null);
  }, []);

  const theme = getPreset(themeId);

  return (
    <ThemeContext.Provider value={{
      themeId, theme, setThemeId,
      density, setDensity,
      fontSize, setFontSize,
      autoTheme, setAutoTheme,
      isDark: theme.isDark,
      toggleDark,
      accentId, setAccentId,
      resetToDefault,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Re-export presets for UI
export { THEME_PRESETS };
