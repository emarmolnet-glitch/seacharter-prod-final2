import React, { useState, useRef, useEffect } from 'react';
import './AgenteProyectosWidget.css';

export default function AgenteProyectosWidget({
  onUpdatePayload,
  isOpen: controlledIsOpen,
  onToggleOpen,
  cargoItems = [],
  financialData = null,
  charteringAssessment = null,
  routeData = null,
}) {
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
  }, [messages, isAnalyzing]);

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

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const raw = inputValue.trim();
    if (!raw || isAnalyzing) return;

    setMessages(prev => [...prev, { sender: 'user', text: raw }]);
    setInputValue('');
    setIsAnalyzing(true);

    try {
      const response = await fetch('/.netlify/functions/project-parser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: raw,
          fileBase64: null,
          items: (Array.isArray(cargoItems) && cargoItems.length > 0) ? cargoItems : undefined,
          pol: routeData?.pol,
          pod: routeData?.pod,
          loadingRate: routeData?.loadingRate,
          dischargingRate: routeData?.dischargingRate,
          distanceNm: routeData?.distanceNm,
          actualLoadingDays: routeData?.actualLoadingDays,
          actualDischargingDays: routeData?.actualDischargingDays,
          demurrageDailyRateUsd: routeData?.demurrageDailyRateUsd,
        }),
      });

      const data = await response.json();
      const formattedItems = (data.success && Array.isArray(data.items)) ? data.items : [];

      if (formattedItems.length > 0) {
        const totalKg = formattedItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (parseFloat(it.weight) || 0)), 0);
        const totalTons = totalKg / 1000;
        const charterModeLabel = totalTons < 40 ? 'Grupaje LCL (TCE buque desactivado)' : 'Fletamento Completo (TCE buque activo)';
        const fleteSub = data.financialBreakdown?.subtotals?.oceanFreight ?? (totalTons * 65);
        const fobSub = data.financialBreakdown?.subtotals?.fobAndPortOperations ?? 0;
        const totalAllIn = data.financialBreakdown?.totalQuotationAllIn ?? ((fleteSub + fobSub) * 1.15);

        const agentReply = `✅ Orden procesada: ${formattedItems.length} partida(s) analizada(s) (${totalTons.toFixed(2)} t acumuladas).\nModalidad: ${charterModeLabel}.\n\n📊 Desglose Financiero Separado:\n• 🌊 Subtotal Flete Marítimo / TCE: ${Number(fleteSub).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n• 🏗️ Subtotal Costes FOB / Operativa: ${Number(fobSub).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n• 💰 Total Cotización (All-In): ${Number(totalAllIn).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n\nLista de empaque y operativa actualizadas automáticamente.`;

        setMessages(prev => [...prev, { sender: 'agent', text: agentReply }]);
        speakText(agentReply);

        if (onUpdatePayload) {
          onUpdatePayload({
            items: formattedItems,
            cargo_items: formattedItems,
            category: formattedItems[0]?.category || 'Maquinaria',
            orderTotals: data.orderTotals,
            charteringAssessment: data.charteringAssessment,
            rotationBreakdown: data.charteringAssessment?.rotationBreakdown,
            operationalProfile: data.operationalProfile,
            financialBreakdown: data.financialBreakdown,
            stowagePlan: data.stowagePlan,
            forceOpenModal: true,
          });
        }
      } else {
        const text = raw.toLowerCase();
        let payloadObj = { instruction: raw };

        const extractNumber = (str) => {
          const match = str.match(/(\d+([.,]\d+)?)/);
          return match ? parseFloat(match[0].replace(',', '.')) : null;
        };

        const val = extractNumber(text);
        const isBreakdownReq = /(desglose|desglos|flete\s*vs|flete\s*y\s*fob|fob\s*y\s*flete|separar\s*flete|subtotal|all-in|costes?\s*separados?|desglose\s*financiero)/i.test(text);

        if (text.includes('dónde') || text.includes('donde') || text.includes('integrado')) {
          payloadObj.infoReply = "Los archivos adjuntos y datos procesados se integran directamente en la tabla de la Lista de Empaque (Project Cargo Builder) y actualizan los cálculos de flete y estiba de forma automática.";
        } else if (isBreakdownReq) {
          payloadObj.requestFinancialBreakdown = true;
          payloadObj.showFinancialBreakdown = true;
          payloadObj.forceOpenModal = true;
          if (data.financialBreakdown) {
            payloadObj.financialBreakdown = data.financialBreakdown;
          }
          const fleteVal = data.financialBreakdown?.subtotals?.oceanFreight ?? (financialData?.subtotalFreight || '0.00');
          const fobVal = data.financialBreakdown?.subtotals?.fobAndPortOperations ?? (financialData?.subtotalFobOperations || '0.00');
          const allInVal = data.financialBreakdown?.totalQuotationAllIn ?? (financialData?.salePrice || '0.00');
          payloadObj.breakdownReply = `📊 Desglose Financiero Separado (SeaCharter Core PRO):\n• 🌊 Subtotal Flete Marítimo / TCE: ${Number(fleteVal).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n• 🏗️ Subtotal Costes FOB y Operativa Portuaria: ${Number(fobVal).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n• 💰 Importe Total Cotización (All-In): ${Number(allInVal).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €\n\nEstado financiero de la interfaz actualizado: los subtotales son visibles de forma transparente.`;
        } else if (text.includes('almacen') || text.includes('dias') || text.includes('días')) {
          if (val !== null) payloadObj.storageDays = val;
        } else if (text.includes('surveyor') || text.includes('perito') || text.includes('inspeccion')) {
          if (val !== null) payloadObj.surveyorCost = val;
        } else if (text.includes('inland') || text.includes('transporte') || text.includes('camion')) {
          if (val !== null) payloadObj.inlandTrucksCount = val;
        } else if (text.includes('mercancía') || text.includes('mercancia') || text.includes('aduana')) {
          if (val !== null) payloadObj.customsCost = val;
        } else if (text.includes('madera') || text.includes('dunnage')) {
          if (val !== null) payloadObj.dunnageUnits = val;
        } else if (text.includes('eslinga')) {
          if (val !== null) payloadObj.slingsUnits = val;
        } else if (text.includes('cadena')) {
          if (val !== null) payloadObj.lashingChains = val;
        }

        const polMatch = text.match(/(?:pol|puerto\s*de\s*(?:origen|carga)|cargar\s*en|desde)\s*[:=]?\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+?)(?:,|\.|\s+pod|\s+hasta|\s+a\s+|\s+ritmo|\s+demora|$)/i);
        if (polMatch && polMatch[1]) {
          let p = polMatch[1].replace(/\s+(?:con|y|hacia|a|para|en)\b.*$/i, '').trim();
          if (p.length > 2 && !['dias', 'euros', 'turnos', 'toneladas', 'días'].includes(p.toLowerCase())) {
            payloadObj.pol = p.charAt(0).toUpperCase() + p.slice(1);
          }
        }
        const podMatch = text.match(/(?:pod|puerto\s*de\s*(?:destino|descarga)|descargar\s*en|hasta|destino)\s*[:=]?\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+?)(?:,|\.|\s+pol|\s+ritmo|\s+demora|$)/i);
        if (podMatch && podMatch[1]) {
          let p = podMatch[1].replace(/\s+(?:con|y|hacia|a|para|en)\b.*$/i, '').trim();
          if (p.length > 2 && !['dias', 'euros', 'turnos', 'toneladas', 'días'].includes(p.toLowerCase())) {
            payloadObj.pod = p.charAt(0).toUpperCase() + p.slice(1);
          }
        }
        const loadMatch = text.match(/(?:ritmo\s*(?:de)?\s*carga|loading\s*rate)\s*[:=]?\s*(\d+[\d.,]*)/i);
        if (loadMatch && loadMatch[1]) {
          const v = parseFloat(loadMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(v) && v > 0) {
            payloadObj.loadingRate = v;
            payloadObj.loadingRateMtDay = v;
          }
        }
        const dischMatch = text.match(/(?:ritmo\s*(?:de)?\s*descarga|discharging\s*rate)\s*[:=]?\s*(\d+[\d.,]*)/i);
        if (dischMatch && dischMatch[1]) {
          const v = parseFloat(dischMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(v) && v > 0) {
            payloadObj.dischargingRate = v;
            payloadObj.dischargingRateMtDay = v;
          }
        }
        const distMatch = text.match(/(?:distancia(?:\s*n[aá]utica)?)\s*[:=]?\s*(\d+[\d.,]*)/i);
        if (distMatch && distMatch[1]) {
          const v = parseFloat(distMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(v) && v > 0) payloadObj.distanceNm = v;
        }
        const actualLoadMatch = text.match(/(?:d[ií]as\s*reales\s*(?:de)?\s*carga|actual\s*loading\s*days)\s*[:=]?\s*(\d+[\d.,]*)/i);
        if (actualLoadMatch && actualLoadMatch[1]) {
          const v = parseFloat(actualLoadMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(v)) payloadObj.actualLoadingDays = v;
        }
        const actualDischMatch = text.match(/(?:d[ií]as\s*reales\s*(?:de)?\s*descarga|actual\s*discharging\s*days)\s*[:=]?\s*(\d+[\d.,]*)/i);
        if (actualDischMatch && actualDischMatch[1]) {
          const v = parseFloat(actualDischMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(v)) payloadObj.actualDischargingDays = v;
        }
        const demMatch = text.match(/(?:demoras?|demurrage|retraso(?:\s*en\s*muelle)?)\s*[:=]?\s*(\d+[\d.,]*)/i);
        if (demMatch && demMatch[1]) {
          const v = parseFloat(demMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(v) && v >= 0) payloadObj.demurrageDays = v;
        }

        // Conectar el charteringAssessment / rotationBreakdown del backend o sintetizarlo
        if (data.charteringAssessment) {
          payloadObj.charteringAssessment = data.charteringAssessment;
          payloadObj.rotationBreakdown = data.charteringAssessment.rotationBreakdown || data.charteringAssessment.timeCharterEquivalent;
          if (payloadObj.rotationBreakdown) {
            if (payloadObj.rotationBreakdown.pol) payloadObj.pol = payloadObj.rotationBreakdown.pol;
            if (payloadObj.rotationBreakdown.pod) payloadObj.pod = payloadObj.rotationBreakdown.pod;
            if (payloadObj.rotationBreakdown.loadingRateMtDay) payloadObj.loadingRate = payloadObj.rotationBreakdown.loadingRateMtDay;
            if (payloadObj.rotationBreakdown.dischargingRateMtDay) payloadObj.dischargingRate = payloadObj.rotationBreakdown.dischargingRateMtDay;
            if (payloadObj.rotationBreakdown.distanceNm) payloadObj.distanceNm = payloadObj.rotationBreakdown.distanceNm;
          }
        } else if (payloadObj.pol || payloadObj.pod || payloadObj.loadingRate || payloadObj.dischargingRate || payloadObj.demurrageDays) {
          const rot = {
            pol: payloadObj.pol || routeData?.pol || 'Valencia',
            pod: payloadObj.pod || routeData?.pod || 'Houston',
            loadingRateMtDay: payloadObj.loadingRate || routeData?.loadingRate || 1200,
            dischargingRateMtDay: payloadObj.dischargingRate || routeData?.dischargingRate || 1000,
            distanceNm: payloadObj.distanceNm || routeData?.distanceNm || 4850,
            actualLoadingDays: payloadObj.actualLoadingDays,
            actualDischargingDays: payloadObj.actualDischargingDays,
            demurrage: payloadObj.demurrageDays !== undefined ? { demurrageDays: payloadObj.demurrageDays } : undefined
          };
          payloadObj.rotationBreakdown = rot;
          payloadObj.charteringAssessment = { rotationBreakdown: rot };
        }

        const hasRouteParams = payloadObj.pol || payloadObj.pod || payloadObj.loadingRate || payloadObj.dischargingRate || payloadObj.demurrageDays || payloadObj.distanceNm;
        if (hasRouteParams) {
          payloadObj.forceOpenModal = true;
        }
        const agentReply = data.error
          ? `⚠️ ${data.error}`
          : payloadObj.breakdownReply
            ? payloadObj.breakdownReply
            : payloadObj.infoReply
              ? payloadObj.infoReply
              : hasRouteParams
                ? `🗺️ Ruta marítima y ritmos operativos actualizados: POL ${payloadObj.pol || 'mantenido'} → POD ${payloadObj.pod || 'mantenido'}${payloadObj.loadingRate ? `, Carga: ${payloadObj.loadingRate} MT/d` : ''}${payloadObj.dischargingRate ? `, Descarga: ${payloadObj.dischargingRate} MT/d` : ''}. Contadores sincronizados.`
                : (payloadObj.storageDays || payloadObj.surveyorCost || payloadObj.inlandTrucksCount || payloadObj.customsCost || payloadObj.dunnageUnits || payloadObj.slingsUnits || payloadObj.lashingChains)
                  ? `⚙️ Parámetros actualizados en el proyecto.`
                  : `He procesado tu instrucción: "${raw}". Workspace sincronizado con el motor de análisis.`;

        setMessages(prev => [...prev, { sender: 'agent', text: agentReply }]);
        speakText(agentReply);

        if (onUpdatePayload) {
          onUpdatePayload(payloadObj);
        }
      }
    } catch (err) {
      console.error('Error al enviar orden a project-parser:', err);
      const errorMsg = '⚠️ Error de comunicación con el motor de análisis project-parser.';
      setMessages(prev => [...prev, { sender: 'agent', text: errorMsg }]);
      speakText(errorMsg);
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

      const response = await fetch('/.netlify/functions/project-parser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: file.name,
          fileBase64: cleanBase64,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
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
        speakText(text);

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
        speakText(text);

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
      speakText(text);
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
