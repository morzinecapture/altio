import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from './fr';
import en from './en';

const LANG_KEY = 'user_language';

export const initI18n = async () => {
  let savedLang: string | null = null;
  try {
    savedLang = await AsyncStorage.getItem(LANG_KEY);
  } catch (_) {}

  const lng = (savedLang === 'en' || savedLang === 'fr') ? savedLang : 'fr';

  await i18n.use(initReactI18next).init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    lng,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });
};

export const changeLanguage = async (lang: 'fr' | 'en') => {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANG_KEY, lang);
  } catch (_) {}
};

export default i18n;
