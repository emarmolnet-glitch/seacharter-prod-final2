/**
 * Diccionario de mapeo exacto de códigos cortos de UI a formato BCP-47
 * requerido por la Web Speech API (SpeechRecognition y SpeechSynthesis).
 */
export const SPEECH_LANG_MAP = Object.freeze({
  es: 'es-ES',
  en: 'en-US',
  fr: 'fr-FR',
  ar: 'ar-SA',
  pt: 'pt-PT',
  de: 'de-DE',
  it: 'it-IT',
  tr: 'tr-TR',
  zh: 'zh-CN',
});

/**
 * Convierte un código corto de idioma de la UI (ej. 'fr', 'en', 'auto') al formato BCP-47
 * requerido por la Web Speech API (SpeechRecognition / SpeechSynthesis).
 * Si la UI está en modo 'AUTO', detecta el idioma base del navegador y le aplica el mapeo,
 * o usa 'en-US' como fallback seguro.
 *
 * @param {string} [langCode]
 * @param {string} [fallback='en-US']
 * @returns {string}
 */
export function mapLanguageToBcp47(langCode, fallback = 'en-US') {
  const clean = String(langCode || '').trim();
  const lower = clean.toLowerCase();

  if (!lower || lower === 'auto') {
    let browserLang = '';
    try {
      if (typeof navigator !== 'undefined') {
        browserLang = String(navigator.language || navigator.userLanguage || '').trim();
      }
    } catch {
      browserLang = '';
    }

    if (browserLang) {
      const base = browserLang.split('-')[0].toLowerCase();
      if (SPEECH_LANG_MAP[base]) {
        return SPEECH_LANG_MAP[base];
      }
      if (browserLang.includes('-')) {
        const parts = browserLang.split('-');
        return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
      }
      return `${base}-${base.toUpperCase()}`;
    }
    return fallback;
  }

  if (clean.includes('-')) {
    const parts = clean.split('-');
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  if (SPEECH_LANG_MAP[lower]) {
    return SPEECH_LANG_MAP[lower];
  }

  const base = lower.split('-')[0];
  if (SPEECH_LANG_MAP[base]) {
    return SPEECH_LANG_MAP[base];
  }

  return fallback;
}

/**
 * Obtiene dinámicamente el idioma actual de la UI mapeado a BCP-47 para SpeechRecognition.
 * Comprueba el selector lateral del DOM, localStorage ('seacharter_lang' / 'rodahmar_lang'),
 * el atributo lang del documento html y la configuración del navegador.
 *
 * @param {string} [fallback='en-US']
 * @returns {string}
 */
export function getSpeechRecognitionLanguage(fallback = 'en-US') {
  if (typeof window === 'undefined') return fallback;
  let raw = '';
  try {
    raw = (typeof document !== 'undefined' && document.getElementById('language-selector')?.value)
      || (typeof localStorage !== 'undefined' && (localStorage.getItem('seacharter_lang') || localStorage.getItem('rodahmar_lang')))
      || (typeof document !== 'undefined' && document.documentElement?.lang)
      || (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage))
      || fallback;
  } catch {
    raw = fallback;
  }
  return mapLanguageToBcp47(raw, fallback);
}

/**
 * Resolves the active UI language from the DOM / localStorage / browser settings,
 * returning standard BCP-47 language tags (e.g. 'en-US', 'fr-FR', 'es-ES').
 *
 * @param {string} [fallback='es-ES']
 * @returns {string}
 */
export function getUILanguage(fallback = 'es-ES') {
  if (typeof window === 'undefined') return fallback;
  let raw = '';
  try {
    raw = (typeof localStorage !== 'undefined' && (localStorage.getItem('seacharter_lang') || localStorage.getItem('rodahmar_lang')))
      || (typeof document !== 'undefined' && document.getElementById('language-selector')?.value)
      || (typeof document !== 'undefined' && document.documentElement?.lang)
      || (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage))
      || fallback;
  } catch {
    raw = fallback;
  }

  const clean = String(raw || '').trim();
  if (!clean) return fallback;

  if (clean.toLowerCase() === 'auto') {
    return mapLanguageToBcp47('auto', 'en-US');
  }

  return mapLanguageToBcp47(clean, fallback);
}

/**
 * Filters available speech synthesis voices for the target interface language
 * and prioritizes natural/premium voices containing "Google", "Natural", "Premium", or "Online".
 * Falls back to the first available voice for that language if no premium voice matches.
 * Wraps execution in try/catch to safely handle missing voices or unsupported browser locales.
 *
 * @param {SpeechSynthesis} speechSynthesisInstance
 * @param {string} targetLang - BCP-47 tag (e.g. 'en-US', 'fr-FR', 'es-ES', 'pt-PT', 'de-DE')
 * @returns {SpeechSynthesisVoice|null}
 */
export function selectBestVoice(speechSynthesisInstance, targetLang) {
  try {
    if (!speechSynthesisInstance || typeof speechSynthesisInstance.getVoices !== 'function') {
      return null;
    }
    const voices = speechSynthesisInstance.getVoices() || [];
    if (!voices.length) return null;

    const normalizedTarget = String(targetLang || '').replace('_', '-').toLowerCase();
    const langPrefix = normalizedTarget.split('-')[0];

    // 1. Filtrar las voces disponibles por el idioma seleccionado en la interfaz (exacto o prefijo ej. pt-PT / pt-BR)
    const exactVoices = voices.filter(
      (v) => v.lang && v.lang.replace('_', '-').toLowerCase() === normalizedTarget
    );
    const prefixVoices = voices.filter(
      (v) => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(langPrefix)
    );
    const candidateVoices = exactVoices.length > 0 ? exactVoices : prefixVoices;

    if (!candidateVoices.length) {
      return null;
    }

    // 2. Priorización: buscar aquellas que contengan "Google", "Natural", "Premium" o "Online"
    const premiumVoice = candidateVoices.find((v) =>
      /Google|Natural|Premium|Online/i.test(v.name || '')
    );

    // 3. Asignar la voz premium o la primera voz disponible para ese idioma
    return premiumVoice || candidateVoices[0] || null;
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[selectBestVoice] Error finding voice for locale:', targetLang, err);
    }
    return null;
  }
}

/**
 * Ensures voices are loaded asynchronously and attaches onvoiceschanged listener.
 *
 * @param {SpeechSynthesis} speechSynthesisInstance
 * @param {function} [onLoaded]
 */
export function initSpeechVoices(speechSynthesisInstance, onLoaded) {
  if (!speechSynthesisInstance || typeof speechSynthesisInstance.getVoices !== 'function') {
    return;
  }
  const voices = speechSynthesisInstance.getVoices();
  if (voices && voices.length > 0 && typeof onLoaded === 'function') {
    onLoaded(voices);
  }

  const handleVoicesChanged = () => {
    const updated = speechSynthesisInstance.getVoices();
    if (typeof onLoaded === 'function') {
      onLoaded(updated);
    }
  };

  speechSynthesisInstance.onvoiceschanged = handleVoicesChanged;
  if (typeof speechSynthesisInstance.addEventListener === 'function') {
    speechSynthesisInstance.addEventListener('voiceschanged', handleVoicesChanged);
  }
}
