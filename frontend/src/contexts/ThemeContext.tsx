import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  ThemePreset, DensityLevel, FontSizeLevel,
  THEME_PRESETS, getPreset, getSystemThemeId, getTimeBasedThemeId,
  DENSITY_SCALE, FONT_SIZE_BASE,
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
  resetToDefault: () => void;
}

interface StoredPrefs {
  themeId?: string;
  density?: DensityLevel;
  fontSize?: FontSizeLevel;
  autoTheme?: boolean;
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
) {
  const root = document.documentElement;

  // 1. Apply colour tokens as CSS variables
  Object.entries(preset.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // 2. Dark / light class for Tailwind dark: variants
  root.classList.toggle('dark', preset.isDark);

  // 3. Density scale (controls padding/gap multiplier via CSS var)
  root.style.setProperty('--ds-density', DENSITY_SCALE[density]);

  // 4. Base font size
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

  // ── Bootstrap from localStorage on first render ───────────────────────────
  useEffect(() => {
    const prefs = readPrefs();
    const auto = prefs.autoTheme ?? false;
    const d = prefs.density ?? 'default';
    const f = prefs.fontSize ?? 'md';

    let resolvedId: string;
    if (auto) {
      resolvedId = getTimeBasedThemeId();
    } else {
      resolvedId = prefs.themeId ?? getSystemThemeId();
    }

    setThemeIdState(resolvedId);
    setDensityState(d);
    setFontSizeState(f);
    setAutoThemeState(auto);
    applyTheme(getPreset(resolvedId), d, f);
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
    applyTheme(getPreset(id), density, fontSize);
    writePrefs({ themeId: id });
  }, [density, fontSize]);

  const setDensity = useCallback((d: DensityLevel) => {
    setDensityState(d);
    applyTheme(getPreset(themeId), d, fontSize);
    writePrefs({ density: d });
  }, [themeId, fontSize]);

  const setFontSize = useCallback((f: FontSizeLevel) => {
    setFontSizeState(f);
    applyTheme(getPreset(themeId), density, f);
    writePrefs({ fontSize: f });
  }, [themeId, density]);

  const setAutoTheme = useCallback((v: boolean) => {
    setAutoThemeState(v);
    writePrefs({ autoTheme: v });
    if (v) {
      const id = getTimeBasedThemeId();
      setThemeIdState(id);
      applyTheme(getPreset(id), density, fontSize);
    }
  }, [density, fontSize]);

  const resetToDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setThemeIdState('default');
    setDensityState('default');
    setFontSizeState('md');
    setAutoThemeState(false);
    applyTheme(getPreset('default'), 'default', 'md');
  }, []);

  const theme = getPreset(themeId);

  return (
    <ThemeContext.Provider value={{
      themeId, theme, setThemeId,
      density, setDensity,
      fontSize, setFontSize,
      autoTheme, setAutoTheme,
      isDark: theme.isDark,
      resetToDefault,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Re-export presets for UI
export { THEME_PRESETS };
