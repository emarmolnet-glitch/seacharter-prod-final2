import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Endpoint de voz neuronal MADRE conectando con DataBridge (Web Audio API - Bypass CSP)
 */
export const MADRE_VOICE_ENDPOINT = "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/madre-voice";

/**
 * Reproducción de voz neuronal MADRE directa en hardware de audio
 * @param {string} textToSpeak
 * @param {object} playback
 */
export async function playNeuralMotherVoice(textToSpeak, playback = {}) {
  if (!textToSpeak) return null;
  let audioCtx;
  
  try {
    const response = await fetch(MADRE_VOICE_ENDPOINT, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg' 
      },
      body: JSON.stringify({ text: textToSpeak })
    });

    if (!response.ok) {
      console.warn(`[playNeuralMotherVoice] Petición rechazada por Netlify (HTTP ${response.status})`);
      return null;
    }

    const contentType = response.headers?.get ? (response.headers.get("content-type") || response.headers.get("Content-Type")) : null;
    if (contentType && contentType.includes("application/json")) {
      console.warn("[playNeuralMotherVoice] El servidor devolvió JSON de error. Abortando síntesis.");
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    if (playback.shouldPlay && !playback.shouldPlay()) {
      await audioCtx.close();
      return null;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    
    if (typeof playback.onReady === 'function') {
      playback.onReady(source);
    }

    source.onended = () => {
      try {
        if (typeof playback.onEnded === 'function') {
          playback.onEnded(source);
        }
        audioCtx.close();
      } catch (_) {}
    };

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    source.start(0);
    return source;
  } catch (err) {
    if (audioCtx) {
      try { await audioCtx.close(); } catch (_) {}
    }
    console.warn('[playNeuralMotherVoice] Error al reproducir síntesis Web Audio:', err);
    return null;
  }
}

/**
 * Hook de voz de MADRE para gestión de audio, síntesis neuronal y soporte para voiceSummary
 */
export function useMadreVoice(initialMuted = false) {
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const currentAudioRef = useRef(null);
  const playbackVersionRef = useRef(0);
  const isMutedRef = useRef(initialMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stop = useCallback(() => {
    playbackVersionRef.current += 1;
    const audio = currentAudioRef.current;
    currentAudioRef.current = null;
    setIsSpeaking(false);

    if (!audio) return;
    try {
      if (typeof audio.stop === 'function') audio.stop();
      else if (typeof audio.pause === 'function') {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch (_) {}
    try {
      if (typeof audio.disconnect === 'function') audio.disconnect();
    } catch (_) {}
  }, []);

  const toggleMute = useCallback((forceVal) => {
    setIsMuted((prev) => {
      const next = typeof forceVal === 'boolean' ? forceVal : !prev;
      isMutedRef.current = next;
      if (next) stop();
      return next;
    });
  }, [stop]);

  /**
   * Reproduce contenido de MADRE. Si se pasa un objeto con `voiceSummary`,
   * reproduce `voiceSummary` en lugar del texto completo con tablas Markdown.
   */
  const speak = useCallback(async (content) => {
    try {
      stop();
      if (isMutedRef.current) return;

      // Extracción limpia: priorizar voiceSummary si viene en la respuesta
      let rawText = '';
      if (content && typeof content === 'object') {
        rawText = content.voiceSummary || content.mensaje_voz || content.resumen_voz || content.reply || content.respuesta || content.text || '';
      } else if (typeof content === 'string') {
        rawText = content;
      }

      // Limpieza de caracteres de markdown
      const clean = String(rawText || '')
        .replace(/[*#_`~>\[\]]/g, '')
        .replace(/\|.*?\|/g, '') // omitir restos de tablas markdown en voz
        .replace(/\s+/g, ' ')
        .trim();

      if (!clean) return;

      const currentVersion = playbackVersionRef.current;
      const shouldPlay = () => currentVersion === playbackVersionRef.current && !isMutedRef.current;

      setIsSpeaking(true);
      const audioInstance = await playNeuralMotherVoice(clean, {
        shouldPlay,
        onReady: (source) => {
          currentAudioRef.current = source;
        },
        onEnded: (source) => {
          if (currentAudioRef.current === source) {
            currentAudioRef.current = null;
            setIsSpeaking(false);
          }
        }
      });

      if (!audioInstance) {
        setIsSpeaking(false);
        return null;
      }

      if (audioInstance && !shouldPlay()) {
        try { audioInstance.stop(); } catch (_) {}
        if (currentAudioRef.current === audioInstance) {
          currentAudioRef.current = null;
          setIsSpeaking(false);
        }
      }
    } catch (err) {
      console.warn('[useMadreVoice] Error en speak:', err);
      setIsSpeaking(false);
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isMuted,
    isSpeaking,
    toggleMute,
    speak,
    stop,
    playNeuralMotherVoice
  };
}

export default useMadreVoice;
