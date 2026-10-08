import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const LANGUAGES = ['uz', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'uz';

interface LocaleState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist((set) => ({ language: DEFAULT_LANGUAGE, setLanguage: (language) => set({ language }) }), {
    name: 'gavhar-locale',
  }),
);
