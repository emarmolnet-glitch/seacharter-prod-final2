import React, { useState } from 'react';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({ onUpdatePayload }) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState([
    { sender: 'agent', text: '¡Hola! Soy tu asistente de proyectos de Cerebro.ia. ¿En qué te puedo ayudar hoy con este despacho o cotización?' }
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = inputValue;
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInputValue('');

    // Simulación de respuesta inteligente de Cerebro.ia
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { sender: 'agent', text: `Entendido. Procesando solicitud para: "${userMsg}". Aplicando cambios al workspace...` }
      ]);
      // Ejemplo de llamada opcional si se requiere actualizar el payload
      if (onUpdatePayload) {
        onUpdatePayload({ note: userMsg });
      }
    }, 1000);
  };

  if (!isOpen) {
    return (
      <button className="cerebro-floating-trigger" onClick={() => setIsOpen(true)} title="Abrir Agente Cerebro.ia">
        <span className="cerebro-icon">🧠</span>
        <span className="cerebro-trigger-text">Cerebro.ia Asistente</span>
      </button>
    );
  }

  return (
    <div className="cerebro-widget-container">
      {/* Header oficial Cerebro.ia */}
      <div className="cerebro-widget-header">
        <div className="cerebro-header-title">
          <div className="cerebro-brain-icon">🧠</div>
          <div>
            <span className="cerebro-brand-name">Cerebro.ia</span>
            <span className="cerebro-agent-subtitle">Agente de Proyectos</span>
          </div>
        </div>
        <div className="cerebro-header-actions">
          <button className="cerebro-action-btn" onClick={() => setIsOpen(false)} title="Minimizar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 12H6"/></svg>
          </button>
          <button className="cerebro-action-btn" onClick={() => setIsOpen(false)} title="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Cuerpo de Mensajes */}
      <div className="cerebro-widget-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`cerebro-bubble ${msg.sender}`}>
            {msg.sender === 'agent' && <div className="bubble-avatar">🧠</div>}
            <div className="bubble-content">{msg.text}</div>
          </div>
        ))}
      </div>

      {/* Input de chat inferior */}
      <form onSubmit={handleSend} className="cerebro-widget-input-box">
        <input 
          type="text" 
          placeholder="Escribe una instrucción para Cerebro.ia..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button type="submit" className="cerebro-send-btn" title="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </form>
    </div>
  );
}
