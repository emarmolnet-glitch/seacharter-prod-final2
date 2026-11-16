import React, { createContext, useContext, useState, useEffect } from 'react';

export const I18nContext = createContext({
  lang: 'es',
  setLang: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children, initialLang }) {
  const [lang, setLang] = useState(() => {
    if (initialLang) return initialLang;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('seacharter_lang') || 'es';
    }
    return 'es';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLanguageChange = (event) => {
      const nextLang = event?.detail?.lang || (typeof localStorage !== 'undefined' ? localStorage.getItem('seacharter_lang') : null) || 'es';
      if (nextLang && nextLang !== lang) {
        setLang(nextLang);
      }
    };

    const handleStorage = (event) => {
      if ((event.key === 'seacharter_lang' || event.key === 'rodahmar_lang') && event.newValue) {
        setLang(event.newValue);
      }
    };

    window.addEventListener('language:change', handleLanguageChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('language:change', handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export default I18nContext;
