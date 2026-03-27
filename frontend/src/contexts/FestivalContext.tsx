import React, { createContext, useContext, useMemo } from 'react';
import { useAnnouncements } from '../hooks/usePeople';

/* ── Ambient theme per festival ─────────────────────────────────────────── */

export interface AmbientFestivalTheme {
  key: string;
  name: string;
  emoji: string;
  /** CSS gradient used for the 3-px header stripe */
  headerGradient: string;
  /** Sidebar left-border / active-item accent color */
  sidebarAccent: string;
  /** Particle characters rendered in the background */
  particleChars: string[];
  particleColors: string[];
  /** Animation style for particles */
  particleAnimation: 'float' | 'fall' | 'twinkle' | 'drift';
}

export const AMBIENT_THEMES: Record<string, AmbientFestivalTheme> = {
  DIWALI: {
    key: 'DIWALI', name: 'Diwali', emoji: '🪔',
    headerGradient: 'linear-gradient(90deg,#ff6b00,#ffd700,#ff3300,#ffd700,#ff6b00)',
    sidebarAccent: '#ff8c00',
    particleChars: ['✨', '✦', '⭐', '✵', '🪔'],
    particleColors: ['#ffd700', '#ff8c00', '#ff6b35', '#ffcc00', '#ff3300'],
    particleAnimation: 'float',
  },
  CHRISTMAS: {
    key: 'CHRISTMAS', name: 'Christmas', emoji: '🎄',
    headerGradient: 'linear-gradient(90deg,#cc0000,#228b22,#cc0000,#228b22,#cc0000)',
    sidebarAccent: '#cc0000',
    particleChars: ['❄', '❅', '❆', '✦', '*'],
    particleColors: ['#ffffff', '#ddffdd', '#ffdddd'],
    particleAnimation: 'fall',
  },
  HOLI: {
    key: 'HOLI', name: 'Holi', emoji: '🌈',
    headerGradient: 'linear-gradient(90deg,#ff0000,#ff8800,#ffee00,#00cc00,#0066ff,#cc00ff,#ff0000)',
    sidebarAccent: '#ff0099',
    particleChars: ['●', '◉', '◎', '○', '◆'],
    particleColors: ['#ff0000', '#ff8800', '#ffee00', '#00cc00', '#0066ff', '#cc00ff'],
    particleAnimation: 'drift',
  },
  EID: {
    key: 'EID', name: 'Eid', emoji: '🌙',
    headerGradient: 'linear-gradient(90deg,#006400,#ffd700,#006400,#ffd700,#006400)',
    sidebarAccent: '#ffd700',
    particleChars: ['★', '✦', '✧', '✵', '☽'],
    particleColors: ['#ffd700', '#c0a000', '#aaffaa', '#ffffff'],
    particleAnimation: 'twinkle',
  },
  NEW_YEAR: {
    key: 'NEW_YEAR', name: 'New Year', emoji: '🎆',
    headerGradient: 'linear-gradient(90deg,#1a1a8e,#ffd700,#ffffff,#ffd700,#1a1a8e)',
    sidebarAccent: '#ffd700',
    particleChars: ['✨', '⭐', '★', '✦', '🎆'],
    particleColors: ['#ffd700', '#ffffff', '#aaaaff'],
    particleAnimation: 'float',
  },
  NAVRATRI: {
    key: 'NAVRATRI', name: 'Navratri', emoji: '💃',
    headerGradient: 'linear-gradient(90deg,#cc0066,#ff6600,#ffcc00,#cc0066)',
    sidebarAccent: '#ff0066',
    particleChars: ['✨', '✦', '★', '◆', '●'],
    particleColors: ['#ff0066', '#ff6600', '#ffcc00', '#cc00ff'],
    particleAnimation: 'drift',
  },
  DUSSEHRA: {
    key: 'DUSSEHRA', name: 'Dussehra', emoji: '🏹',
    headerGradient: 'linear-gradient(90deg,#cc3300,#ff9900,#ffd700,#ff9900,#cc3300)',
    sidebarAccent: '#ff6600',
    particleChars: ['✨', '⭐', '★', '✵', '✦'],
    particleColors: ['#ff6600', '#ffd700', '#ff3300'],
    particleAnimation: 'float',
  },
  PONGAL: {
    key: 'PONGAL', name: 'Pongal', emoji: '🍯',
    headerGradient: 'linear-gradient(90deg,#cc6600,#ffcc00,#ff8800,#ffcc00,#cc6600)',
    sidebarAccent: '#ffcc00',
    particleChars: ['🌾', '☀', '✨', '⭐', '✦'],
    particleColors: ['#ffcc00', '#ff8800', '#ff6600'],
    particleAnimation: 'float',
  },
  EASTER: {
    key: 'EASTER', name: 'Easter', emoji: '🐣',
    headerGradient: 'linear-gradient(90deg,#ff99ff,#99ffcc,#ffff99,#99ccff,#ff99ff)',
    sidebarAccent: '#ff99cc',
    particleChars: ['🌸', '✨', '◆', '●', '✦'],
    particleColors: ['#ff99ff', '#99ffcc', '#ffff99', '#99ccff'],
    particleAnimation: 'drift',
  },
};

/* ── Context ─────────────────────────────────────────────────────────────── */

export interface FestivalContextValue {
  festival: AmbientFestivalTheme | null;
  title: string;
}

const FestivalContext = createContext<FestivalContextValue>({ festival: null, title: '' });

export const useFestival = () => useContext(FestivalContext);

export const FestivalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useAnnouncements();

  const value = useMemo<FestivalContextValue>(() => {
    const all: any[] = Array.isArray(data) ? data : [];
    const today = new Date().toISOString().slice(0, 10);

    // Pick the first non-expired FESTIVAL announcement
    const ann = all.find(
      (a) =>
        a.subtype === 'FESTIVAL' &&
        a.festivalKey &&
        (!a.expiresAt || a.expiresAt >= today),
    );

    if (!ann) return { festival: null, title: '' };
    return {
      festival: AMBIENT_THEMES[ann.festivalKey] ?? null,
      title: ann.title,
    };
  }, [data]);

  return <FestivalContext.Provider value={value}>{children}</FestivalContext.Provider>;
};
