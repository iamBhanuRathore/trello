import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemePalette = 'default' | 'midnight' | 'ocean' | 'forest' | 'synthwave' | 'nordic';

export interface AccentColor {
  id: string;
  name: string;
  primary: string;
  ring: string;
  bgGradient: string;
}

export const ACCENT_PRESETS: AccentColor[] = [
  {
    id: 'indigo',
    name: 'Indigo (Default)',
    primary: '#6366f1',
    ring: 'rgba(99, 102, 241, 0.5)',
    bgGradient: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'sky',
    name: 'Sky Blue',
    primary: '#0284c7',
    ring: 'rgba(2, 132, 199, 0.5)',
    bgGradient: 'from-sky-500 to-blue-600',
  },
  {
    id: 'emerald',
    name: 'Emerald Green',
    primary: '#10b981',
    ring: 'rgba(16, 185, 129, 0.5)',
    bgGradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'violet',
    name: 'Neon Violet',
    primary: '#8b5cf6',
    ring: 'rgba(139, 92, 246, 0.5)',
    bgGradient: 'from-purple-500 to-pink-600',
  },
  {
    id: 'rose',
    name: 'Rose Crimson',
    primary: '#f43f5e',
    ring: 'rgba(244, 63, 94, 0.5)',
    bgGradient: 'from-rose-500 to-red-600',
  },
  {
    id: 'amber',
    name: 'Amber Glow',
    primary: '#f59e0b',
    ring: 'rgba(245, 158, 11, 0.5)',
    bgGradient: 'from-amber-500 to-orange-600',
  },
];

export interface ThemePresetInfo {
  id: ThemePalette;
  name: string;
  description: string;
  previewBg: string;
  previewCard: string;
  previewAccent: string;
  isDarkOnly?: boolean;
}

export const THEME_PALETTES: ThemePresetInfo[] = [
  {
    id: 'default',
    name: 'Classic Zinc',
    description: 'Clean, modern high-contrast grayscale interface.',
    previewBg: '#0f172a',
    previewCard: '#1e293b',
    previewAccent: '#818cf8',
  },
  {
    id: 'midnight',
    name: 'Midnight OLED',
    description: 'Ultra-deep pitch black for maximum focus & contrast.',
    previewBg: '#000000',
    previewCard: '#09090b',
    previewAccent: '#6366f1',
    isDarkOnly: true,
  },
  {
    id: 'ocean',
    name: 'Oceanic Azure',
    description: 'Deep navy twilight slate with glowing cyan accents.',
    previewBg: '#0b132b',
    previewCard: '#111d40',
    previewAccent: '#38bdf8',
    isDarkOnly: true,
  },
  {
    id: 'forest',
    name: 'Emerald Forest',
    description: 'Serene pine & dark moss with vibrant mint green.',
    previewBg: '#061914',
    previewCard: '#0c2921',
    previewAccent: '#10b981',
    isDarkOnly: true,
  },
  {
    id: 'synthwave',
    name: 'Synthwave Sunset',
    description: 'Retro cyberpunk violet with neon pink glow.',
    previewBg: '#120826',
    previewCard: '#1c0d3a',
    previewAccent: '#f43f5e',
    isDarkOnly: true,
  },
  {
    id: 'nordic',
    name: 'Nordic Frost',
    description: 'Arctic slate with chilled ice-blue highlights.',
    previewBg: '#1e2530',
    previewCard: '#273140',
    previewAccent: '#88c0d0',
    isDarkOnly: true,
  },
];

interface ThemeState {
  mode: ThemeMode;
  palette: ThemePalette;
  accentId: string;
  customAccentHex: string | null;
  resolvedIsDark: boolean;

  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
  setAccentId: (accentId: string) => void;
  setCustomAccentHex: (hex: string | null) => void;
  initTheme: () => () => void;
}

