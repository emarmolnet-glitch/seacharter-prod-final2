import React, { useState, useRef, useEffect } from 'react';
import { getApiUrl } from '../utils/apiConfig.js';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({
  onUpdatePayload,
  isOpen: controlledIsOpen,
  onToggleOpen,
  cargoItems = [],
  items = null,
  financialData = null,
  financialBreakdown = null,
  charteringAssessment = null,
  routeData = null,
  stowagePlan = null,
}) {
  const currentProjectItems = (Array.isArray(items) && items.length > 0)
    ? items
    : (Array.isArray(cargoItems) ? cargoItems : []);
  const currentFinancialBreakdown = financialBreakdown || financialData || null;
  const currentStowagePlan = stowagePlan || charteringAssessment?.stowagePlan || null;

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isAudioEnabled = !isMuted;
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
  }, [messages, isAnalyzing]);

  const speakMessage = (text) => {
    if (isMuted) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
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

  const speakText = speakMessage;

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const raw = inputValue.trim();
    if (!raw || isAnalyzing) return;

    setMessages(prev => [...prev, { sender: 'user', text: raw }]);
    setInputValue('');
    setIsAnalyzing(true);

    try {
      const projectContext = JSON.stringify({
        items: currentProjectItems, // Reemplazar con la variable real de tu estado
        financials: currentFinancialBreakdown, // Reemplazar con la variable real
        stowage: currentStowagePlan // Reemplazar con la variable real
      });

      const systemInstruction = `Eres el Agente de Proyectos de SeaCharter Core PRO, impulsado por Gemini. Eres un consultor estratégico marítimo y un socio conversacional altamente inteligente.

REGLA CERO - SALUDOS Y MENSAJES CASUALES:
Si el usuario te saluda ("hola", "buenos días", "qué tal") o hace una pregunta informal, responde ÚNICAMENTE con un saludo natural, humano y cercano, abriendo la puerta a la conversación. ¡PROHIBIDO! No escupas desgloses financieros, costes ni datos del JSON a menos que el usuario te pida explícitamente números, cálculos o análisis específicos.

REGLAS DE COMPORTAMIENTO Y PERSONALIDAD:
1. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL: Habla de tú a tú con el usuario. Tienes permiso absoluto para debatir, opinar, aconsejar sobre negociaciones con clientes, analizar tendencias macroeconómicas (ej. impacto del precio del combustible en fletes) o buscar cualquier dato en la web en tiempo real.
2. OPINIÓN CRÍTICA Y ASESORAMIENTO: Si el usuario te pregunta "¿qué opinas de este croquis?" o "¿debería informar al cliente de esta subida?", no te limites a repetir datos. Analiza la situación, cruza la información con la web si es necesario, y da tu recomendación profesional como un bróker senior.
3. TONO NATURAL: Responde de forma directa, analítica y fluida. Usa formato markdown para estructurar ideas complejas, manteniendo un tono de diálogo abierto y proactivo.

CONTEXTO EN VIVO DEL PROYECTO (USO INTERNO):
Tienes acceso en tiempo real a los datos que el usuario está operando, pero consúltalos solo cuando te hagan una pregunta técnica o financiera:
- Para consultas financieras, márgenes o viabilidad, evalúa la sección 'financials'.
- Para opinar sobre la viabilidad física, estiba o riesgos, analiza la sección 'stowage.executiveJustification'.
- NUNCA expongas el JSON crudo en tu respuesta.

Contexto actual del proyecto: ${projectContext}`;

      const response = await fetch(getApiUrl('/api/project-chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modulo: 'proyectos',
          isProjectMode: true,
          message: raw,
          text: raw,
          systemInstruction,
          projectContext,
          history: messages,
        }),
      });

      const data = await response.json();
      let rawReply = data.reply || data.respuesta || data.text || (data.error ? `⚠️ ${data.error}` : 'No se pudo obtener respuesta del consultor.');

      // Procesar bloque json-action para actualizar la interfaz automáticamente
      let actionData = data.payload || null;
      const jsonActionRegex = /```(?:json-action|json)?\s*(\{[\s\S]*?"action"\s*:\s*"update_form"[\s\S]*?\})\s*```/i;
      const match = rawReply.match(jsonActionRegex);

      if (match && match[1]) {
        try {
          const parsedAction = JSON.parse(match[1]);
          if (parsedAction.data) {
            actionData = parsedAction.data;
          }
        } catch (err) {
          console.warn('Error al parsear bloque json-action:', err);
        }
      }

      // Limpiar el texto mostrado al usuario eliminando el bloque json-action
      const cleanReply = rawReply.replace(jsonActionRegex, '').trim();
      const userDisplayReply = cleanReply || 'He actualizado los campos del proyecto según lo indicado.';

      setMessages(prev => [...prev, { sender: 'agent', text: userDisplayReply }]);
      speakMessage(userDisplayReply);

      // Ejecutar la actualización de los campos del formulario del proyecto
      if (actionData && onUpdatePayload) {
        onUpdatePayload({
          action: 'update_form',
          pol: actionData.portOfLoading,
          pod: actionData.portOfDischarge,
          loadingRate: actionData.loadingRate,
          dischargingRate: actionData.dischargeRate,
          cargoDescription: actionData.cargoDescription,
          quantityMT: actionData.quantityMT,
          forceOpenModal: true,
          ...actionData
        });
      } else if (data.functionCall && onUpdatePayload) {
        const args = data.functionCall.args || {};
        onUpdatePayload({
          pol: args.portOfLoading,
          pod: args.portOfDischarge,
          loadingRate: args.loadingRate,
          dischargingRate: args.dischargeRate,
          cargoDescription: args.cargoDescription,
          quantityMT: args.quantityMT,
          forceOpenModal: true,
          ...args
        });
      }
    } catch (err) {
      console.error('Error al enviar mensaje a asistente conversacional:', err);
      const errorMsg = '⚠️ Error de comunicación con el consultor conversacional de proyectos.';
      setMessages(prev => [...prev, { sender: 'agent', text: errorMsg }]);
      speakMessage(errorMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileAttach = async (e) => {
    const file = e.target.files?.[0];
    if (!file || isAnalyzing) return;

    setMessages(prev => [...prev, { sender: 'user', text: `📎 Archivo adjunto: ${file.name}` }]);
    setIsAnalyzing(true);

    try {
      // Conversión local a Base64 limpia (sin prefijo data:...;base64,) para enviar JSON plano
      const reader = new FileReader();
      const rawDataBase64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });

      const cleanBase64 = (typeof rawDataBase64 === 'string' && rawDataBase64.includes(','))
        ? rawDataBase64.split(',')[1].trim()
        : (typeof rawDataBase64 === 'string' ? rawDataBase64.trim() : '');

      const projectContext = JSON.stringify({
        items: currentProjectItems,
        financials: currentFinancialBreakdown,
        stowage: currentStowagePlan
      });

      const systemInstruction = `Eres el Agente de Proyectos de SeaCharter Core PRO, impulsado por Gemini. Eres un consultor estratégico marítimo y un socio conversacional altamente inteligente.

REGLA CERO - SALUDOS Y MENSAJES CASUALES:
Si el usuario te saluda ("hola", "buenos días", "qué tal") o hace una pregunta informal, responde ÚNICAMENTE con un saludo natural, humano y cercano, abriendo la puerta a la conversación. ¡PROHIBIDO! No escupas desgloses financieros, costes ni datos del JSON a menos que el usuario te pida explícitamente números, cálculos o análisis específicos.

REGLAS DE COMPORTAMIENTO Y PERSONALIDAD:
1. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL: Habla de tú a tú con el usuario. Tienes permiso absoluto para debatir, opinar, aconsejar sobre negociaciones con clientes, analizar tendencias macroeconómicas (ej. impacto del precio del combustible en fletes) o buscar cualquier dato en la web en tiempo real.
2. OPINIÓN CRÍTICA Y ASESORAMIENTO: Si el usuario te pregunta "¿qué opinas de este croquis?" o "¿debería informar al cliente de esta subida?", no te limites a repetir datos. Analiza la situación, cruza la información con la web si es necesario, y da tu recomendación profesional como un bróker senior.
3. TONO NATURAL: Responde de forma directa, analítica y fluida. Usa formato markdown para estructurar ideas complejas, manteniendo un tono de diálogo abierto y proactivo.

CONTEXTO EN VIVO DEL PROYECTO (USO INTERNO):
Tienes acceso en tiempo real a los datos que el usuario está operando, pero consúltalos solo cuando te hagan una pregunta técnica o financiera:
- Para consultas financieras, márgenes o viabilidad, evalúa la sección 'financials'.
- Para opinar sobre la viabilidad física, estiba o riesgos, analiza la sección 'stowage.executiveJustification'.
- NUNCA expongas el JSON crudo en tu respuesta.

Contexto actual del proyecto: ${projectContext}`;

      const response = await fetch(getApiUrl('/.netlify/functions/project-parser'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: file.name,
          fileBase64: cleanBase64,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          systemInstruction,
          systemPrompt: systemInstruction,
          projectContext,
          history: messages,
        })
      });
      const data = await response.json();

      const formattedItems = (data.success && Array.isArray(data.items)) ? data.items : [];

      const documentMeta = {
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        itemsCount: formattedItems.length,
        uploadedAt: new Date().toISOString(),
        dataBase64: rawDataBase64 // DataURL para visualización previa
      };

      if (formattedItems.length > 0) {
        const totalKg = formattedItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (parseFloat(it.weight) || 0)), 0);
        const totalTons = totalKg / 1000;
        const charterModeLabel = totalTons < 40 ? 'Grupaje LCL (TCE buque desactivado)' : 'Fletamento Completo (TCE buque activo)';
        const fleteSub = data.financialBreakdown?.subtotals?.oceanFreight ?? (totalTons * 65);
        const fobSub = data.financialBreakdown?.subtotals?.fobAndPortOperations ?? 0;
        const totalAllIn = data.financialBreakdown?.totalQuotationAllIn ?? ((fleteSub + fobSub) * 1.15);

        const text = `📁 Documento "${file.name}" procesado con éxito: ${formattedItems.length} partida(s) de carga detectada(s) (${totalTons.toFixed(2)} t).\nModalidad: ${charterModeLabel}.\n\n📊 Desglose Financiero Separado:\n• 🌊 Subtotal Flete Marítimo / TCE: ${Number(fleteSub).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n• 🏗️ Subtotal Costes FOB / Operativa: ${Number(fobSub).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n• 💰 Total Cotización (All-In): ${Number(totalAllIn).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n\nLista de empaque y operativa actualizadas automáticamente.`;
        setMessages(prev => [...prev, { sender: 'agent', text }]);
        speakMessage(text);

        if (onUpdatePayload) {
          onUpdatePayload({
            items: formattedItems,
            cargo_items: formattedItems,
            category: formattedItems[0]?.category || 'Maquinaria',
            orderTotals: data.orderTotals,
            charteringAssessment: data.charteringAssessment,
            operationalProfile: data.operationalProfile,
            financialBreakdown: data.financialBreakdown,
            stowagePlan: data.stowagePlan,
            documentMeta: documentMeta,
            forceOpenModal: true,
          });
        }
      } else {
        const text = data.error
          ? `⚠️ Error al procesar: ${data.error}`
          : `📁 Documento "${file.name}" analizado: no se encontraron partidas de carga.`;
        setMessages(prev => [...prev, { sender: 'agent', text }]);
        speakMessage(text);

        if (onUpdatePayload) {
          onUpdatePayload({
            items: [],
            cargo_items: [],
            documentMeta: documentMeta
          });
        }
      }
    } catch (err) {
      console.error('Error analizando archivo en agente:', err);
      const text = `⚠️ Hubo un error al procesar el archivo.`;
      setMessages(prev => [...prev, { sender: 'agent', text }]);
      speakMessage(text);
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (newMutedState === true) {
      window.speechSynthesis.cancel();
    }
  };

  const toggleAudio = toggleMute;

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
            onClick={toggleMute} 
            title={!isMuted ? "Altavoz activado" : "Altavoz silenciado"}
            className={`control-icon-btn ${!isMuted ? 'active' : ''}`}
            aria-label="Alternar audio"
          >
            {!isMuted ? '🔊' : '🔇'}
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
        {isAnalyzing && (
          <div className="pa-bubble agent pa-loading-bubble" role="status" aria-live="polite">
            <span className="pa-avatar">📂</span>
            <div className="pa-bubble-text pa-loading-text">
              <span className="pa-spinner">⏳</span> Analizando orden y calculando parámetros...
            </div>
          </div>
        )}
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
          disabled={isAnalyzing}
        >
          📎
        </button>
        <button 
          type="button" 
          className={`pa-tool-btn ${isListening ? 'listening' : ''}`} 
          onClick={toggleMic}
          title="Dictado por voz"
          disabled={isAnalyzing}
        >
          🎙️
        </button>
        <input 
          type="text" 
          placeholder={isAnalyzing ? "Analizando orden y calculando parámetros..." : "Escribe cualquier orden..."} 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isAnalyzing}
        />
        <button type="submit" className="pa-send-btn" title="Enviar orden" disabled={isAnalyzing || !inputValue.trim()}>
          {isAnalyzing ? '⏳' : '➤'}
        </button>
      </form>
    </div>
  );
}
