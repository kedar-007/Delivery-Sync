export interface ThemePreset {
  id: string;
  name: string;
  emoji: string;
  isDark: boolean;
  /** RGB triplets used as CSS custom-property values, e.g. "59 130 246" */
  vars: Record<string, string>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    emoji: '💙',
    isDark: false,
    vars: {
      '--ds-primary':         '59 130 246',   // blue-500
      '--ds-primary-hover':   '37 99 235',    // blue-600
      '--ds-bg':              '249 250 251',  // gray-50
      '--ds-surface':         '255 255 255',  // white
      '--ds-surface-hover':   '243 244 246',  // gray-100
      '--ds-border':          '229 231 235',  // gray-200
      '--ds-text':            '17 24 39',     // gray-900
      '--ds-text-muted':      '107 114 128',  // gray-500
      '--ds-text-inverse':    '255 255 255',
      '--ds-sidebar-bg':      '30 58 138',    // blue-900
      '--ds-sidebar-hover':   '30 64 175',    // blue-800
      '--ds-sidebar-active':  '29 78 216',    // blue-700
      '--ds-sidebar-border':  '30 64 175',
      '--ds-sidebar-text':    '219 234 254',  // blue-100
      '--ds-accent':          '139 92 246',   // violet-500
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    emoji: '🌙',
    isDark: true,
    vars: {
      '--ds-primary':         '96 165 250',   // blue-400
      '--ds-primary-hover':   '59 130 246',   // blue-500
      '--ds-bg':              '17 24 39',     // gray-900
      '--ds-surface':         '31 41 55',     // gray-800
      '--ds-surface-hover':   '55 65 81',     // gray-700
      '--ds-border':          '55 65 81',     // gray-700
      '--ds-text':            '243 244 246',  // gray-100
      '--ds-text-muted':      '156 163 175',  // gray-400
      '--ds-text-inverse':    '17 24 39',
      '--ds-sidebar-bg':      '15 23 42',     // slate-900
      '--ds-sidebar-hover':   '30 41 59',     // slate-800
      '--ds-sidebar-active':  '37 99 235',    // blue-600
      '--ds-sidebar-border':  '30 41 59',
      '--ds-sidebar-text':    '226 232 240',  // slate-200
      '--ds-accent':          '167 139 250',  // violet-400
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    isDark: false,
    vars: {
      '--ds-primary':         '6 182 212',    // cyan-500
      '--ds-primary-hover':   '8 145 178',    // cyan-600
      '--ds-bg':              '236 254 255',  // cyan-50
      '--ds-surface':         '255 255 255',
      '--ds-surface-hover':   '207 250 254',  // cyan-100
      '--ds-border':          '165 243 252',  // cyan-200
      '--ds-text':            '22 78 99',     // cyan-900
      '--ds-text-muted':      '8 145 178',    // cyan-600
      '--ds-text-inverse':    '255 255 255',
      '--ds-sidebar-bg':      '22 78 99',     // cyan-900
      '--ds-sidebar-hover':   '21 94 117',    // cyan-800
      '--ds-sidebar-active':  '8 145 178',    // cyan-600
      '--ds-sidebar-border':  '21 94 117',
      '--ds-sidebar-text':    '207 250 254',  // cyan-100
      '--ds-accent':          '34 211 238',   // cyan-400
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    emoji: '🌅',
    isDark: false,
    vars: {
      '--ds-primary':         '249 115 22',   // orange-500
      '--ds-primary-hover':   '234 88 12',    // orange-600
      '--ds-bg':              '255 247 237',  // orange-50
      '--ds-surface':         '255 255 255',
      '--ds-surface-hover':   '255 237 213',  // orange-100
      '--ds-border':          '254 215 170',  // orange-200
      '--ds-text':            '124 45 18',    // orange-900
      '--ds-text-muted':      '194 65 12',    // orange-700
      '--ds-text-inverse':    '255 255 255',
      '--ds-sidebar-bg':      '124 45 18',    // orange-900
      '--ds-sidebar-hover':   '154 52 18',    // orange-800
      '--ds-sidebar-active':  '234 88 12',    // orange-600
      '--ds-sidebar-border':  '154 52 18',
      '--ds-sidebar-text':    '255 237 213',  // orange-100
      '--ds-accent':          '239 68 68',    // red-500
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    emoji: '🌿',
    isDark: false,
    vars: {
      '--ds-primary':         '34 197 94',    // green-500
      '--ds-primary-hover':   '22 163 74',    // green-600
      '--ds-bg':              '240 253 244',  // green-50
      '--ds-surface':         '255 255 255',
      '--ds-surface-hover':   '220 252 231',  // green-100
      '--ds-border':          '187 247 208',  // green-200
      '--ds-text':            '20 83 45',     // green-900
      '--ds-text-muted':      '21 128 61',    // green-700
      '--ds-text-inverse':    '255 255 255',
      '--ds-sidebar-bg':      '20 83 45',     // green-900
      '--ds-sidebar-hover':   '21 128 61',    // green-700
      '--ds-sidebar-active':  '22 163 74',    // green-600
      '--ds-sidebar-border':  '21 128 61',
      '--ds-sidebar-text':    '220 252 231',  // green-100
      '--ds-accent':          '16 185 129',   // emerald-500
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    emoji: '🌌',
    isDark: true,
    vars: {
      '--ds-primary':         '167 139 250',  // violet-400
      '--ds-primary-hover':   '139 92 246',   // violet-500
      '--ds-bg':              '15 10 40',
      '--ds-surface':         '26 20 60',
      '--ds-surface-hover':   '40 32 80',
      '--ds-border':          '55 48 100',
      '--ds-text':            '237 233 254',  // violet-100
      '--ds-text-muted':      '167 139 250',  // violet-400
      '--ds-text-inverse':    '15 10 40',
      '--ds-sidebar-bg':      '10 7 28',
      '--ds-sidebar-hover':   '26 20 60',
      '--ds-sidebar-active':  '109 40 217',   // violet-700
      '--ds-sidebar-border':  '40 32 80',
      '--ds-sidebar-text':    '221 214 254',  // violet-200
      '--ds-accent':          '236 72 153',   // pink-500
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    emoji: '⬛',
    isDark: false,
    vars: {
      '--ds-primary':         '71 85 105',    // slate-600
      '--ds-primary-hover':   '51 65 85',     // slate-700
      '--ds-bg':              '248 250 252',  // slate-50
      '--ds-surface':         '255 255 255',
      '--ds-surface-hover':   '241 245 249',  // slate-100
      '--ds-border':          '226 232 240',  // slate-200
      '--ds-text':            '15 23 42',     // slate-900
      '--ds-text-muted':      '100 116 139',  // slate-500
      '--ds-text-inverse':    '255 255 255',
      '--ds-sidebar-bg':      '30 41 59',     // slate-800
      '--ds-sidebar-hover':   '51 65 85',     // slate-700
      '--ds-sidebar-active':  '71 85 105',    // slate-600
      '--ds-sidebar-border':  '51 65 85',
      '--ds-sidebar-text':    '226 232 240',  // slate-200
      '--ds-accent':          '100 116 139',  // slate-500
    },
  },
];

export const getPreset = (id: string): ThemePreset =>
  THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];

export const getSystemThemeId = (): string => {
  if (typeof window === 'undefined') return 'default';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
};

export const getTimeBasedThemeId = (): string => {
  const hour = new Date().getHours();
  // Daytime 6am–8pm → respect system, otherwise force dark
  if (hour >= 6 && hour < 20) return getSystemThemeId();
  return 'dark';
};

export type DensityLevel = 'compact' | 'default' | 'comfortable';
export type FontSizeLevel = 'sm' | 'md' | 'lg';

export const DENSITY_SCALE: Record<DensityLevel, string> = {
  compact: '0.85',
  default: '1',
  comfortable: '1.15',
};

export const FONT_SIZE_BASE: Record<FontSizeLevel, string> = {
  sm: '13px',
  md: '15px',
  lg: '17px',
};
