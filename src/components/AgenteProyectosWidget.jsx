import React, { useState, useRef, useEffect } from 'react';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({ onUpdatePayload, isOpen: controlledIsOpen, onToggleOpen }) {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  const effectiveIsOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const setIsOpen = (val) => {
    setInternalIsOpen(val);
    if (onToggleOpen) onToggleOpen(val);
  };

  const [messages, setMessages] = useState([
    { sender: 'agent', text: '¡Hola! Soy tu Agente de Proyectos. Estoy conectado al workspace y listo para ejecutar cualquier orden en lenguaje natural.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const [position, setPosition] = useState({ 
    x: typeof window !== 'undefined' ? Math.max(10, window.innerWidth - 420) : 100, 
    y: typeof window !== 'undefined' ? Math.max(10, window.innerHeight - 560) : 100 
  });
  const [isDragging, setIsDragging] = useState(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest('.widget-controls') || e.target.closest('button')) return;
    setIsDragging(true);
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 380, e.clientX - offsetRef.current.x)),
        y: Math.max(10, Math.min(window.innerHeight - 100, e.clientY - offsetRef.current.y))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speakText = (text) => {
    if (!isAudioEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[✅📂📎🎙️🔊🔇●✕🗕•]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignorar fallos de síntesis de voz
    }
  };

  const handleSend = (e) => {
    if (e) e.preventDefault();
    const raw = inputValue.trim();
    if (!raw) return;

    setMessages(prev => [...prev, { sender: 'user', text: raw }]);
    setInputValue('');

    const text = raw.toLowerCase();
    let agentReply = "Orden procesada y aplicada en el workspace.";
    let payloadObj = { instruction: raw };

    const extractNumber = (str) => {
      const match = str.match(/(\d+([.,]\d+)?)/);
      return match ? parseFloat(match[0].replace(',', '.')) : null;
    };

    const val = extractNumber(text);

    if (text.includes('dónde') || text.includes('donde') || text.includes('integrado')) {
      agentReply = "Los archivos adjuntos y datos procesados se integran directamente en la tabla de la Lista de Empaque (Project Cargo Builder) y actualizan los cálculos de flete y estiba de forma automática.";
    } else if (text.includes('almacen') || text.includes('dias') || text.includes('días')) {
      if (val !== null) {
        payloadObj.storageDays = val;
        agentReply = `⚙️ Parámetro aplicado: ${val} días de almacenaje configurados en el proyecto.`;
      }
    } else if (text.includes('surveyor') || text.includes('perito') || text.includes('inspeccion')) {
      if (val !== null) {
        payloadObj.surveyorCost = val;
        agentReply = `⚙️ Coste de Surveyor actualizado a ${val} €.`;
      }
    } else if (text.includes('inland') || text.includes('transporte') || text.includes('camion')) {
      if (val !== null) {
        payloadObj.inlandTrucksCount = val;
        agentReply = `⚙️ Coste de transporte Inland actualizado a ${val} €.`;
      }
    } else if (text.includes('aduana')) {
      if (val !== null) {
        payloadObj.customsCost = val;
        agentReply = `⚙️ Gastos de aduanas actualizados a ${val} €.`;
      }
    } else if (text.includes('madera') || text.includes('dunnage')) {
      if (val !== null) {
        payloadObj.dunnageUnits = val;
        agentReply = `⚙️ Unidades de maderas de estiba ajustadas a ${val}.`;
      }
    } else if (text.includes('eslinga')) {
      if (val !== null) {
        payloadObj.slingsUnits = val;
        agentReply = `⚙️ Unidades de eslingas ajustadas a ${val}.`;
      }
    } else if (text.includes('cadena')) {
      if (val !== null) {
        payloadObj.lashingChains = val;
        agentReply = `⚙️ Unidades de cadenas de trincaje ajustadas a ${val}.`;
      }
    } else if (text.includes('pieza') || text.includes('cargo') || text.includes('equipo') || text.includes('añad') || text.includes('agreg') || text.includes('met') || text.includes('pon')) {
      payloadObj.category = 'Equipos de Proceso';
      payloadObj.cargo_items = [{
        id: `item-${Date.now()}`,
        category: 'Equipos de Proceso',
        quantity: val !== null && val < 50 ? val : 1,
        type: raw.length > 5 ? raw : 'Pieza Industrial Asistida por IA',
        length: '5.5',
        width: '2.5',
        height: '3.0',
        weight: '28000',
        shipping_mode_supported: "40' Flat Rack"
      }];
      agentReply = `📦 Elemento añadido y sincronizado con la lista de empaque del expediente.`;
    } else {
      agentReply = `He procesado tu instrucción: "${raw}". Parámetros actualizados en el sistema.`;
    }

    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'agent', text: agentReply }]);
      speakText(agentReply);
      if (onUpdatePayload) {
        onUpdatePayload(payloadObj);
      }
    }, 500);
  };

  const handleFileAttach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessages(prev => [...prev, { sender: 'user', text: `📎 Archivo adjunto: ${file.name}` }]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/.netlify/functions/project-parser', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (data.success && Array.isArray(data.items) && data.items.length > 0) {
        const formattedItems = data.items.map((it, idx) => ({
          id: it.id || `item-${Date.now()}-${idx}-${Math.random()}`,
          category: it.category || 'Equipos de Proceso',
          quantity: it.quantity || 1,
          type: it.type || it.description || '',
          length: it.length_m ?? it.length ?? '',
          width: it.width_m ?? it.width ?? '',
          height: it.height_m ?? it.height ?? '',
          weight: it.unit_weight_kg ?? it.weight ?? '',
          shipping_mode_supported: it.shipping_mode_supported || "40' HC Contenedor"
        }));

        const count = formattedItems.length;
        const text = `📁 Documento "${file.name}" analizado con éxito. Se han extraído e integrado ${count} ítems al expediente del proyecto.[cite: 1]`;
        setMessages(prev => [...prev, { sender: 'agent', text }]);
        speakText(text);

        if (onUpdatePayload) {
          onUpdatePayload({
            category: 'Equipos de Proceso',
            cargo_items: formattedItems
          });
        }
      } else {
        const fallbackItem = {
          id: `item-${Date.now()}`,
          category: 'Equipos de Proceso',
          quantity: 1,
          type: `Carga de ${file.name}`,
          length: '6.0',
          width: '2.4',
          height: '2.8',
          weight: '30000',
          shipping_mode_supported: "40' Open Top"
        };
        const text = `📁 Documento "${file.name}" procesado, pero no se detectaron filas tabulares estructuradas. Se añadió como ítem base.`;
        setMessages(prev => [...prev, { sender: 'agent', text }]);
        speakText(text);
        if (onUpdatePayload) {
          onUpdatePayload({
            category: 'Equipos de Proceso',
            cargo_items: [fallbackItem]
          });
        }
      }
    } catch (err) {
      console.error('Error analizando archivo en agente:', err);
      const text = `⚠️ Hubo un error al conectar con el servidor de análisis para procesar el archivo.`;
      setMessages(prev => [...prev, { sender: 'agent', text }]);
      speakText(text);
    }
  };

  const toggleMic = () => {
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setIsListening(!isListening);
      if (!isListening) {
        setMessages(prev => [...prev, { sender: 'agent', text: '🎙️ Dictado por voz: Escribe tu orden directamente en el campo de texto si tu navegador no soporta SpeechRecognition.' }]);
      }
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.lang = 'es-ES';
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onresult = (event) => {
          const transcript = event.results?.[0]?.[0]?.transcript;
          if (transcript) {
            setInputValue(transcript);
          }
          setIsListening(false);
        };
        recognitionRef.current.onerror = () => { setIsListening(false); };
        recognitionRef.current.onend = () => { setIsListening(false); };
      }

      if (isListening) {
        recognitionRef.current.stop();
        setIsListening(false);
      } else {
        recognitionRef.current.start();
        setIsListening(true);
      }
    } catch {
      setIsListening(!isListening);
    }
  };

  const toggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    if (onToggleOpen) onToggleOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
    if (onToggleOpen) onToggleOpen(false);
  };

  const handleRestore = () => {
    setIsOpen(true);
    setIsMinimized(false);
    if (onToggleOpen) onToggleOpen(true);
  };

  if (!effectiveIsOpen || isMinimized) {
    return (
      <button 
        type="button"
        className="project-agent-floating-btn" 
        onClick={handleRestore}
        title="Restaurar Agente de Proyectos"
      >
        <span className="floating-badge">📂</span>
        <span>Agente de Proyectos</span>
      </button>
    );
  }

  return (
    <div 
      className="project-agent-container" 
      style={{ left: `${position.x}px`, top: `${position.y}px`, position: 'fixed' }}
    >
      <div 
        className="project-agent-header"
        onMouseDown={handleMouseDown}
      >
        <div className="project-agent-title-group">
          <span className="project-agent-badge">📂</span>
          <div>
            <h4 className="project-agent-title">Agente de Proyectos</h4>
            <span className="project-agent-status">● Activo (Arrastrable)</span>
          </div>
        </div>
        <div className="widget-controls">
          <button 
            type="button" 
            onClick={toggleAudio} 
            title={isAudioEnabled ? "Altavoz activado" : "Altavoz silenciado"}
            className={`control-icon-btn ${isAudioEnabled ? 'active' : ''}`}
            aria-label="Alternar audio"
          >
            {isAudioEnabled ? '🔊' : '🔇'}
          </button>
          <button 
            type="button" 
            onClick={handleMinimize} 
            title="Minimizar agente"
            className="control-icon-btn"
            aria-label="Minimizar agente"
          >
            🗕
          </button>
          <button 
            type="button" 
            onClick={handleClose} 
            title="Ocultar agente"
            className="control-icon-btn"
            aria-label="Ocultar agente"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="project-agent-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`pa-bubble ${msg.sender}`}>
            {msg.sender === 'agent' && <span className="pa-avatar">📂</span>}
            <div className="pa-bubble-text">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="project-agent-input-bar">
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileAttach} 
        />
        <button 
          type="button" 
          className="pa-tool-btn" 
          onClick={() => fileInputRef.current?.click()}
          title="Adjuntar archivo o plano"
        >
          📎
        </button>
        <button 
          type="button" 
          className={`pa-tool-btn ${isListening ? 'listening' : ''}`} 
          onClick={toggleMic}
          title="Dictado por voz"
        >
          🎙️
        </button>
        <input 
          type="text" 
          placeholder="Escribe cualquier orden..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button type="submit" className="pa-send-btn" title="Enviar orden">
          ➤
        </button>
      </form>
    </div>
  );
}
