import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/** `public/theme-init.js` ham shu kalitni o'qiydi — nomi o'zgarsa u yerda ham o'zgartiring. */
export const THEME_STORAGE_KEY = 'gavhar-theme';

export const useThemeStore = create<ThemeState>()(
  persist((set) => ({ theme: 'system', setTheme: (theme) => set({ theme }) }), {
    name: THEME_STORAGE_KEY,
  }),
);

const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#0F4C3A', dark: '#0B1512' };

export const resolveTheme = (preference: ThemePreference): ResolvedTheme => {
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
};

export function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved]);
}

/** "Tizim" rejimida OS temasi o'zgarsa, ilova ham darhol moslashadi. */
export function watchSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
