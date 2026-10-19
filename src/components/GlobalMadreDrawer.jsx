import React, { useState, useEffect, useRef } from 'react';

/**
 * Global MADRE Drawer component for SeaCharter Core PRO.
 * Renders an offcanvas assistant drawer with dark theme inline style overrides
 * to prevent legacy global CSS from forcing white backgrounds.
 * Integrates directly with the MADRE strategic chat API endpoint.
 */
export function GlobalMadreDrawer({
  isOpen = true,
  onClose,
  isMuted: controlledIsMuted,
  onMuteToggle,
  onReset,
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);
  const [internalIsMuted, setInternalIsMuted] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      role: 'assistant',
      text: 'Auditoría Estratégica MADRE activa. Sistema listo para optimización y fixture recap. ¿En qué operación marítima puedo asistirte hoy?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setInternalIsOpen(isOpen);
  }, [isOpen]);

  const isMuted = controlledIsMuted !== undefined ? controlledIsMuted : internalIsMuted;

  // Auto-scroll to bottom whenever messages or loading state change
  useEffect(() => {
    if (internalIsOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, internalIsOpen]);

  // Focus input when drawer opens
  useEffect(() => {
    if (internalIsOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [internalIsOpen]);

  // Global event bridge
  useEffect(() => {
    const handleToggle = () => setInternalIsOpen((prev) => !prev);
    const handleOpen = () => setInternalIsOpen(true);
    const handleCloseEvent = () => setInternalIsOpen(false);

    window.addEventListener('madre:toggle', handleToggle);
    window.addEventListener('madre:open', handleOpen);
    window.addEventListener('madre:close', handleCloseEvent);

    if (typeof window !== 'undefined') {
      window.openMadreDrawer = handleOpen;
      window.closeMadreDrawer = handleCloseEvent;
      window.toggleMadreDrawer = handleToggle;
    }

    return () => {
      window.removeEventListener('madre:toggle', handleToggle);
      window.removeEventListener('madre:open', handleOpen);
      window.removeEventListener('madre:close', handleCloseEvent);
    };
  }, []);

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
    setInternalIsOpen(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('madre:close'));
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    if (typeof onMuteToggle === 'function') {
      onMuteToggle(nextMuted);
    } else {
      setInternalIsMuted(nextMuted);
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && nextMuted) {
      window.speechSynthesis.cancel();
    }
  };

  const handleReset = () => {
    if (typeof onReset === 'function') {
      onReset();
    }
    setMessages([
      {
        id: Date.now(),
        sender: 'assistant',
        role: 'assistant',
        text: 'Auditoría Estratégica MADRE reiniciada. Sistema listo para optimización y fixture recap.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMessage(null);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const speakText = (text) => {
    if (isMuted || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#_`~[\]]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  };

  /**
   * Complete handleSubmit logic with the fetch call to the MADRE chat API endpoint.
   */
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
    setErrorMessage(null);

    try {
      const response = await fetch('https://neon-seachartercorepro-4ce09d.netlify.app/api/madre-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          message: trimmed,
          prompt: trimmed,
          history: messages.map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
          context: {
            source: 'SeaCharter Core PRO',
            module: 'GlobalMadreDrawer',
            projectRef: typeof window !== 'undefined'
              ? (window.ContractRefManager?.getActiveContractRef?.() || window.localStorage?.getItem('active_contract_ref') || '')
              : '',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText || 'Error en comunicación con MADRE'}`);
      }

      const data = await response.json();
      const replyText = data?.reply || data?.message || data?.text || data?.response || data?.resultado || 'Auditoría MADRE procesada.';

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
      console.error('[GlobalMadreDrawer] Error calling MADRE API:', err);
      const errorText = 'No se pudo conectar con el motor central de MADRE. Verifique la conexión o reintente en unos instantes.';
      setErrorMessage(err.message || 'Error de conexión');
      const fallbackErrorMessage = {
        id: Date.now() + 1,
        sender: 'assistant',
        role: 'assistant',
        text: errorText,
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackErrorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!internalIsOpen) return null;

  return (
    <aside
      id="global-madre-drawer"
      className="fixed top-0 right-0 bottom-0 z-[9999] w-full max-w-md bg-slate-900 text-slate-100 shadow-2xl border-l border-slate-800 flex flex-col font-sans transition-all duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="Panel MADRE"
      style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
    >
      {/* HEADER: Strict Inline Styles to forcefully bypass legacy CSS */}
      <header className="madre-header flex items-center justify-between px-4 py-3 shrink-0" style={{ backgroundColor: '#0f172a', color: '#ffffff', borderBottom: '1px solid #1e293b' }}>
        <div className="flex items-center gap-2.5">
          <img
            src="/MADRE.png"
            alt="MADRE"
            className="w-6 h-6 rounded-full object-cover shadow-[0_0_8px_rgba(45,212,191,0.6)]"
            style={{ width: '24px', height: '24px', borderRadius: '50%' }}
          />
          <span className="font-bold text-base tracking-wide" style={{ color: '#ffffff' }}>MADRE</span>
          <span className="text-[10px] font-mono font-bold bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30 uppercase tracking-wider">
            AI Core
          </span>
        </div>

        {/* Action buttons container with forced text color */}
        <div className="flex items-center gap-3 ml-auto shrink-0" style={{ color: '#ffffff' }}>
          <button
            type="button"
            id="btn-madre-mute"
            onClick={toggleMute}
            aria-label={isMuted ? 'Activar voz' : 'Silenciar voz'}
            title={isMuted ? 'Activar voz' : 'Silenciar voz'}
            className="cursor-pointer text-xs font-semibold px-2 py-1 rounded hover:bg-slate-800/80 transition-colors inline-flex items-center gap-1"
            style={{ color: '#ffffff', backgroundColor: 'transparent' }}
          >
            <span>{isMuted ? '🔇' : '🔊'}</span>
            <span>Mute</span>
          </button>
          <button
            type="button"
            id="btn-madre-reset"
            onClick={handleReset}
            aria-label="Reiniciar conversación"
            title="Reiniciar conversación"
            className="cursor-pointer text-xs font-semibold px-2 py-1 rounded hover:bg-slate-800/80 transition-colors inline-flex items-center gap-1"
            style={{ color: '#ffffff', backgroundColor: 'transparent' }}
          >
            <span>🔄</span>
            <span>Reset</span>
          </button>
          <button
            type="button"
            id="btn-madre-close"
            onClick={handleClose}
            aria-label="Cerrar panel MADRE"
            title="Cerrar panel MADRE"
            className="cursor-pointer text-xs font-semibold px-2 py-1 rounded hover:bg-slate-800/80 transition-colors inline-flex items-center gap-1"
            style={{ color: '#ffffff', backgroundColor: 'transparent' }}
          >
            <span>✕</span>
            <span>Close</span>
          </button>
        </div>
      </header>

      {/* CHAT MESSAGES BODY with Auto-Scroll & Bubbles */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3.5 select-text"
        style={{ backgroundColor: '#0f172a', color: '#ffffff', userSelect: 'text' }}
      >
        {messages.map((m) => {
          const isUser = m.sender === 'user' || m.role === 'user';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className="text-[10px] font-bold text-slate-400">
                  {isUser ? 'Operador' : 'MADRE'}
                </span>
                {m.timestamp && (
                  <span className="text-[9px] text-slate-500 font-mono">
                    {m.timestamp}
                  </span>
                )}
              </div>
              <div
                className={`max-w-[88%] p-3 rounded-xl text-xs leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-teal-600 text-white rounded-tr-none'
                    : m.isError
                    ? 'bg-red-950/80 border border-red-800/70 text-red-200 rounded-tl-none'
                    : 'bg-slate-800/90 border border-slate-700/70 text-slate-100 rounded-tl-none'
                }`}
                style={
                  isUser
                    ? { backgroundColor: '#0d9488', color: '#ffffff' }
                    : m.isError
                    ? { backgroundColor: '#450a0a', color: '#fecaca', border: '1px solid #991b1b' }
                    : { backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }
                }
              >
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
              </div>
            </div>
          );
        })}

        {/* LOADING INDICATOR BUBBLE */}
        {isLoading && (
          <div className="flex flex-col items-start" role="status" aria-live="polite">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className="text-[10px] font-bold text-teal-400">MADRE</span>
              <span className="text-[9px] text-slate-500 font-mono">Procesando...</span>
            </div>
            <div
              className="p-3 rounded-xl rounded-tl-none bg-slate-800/90 border border-slate-700/70 text-xs text-teal-300 flex items-center gap-2"
              style={{ backgroundColor: '#1e293b', color: '#5eead4', border: '1px solid #334155' }}
            >
              <span className="inline-block animate-spin">⏳</span>
              <span className="animate-pulse">Analizando operación y consultando motor estratégico...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK SUGGESTIONS BAR */}
      <div
        className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
        style={{ backgroundColor: '#0b1120' }}
      >
        <span className="text-[10px] font-bold text-slate-400 shrink-0">Sugerencias:</span>
        <button
          type="button"
          onClick={() => setInputValue('Analizar viabilidad y break-even de la operación')}
          className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
        >
          Break-Even
        </button>
        <button
          type="button"
          onClick={() => setInputValue('Recomendar cláusulas de protección y laytime WWD SHINC')}
          className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
        >
          Cláusulas
        </button>
        <button
          type="button"
          onClick={() => setInputValue('Simular propuesta de Fixture Recap (Opción B)')}
          className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 whitespace-nowrap cursor-pointer transition-colors"
        >
          Fixture Recap
        </button>
      </div>

      {/* INPUT FORM BAR */}
      <div
        className="p-3 border-t border-slate-800 bg-slate-900 shrink-0"
        style={{ backgroundColor: '#0f172a' }}
      >
        {errorMessage && (
          <div className="mb-2 text-[10px] text-red-400 bg-red-950/40 border border-red-900/50 rounded px-2 py-1">
            {errorMessage}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Consulta estratégica a MADRE..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400 disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#1e293b', color: '#ffffff' }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0 flex items-center gap-1.5"
            style={{ backgroundColor: isLoading || !inputValue.trim() ? '#1e293b' : '#0d9488', color: '#ffffff' }}
          >
            <span>{isLoading ? '...' : 'Enviar'}</span>
            <span>↵</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

export default GlobalMadreDrawer;
