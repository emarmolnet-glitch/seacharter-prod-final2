// src/components/AgenteProyectosWidget.jsx
import React, { useState, useRef, useEffect } from 'react';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({ onUpdatePayload }) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState([
    { sender: 'agent', text: '¡Hola! Soy tu Agente de Proyectos especializado en este workspace. ¿Qué deseas gestionar o ajustar?' }
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

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = inputValue;
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInputValue('');

    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { sender: 'agent', text: `Procesando orden para proyectos: "${userMsg}". Aplicando cambios en el workspace...` }
      ]);
      if (onUpdatePayload) {
        onUpdatePayload({ instruction: userMsg });
      }
    }, 1000);
  };

  const handleFileAttach = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMessages(prev => [...prev, { sender: 'user', text: `📎 Archivo adjunto: ${file.name}` }]);
      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'agent', text: `Documento ${file.name} integrado con éxito al dossier del proyecto.` }]);
      }, 1000);
    }
  };

  const toggleMic = () => {
    setIsListening(!isListening);
    if (!isListening) {
      setMessages(prev => [...prev, { sender: 'agent', text: '🎙️ Escuchando comando de voz para el proyecto...' }]);
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
            title="Minimizar"
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
          placeholder="Escribe una instrucción para el proyecto..." 
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
