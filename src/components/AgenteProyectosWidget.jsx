import React, { useState } from 'react';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({ onUpdatePayload }) {
    const [isOpen, setIsOpen] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        { 
            sender: 'agent', 
            text: '¡Hola! Veo que estás trabajando en Proyectos. ¿Analizamos la lista de empaque, el trincaje o la operativa portuaria?' 
        }
    ]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputMessage.trim() && !isLoading) return;

        const userText = inputMessage;
        setInputMessage('');
        setMessages(prev => [...prev, { sender: 'user', text: userText }]);
        setIsLoading(true);

        try {
            const response = await fetch('/api/agente-proyectos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modulo: 'proyectos',
                    isProjectMode: true,
                    message: userText
                })
            });

            const data = await response.json();

            if (data.reply) {
                setMessages(prev => [...prev, { sender: 'agent', text: data.reply }]);
            }

            if (data.action === 'update_fields' && data.payload && onUpdatePayload) {
                onUpdatePayload(data.payload);
            }
        } catch (error) {
            setMessages(prev => [...prev, { sender: 'agent', text: 'Error de comunicación con el Agente de Proyectos.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={`agente-proyectos-widget ${isMinimized ? 'minimized' : ''}`}>
            <div className="widget-header">
                <div className="widget-title-area">
                    <span className="status-dot"></span>
                    <span className="agent-name">🧠 Agente de Proyectos</span>
                </div>
                <div className="widget-controls">
                    <button title="Minimizar" className="control-btn" onClick={() => setIsMinimized(!isMinimized)}>
                        <i className={`fas ${isMinimized ? 'fa-window-maximize' : 'fa-minus'}`}></i>
                    </button>
                    <button title="Cerrar" className="control-btn" onClick={() => setIsOpen(false)}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    <div className="widget-messages">
                        {messages.map((msg, index) => (
                            <div key={index} className={`message-bubble ${msg.sender}`}>
                                <p>{msg.text}</p>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="message-bubble agent loading">
                                <p>⏳ Procesando cálculo operativo...</p>
                            </div>
                        )}
                    </div>

                    <form className="widget-input-area" onSubmit={handleSendMessage}>
                        <button type="button" title="Adjuntar archivo" className="input-action-btn">
                            <i className="fas fa-paperclip"></i>
                        </button>
                        <input 
                            type="text" 
                            placeholder="Describe la carga o los cambios..." 
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                        />
                        <button type="button" title="Dictado" className="input-action-btn">
                            <i className="fas fa-microphone"></i>
                        </button>
                        <button type="submit" title="Enviar" className="send-btn">
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}