const STORAGE_KEYS = {
  mode: 'boardly_theme_mode',
  palette: 'boardly_theme_palette',
  accentId: 'boardly_theme_accent',
  customAccentHex: 'boardly_theme_custom_accent',
};

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDOMTheme(
  mode: ThemeMode,
  palette: ThemePalette,
  accentId: string,
  customAccentHex: string | null
): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;

  const isSystemDark = getSystemPrefersDark();
  const isDark = mode === 'dark' || (mode === 'system' && isSystemDark);

  // If a dark-only palette is active and user switches to light, we keep light styling or handle palette gracefully
  if (isDark) {
    root.classList.add('dark');
    root.setAttribute('data-theme', palette);
  } else {
    root.classList.remove('dark');
    // Previously the attribute was REMOVED in light mode, which discarded the
    // stored palette — switching back to dark lost the user's choice. The
    // dark-only palettes are styled under `.dark`, so setting it here is inert
    // in light mode but keeps the selection.
    root.setAttribute('data-theme', palette);
  }

  // Apply accent color
  if (customAccentHex) {
    root.style.setProperty('--accent-primary', customAccentHex);
    root.style.setProperty('--accent-ring', `${customAccentHex}80`);
  } else {
    const accent = ACCENT_PRESETS.find((a) => a.id === accentId) || ACCENT_PRESETS[0];
    if (accent && accent.id !== 'indigo') {
      root.style.setProperty('--accent-primary', accent.primary);
      root.style.setProperty('--accent-ring', accent.ring);
    } else {
      root.style.removeProperty('--accent-primary');
      root.style.removeProperty('--accent-ring');
    }
  }

  return isDark;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  // Read initial from localStorage if available
  const savedMode =
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEYS.mode) as ThemeMode)
      : null) || 'system';

  const savedPalette =
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEYS.palette) as ThemePalette)
      : null) || 'default';

  const savedAccentId =
    (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.accentId) : null) ||
    'indigo';

  const savedCustomAccentHex =
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEYS.customAccentHex)
      : null) || null;

  return {
    mode: savedMode,
    palette: savedPalette,
    accentId: savedAccentId,
    customAccentHex: savedCustomAccentHex,
    resolvedIsDark: savedMode === 'dark' || (savedMode === 'system' && getSystemPrefersDark()),

    setMode: (mode) => {
      localStorage.setItem(STORAGE_KEYS.mode, mode);
      const { palette, accentId, customAccentHex } = get();
      const resolvedIsDark = applyDOMTheme(mode, palette, accentId, customAccentHex);
      set({ mode, resolvedIsDark });
    },

    setPalette: (palette) => {
      localStorage.setItem(STORAGE_KEYS.palette, palette);
      const { mode, accentId, customAccentHex } = get();
      // A dark-only palette used to silently rewrite mode light -> dark, so
      // choosing a colour changed the user's theme with no indication. The
      // constraint is surfaced in the Appearance modal instead; setPalette only
      // records the choice.
      const resolvedIsDark = applyDOMTheme(mode, palette, accentId, customAccentHex);
      set({ palette, resolvedIsDark });
    },

    setAccentId: (accentId) => {
      localStorage.setItem(STORAGE_KEYS.accentId, accentId);
      localStorage.removeItem(STORAGE_KEYS.customAccentHex);
      const { mode, palette } = get();
      const resolvedIsDark = applyDOMTheme(mode, palette, accentId, null);
      set({ accentId, customAccentHex: null, resolvedIsDark });
    },

    setCustomAccentHex: (hex) => {
      if (hex) {
        localStorage.setItem(STORAGE_KEYS.customAccentHex, hex);
      } else {
        localStorage.removeItem(STORAGE_KEYS.customAccentHex);
      }
      const { mode, palette, accentId } = get();
      const resolvedIsDark = applyDOMTheme(mode, palette, accentId, hex);
      set({ customAccentHex: hex, resolvedIsDark });
    },

    initTheme: () => {
      const { mode, palette, accentId, customAccentHex } = get();
      const resolvedIsDark = applyDOMTheme(mode, palette, accentId, customAccentHex);
      set({ resolvedIsDark });

      // Listen to OS system preference changes
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
          const currentMode = get().mode;
          if (currentMode === 'system') {
            const isDark = applyDOMTheme(
              'system',
              get().palette,
              get().accentId,
              get().customAccentHex
            );
            set({ resolvedIsDark: isDark });
          }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      }

      return () => {};
    },
  };
});
