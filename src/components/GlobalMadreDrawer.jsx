import React, { useState, useEffect, useRef } from 'react';
import {
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  SCAN_COMMAND_REGEX,
  ejecutarEscaneoCompleto
} from '../utils/coreProScanner.js';

/**
 * Cerebro Central MADRE - Strategic Audit & Fixture Recap API Endpoint
 */
export const MADRE_API_ENDPOINT = "/.netlify/functions/madre-chat";

/**
 * Helper function to safely extract active Core PRO parameters from DOM / state.
 */
export function getCoreProUIContext() {
  const params = {};
  let vistaActivaActual = "Core PRO - Panel y Mapa Operativo";
  let referenciaActiva = null;

  if (typeof document !== 'undefined') {
    // 1. MGO y Portfolio (lo que ya tenías)
    const mgoEl = document.querySelector('[data-fuel="mgo"], #mgo-price, #bunker-mgo, .price-mgo, [data-metric="mgo"]');
    const portfolioEl = document.querySelector('#portfolio-count, [data-portfolio-count], #fleet-summary-count');

    if (mgoEl) {
      const val = parseFloat((mgoEl.value || mgoEl.textContent || "").replace(/[^0-9.]/g, ""));
      if (Number.isFinite(val) && val > 0) params.mgo_price = val;
    }
    if (portfolioEl) {
      const pVal = parseInt((portfolioEl.textContent || "").replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(pVal) && pVal > 0) params.totalPortfolio = pVal;
    }
    }

    // --- NUEVO: 2. Rescatar la Referencia del Expediente (RDM/...) ---
    // Escaneamos la pantalla buscando el formato RDM/XXXX-XXXX
    const allTextEls = typeof document.querySelectorAll === 'function'
      ? Array.from(document.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6, input'))
      : [];
    const refEl = allTextEls.find(el => {
      const text = el.value || el.textContent || "";
      return text.includes('RDM/');
    });
    if (refEl) {
      const match = (refEl.value || refEl.textContent).match(/RDM\/\d{4}-\d{4,}/);
      if (match) referenciaActiva = match[0];
    }

   // --- NUEVO: 3. Rescatar las PDA POL y PDA POD ---
    const pdaPolInput = typeof document.getElementById === 'function' ? document.getElementById('pda-pol') : null;
    const pdaPodInput = typeof document.getElementById === 'function' ? document.getElementById('pda-pod') : null;

    if (pdaPolInput) {
      // Leemos el valor normal o el atributo especial de datos operativos que usa tu sistema
      const rawPol = pdaPolInput.value || pdaPolInput.getAttribute('data-operational-pda-base') || "0";
      const valPol = parseFloat(rawPol.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(valPol) && valPol > 0) params.pda_pol = valPol;
    }

    if (pdaPodInput) {
      const rawPod = pdaPodInput.value || pdaPodInput.getAttribute('data-operational-pda-base') || "0";
      const valPod = parseFloat(rawPod.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(valPod) && valPod > 0) params.pda_pod = valPod;
    }

    // --- NUEVO: 4. Cambiar de vista dinámicamente ---
    if (params.pda_pol || params.pda_pod) {
      vistaActivaActual = "Core PRO - Calculadora de Bunkers y PDAs";
    }

  // --- NUEVO: 5. Escaneo Estructurado Bloque por Bloque (Módulos 1 al 10) ---
  let escaneoCompacto = null;
  try {
    const rawData = extractStructuredCoreProData();
    escaneoCompacto = compactPayload(rawData);
  } catch (_) {}

  // Se lo enviamos TODO a MADRE
  return {
    current_module: "core_pro",
    vista_activa: "Core PRO - Panel y Mapa Operativo",
    vista_dinamica: vistaActivaActual,
    referenciaMadre: referenciaActiva, // <- VITAL PARA QUE NO FALLE NEON
    parametros_activos: params,        // <- AQUÍ VAN LOS GASTOS DE PUERTO
    escaneo_estructurado: escaneoCompacto,
    modulos_1_a_10: escaneoCompacto?.bloques,
    resumen_operativo: escaneoCompacto?.resumen,
    pol: escaneoCompacto?.bloques?.bloque_1_derrota_puertos?.pol || 'Rotterdam',
    pod: escaneoCompacto?.bloques?.bloque_1_derrota_puertos?.pod || 'Houston',
    cargoQty: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.toneladas_carga || 30000,
    commodity: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.commodity || 'Siderúrgico / Carga General',
    breakEvenUnitario: escaneoCompacto?.bloques?.bloque_6_resumen_operacion_costes?.break_even_usd_mt || 28.5,
    fleteUnitario: escaneoCompacto?.bloques?.bloque_10_simulador_negociacion_contraofertas?.flete_venta_fletador_mt || escaneoCompacto?.bloques?.bloque_7_analisis_fletes_riesgos?.flete_venta_sugerido_mt || 37.0,
    loadRate: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.ritmo_carga_tpd || 5000,
    dischargeRate: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.ritmo_descarga_tpd || 2500,
    tceDiario: escaneoCompacto?.bloques?.bloque_10_simulador_negociacion_contraofertas?.tce_obtenido_usd_dia || 13500
  };
}

if (typeof window !== 'undefined') {
  window.getCoreProUIContext = getCoreProUIContext;
  window.triggerLaserScanEffect = triggerLaserScanEffect;
  window.ejecutarEscaneoVisual = ejecutarEscaneoVisual;
  window.ejecutarEfectoLaserScan = ejecutarEfectoLaserScan;
  window.extractStructuredCoreProData = extractStructuredCoreProData;
  window.extraerDatosEstructuradosCorePro = extraerDatosEstructuradosCorePro;
  window.compactPayload = compactPayload;
  window.ejecutarEscaneoCompleto = ejecutarEscaneoCompleto;
}

export function GlobalMadreDrawer({
  isOpen = false,
  onClose,
  isMuted: controlledIsMuted,
  onMuteToggle,
  onReset,
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);
  const [internalIsMuted, setInternalIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      role: 'assistant',
      text: 'Auditoría Estratégica MADRE activa. Sistema listo para optimización y fixture recap.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setInternalIsOpen(isOpen);
    if (!isOpen && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isOpen]);

  const isMuted = controlledIsMuted !== undefined ? controlledIsMuted : internalIsMuted;

  useEffect(() => {
    if (internalIsOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, internalIsOpen]);

  // Global event bridge
  useEffect(() => {
    const handleToggle = () => {
      setInternalIsOpen((prev) => {
        const nextState = !prev;
        if (!nextState && typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        return nextState;
      });
    };
    
    const handleOpen = () => setInternalIsOpen(true);
    
    const handleCloseEvent = () => {
      setInternalIsOpen(false);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };

    window.addEventListener('madre:toggle', handleToggle);
    window.addEventListener('madre:open', handleOpen);
    window.addEventListener('madre:close', handleCloseEvent);

    // EXPOSE TO GLOBAL WINDOW SO HTML BUTTON CAN FIRE IT
    if (typeof window !== 'undefined') {
      window.openMadreDrawer = handleOpen;
      window.closeMadreDrawer = handleCloseEvent;
      window.toggleMadreDrawer = handleToggle;
      window.getCoreProUIContext = getCoreProUIContext;
    }

    return () => {
      window.removeEventListener('madre:toggle', handleToggle);
      window.removeEventListener('madre:open', handleOpen);
      window.removeEventListener('madre:close', handleCloseEvent);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakText = (text) => {
    if (isMuted || !internalIsOpen || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#_`~[\]]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    if (typeof onMuteToggle === 'function') {
      onMuteToggle(nextMuted);
    } else {
      setInternalIsMuted(nextMuted);
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };
  const toggleMute = handleMuteToggle;

  const handleReset = () => {
    if (typeof onReset === 'function') {
      onReset();
    }
    setMessages([
      {
        id: Date.now(),
        sender: 'assistant',
        role: 'assistant',
        text: 'Auditoría Estratégica MADRE reiniciada.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
    setInternalIsOpen(false);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const handleMicClick = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Reconocimiento de voz no soportado.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event) => setInputValue(event.results[0][0].transcript);

    recognition.start();
  };

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const queryText = trimmed;
    const urlParams = new URLSearchParams(window.location.search);
    const projectRef = urlParams.get('ref') || window.location.hash.match(/ref=([^&]+)/)?.[1] || "RDM/2026-TBN";

    // Si la consulta solicita escaneo o análisis de pantalla, dispara el efecto láser visual
    if (SCAN_COMMAND_REGEX.test(queryText)) {
      triggerLaserScanEffect();
    }

    // Clean the history to satisfy Gemini API requirements
    let cleanHistory = messages
      .filter(m => m.text && !m.isError && !m.text.includes("Indica error provocado"))
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'model', // CRITICAL: Gemini requires 'model'
        content: m.text
      }));

    // Strictly ensure the history array always starts with a 'user' turn
    while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
      cleanHistory.shift();
    }

    const payload = {
      mensajeUsuario: queryText,
      message: queryText,
      prompt: queryText,
      history: cleanHistory,
      context: {
        origin: "SeaCharter Core PRO",
        projectRef: projectRef,
        userName: "Esteban" // Injected for Data Bridge personalization parity
      },
      contexto_ui: getCoreProUIContext()
    };

    try {
      // Clean, single-payload dispatch to MADRE API endpoint
      const response = await fetch(MADRE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Error en MADRE API');
      const data = await response.json();
      const replyText = data?.reply || data?.message || data?.text || 'Auditoría procesada.';

      const assistantMessage = {
        id: Date.now() + 1,
        sender: 'assistant',
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      speakText(replyText);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          role: 'assistant',
          text: 'Error de conexión con el Cerebro Central.',
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!internalIsOpen) return null;

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-[9999] w-[420px] max-w-lg bg-slate-900 text-slate-100 shadow-2xl border-r border-slate-800 flex flex-col font-sans transition-all duration-300"
      style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-white">
        {/* Left side: Logo and Title */}
        <div className="flex items-center gap-2 min-w-0">
          <img src="/MADRE.png" alt="MADRE" className="w-6 h-6 rounded-full object-cover shrink-0" />
          <span className="font-bold text-sm tracking-wide truncate text-slate-800">MADRE</span>
          <span className="text-[10px] font-mono bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-200 shrink-0">Cerebro Central</span>
        </div>

        {/* Right side: Action Buttons (Mute, Reset, Close) */}
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={toggleMute} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-[28px]" title={isMuted ? 'Activar voz' : 'Silenciar voz'}>{isMuted ? '🔇' : '🔊'}</button>
          <button type="button" onClick={handleReset} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-[28px]" title="Reiniciar conversación">🔄</button>
          <button type="button" onClick={handleClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors flex items-center justify-center min-w-[28px]" title="Cerrar panel">✕</button>
        </div>
      </header>

      {/* Barra de acción rápida: Escaneo Visual Láser de Pantalla (Bloques 1 al 10) */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 truncate">Escaneo Visual Core PRO</span>
        </div>
        <button
          type="button"
          id="btn-madre-scan-screen"
          onClick={() => {
            triggerLaserScanEffect();
            setInputValue("Escanear y auditar pantalla Core PRO (Módulos 1 al 10)");
            setTimeout(() => {
              handleSubmit();
            }, 60);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
          title="Disparar escaneo visual láser y auditar módulos 1 al 10"
        >
          <span className="text-emerald-400 font-bold">⚡</span>
          <span>Escanear Pantalla</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`p-3 rounded-xl text-xs max-w-[85%] whitespace-pre-wrap ${m.sender === 'user' ? 'bg-teal-600 text-white' : m.isError ? 'bg-red-950 text-red-200 border-red-800' : 'bg-slate-800 border border-slate-700 text-white'}`}>{m.text}</div>
          </div>
        ))}
        {isLoading && <div className="text-xs text-teal-300 animate-pulse">Procesando...</div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-slate-800 flex gap-2">
        <button onClick={handleMicClick} className="p-2 rounded-lg text-xs bg-slate-800 text-teal-300">🎙️</button>
        <form onSubmit={handleSubmit} className="flex gap-2 flex-1">
          <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Comando..." className="flex-1 px-3 py-2 bg-slate-800 border-slate-700 rounded-lg text-xs text-white" />
          <button type="submit" className="px-3 py-2 bg-teal-600 text-white rounded-lg text-xs">Enviar</button>
        </form>
      </div>
    </aside>
  );
}

export {
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  SCAN_COMMAND_REGEX,
  ejecutarEscaneoCompleto
};

export default GlobalMadreDrawer;
