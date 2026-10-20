import React, { useState, useEffect, useRef } from 'react';

/**
 * Cerebro Central MADRE - Strategic Audit & Fixture Recap API Endpoint
 */
export const MADRE_API_ENDPOINT = "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/madre-chat";

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
      }
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
      className="fixed top-0 left-0 bottom-0 z-[9999] w-full max-w-md bg-slate-900 text-slate-100 shadow-2xl border-r border-slate-800 flex flex-col font-sans transition-all duration-300"
      style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
        <div className="flex items-center gap-2">
          <img src="/MADRE.png" alt="MADRE" className="w-5 h-5 rounded-full object-cover shadow-[0_0_8px_rgba(45,212,191,0.6)]" style={{ width: '20px', height: '20px' }} />
          <span className="font-bold text-base text-white">MADRE</span>
          <span className="text-[9px] font-mono bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30">Cerebro Central</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-white text-xs">
          <button type="button" onClick={toggleMute} className="px-2 py-1 rounded hover:bg-slate-800/80 transition-colors" title={isMuted ? 'Activar voz' : 'Silenciar voz'}>{isMuted ? '🔇' : '🔊'}</button>
          <button type="button" onClick={handleReset} className="px-2 py-1 rounded hover:bg-slate-800/80 transition-colors" title="Reiniciar conversación">🔄</button>
          <button type="button" onClick={handleClose} className="px-2 py-1 rounded hover:bg-slate-800/80 transition-colors" title="Cerrar panel">✕</button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`p-3 rounded-xl text-xs max-w-[85%] ${m.sender === 'user' ? 'bg-teal-600 text-white' : m.isError ? 'bg-red-950 text-red-200 border-red-800' : 'bg-slate-800 border border-slate-700 text-white'}`}>{m.text}</div>
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

export default GlobalMadreDrawer;
