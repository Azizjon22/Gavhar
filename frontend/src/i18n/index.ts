import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setDateLocale } from '@/lib/format';
import { DEFAULT_LANGUAGE, type Language, useLocaleStore } from '@/stores/locale.store';
import ru from './ru.json';
import uz from './uz.json';

const initialLanguage = useLocaleStore.getState().language;

void i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru } },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

const applyLanguage = (language: Language): void => {
  document.documentElement.lang = language;
  setDateLocale(language);
};

applyLanguage(initialLanguage);

// Til bitta joyda — store'da — o'zgaradi; i18next va sana formati unga ergashadi.
useLocaleStore.subscribe((state, previous) => {
  if (state.language === previous.language) return;
  void i18n.changeLanguage(state.language);
  applyLanguage(state.language);
});

export default i18n;
