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
    raw = (typeof localStorage !== 'undefined' && localStorage.getItem('seacharter_lang'))
      || (typeof document !== 'undefined' && document.getElementById('language-selector')?.value)
      || (typeof document !== 'undefined' && document.documentElement?.lang)
      || (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage))
      || fallback;
  } catch {
    raw = fallback;
  }

  const clean = String(raw || '').trim();
  if (!clean) return fallback;

  if (clean.includes('-')) {
    const parts = clean.split('-');
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  const lower = clean.toLowerCase();
  if (lower === 'en') return 'en-US';
  if (lower === 'fr') return 'fr-FR';
  if (lower === 'es') return 'es-ES';
  if (lower === 'de') return 'de-DE';
  if (lower === 'it') return 'it-IT';
  if (lower === 'pt') return 'pt-PT';
  if (lower === 'ar') return 'ar-SA';
  if (lower === 'tr') return 'tr-TR';
  if (lower === 'zh' || lower === 'zh-cn') return 'zh-CN';
  return `${lower}-${lower.toUpperCase()}`;
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
