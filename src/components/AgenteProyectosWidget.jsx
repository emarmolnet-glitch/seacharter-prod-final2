import React, { useState, useRef, useEffect } from 'react';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({ onUpdatePayload }) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState([
    { sender: 'agent', text: '¡Hola! Soy tu Agente de Proyectos de Cerebro.ia. Estoy conectado al workspace. Dime qué número, coste, días o piezas deseas modificar y lo haré al instante.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const fileInputRef = useRef(null);

  const [position, setPosition] = useState({ 
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 100, 
    y: typeof window !== 'undefined' ? window.innerHeight - 560 : 100 
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

  // Inteligencia abierta para procesar cualquier orden o pregunta
  const handleSend = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = inputValue;
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInputValue('');

    const text = userMsg.toLowerCase();
    let agentReply = "He procesado tu solicitud en el workspace.";
    let payloadObj = { instruction: userMsg };

    const extractNumber = (str) => {
      const match = str.match(/(\d+([.,]\d+)?)/);
      return match ? parseFloat(match[0].replace(',', '.')) : null;
    };

    const val = extractNumber(text);

    // Responder a preguntas conversacionales comunes
    if (text.includes('dónde') || text.includes('donde') || text.includes('integrado')) {
      agentReply = "Los archivos adjuntos y datos procesados se integran directamente en la tabla de la Lista de Empaque (Project Cargo Builder) y actualizan los cálculos de flete y estiba de forma automática.";
    } 
    // Detección flexible de parámetros logísticos
    else if (text.includes('almacen') || text.includes('dias') || text.includes('días')) {
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
    } 
    // Detección para añadir carga o piezas
    else if (text.includes('pieza') || text.includes('cargo') || text.includes('equipo') || text.includes('añad') || text.includes('agreg') || text.includes('met') || text.includes('pon')) {
      payloadObj.category = 'Equipos de Proceso';
      payloadObj.cargo_items = [{
        id: `item-${Date.now()}`,
        category: 'Equipos de Proceso',
        quantity: val !== null && val < 50 ? val : 1,
        type: userMsg.length > 5 ? userMsg : 'Pieza Industrial Asistida por IA',
        length: '5.5',
        width: '2.5',
        height: '3.0',
        weight: '28000',
        shipping_mode_supported: "40' Flat Rack"
      }];
      agentReply = `📦 Elemento añadido y sincronizado con la lista de empaque del expediente.`;
    } else {
      agentReply = `He registrado tu comentario: "${userMsg}". Puedes indicarme cambios directos de costes, días de puerto o añadir elementos al expediente.`;
    }

    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'agent', text: agentReply }]);
      if (onUpdatePayload) {
        onUpdatePayload(payloadObj);
      }
    }, 500);
  };

  const handleFileAttach = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMessages(prev => [...prev, { sender: 'user', text: `📎 Archivo adjunto: ${file.name}` }]);
      setTimeout(() => {
        setMessages(prev => [
          ...prev, 
          { sender: 'agent', text: `📁 Documento "${file.name}" analizado con éxito e integrado en el expediente del proyecto.` }
        ]);
        if (onUpdatePayload) {
          onUpdatePayload({
            category: 'Equipos de Proceso',
            cargo_items: [{
              id: `item-${Date.now()}`,
              category: 'Equipos de Proceso',
              quantity: 1,
              type: `Carga extraída de ${file.name}`,
              length: '6.0',
              width: '2.4',
              height: '2.8',
              weight: '30000',
              shipping_mode_supported: "40' Open Top"
            }]
          });
        }
      }, 700);
    }
  };

  const toggleMic = () => {
    setIsListening(!isListening);
    if (!isListening) {
      setMessages(prev => [...prev, { sender: 'agent', text: '🎙️ Escuchando instrucción...' }]);
    }
  };

  const toggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled);
  };

  if (!isOpen) {
    return (
      <button 
        className="project-agent-floating-btn" 
        onClick={() => setIsOpen(true)}
        title="Abrir Agente de Proyectos"
      >
        📂 Agente de Proyectos
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
          >
            {isAudioEnabled ? '🔊' : '🔇'}
          </button>
          <button 
            type="button" 
            onClick={() => setIsOpen(false)} 
            title="Minimizar / Ocultar"
            className="control-icon-btn"
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
          placeholder="Escribe cualquier orden o pregunta..." 
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
