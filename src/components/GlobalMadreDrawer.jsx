import React, { useState, useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import { copyMarkdownForOutlook, extractCounterproposalEmail } from '../utils/madreReportClipboard.mjs';
import {
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  SCAN_COMMAND_REGEX,
  hasOperationalInputData,
  PENDING_OPERATION_MESSAGE,
  ejecutarEscaneoCompleto
} from '../utils/coreProScanner.js';

export const SEACHARTER_DOM_DICTIONARY = {
  "cuartel_general": { "contenedor": "#view-ais", "inputs": ["#header-vessel-search-input", "#tracking-input-vessel", "#tracking-input-pol", "#tracking-input-pod", "#tracking-input-laydays", "#tracking-input-cancelling", "#tracking-input-cargo", "#ais-vessel-class-select", "#ais-radius-select", "#ais-ballast-filter"], "metricas": ["#ais-radar-status-badge", "#ais-kpi-total-vessels", "#ais-kpi-ballast-count", "#ais-kpi-laden-count", "#ais-kpi-fair-freight", "#ais-kpi-avg-dwt", "#ais-kpi-avg-speed", "#tracking-live-connection", "#tracking-live-last-sync", "#vessel-master-preview-card"] },
  "market_intel": { "contenedor": "#market-intel-dashboard", "inputs": ["#market-intel-capesize-tc", "#market-intel-panamax-tc", "#market-intel-supramax-tc", "#market-intel-handysize-tc", "#market-intel-bdi-index", "#market-intel-spot-v2-tc", "#market-intel-vlsfo-price", "#market-intel-lsmgo-price", "#market-intel-ifo380-price", "#market-calibration-factor", "#inverse-tce-target", "#market-intelligence-client-offer"], "metricas": ["#baltic-spot-value", "#baltic-spot-variation", "#tce-spot-theoretical-value", "#res-market-benchmark-rate", "#res-market-benchmark-alert"] },
  "mapa": { "contenedor": "#view-map", "inputs": ["#map-port-ballast", "#map-port-pol", "#map-port-pod", "#map-laycan-date", "#map-cancelling-date"], "metricas": ["#sync-miles-label", "#sync-miles-breakdown", "#sync-pol-label", "#sync-pod-label"] },
  "calculadora": { "contenedor": "#view-estimator", "inputs": ["#port-ballast", "#port-pol", "#port-pod", "#dist-ballast", "#dist-laden", "#dist-total", "#spd-ballast", "#spd-laden", "#nombre-buque-calculadora", "#vessel-dwt", "#cargo-type", "#cargo-qty", "#cargo-sf", "#rate-load", "#rate-disch", "#price-sea", "#price-port", "#pda-pol", "#pda-pod", "#opex-daily", "#margin-charterer", "#margin-owner", "#freight-rate", "#freight-sell", "#demurrage-rate"], "metricas": ["#res-days-sea-total", "#res-days-port", "#res-days-total", "#res-cost-bunker", "#res-cost-pda", "#res-cost-opex", "#res-cost-total", "#res-breakeven", "#res-sug-charterer", "#res-net-profit-charterer", "#res-tce-label", "#negotiation-spread-pmt"] },
  "dossiers": { "contenedor": "#view-dossiers", "inputs": ["#dossiers-search", "#quick-ref"], "metricas": ["#dossiers-count", "#dossiers-table-body"] },
  "decisiones": { "contenedor": "#view-decisiones", "inputs": ["#input-jwlaPremiumUSD", "#input-ballastDays", "#input-freight-all-in", "#input-sim-speed", "#input-sim-loadrate", "#input-sim-bunker-price"], "metricas": ["#badge-jwc-risk", "#section-flete-all-in-gross", "#card-laycan", "#card-loadrate", "#card-financial", "#madre-offcanvas-veredicto-val"] },
  "agenda": { "contenedor": "#market-directory-shell", "inputs": ["#market-directory-search", "#market-contact-company", "#market-contact-name", "#market-contact-role", "#market-contact-country", "#market-contact-imo-input"], "metricas": ["#market-directory-summary", "#market-directory-list"] },
  "auditoria": { "contenedor": "#view-auditor", "inputs": ["#fileUpload", "#recapInput", "#carrier-offer-name"], "metricas": ["#doc-badge", "#audit-report-ref-id", "#resProforma", "#resRiesgos", "#resEstrategia"] }
};

/**
 * Detecta el identificador del módulo activo en el DOM de SeaCharter Core PRO
 */
export function detectarModuloActual() {
  if (typeof document === 'undefined') return 'calculadora';

  // 1. Auditoría IA activa (#view-auditor, #view-auditoria, #auditoria)
  try {
    const viewAuditor = document.querySelector('#view-auditor, #view-auditoria, #auditoria');
    if (viewAuditor && (!viewAuditor.classList.contains('hidden') || viewAuditor.classList.contains('active-block') || viewAuditor.classList.contains('active-flex') || viewAuditor.style.display === 'block' || viewAuditor.style.display === 'flex')) {
      return 'auditoria';
    }
  } catch (_) {}

  // 2. Mapa activo (¡Subido al principio para evitar falsos positivos con decisiones!)
  try {
    const viewMap = document.querySelector('#view-map');
    if (viewMap && (!viewMap.classList.contains('hidden') || viewMap.classList.contains('active-block') || viewMap.classList.contains('active-flex'))) {
      return 'mapa';
    }
  } catch (_) {}

  // 3. Estimador / Calculadora activo
  try {
    const viewEstimator = document.querySelector('#view-estimator');
    if (viewEstimator && (!viewEstimator.classList.contains('hidden') || viewEstimator.classList.contains('active-block') || viewEstimator.classList.contains('active-flex'))) {
      return 'calculadora';
    }
  } catch (_) {}

  // 4. Agenda de Brokers abierta (modal/drawer)
  try {
    const agendaShell = document.querySelector('#market-directory-shell');
    if (agendaShell && !agendaShell.hasAttribute('hidden') && agendaShell.getAttribute('aria-hidden') !== 'true' && agendaShell.style.display !== 'none') {
      return 'agenda';
    }
  } catch (_) {}

  // 5. Decisiones DSS activo
  try {
    const viewDecisiones = document.querySelector('#view-decisiones');
    if (viewDecisiones && (!viewDecisiones.classList.contains('hidden') || viewDecisiones.classList.contains('active-block') || viewDecisiones.classList.contains('active-flex'))) {
      return 'decisiones';
    }
  } catch (_) {}

  // 6. Dossiers activo
  try {
    const viewDossiers = document.querySelector('#view-dossiers');
    if (viewDossiers && !viewDossiers.classList.contains('hidden')) {
      return 'dossiers';
    }
  } catch (_) {}

  // 7. Cuartel General / Radar AIS activo
  try {
    const viewAis = document.querySelector('#view-ais');
    if (viewAis && (!viewAis.classList.contains('hidden') || viewAis.classList.contains('active-block') || viewAis.classList.contains('active-flex'))) {
      return 'cuartel_general';
    }
  } catch (_) {}

  // 8. Market Intel activo
  try {
    const currentTab = typeof window !== 'undefined' ? (window.currentTab || window.activeTab) : null;
    if (currentTab === 'market_intel') return 'market_intel';
  } catch (_) {}

  // 9. Chequeo por tab global si existe
  if (typeof window !== 'undefined') {
    const tab = window.currentTab || window.activeTab;
    const tabMap = {
      ais: 'cuartel_general',
      map: 'mapa',
      estimator: 'calculadora',
      calc: 'calculadora',
      dossiers: 'dossiers',
      decisiones: 'decisiones',
      agenda: 'agenda',
      market_intel: 'market_intel',
      auditor: 'auditoria',
      auditoria: 'auditoria'
    };
    if (tab && tabMap[tab]) return tabMap[tab];
    if (tab && SEACHARTER_DOM_DICTIONARY[tab]) return tab;
  }

  return 'calculadora';
}
/**
 * Motor de Captura DOM por Módulo Activo usando SEACHARTER_DOM_DICTIONARY.
 * Itera sobre arrays de inputs y metricas usando document.querySelector para
 * extraer los valores prioritarios antes del barrido general.
 * Añade las métricas encontradas en una lista llamada [Métricas Clave]:
 * dentro del string de elementos visibles.
 */
export function capturarDomModuloActivo(moduloIdOpcional) {
  let moduloKey = moduloIdOpcional;

  // Si se pasa un selector de contenedor (ej. #view-ais), normalizar al ID de diccionario
  if (moduloKey && typeof moduloKey === 'string') {
    if (!SEACHARTER_DOM_DICTIONARY[moduloKey]) {
      const entry = Object.entries(SEACHARTER_DOM_DICTIONARY).find(
        ([, conf]) => conf.contenedor === moduloKey
      );
      if (entry) {
        moduloKey = entry[0];
      } else {
        const aliasMap = {
          ais: 'cuartel_general',
          map: 'mapa',
          estimator: 'calculadora',
          calc: 'calculadora',
          dossier: 'dossiers',
          decision: 'decisiones',
          contacts: 'agenda',
          directory: 'agenda',
          auditor: 'auditoria',
          auditoria: 'auditoria'
        };
        if (aliasMap[moduloKey]) moduloKey = aliasMap[moduloKey];
      }
    }
  }

  if (!moduloKey || !SEACHARTER_DOM_DICTIONARY[moduloKey]) {
    moduloKey = detectarModuloActual();
  }

  const moduleConfig = SEACHARTER_DOM_DICTIONARY[moduloKey];
  if (!moduleConfig) {
    return {
      suite: "SeaCharter Core PRO",
      modulo_actual: moduloKey || "calculadora",
      contenedor: "",
      inputs: [],
      metricas: [],
      elementos_visibles: `[Módulo Activo]: ${moduloKey}\n[Métricas Clave]:\n- (Módulo no registrado)`
    };
  }

  const contenedorSel = moduleConfig.contenedor;
  const metricasEncontradas = [];
  const inputsPrioritarios = [];
  const lineasMetricas = [];
  const lineasInputs = [];

  if (typeof document !== 'undefined') {
    // 1. Extraer valores prioritarios de metricas usando document.querySelector
    if (Array.isArray(moduleConfig.metricas)) {
      moduleConfig.metricas.forEach((sel) => {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const val = (el.value != null && el.value !== '' ? el.value : (el.textContent || '')).trim();
            metricasEncontradas.push({ selector: sel, valor: val });
            lineasMetricas.push(`${sel}: ${val}`);
          }
        } catch (_) {}
      });
    }

    // 2. Extraer valores prioritarios de inputs usando document.querySelector
    if (Array.isArray(moduleConfig.inputs)) {
      moduleConfig.inputs.forEach((sel) => {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const val = (el.value != null ? el.value : (el.textContent || '')).trim();
            inputsPrioritarios.push({ selector: sel, valor: val });
            lineasInputs.push(`${sel}: ${val}`);
          }
        } catch (_) {}
      });
    }

    // 3. Barrido general de inputs dentro del contenedor
    const contenedorEl = (typeof document.querySelector === 'function' ? document.querySelector(contenedorSel) : null) || document;
    const otrosInputs = [];
    if (contenedorEl && typeof contenedorEl.querySelectorAll === 'function') {
      const inputsPrioritariosSet = new Set(moduleConfig.inputs || []);
      try {
        const allFormEls = contenedorEl.querySelectorAll('input, select, textarea');
        allFormEls.forEach((el) => {
          const idSel = el.id ? `#${el.id}` : null;
          if (!idSel || !inputsPrioritariosSet.has(idSel)) {
            const val = (el.value != null ? el.value : '').trim();
            otrosInputs.push({ selector: idSel || el.name || 'input', valor: val });
          }
        });
      } catch (_) {}
    }
  }

  // 4. Añadir las métricas encontradas en una lista llamada [Métricas Clave]: dentro del string de elementos visibles
  let elementosVisibles = `[Módulo]: ${moduloKey} (${contenedorSel})\n\n`;

  elementosVisibles += `[Métricas Clave]:\n`;
  if (lineasMetricas.length > 0) {
    elementosVisibles += lineasMetricas.map((m) => `  • ${m}`).join('\n') + '\n\n';
  } else {
    elementosVisibles += `  • (Sin métricas registradas en ${contenedorSel})\n\n`;
  }

  elementosVisibles += `[Inputs Prioritarios]:\n`;
  if (lineasInputs.length > 0) {
    elementosVisibles += lineasInputs.map((i) => `  • ${i}`).join('\n') + '\n';
  } else {
    elementosVisibles += `  • (Sin inputs registrados en ${contenedorSel})\n`;
  }

  return {
    suite: "SeaCharter Core PRO",
    modulo_actual: moduloKey,
    contenedor: contenedorSel,
    metricas: metricasEncontradas,
    inputs: inputsPrioritarios,
    elementos_visibles: elementosVisibles.trim()
  };
}

/**
 * Cerebro Central MADRE - Strategic Audit & Fixture Recap API Endpoint
 */
export const MADRE_API_ENDPOINT = "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/madre-chat";

/**
 * Guion Ejecutivo de Carga Seca para voz neuronal de Madre
 * Genera un texto conversacional y fluido basado en el estado (State) actual del viaje.
 */
export function getScanPendingMessage(state = {}) {
  const modulo = detectarModuloActual();
  if (modulo === 'mapa') {
    return 'Estás en el mapa operativo. Para auditar la operación, accede a la calculadora de SeaCharter e introduce o revisa los datos de carga y cálculo.';
  }

  const readMetric = (selectors, fallback) => {
    for (const selector of selectors) {
      const element = typeof document !== 'undefined' ? document.querySelector(selector) : null;
      if (!element) continue;
      const raw = String('value' in element ? element.value : element.textContent || '').trim();
      let clean = raw.replace(/[^0-9.,-]/g, '');
      clean = clean.lastIndexOf(',') > clean.lastIndexOf('.')
        ? clean.replace(/\./g, '').replace(',', '.')
        : clean.replace(/,/g, '');
      return clean ? Number(clean) : 0;
    }
    return Number(fallback);
  };

  const cargo = readMetric(['#cargo-qty'], state.cargoQty ?? state.cargo);
  const breakEven = readMetric(['#res-breakeven', '#res-cost-base-break-even'], state.breakEven ?? state.breakEvenUnitario);
  if (!hasOperationalInputData() || !Number.isFinite(cargo) || cargo <= 0 || !Number.isFinite(breakEven) || breakEven <= 0) {
    if (modulo === 'cuartel_general') {
      return 'Estás en el radar AIS y faltan datos de carga o cálculo para auditar la operación. Accede a la calculadora de SeaCharter e introduce las toneladas de carga y los parámetros de la operación.';
    }
    return PENDING_OPERATION_MESSAGE;
  }
  return null;
}

function buildMotherExecutiveScript(state = {}) {
  const pendingMessage = getScanPendingMessage(state);
  if (pendingMessage) return pendingMessage;
  // Función auxiliar para parsear números respetando decimales (US y EU)
  const parseValue = (val) => {
      if (!val) return null;
      let clean = val.replace(/[^0-9.,]/g, '');
      // Si la coma está después del punto, es formato EU (1.234,56)
      if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
          clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
          // Formato US (1,234.56 o 19.61)
          clean = clean.replace(/,/g, '');
      }
      return parseFloat(clean);
  };

  // 1. EXTRACCIÓN 100% DINÁMICA DEL DOM
  let liveDays = null;
  let liveCargoQty = null;
  let extractedBreakEven = null;
  let optimeFreight = null;
  let isExtracomunitario = false;

  if (typeof document !== 'undefined') {
      const domText = document.body.innerText || '';
      
      // Captura exacta de Días Totales
      const matchDays = domText.match(/Dias Mar\s*\+\s*Puerto\s*\+\s*Margen Clima:?\s*([\d,\.]+)/i);
      if (matchDays) liveDays = parseValue(matchDays[1]);

      // Extraer Toneladas / Carga
      const matchCargo = domText.match(/(?:Toneladas|Cargo Qty|\bMT\b)[:\s]*([\d\.,]+)/i);
      if (matchCargo) {
          const parsed = parseValue(matchCargo[1]);
          if (parsed > 0) liveCargoQty = parsed;
      }

      // Extraer Flete Break-Even
      const matchBe = domText.match(/(?:FLETE BREAK-EVEN.*?|COSTE BASE - BREAK-EVEN)[:\s]*\$?([\d\.,]+)/i);
      if (matchBe) extractedBreakEven = parseValue(matchBe[1]);

      // Extraer Escenario Óptimo de la Risk Matrix
      const matchOpt = domText.match(/ESCENARIO ÓPTIMO[\s\S]{0,30}\$([\d\.,]+)/i);
      if (matchOpt) optimeFreight = parseValue(matchOpt[1]);

      // Detectar origen extracomunitario (CBAM)
      if (/Abidjan|Bejaia|Argelia|Algiers|Oran|Sfax|Dakar|Turkey|Turquía|Egipto|Casablanca/i.test(domText)) {
          isExtracomunitario = true;
      }
  }

  // 2. CONSOLIDACIÓN SEGURA
  const breakEven = extractedBreakEven !== null ? extractedBreakEven : (state?.breakEven ?? state?.breakEvenUnitario ?? null);
  const diasTotales = liveDays !== null ? liveDays : (state?.diasTotales ?? null);
  const cargoMt = liveCargoQty !== null ? liveCargoQty : (state?.cargoQty ?? null);
  
  if (!Number.isFinite(Number(cargoMt)) || Number(cargoMt) <= 0 || !Number.isFinite(Number(breakEven)) || Number(breakEven) <= 0) {
    return PENDING_OPERATION_MESSAGE;
  }

  let alertaRegulatoria = '';
  if (isExtracomunitario) {
      alertaRegulatoria = ' Alerta regulatoria: Origen extracomunitario detectado (liquidación CBAM y provisión EU ETS aplicables).';
  }

  // 3. CONSTRUCCIÓN DE RESPUESTA ADAPTATIVA
  const textoDias = diasTotales !== null ? `en un ciclo de ${Number(diasTotales).toFixed(2)} días` : 'con días operativos pendientes';
  const textoCarga = cargoMt !== null ? `${Number(cargoMt).toLocaleString('es-ES')} toneladas métricas` : 'la carga establecida';
  const textoBe = breakEven !== null ? `situado en $${Number(breakEven).toFixed(2)} por tonelada` : 'pendiente de validación';

  let recomendacionRitmos = '';
  if (breakEven !== null && optimeFreight !== null) {
      recomendacionRitmos = ` Análisis de Risk Matrix: Se recomienda intensificar los ritmos de carga para alcanzar el Escenario Óptimo de $${optimeFreight.toFixed(2)}/MT, optimizando el margen operativo frente al escenario actual.`;
  }

  return `Escaneo analítico completado. Operación evaluada para ${textoCarga} ${textoDias}. El break-even de armador se encuentra ${textoBe}.${recomendacionRitmos}${alertaRegulatoria} Impacto global: auditoría paramétrica finalizada con éxito.`;
}

/**
 * Reproducción de voz neuronal MADRE conectando con DataBridge (madre-voice.js / Google Cloud TTS)
 * Reproducción directa en hardware usando Web Audio API (Bypass CSP media-src / blob:)
 */
async function playNeuralMotherVoice(textToSpeak, playback = {}) {
  if (!textToSpeak) return null;
  let audioCtx;
  
  try {
    const response = await fetch('https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/madre-voice', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg' 
      },
      body: JSON.stringify({ text: textToSpeak })
    });

    if (!response.ok) {
      console.warn(`[playNeuralMotherVoice] Petición rechazada por Netlify (HTTP ${response.status})`);
      return null;
    }

    const contentType = response.headers?.get ? (response.headers.get("content-type") || response.headers.get("Content-Type")) : null;
    if (contentType && contentType.includes("application/json")) {
      console.warn("[playNeuralMotherVoice] El servidor devolvió JSON de error. Abortando síntesis para evitar voz robótica.");
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      try { await audioCtx.resume(); } catch (_) {}
    }
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    if (playback.shouldPlay && !playback.shouldPlay()) {
      await audioCtx.close();
      return null;
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    
    source.onended = () => {
      source.disconnect();
      void audioCtx.close().catch(() => {});
      playback.onEnded?.(source);
    };
    
    playback.onReady?.(source);
    
    if (playback.shouldPlay && !playback.shouldPlay()) {
      source.disconnect();
      await audioCtx.close();
      playback.onEnded?.(source);
      return null;
    }
    
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (_) {}
    }
    
    source.start(0);
    return source;
    
  } catch (error) {
    if (audioCtx) void audioCtx.close().catch(() => {});
    console.error("Fallo al invocar a Madre neuronal en DataBridge:", error);
    return null;
  }
}

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
  }

  // --- NUEVO: 5. Escaneo Estructurado Bloque por Bloque (Módulos 1 al 10) ---
  let escaneoCompacto = null;
  try {
    const rawData = extractStructuredCoreProData();
    escaneoCompacto = compactPayload(rawData);
  } catch (_) {}

  // Extraer breakEven, cargoQty y demurrageRate hacia parametros_activos únicamente si existen elementos en el DOM
  const hasLiveDomElements = typeof document !== 'undefined' && typeof document.querySelector === 'function' && Boolean(
    document.querySelector('#res-breakeven, #res-cost-base-break-even, #exec-buy-freight, #cargo-qty, #exec-cargo-qty, #demurrage-rate')
  );

  const b6BreakEven = escaneoCompacto?.bloques?.bloque_6_resumen_operacion_costes?.break_even_usd_mt;
  const b2CargoQty = escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.toneladas_carga;
  const b9Demurrage = escaneoCompacto?.bloques?.bloque_9_matriz_riesgo_psc?.tarifa_demurrage_usd_dia;

  if (hasLiveDomElements) {
    if (b6BreakEven != null) params.breakEven = b6BreakEven;
    if (b2CargoQty != null) params.cargoQty = b2CargoQty;
    if (b9Demurrage != null) params.demurrageRate = b9Demurrage;
  }

  if (typeof document !== 'undefined') {
    if (params.breakEven == null) {
      const beEl = document.querySelector('#res-breakeven, #res-cost-base-break-even, #exec-buy-freight');
      if (beEl) {
        const val = parseFloat((beEl.value || beEl.textContent || "").replace(/[^0-9.]/g, ""));
        if (Number.isFinite(val) && val > 0) params.breakEven = val;
      }
    }
    if (params.cargoQty == null) {
      const cqEl = document.querySelector('#cargo-qty, #exec-cargo-qty');
      if (cqEl) {
        const val = parseFloat((cqEl.value || cqEl.textContent || "").replace(/[^0-9.]/g, ""));
        if (Number.isFinite(val) && val > 0) params.cargoQty = val;
      }
    }
    if (params.demurrageRate == null) {
      const dmEl = document.querySelector('#demurrage-rate');
      if (dmEl) {
        const val = parseFloat((dmEl.value || dmEl.textContent || "").replace(/[^0-9.]/g, ""));
        if (Number.isFinite(val) && val >= 0) params.demurrageRate = val;
      }
    }
  }

  if (typeof window !== 'undefined' && window.State) {
    if (params.breakEven == null && window.State.breakEven != null) params.breakEven = window.State.breakEven;
    if (params.cargoQty == null && (window.State.cargoQty != null || window.State.cargo_qty != null)) {
      params.cargoQty = window.State.cargoQty ?? window.State.cargo_qty;
    }
    if (params.demurrageRate == null && (window.State.demurrageRate != null || window.State.demurrage_rate != null)) {
      params.demurrageRate = window.State.demurrageRate ?? window.State.demurrage_rate;
    }
  }

  const moduloActual = detectarModuloActual();
  const capturaDOM = capturarDomModuloActivo(moduloActual);

  const getSafeVal = (sel) => {
    if (typeof document === 'undefined') return '';
    try {
      if (typeof document.querySelector === 'function') {
        const el = document.querySelector(sel);
        return el ? (el.value || el.textContent || '') : '';
      }
      if (typeof document.getElementById === 'function' && sel.startsWith('#')) {
        const el = document.getElementById(sel.slice(1));
        return el ? (el.value || el.textContent || '') : '';
      }
    } catch (_) {}
    return '';
  };

  const getSafeNum = (sel) => {
    const raw = getSafeVal(sel);
    if (!raw) return 0;
    const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const cleanPol = String(
    escaneoCompacto?.bloques?.bloque_1_derrota_puertos?.pol ||
    getSafeVal('#port-pol') ||
    getSafeVal('#input-pol') ||
    getSafeVal('#map-port-pol') ||
    getSafeVal('#exec-pol') ||
    getSafeVal('#tracking-input-pol') ||
    (typeof window !== 'undefined' ? (window.State?.pol || window.dssFormState?.pol) : '') ||
    ''
  ).trim();

  const cleanPod = String(
    escaneoCompacto?.bloques?.bloque_1_derrota_puertos?.pod ||
    getSafeVal('#port-pod') ||
    getSafeVal('#input-pod') ||
    getSafeVal('#map-port-pod') ||
    getSafeVal('#exec-pod') ||
    getSafeVal('#tracking-input-pod') ||
    (typeof window !== 'undefined' ? (window.State?.pod || window.dssFormState?.pod) : '') ||
    ''
  ).trim();

  const cleanCargo = Number(
    escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.toneladas_carga ||
    params.cargoQty ||
    getSafeNum('#cargo-qty') ||
    getSafeNum('#exec-cargo-qty') ||
    (typeof window !== 'undefined' ? (window.State?.cargoQty ?? window.State?.cargo_qty ?? window.State?.cargo) : 0) ||
    0
  );

  const cleanLoadRate = Number(
    escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.ritmo_carga_tpd ||
    getSafeNum('#rate-load') ||
    getSafeNum('#loading-rate') ||
    getSafeNum('#gc-laytime-load-val') ||
    (typeof window !== 'undefined' ? (window.State?.loadRate ?? window.State?.ratePOL ?? window.State?.ritmo_carga ?? window.State?.ritmoRealPol) : 0) ||
    0
  );

  const cleanDischargeRate = Number(
    escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.ritmo_descarga_tpd ||
    getSafeNum('#rate-disch') ||
    getSafeNum('#discharge-rate') ||
    getSafeNum('#gc-laytime-disch-val') ||
    getSafeNum('#input-dischargeRate') ||
    (typeof window !== 'undefined' ? (window.State?.dischargeRate ?? window.State?.dischRate ?? window.State?.ratePOD ?? window.State?.ritmo_descarga ?? window.State?.ritmoRealPod) : 0) ||
    0
  );

  const cleanCommodity = String(
    escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.commodity ||
    getSafeVal('#cargo-product') ||
    getSafeVal('#cargo-type') ||
    getSafeVal('#input-commodity') ||
    (typeof window !== 'undefined' ? (window.State?.cargoProduct || window.State?.cargoType || window.State?.commodity) : '') ||
    ''
  ).trim();

  // Se lo enviamos TODO a MADRE
  return {
    suite: "SeaCharter Core PRO",
    modulo_actual: moduloActual,
    current_module: "core_pro",
    vista_activa: "Core PRO - Panel y Mapa Operativo",
    vista_dinamica: vistaActivaActual,
    referenciaMadre: referenciaActiva, // <- VITAL PARA QUE NO FALLE NEON
    allInRateGross: Number(typeof window !== 'undefined' ? (window.dssFormState?.allInRateGross || window.getDSSCurrentState?.()?.allInRateGross || 0) : 0),
    parametros_activos: params,        // <- AQUÍ VAN LOS GASTOS DE PUERTO
    escaneo_estructurado: escaneoCompacto,
    modulos_1_a_10: escaneoCompacto?.bloques,
    resumen_operativo: escaneoCompacto?.resumen,
    captura_dom: capturaDOM,
    elementos_visibles: capturaDOM?.elementos_visibles,
    pol: cleanPol,
    pod: cleanPod,
    port_pol: cleanPol,
    port_pod: cleanPod,
    cargoQty: cleanCargo,
    tonnage: cleanCargo,
    cargo_qty: cleanCargo,
    commodity: cleanCommodity,
    cargoType: cleanCommodity,
    breakEvenUnitario: escaneoCompacto?.bloques?.bloque_6_resumen_operacion_costes?.break_even_usd_mt || params.breakEven || 0,
    fleteUnitario: escaneoCompacto?.bloques?.bloque_10_simulador_negociacion_contraofertas?.flete_venta_fletador_mt || escaneoCompacto?.bloques?.bloque_7_analisis_fletes_riesgos?.flete_venta_sugerido_mt || 0,
    loadRate: cleanLoadRate,
    loading_rate: cleanLoadRate,
    ratePOL: cleanLoadRate,
    ritmo_carga: cleanLoadRate,
    ritmo_carga_tpd: cleanLoadRate,
    dischargeRate: cleanDischargeRate,
    discharge_rate: cleanDischargeRate,
    ratePOD: cleanDischargeRate,
    ritmo_descarga: cleanDischargeRate,
    ritmo_descarga_tpd: cleanDischargeRate,
    tceDiario: escaneoCompacto?.bloques?.bloque_10_simulador_negociacion_contraofertas?.tce_obtenido_usd_dia || 0
  };
}

/**
 * Formatea y procesa el veredicto comercial y operativo unificado de MADRE
 */
function formatMotherVerdict(data, fallbackState = {}) {
  if (!data || typeof data !== 'object') {
    return buildMotherExecutiveScript(fallbackState);
  }

  const veredictoGeneral = (data.veredicto_general || data.veredicto || data.dictamen || '').trim();
  const reporteEstrategico = (data.reporte_estrategico || data.informe || data.reporte || '').trim();
  const rawReply = (data.respuesta || data.reply || data.texto_preformateado || data.message || data.text || data.response || '').trim();

  if (!veredictoGeneral && !reporteEstrategico && !rawReply) {
    return buildMotherExecutiveScript(fallbackState);
  }

  const parts = [];

  // 1. Veredicto Comercial / Operativo Unificado
  if (veredictoGeneral) {
    parts.push(`### Veredicto Comercial y Operativo: ${veredictoGeneral}`);
  }

  // 2. Reporte Estratégico o Respuesta Principal
  if (reporteEstrategico) {
    parts.push(reporteEstrategico);
  } else if (rawReply && !rawReply.includes(veredictoGeneral)) {
    parts.push(rawReply);
  }

  // 3. Variables Perjudiciales / Cuellos de Botella Detectados (13 Hijas)
  if (Array.isArray(data.variables_perjudiciales) && data.variables_perjudiciales.length > 0) {
    const varsText = data.variables_perjudiciales
      .filter(v => typeof v === 'string' && v.trim().length > 0)
      .map(v => `• ${v.trim()}`)
      .join('\n');
    if (varsText) {
      parts.push(`**Variables Críticas Detectadas:**\n${varsText}`);
    }
  }

  // 4. Recomendaciones Operativas y Comerciales
  if (Array.isArray(data.recomendaciones) && data.recomendaciones.length > 0) {
    const recs = data.recomendaciones
      .filter(r => r && typeof r === 'object')
      .map(r => {
        const itemParts = [];
        if (r.accion) itemParts.push(`**Acción:** ${r.accion}`);
        if (r.pro) itemParts.push(`*Ventaja:* ${r.pro}`);
        if (r.contra) itemParts.push(`*Riesgo evitado:* ${r.contra}`);
        return itemParts.join(' ');
      })
      .filter(Boolean)
      .join('\n');
    if (recs) {
      parts.push(`**Recomendaciones de Optimización:**\n${recs}`);
    }
  }

  const result = parts.filter(Boolean).join('\n\n').trim();
  return result || rawReply || buildMotherExecutiveScript(fallbackState);
}

/**
 * Helper compacto que corta referencias circulares, limita la profundidad máxima a 12
 * y descarta nodos DOM, Window, Event, File/Blob y funciones.
 */
export function safeCloneForJson(value, maxDepth = 12, currentDepth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  // Descartar funciones y símbolos
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  // Tipos primitivos seguros
  if (typeof value !== 'object') {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    return value;
  }

  // Límite de profundidad máxima
  if (currentDepth >= maxDepth) {
    return undefined;
  }

  // Descartar Window
  if (
    (typeof window !== 'undefined' && value === window) ||
    value.window === value ||
    (typeof Window !== 'undefined' && value instanceof Window)
  ) {
    return undefined;
  }

  // Descartar Nodos DOM (Element, Document, DocumentFragment, etc.)
  if (
    (typeof Node !== 'undefined' && value instanceof Node) ||
    typeof value.nodeType === 'number' ||
    value.tagName !== undefined
  ) {
    return undefined;
  }

  // Descartar Eventos
  if (
    (typeof Event !== 'undefined' && value instanceof Event) ||
    (typeof value.preventDefault === 'function' && typeof value.stopPropagation === 'function')
  ) {
    return undefined;
  }

  // Descartar File / Blob
  if (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof File !== 'undefined' && value instanceof File) ||
    (typeof value.arrayBuffer === 'function' && typeof value.slice === 'function')
  ) {
    return undefined;
  }

  // Control de referencias circulares
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  // Arrays
  if (Array.isArray(value)) {
    const arr = [];
    for (let i = 0; i < value.length; i++) {
      const cloned = safeCloneForJson(value[i], maxDepth, currentDepth + 1, seen);
      arr.push(cloned === undefined ? null : cloned);
    }
    seen.delete(value);
    return arr;
  }

  // Objetos planos
  const result = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    let propVal;
    try {
      propVal = value[key];
    } catch (_) {
      continue;
    }
    if (typeof propVal === 'function' || typeof propVal === 'symbol') {
      continue;
    }
    const cloned = safeCloneForJson(propVal, maxDepth, currentDepth + 1, seen);
    if (cloned !== undefined) {
      result[key] = cloned;
    }
  }

  seen.delete(value);
  return result;
}

if (typeof window !== 'undefined') {
  window.safeCloneForJson = safeCloneForJson;
}

/**
 * Arquitectura "Dos Tiempos" para MADRE:
 * - Fase 1: Digerir y validar el contexto_ui estructurado en backend sin bloquear la respuesta.
 * - Fase 2: Ejecutar el análisis profundo o veredicto estratégico con la sesión consolidada.
 */
async function ejecutarEscaneoDosTiempos(basePayload) {
  const endpoint = typeof MADRE_API_ENDPOINT !== 'undefined'
    ? MADRE_API_ENDPOINT
    : "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/madre-chat";

  // Fase 1: Envío preliminar para digerir y validar el contexto operativo
  const payloadFase1 = {
    ...basePayload,
    fase: 1
  };

  const responseFase1 = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(safeCloneForJson(payloadFase1)),
  });

  if (!responseFase1.ok) {
    throw new Error(`Error HTTP en Fase 1: ${responseFase1.status}`);
  }

  const dataFase1 = await responseFase1.json().catch(() => ({}));
  const sessionId = dataFase1?.session_id || dataFase1?.referenciaMadre || basePayload?.session_id || 'REF-MADRE-ACTIVA';

  // Fase 2: Petición de generación/veredicto consolidado
  const payloadFase2 = {
    ...basePayload,
    fase: 2,
    session_id: sessionId,
    referenciaMadre: dataFase1?.referenciaMadre || sessionId
  };

  const responseFase2 = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(safeCloneForJson(payloadFase2)),
  });

  if (!responseFase2.ok) {
    throw new Error(`Error HTTP en Fase 2: ${responseFase2.status}`);
  }

  return await responseFase2.json().catch(() => ({}));
}

/**
 * Valida si el usuario ha introducido datos operativos reales en la calculadora
 */
function hasRealCalculatorData() {
  if (typeof hasOperationalInputData === 'function' && hasOperationalInputData()) {
    return true;
  }
  if (typeof document !== 'undefined') {
    const realInputs = [
      '#cargo-qty', '#rate-load', '#rate-disch', '#freight-rate', '#freight-sell',
      '#dist-ballast', '#dist-laden', '#price-sea', '#price-port', '#pda-pol', '#pda-pod'
    ];
    for (const sel of realInputs) {
      try {
        const el = document.querySelector(sel);
        const raw = el?.value != null ? String(el.value).trim() : '';
        const val = parseFloat(raw.replace(/[^0-9.]/g, ''));
        if (raw !== '' && Number.isFinite(val) && val > 0) return true;
      } catch (_) {}
    }
  }
  return false;
}

/**
 * Detecta si el mensaje del usuario es un saludo o cortesía breve sin intención analítica.
 * Directriz de Gobernanza SeaCharter:
 * Saludos simples (hola, buenas, buenos días, hi, hello, gracias, ok, < 20 caracteres sin intención analítica)
 * deben enrutarse SIEMPRE al chat estándar, sin scanMode: "audit_critical".
 */
function isSimpleGreetingOrCourtesy(text) {
  if (!text || typeof text !== 'string') return false;

  const clean = text
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¡!¿?.,;:()_`"'~#*\/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return false;

  // Si supera 30 caracteres, no es una cortesía breve
  if (clean.length > 30) return false;

  // Palabras analíticas u operativas marítimas que indican intención de consulta o cálculo
  const analyticalKeywords = [
    'flete', 'freight', 'demurrage', 'laytime', 'laycan', 'bunker', 'mgo', 'vlsfo',
    'pda', 'clausula', 'riesgo', 'risk', 'buque', 'vessel', 'pol', 'pod', 'carga',
    'cargo', 'ton', 'tce', 'margen', 'profit', 'audita', 'analiza', 'revisa', 'calcula',
    'escan', 'scan', 'dwt', 'despacho', 'descuento', 'puerto', 'port', 'tarifa',
    'comision', 'broker', 'fio', 'fiost', 'gencon', 'asbatankvoy', 'recap', 'contrato',
    'coste', 'cost', 'precio', 'price', 'speed', 'velocidad'
  ];

  if (analyticalKeywords.some(kw => clean.includes(kw))) {
    return false;
  }

  // Patrones directos de saludos y cortesías comunes
  const greetingPatterns = [
    /^hola(\s+(madre|amiga|equipo|asistente))?$/i,
    /^buenas(\s+(tardes|noches|dias))?$/i,
    /^buen(os)?\s+(dias?|tardes?|noches?)$/i,
    /^buen\s+dia$/i,
    /^hola\s+buen(os)?\s+(dias?|tardes?|noches?)$/i,
    /^hola\s+buenas(\s+(tardes|noches|dias))?$/i,
    /^(hi|hello|hey|howdy)(\s+(madre|there))?$/i,
    /^(gracias|muchas\s+gracias|mil\s+gracias|thanks|thank\s+you)(\s+madre)?$/i,
    /^(ok|okay|vale|de\s+acuerdo|entendido|perfecto|listo|bien)$/i,
    /^(adios|chao|bye|hasta\s+luego|hasta\s+pronto)$/i,
    /^(saludos|que\s+tal|como\s+estas?|como\s+va|todo\s+bien)(\s+madre)?$/i
  ];

  if (greetingPatterns.some(regex => regex.test(clean))) {
    return true;
  }

  // Si tiene menos de 20 caracteres y consiste en tokens conocidos de cortesía
  if (clean.length < 20) {
    const tokens = clean.split(' ').filter(Boolean);
    const commonGreetingTokens = new Set([
      'hola', 'buenas', 'buenos', 'buen', 'dia', 'dias', 'tarde', 'tardes', 'noche', 'noches',
      'hi', 'hello', 'hey', 'madre', 'gracias', 'ok', 'okay', 'vale', 'perfecto', 'saludos',
      'que', 'tal', 'como', 'estas', 'va', 'bien', 'chao', 'adios', 'bye', 'si', 'no'
    ]);
    if (tokens.length > 0 && tokens.every(t => commonGreetingTokens.has(t))) {
      return true;
    }
  }

  return false;
}

/**
 * Captura dinámica del contexto completo de auditoría/documento (sin truncado por scroll).
 * Extrae toda la información del módulo activo, tablas, métricas, bloques y texto en memoria.
 */
function extractDynamicAuditContext() {
  if (typeof document === 'undefined') {
    return {
      documentType: null,
      documentName: null,
      fullAuditData: {},
      rawDocumentText: '',
      activeScreenContext: {},
      userLanguage: 'es'
    };
  }

  // Idioma activo de la interfaz de SeaCharter
  const userLanguage = (typeof localStorage !== 'undefined' && (localStorage.getItem('seacharter_lang') || localStorage.getItem('rodahmar_lang'))) ||
    document.getElementById('language-selector')?.value ||
    (typeof window !== 'undefined' && window.currentExecutiveReportLang) ||
    'es';

  // Detección del módulo actual y su contenedor
  const moduloActual = typeof detectarModuloActual === 'function' ? detectarModuloActual() : 'calculadora';

  // 1. rawDocumentText (texto íntegro del documento en memoria, limitado a 25.000 caracteres máximo)
  let rawDocumentText = '';
  if (typeof window !== 'undefined') {
    if (window.State?.uploadedFile?.text) {
      rawDocumentText = window.State.uploadedFile.text;
    } else if (window.State?.rawDocumentText) {
      rawDocumentText = window.State.rawDocumentText;
    } else if (window.activeDocumentText) {
      rawDocumentText = window.activeDocumentText;
    } else if (window.rawDocumentText) {
      rawDocumentText = window.rawDocumentText;
    } else if (window.State?.contractText) {
      rawDocumentText = window.State.contractText;
    } else if (window.activeDossier?.contractText || window.activeDossier?.rawText) {
      rawDocumentText = window.activeDossier.contractText || window.activeDossier.rawText;
    }
  }

  if (!rawDocumentText) {
    const recapEl = document.getElementById('recapInput');
    if (recapEl && recapEl.value) {
      rawDocumentText = recapEl.value;
    }
  }

  if (!rawDocumentText) {
    const pdfReportEl = document.getElementById('contenedor-informe-pdf');
    if (pdfReportEl && pdfReportEl.innerText?.trim()) {
      rawDocumentText = pdfReportEl.innerText.trim();
    }
  }

  // Comprobar si existe un documento o informe en el módulo de Auditoría IA (#auditoria / visor de auditoría)
  const isAuditViewActive = Boolean(
    moduloActual === 'auditoria' ||
    (typeof document !== 'undefined' && (
      Boolean(document.querySelector('#view-auditor:not(.hidden), #view-auditor.active-flex, #view-auditor.active-block, #view-auditoria:not(.hidden), #auditoria:not(.hidden)')) ||
      Boolean(document.querySelector('#resultsContent:not(.hidden)')) ||
      Boolean(document.querySelector('#docPreviewContainer:not(.hidden)'))
    ))
  );

  const hasAuditDocumentInMemory = Boolean(
    (typeof window !== 'undefined' && (
      window.State?.uploadedFile?.text ||
      window.State?.uploadedFile?.name ||
      window.State?.rawDocumentText ||
      window.activeDocumentText ||
      window.rawDocumentText ||
      window.madreUltimaAuditoria ||
      window.SeaCharterCarrierOfferAudit ||
      window.lastCommercialNplPayload ||
      window.activeAuditResult ||
      window.lastAuditData
    )) ||
    (typeof document !== 'undefined' && (
      (document.getElementById('recapInput')?.value?.trim()?.length || 0) > 20 ||
      document.getElementById('docPreviewText')?.textContent?.trim() ||
      (document.getElementById('contenedor-informe-pdf')?.textContent?.trim()?.length || 0) > 20 ||
      (document.getElementById('resProforma')?.textContent?.trim()?.length || 0) > 20
    ))
  );

  const hasAuditDocOrReport = isAuditViewActive || hasAuditDocumentInMemory || Boolean(rawDocumentText);

  // 2. documentName (nombre del archivo, referencia o título del expediente)
  let documentName = null;
  if (typeof window !== 'undefined' && window.State?.uploadedFile?.name) {
    documentName = window.State.uploadedFile.name;
  } else {
    const docPreview = document.getElementById('docPreviewText');
    if (docPreview && docPreview.textContent?.trim()) {
      documentName = docPreview.textContent.trim();
    } else if (hasAuditDocOrReport) {
      const quickRef = document.getElementById('quick-ref');
      const qVal = quickRef && quickRef.value?.trim();
      if (qVal && !/^RDM\/\d{4}-0000$/i.test(qVal)) {
        documentName = qVal;
      } else if (typeof window !== 'undefined') {
        const ref = window.activeDossier?.reference || window.State?.contractReference || window.State?.reference || window.activeVoyage?.reference;
        if (ref && !/^RDM\/\d{4}-0000$/i.test(ref)) {
          documentName = ref;
        }
      }
    }
  }

  // 3. documentType (tipo detectado por el módulo si existe, o null)
  let documentType = null;
  const docBadge = document.getElementById('doc-badge');
  if (docBadge && docBadge.textContent?.trim()) {
    documentType = docBadge.textContent.trim();
  } else if (typeof window !== 'undefined' && window.State?.detectedDocumentType) {
    documentType = window.State.detectedDocumentType;
  } else if (typeof window !== 'undefined' && window.State?.charterPartyStandard) {
    documentType = window.State.charterPartyStandard;
  } else if (moduloActual === 'gencon' && hasAuditDocOrReport) {
    documentType = 'GENCON';
  } else if (moduloActual === 'asbatankvoy' && hasAuditDocOrReport) {
    documentType = 'ASBATANKVOY';
  } else if (rawDocumentText) {
    const upperText = rawDocumentText.toUpperCase();
    if (upperText.includes('GENCON')) documentType = 'GENCON';
    else if (upperText.includes('ASBATANKVOY')) documentType = 'ASBATANKVOY';
    else if (upperText.includes('FIXTURE RECAP')) documentType = 'FIXTURE RECAP';
    else if (upperText.includes('BILL OF LADING')) documentType = 'BILL OF LADING';
    else if (upperText.includes('STATEMENT OF FACTS') || upperText.includes('SOF')) documentType = 'STATEMENT OF FACTS';
    else if (upperText.includes('TIME CHARTER')) documentType = 'TIME CHARTER';
    else if (upperText.includes('VOYAGE CHARTER')) documentType = 'VOYAGE CHARTER';
  }

  // Selector del contenedor: Cuando exista documento o informe de Auditoría IA,
  // extraer EXCLUSIVAMENTE del contenedor del visor de auditoría.
  const visorAuditoria = typeof document !== 'undefined' ? (
    document.querySelector('#resultsContent:not(.hidden)') ||
    document.querySelector('#contenedor-informe-pdf') ||
    document.querySelector('.audit-results-panel') ||
    document.querySelector('#resultsContent') ||
    document.querySelector('#view-auditor') ||
    document.querySelector('#view-auditoria') ||
    document.querySelector('#auditoria')
  ) : null;

  const containerSelector = SEACHARTER_DOM_DICTIONARY[moduloActual]?.contenedor || `#view-${moduloActual}`;
  const containerEl = (hasAuditDocOrReport && visorAuditoria)
    ? visorAuditoria
    : (document.querySelector(containerSelector) || document.querySelector('.view-section:not(.hidden)') || document.body);

  if (!rawDocumentText && containerEl) {
    const textareas = containerEl.querySelectorAll('textarea');
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 30) {
        rawDocumentText = ta.value;
        break;
      }
    }
  }
  if (rawDocumentText) {
    rawDocumentText = rawDocumentText.trim().slice(0, 25000);
  }

  // 4. fullAuditData (serialización completa de todos los bloques, alertas, métricas, tablas y pestañas)
  const fullAuditData = {
    modulo_activo: hasAuditDocOrReport ? 'auditoria' : moduloActual,
    bloques: [],
    alertas: [],
    metricas: [],
    tablas: [],
    pestanas: []
  };

  const isElementVisible = (el) => {
    if (!el) return false;
    if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
    if (el.classList?.contains('hidden')) return false;
    if (el.closest?.('.hidden, [hidden], [style*="display: none"], [style*="display:none"]')) return false;
    return true;
  };

  if (containerEl) {
    // A. Tablas (recorrer todas las tablas visibles del contenedor de auditoría)
    const tables = containerEl.querySelectorAll('table');
    tables.forEach((tbl, idx) => {
      if (!isElementVisible(tbl)) return;
      const headers = Array.from(tbl.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
      const rows = Array.from(tbl.querySelectorAll('tbody tr, tr')).filter(tr => tr.querySelectorAll('td').length > 0 && isElementVisible(tr)).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '')
      );
      if (headers.length > 0 || rows.length > 0) {
        fullAuditData.tablas.push({
          id: tbl.id || `tabla_${idx + 1}`,
          headers,
          rows
        });
      }
    });

    // B. Alertas (filtrar alertas ocultas o avisos por defecto de calculadora vacía)
    const alertEls = containerEl.querySelectorAll('.alert, [role="alert"], [class*="border-red"], [class*="border-amber"], [class*="border-teal"], [class*="bg-red-50"], [class*="bg-amber-50"]');
    alertEls.forEach((el) => {
      if (!isElementVisible(el)) return;
      const txt = el.textContent?.trim();
      if (
        txt && txt.length > 5 && txt.length < 500 &&
        !txt.includes('NOTICE: THIS VESSEL IS NOT COMPATIBLE') &&
        !txt.includes('Faltan datos operativos') &&
        !fullAuditData.alertas.includes(txt)
      ) {
        fullAuditData.alertas.push(txt);
      }
    });

    // C. Métricas y KPIs visibles
    const metricEls = containerEl.querySelectorAll('.kpi, [id*="kpi"], [id*="res-"], [id*="badge"], .metric');
    metricEls.forEach((el) => {
      if (!isElementVisible(el)) return;
      const label = el.getAttribute('aria-label') || el.getAttribute('data-label') || el.previousElementSibling?.textContent?.trim() || '';
      const val = (el.value != null ? el.value : el.textContent)?.trim();
      if (val && val.length < 100) {
        fullAuditData.metricas.push({
          id: el.id || '',
          etiqueta: label,
          valor: val
        });
      }
    });

    // D. Bloques y Secciones visibles
    const sections = containerEl.querySelectorAll('[data-collapsible-section], .ai-work-card, section, article, .audit-collapsible-panel, .legacy-audit-section');
    sections.forEach((sec, idx) => {
      if (!isElementVisible(sec)) return;
      const title = sec.querySelector('h1, h2, h3, h4, [data-collapsible-title]')?.textContent?.trim() || `Bloque ${idx + 1}`;
      const content = sec.textContent?.trim();
      if (content && content.length > 20) {
        fullAuditData.bloques.push({
          titulo: title,
          resumen: content.slice(0, 500)
        });
      }
    });

    // E. Pestañas / Tabs visibles
    const tabs = containerEl.querySelectorAll('.tab, [role="tab"], .tab-item, [data-tab]');
    tabs.forEach((tab) => {
      if (!isElementVisible(tab)) return;
      const tabName = tab.textContent?.trim();
      const isActive = tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true';
      if (tabName) {
        fullAuditData.pestanas.push({ nombre: tabName, activa: isActive });
      }
    });
  }

  // Integración de auditorías en memoria si existen
  if (typeof window !== 'undefined') {
    if (window.madreUltimaAuditoria) {
      fullAuditData.madreUltimaAuditoria = window.madreUltimaAuditoria;
    }
    if (window.SeaCharterCarrierOfferAudit) {
      fullAuditData.carrierOfferAudit = window.SeaCharterCarrierOfferAudit;
    }
    if (window.lastCommercialNplPayload) {
      fullAuditData.commercialNpl = window.lastCommercialNplPayload;
    }
  }

/**
 * Construye activeScreenContext con una lista blanca estricta de campos operativos planos del viaje.
 * Excluye explícitamente sensitivityAnalysis, rawDocumentText, madreUltimaAuditoria,
 * reporte_estrategico, reporteEstrategico y fullAuditData.
 */
function buildFlatActiveScreenContext(liveContext = {}, state = {}) {
  const moduloActual = typeof detectarModuloActual === 'function'
    ? detectarModuloActual()
    : (liveContext.modulo_actual || 'calculadora');
  const vistaActiva = liveContext.vista_activa || moduloActual;

  const pol = String(
    liveContext.pol ||
    state.pol ||
    state.port_pol ||
    (typeof document !== 'undefined' ? document.getElementById('port-pol')?.value : '') ||
    ''
  ).trim();

  const pod = String(
    liveContext.pod ||
    state.pod ||
    state.port_pod ||
    (typeof document !== 'undefined' ? document.getElementById('port-pod')?.value : '') ||
    ''
  ).trim();

  const commodity = String(
    state.commodity ||
    liveContext.commodity ||
    state.cargoProduct ||
    state.cargoType ||
    (typeof document !== 'undefined' ? document.getElementById('commodity-select')?.value || document.getElementById('commodity')?.value : '') ||
    ''
  ).trim();

  const cargoType = String(
    state.cargoType ||
    liveContext.cargoType ||
    commodity ||
    ''
  ).trim();

  const cargoQty = Number(
    (Number(state.cargoQty ?? state.cargo ?? state.tonnage) > 0 ? (state.cargoQty ?? state.cargo ?? state.tonnage) : null) ??
    (Number(liveContext.cargoQty ?? liveContext.tonnage) > 0 ? (liveContext.cargoQty ?? liveContext.tonnage) : null) ??
    (typeof document !== 'undefined' ? document.getElementById('cargo-qty')?.value : null) ??
    state.cargoQty ??
    liveContext.cargoQty ??
    0
  ) || 0;

  const loadRate = Number(
    (Number(state.loadRate ?? state.ratePOL ?? state.loading_rate) > 0 ? (state.loadRate ?? state.ratePOL ?? state.loading_rate) : null) ??
    (Number(liveContext.loadRate ?? liveContext.ratePOL) > 0 ? (liveContext.loadRate ?? liveContext.ratePOL) : null) ??
    (typeof document !== 'undefined' ? document.getElementById('rate-load')?.value : null) ??
    state.loadRate ??
    liveContext.loadRate ??
    0
  ) || 0;

  const dischargeRate = Number(
    (Number(state.dischargeRate ?? state.ratePOD ?? state.discharge_rate) > 0 ? (state.dischargeRate ?? state.ratePOD ?? state.discharge_rate) : null) ??
    (Number(liveContext.dischargeRate ?? liveContext.ratePOD) > 0 ? (liveContext.dischargeRate ?? liveContext.ratePOD) : null) ??
    (typeof document !== 'undefined' ? document.getElementById('rate-disch')?.value : null) ??
    state.dischargeRate ??
    liveContext.dischargeRate ??
    0
  ) || 0;

  const breakEven = Number(
    (Number(state.breakEven ?? state.breakEvenArmador) > 0 ? (state.breakEven ?? state.breakEvenArmador) : null) ??
    (Number(liveContext.breakEven ?? liveContext.breakEvenUnitario) > 0 ? (liveContext.breakEven ?? liveContext.breakEvenUnitario) : null) ??
    (typeof document !== 'undefined' ? document.getElementById('break-even-val')?.innerText || document.getElementById('break-even')?.value : null) ??
    state.breakEven ??
    liveContext.breakEven ??
    0
  ) || 0;

  const fleteUnitario = Number(
    (Number(state.fleteUnitario ?? state.freightRate ?? state.flete) > 0 ? (state.fleteUnitario ?? state.freightRate ?? state.flete) : null) ??
    (Number(liveContext.fleteUnitario) > 0 ? liveContext.fleteUnitario : null) ??
    (typeof document !== 'undefined' ? document.getElementById('freight-rate')?.value : null) ??
    state.fleteUnitario ??
    liveContext.fleteUnitario ??
    0
  ) || 0;

  const tceDiario = Number(
    (Number(state.tceDiario ?? state.tce) > 0 ? (state.tceDiario ?? state.tce) : null) ??
    (Number(liveContext.tceDiario) > 0 ? liveContext.tceDiario : null) ??
    (typeof document !== 'undefined' ? document.getElementById('tce-daily')?.innerText || document.getElementById('tce')?.value : null) ??
    state.tceDiario ??
    liveContext.tceDiario ??
    0
  ) || 0;

  const freightTerms = String(
    state.freightTerms ||
    state.terms ||
    liveContext.freightTerms ||
    (typeof document !== 'undefined' ? document.getElementById('freight-terms')?.value : '') ||
    ''
  ).trim();

  const vesselType = String(
    state.vesselType ||
    state.buque_tipo ||
    liveContext.vesselType ||
    (typeof document !== 'undefined' ? document.getElementById('vessel-type')?.value : '') ||
    ''
  ).trim();

  const estimatedVoyageDays = Number(
    (Number(state.estimatedVoyageDays ?? state.totalDays ?? state.daysTotal) > 0 ? (state.estimatedVoyageDays ?? state.totalDays ?? state.daysTotal) : null) ??
    (Number(liveContext.estimatedVoyageDays) > 0 ? liveContext.estimatedVoyageDays : null) ??
    (typeof document !== 'undefined' ? document.getElementById('voyage-days')?.value : null) ??
    state.estimatedVoyageDays ??
    liveContext.estimatedVoyageDays ??
    0
  ) || 0;

  const ballastDays = Number(
    (Number(state.ballastDays ?? state.daysBallast ?? state.diasLastre) > 0 ? (state.ballastDays ?? state.daysBallast ?? state.diasLastre) : null) ??
    (Number(liveContext.ballastDays) > 0 ? liveContext.ballastDays : null) ??
    (typeof document !== 'undefined' ? document.getElementById('input-ballastDays')?.value : null) ??
    state.ballastDays ??
    liveContext.ballastDays ??
    0
  ) || 0;

  const flatContext = {
    suite: "SeaCharter Core PRO",
    modulo_actual: moduloActual,
    vista_activa: vistaActiva,
    pol,
    pod,
    commodity,
    cargoType,
    cargoQty,
    loadRate,
    dischargeRate,
    breakEven,
    fleteUnitario,
    tceDiario,
    freightTerms,
    vesselType,
    estimatedVoyageDays,
    ballastDays
  };

  // Excluir explícitamente cualquier campo pesado o duplicado
  delete flatContext.sensitivityAnalysis;
  delete flatContext.rawDocumentText;
  delete flatContext.madreUltimaAuditoria;
  delete flatContext.reporte_estrategico;
  delete flatContext.reporteEstrategico;
  delete flatContext.fullAuditData;

  return flatContext;
}

  // 5. activeScreenContext: aislar cuando hay auditoría documental activa
  // Deja activeScreenContext vacío ({}) salvo que el usuario tenga datos reales introducidos en la calculadora
  let activeScreenContext = {};

  if (hasAuditDocOrReport) {
    if (hasRealCalculatorData()) {
      const liveContext = typeof getCoreProUIContext === 'function' ? getCoreProUIContext() : {};
      const liveState = typeof window !== 'undefined' ? (window.State || {}) : {};
      activeScreenContext = buildFlatActiveScreenContext(liveContext, liveState);
    } else {
      activeScreenContext = {};
    }
  } else {
    const liveContext = typeof getCoreProUIContext === 'function' ? getCoreProUIContext() : {};
    const liveState = typeof window !== 'undefined' ? (window.State || {}) : {};
    activeScreenContext = buildFlatActiveScreenContext(liveContext, liveState);
  }

  return {
    documentType: documentType || null,
    documentName: documentName || (rawDocumentText ? 'Documento en memoria' : null),
    fullAuditData,
    rawDocumentText: rawDocumentText || '',
    activeScreenContext: activeScreenContext || {},
    userLanguage
  };
}

/**
 * Valida si existe un documento, expediente o informe auditado cargado en el módulo activo.
 * Directriz de Gobernanza SeaCharter:
 * 1. NO VINCULAR EXPEDIENTES VACÍOS AL ARRANCAR: Nunca auto-vincular expedientes por defecto
 *    (ej. RDM/2026-0000 o estado inicial vacío) sin rawDocumentText ni auditoría previa.
 * 2. Requiere contenido real comprobable: texto íntegro (> 20 chars), auditoría previa en memoria,
 *    o dictámenes y cláusulas reales en el visor de auditoría.
 */
function hasActiveDocumentOrAudit(payload) {
  if (!payload) return false;

  const rawText = (payload.rawDocumentText || '').trim();
  const hasRealRawText = rawText.length > 20;

  const hasPriorAudit = Boolean(
    payload.fullAuditData?.madreUltimaAuditoria ||
    payload.fullAuditData?.carrierOfferAudit ||
    payload.fullAuditData?.commercialNpl ||
    (typeof window !== 'undefined' && (
      window.madreUltimaAuditoria ||
      window.SeaCharterCarrierOfferAudit ||
      window.lastCommercialNplPayload ||
      window.activeAuditResult ||
      window.lastAuditData
    ))
  );

  const isAuditModule = payload.fullAuditData?.modulo_activo === 'auditoria';
  const hasAuditTables = Boolean(
    isAuditModule &&
    Array.isArray(payload.fullAuditData?.tablas) &&
    payload.fullAuditData.tablas.some(t => t.rows && t.rows.length > 0)
  );

  const hasAuditAlerts = Boolean(
    isAuditModule &&
    Array.isArray(payload.fullAuditData?.alertas) &&
    payload.fullAuditData.alertas.length > 0
  );

  const hasDocumentInMemory = Boolean(
    typeof window !== 'undefined' && (
      window.State?.uploadedFile?.text ||
      (window.State?.uploadedFile?.name && (hasRealRawText || hasPriorAudit)) ||
      window.State?.rawDocumentText ||
      window.activeDocumentText
    )
  );

  const docName = (payload.documentName || '').trim();
  const isDefaultOrEmptyRef = !docName ||
    docName === 'Documento en memoria' ||
    /^RDM\/\d{4}-0000$/i.test(docName) ||
    /^RDM\/\d{4}-TBN$/i.test(docName);

  // Si es un expediente por defecto (RDM/2026-0000) o sin nombre, NUNCA auto-vincular sin texto real ni auditoría previa
  if (isDefaultOrEmptyRef && !hasRealRawText && !hasPriorAudit) {
    return false;
  }

  // Requiere contenido real comprobable
  return Boolean(
    hasRealRawText ||
    hasPriorAudit ||
    hasAuditTables ||
    hasAuditAlerts ||
    (hasDocumentInMemory && !isDefaultOrEmptyRef)
  );
}

/**
 * Botón sutil para copiar el informe de auditoría al portapapeles.
 * Copia en doble formato: text/html con estilos inline (compatible con Outlook)
 * y text/plain limpio (sin ###, ** ni backticks) para texto plano / WhatsApp.
 */
function CopyReportButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const ok = await copyMarkdownForOutlook(text);
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 hover:bg-teal-50 px-2 py-0.5 rounded transition-all cursor-pointer"
      title="Copiar informe al portapapeles (formato Outlook)"
    >
      <span>{copied ? '✓ Copiado' : '📋 Copiar informe'}</span>
    </button>
  );
}

/**
 * Botón compacto que copia solo el borrador de correo de la sección 4
 * (Asunto/saludo → firma), excluyendo bloques internos, break-even o margen.
 * No se muestra si el mensaje no contiene un borrador de correo.
 */
function CopyCounterproposalEmailButton({ text }) {
  const [copied, setCopied] = useState(false);
  const email = React.useMemo(() => extractCounterproposalEmail(text), [text]);
  if (!email) return null;

  const handleCopy = async () => {
    try {
      const ok = await copyMarkdownForOutlook(email);
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 px-2 py-0.5 rounded transition-all cursor-pointer"
      title="Copiar solo el correo de contrapropuesta, listo para enviar"
    >
      <span>{copied ? '✓ Correo copiado' : '✉️ Copiar correo contrapropuesta'}</span>
    </button>
  );
}

function isTableSeparator(line) {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  let inner = trimmed;
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  const cells = inner.split('|').map(c => c.trim());
  if (cells.length === 0) return false;
  return cells.every(c => /^:?-{1,}:?$/.test(c));
}

function parseTableAlignments(separatorLine) {
  let inner = separatorLine.trim();
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  return inner.split('|').map(c => {
    const trimmed = c.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'text-center';
    if (right) return 'text-right';
    return 'text-left';
  });
}

function splitRowCells(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(c => c.trim());
}

function isTableRow(line) {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (trimmed.startsWith('#') || /^[-*•]\s+/.test(trimmed) || /^---{1,}$/.test(trimmed)) return false;
  return true;
}

/**
 * Componente para renderizar formato Markdown estructurado (tablas responsivas, negritas, listas y títulos)
 */
function MarkdownMessage({ content }) {
  if (!content) return null;

  const lines = String(content).split('\n');
  const elements = [];
  let currentList = null;

  const renderFormattedInline = (str) => {
    if (!str) return '';
    const parts = String(str).split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return <strong key={idx} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const flushList = (key) => {
    if (!currentList) return null;
    const items = currentList;
    currentList = null;
    return (
      <ul key={`list-${key}`} className="my-1.5 space-y-0.5 list-disc list-inside">
        {items.map((item, idx) => (
          <li key={idx} className="text-xs leading-relaxed text-slate-800">{renderFormattedInline(item)}</li>
        ))}
      </ul>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Detección de Tabla GFM estándar (con o sin barras iniciales/finales, y con separadores |---| o |:---|)
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      if (currentList) elements.push(flushList(i));

      const headers = splitRowCells(line);
      const alignments = parseTableAlignments(lines[i + 1]);
      const rows = [];
      i++; // Avanzar sobre la línea separadora

      // Capturar todas las filas consecutivas de la tabla
      while (i + 1 < lines.length && isTableRow(lines[i + 1]) && !isTableSeparator(lines[i + 1])) {
        i++;
        const rowCells = splitRowCells(lines[i]);
        while (rowCells.length < headers.length) {
          rowCells.push('');
        }
        rows.push(rowCells);
      }

      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-2 rounded-lg border border-gray-200 shadow-2xs">
          <table className="min-w-full divide-y divide-gray-200 text-xs border-collapse">
            {headers.length > 0 && (
              <thead className="bg-slate-100 font-bold text-slate-800">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className={`px-3 py-2 ${alignments[hIdx] || 'text-left'} font-bold text-slate-800 border-b border-gray-200 text-xs uppercase tracking-wider bg-slate-100`}
                    >
                      {renderFormattedInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={rIdx % 2 === 0 ? 'bg-white hover:bg-slate-50/60 transition-colors' : 'bg-slate-50/40 hover:bg-slate-50/80 transition-colors'}
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-3 py-2 ${alignments[cIdx] || 'text-left'} text-slate-700 font-normal border-b border-gray-100 align-top`}
                    >
                      {renderFormattedInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 2. Listas con viñetas
    if (/^[-*•]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*•]\s+/, '');
      if (!currentList) {
        currentList = [itemText];
      } else {
        currentList.push(itemText);
      }
      continue;
    } else if (currentList) {
      elements.push(flushList(i));
    }

    // 3. Separadores ---
    if (/^---{1,}$/.test(trimmed)) {
      elements.push(<hr key={i} className="my-2.5 border-gray-200" />);
      continue;
    }

    // 4. Encabezados Markdown
    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-bold text-xs sm:text-sm text-slate-900 mt-2 mb-1">{renderFormattedInline(trimmed.replace('### ', ''))}</h4>);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-bold text-sm text-slate-900 mt-2.5 mb-1 border-b border-gray-200 pb-0.5">{renderFormattedInline(trimmed.replace('## ', ''))}</h3>);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-extrabold text-sm sm:text-base text-slate-900 mt-3 mb-1.5">{renderFormattedInline(trimmed.replace('# ', ''))}</h2>);
      continue;
    }

    if (!trimmed) {
      elements.push(<div key={i} className="h-1" />);
      continue;
    }

    elements.push(
      <p key={i} className="leading-relaxed my-0.5 text-xs text-slate-800 break-words">
        {renderFormattedInline(line)}
      </p>
    );
  }

  if (currentList) elements.push(flushList('end'));

  return <div className="space-y-0.5 text-xs text-slate-800 leading-relaxed font-sans">{elements}</div>;
}

if (typeof window !== 'undefined') {
  window.SEACHARTER_DOM_DICTIONARY = SEACHARTER_DOM_DICTIONARY;
  window.capturarDomModuloActivo = capturarDomModuloActivo;
  window.detectarModuloActual = detectarModuloActual;
  window.getCoreProUIContext = getCoreProUIContext;
  window.hasRealCalculatorData = hasRealCalculatorData;
  window.extractDynamicAuditContext = extractDynamicAuditContext;
  window.hasActiveDocumentOrAudit = hasActiveDocumentOrAudit;
  window.isSimpleGreetingOrCourtesy = isSimpleGreetingOrCourtesy;
  window.triggerLaserScanEffect = triggerLaserScanEffect;
  window.ejecutarEscaneoVisual = ejecutarEscaneoVisual;
  window.ejecutarEfectoLaserScan = ejecutarEfectoLaserScan;
  window.extractStructuredCoreProData = extractStructuredCoreProData;
  window.extraerDatosEstructuradosCorePro = extraerDatosEstructuradosCorePro;
  window.compactPayload = compactPayload;
  window.ejecutarEscaneoCompleto = ejecutarEscaneoCompleto;
  window.ejecutarEscaneoDosTiempos = ejecutarEscaneoDosTiempos;
  window.buildMotherExecutiveScript = buildMotherExecutiveScript;
  window.formatMotherVerdict = formatMotherVerdict;
  window.playNeuralMotherVoice = playNeuralMotherVoice;
}

export function GlobalMadreDrawer({
  isOpen = false,
  onClose,
  isMuted: controlledIsMuted,
  onMuteToggle,
  onReset,
}) {
  const [isMadreOpen, setIsMadreOpen] = useState(isOpen);
  const [internalIsMuted, setInternalIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [activeAuditContext, setActiveAuditContext] = useState(null);
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
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const nodeRef = useRef(null);

  const currentAudioRef = useRef(null);
  const playbackVersionRef = useRef(0);
  const voiceStateRef = useRef({ muted: false, open: isOpen });
  const activeAuditContextRef = useRef(null);
  activeAuditContextRef.current = typeof activeAuditContext !== 'undefined' ? activeAuditContext : null;
  const scanFocusQuestionRef = useRef(null);
  const isMuted = controlledIsMuted !== undefined ? controlledIsMuted : internalIsMuted;
  voiceStateRef.current = { muted: isMuted, open: isMadreOpen };

  const stopCurrentAudio = () => {
    playbackVersionRef.current += 1;
    const audio = currentAudioRef.current;
    currentAudioRef.current = null;
    if (!audio) return;
    try {
      if (typeof audio.stop === 'function') audio.stop();
      else if (typeof audio.pause === 'function') {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch (_) {}
    try { audio.disconnect?.(); } catch (_) {}
  };

  useEffect(() => {
    setIsMadreOpen(isOpen);
    if (!isOpen) {
      stopCurrentAudio();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isMuted || !isMadreOpen) stopCurrentAudio();
  }, [isMuted, isMadreOpen]);

  useEffect(() => {
    if (isMadreOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isMadreOpen]);

  // Cuando MADRE se cierra, el globo/mapa 3D debe expandirse al 100% del ancho
  useEffect(() => {
    if (!isMadreOpen && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
      if (window.GlobalFleetGlobe?.resize) {
        try { window.GlobalFleetGlobe.resize(); } catch (_) {}
      }
    }
  }, [isMadreOpen]);

  // Global event bridge
  useEffect(() => {
    const handleToggle = () => {
      setIsMadreOpen((prev) => {
        const nextState = !prev;
        if (!nextState) {
          stopCurrentAudio();
        }
        return nextState;
      });
    };
    
    // Regla estricta: MADRE SOLO debe abrirse si el usuario hace clic explícitamente
    // en el botón de su avatar en el Header o si invoca el sistema mediante el Wake Word por voz.
    // Nunca debe reaccionar abriéndose solo tras terminar un cálculo o estimación en SeaCharter.
    const handleOpen = (e) => {
      if (e?.detail?.fromCalculation || e?.fromCalculation) {
        console.warn('[MADRE] Apertura automática por cálculo bloqueada según directriz de gobernanza.');
        return;
      }
      setIsMadreOpen(true);
    };

    const handleWakeWord = () => {
      // Apertura permitida: Invocación explícita mediante Wake Word por voz
      setIsMadreOpen(true);
    };
    
    const handleCloseEvent = () => {
      setIsMadreOpen(false);
      stopCurrentAudio();
    };

    const handleScanEvent = (e) => {
      setIsMadreOpen(true);
      const question = e?.detail?.userFocusQuestion ?? inputValueRef.current ?? (inputRef?.current?.value || '');
      if (typeof handleScan === 'function') {
        handleScan(null, question);
      }
    };

    window.addEventListener('madre:toggle', handleToggle);
    window.addEventListener('madre:open', handleOpen);
    window.addEventListener('madre:wake-word', handleWakeWord);
    window.addEventListener('madre:close', handleCloseEvent);
    window.addEventListener('madre:scan', handleScanEvent);

    // EXPOSE TO GLOBAL WINDOW SO HTML BUTTON CAN FIRE IT
    if (typeof window !== 'undefined') {
      window.openMadreDrawer = handleOpen;
      window.abrirPanelMadre = (opts) => {
        if (opts?.fromCalculation) {
          console.warn('[MADRE] Apertura automática rechazada tras cálculo.');
          return;
        }
        handleOpen(opts);
      };
      window.closeMadreDrawer = handleCloseEvent;
      window.toggleMadreDrawer = handleToggle;
      window.scanMadreScreen = (question) => {
        setIsMadreOpen(true);
        if (typeof handleScan === 'function') {
          handleScan(null, question);
        }
      };
      window.getCoreProUIContext = getCoreProUIContext;
      window.buildMotherExecutiveScript = buildMotherExecutiveScript;
      window.playNeuralMotherVoice = playNeuralMotherVoice;
    }

    return () => {
      window.removeEventListener('madre:toggle', handleToggle);
      window.removeEventListener('madre:open', handleOpen);
      window.removeEventListener('madre:wake-word', handleWakeWord);
      window.removeEventListener('madre:close', handleCloseEvent);
      window.removeEventListener('madre:scan', handleScanEvent);
      stopCurrentAudio();
    };
  }, []);

  const speakText = async (text, stateForVoice = null) => {
    if (voiceStateRef.current.muted || !voiceStateRef.current.open) return;
    try {
      stopCurrentAudio();
      const clean = String(text || '')
        .replace(/[*#_`~>\[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return;
      const version = playbackVersionRef.current;
      const shouldPlay = () => version === playbackVersionRef.current
        && !voiceStateRef.current.muted && voiceStateRef.current.open;
      const audioInstance = await playNeuralMotherVoice(clean, {
        shouldPlay,
        onReady: (source) => { currentAudioRef.current = source; },
        onEnded: (source) => {
          if (currentAudioRef.current === source) currentAudioRef.current = null;
        },
      });
      if (audioInstance && !shouldPlay()) {
        try { audioInstance.stop(); } catch (_) {}
        if (currentAudioRef.current === audioInstance) currentAudioRef.current = null;
      }
    } catch (_) {}
  };

  const handleMuteToggle = () => {
    const nextMuted = !voiceStateRef.current.muted;
    voiceStateRef.current.muted = nextMuted;
    stopCurrentAudio();
    if (typeof onMuteToggle === 'function') {
      onMuteToggle(nextMuted);
    } else {
      setInternalIsMuted(nextMuted);
    }
  };
  const toggleMute = handleMuteToggle;

  const handleReset = () => {
    setActiveAuditContext(null);
    scanFocusQuestionRef.current = null;
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
    stopCurrentAudio();
  };

  const handleClose = () => {
    voiceStateRef.current.open = false;
    stopCurrentAudio();
    if (typeof onClose === 'function') {
      onClose();
    }
    setIsMadreOpen(false);
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
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript); // Actualiza la UI

      if (event.results[0].isFinal) {
        // Auto-envío del comando sin requerir clic manual
        await handleSendMessage(transcript);
      }
    };

    recognition.start();
  };

  const handleSendMessage = async (overrideText = null) => {
    const queryText = (typeof overrideText === 'string' ? overrideText : inputValue).trim();
    if (!queryText || isLoading) return;

    // Desbloquear / reanudar explícitamente AudioContext ante interacción de usuario antes del fetch
    try {
      const AudioCtxClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (typeof AudioCtxClass === 'function') {
        if (!window.__madreUserAudioCtx || window.__madreUserAudioCtx.state === 'closed') {
          try { window.__madreUserAudioCtx = new AudioCtxClass(); } catch (_) {}
        }
        if (window.__madreUserAudioCtx && window.__madreUserAudioCtx.state === 'suspended' && typeof window.__madreUserAudioCtx.resume === 'function') {
          window.__madreUserAudioCtx.resume().catch(() => {});
        }
      }
    } catch (_) {}

    stopCurrentAudio();
    const textToProcess = queryText;
    const voiceRequestVersion = playbackVersionRef.current;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      role: 'user',
      text: textToProcess,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const isScanCommand = SCAN_COMMAND_REGEX.test(queryText);
    const checkGreeting = (typeof isSimpleGreetingOrCourtesy === 'function')
      ? isSimpleGreetingOrCourtesy
      : (typeof window !== 'undefined' && typeof window.isSimpleGreetingOrCourtesy === 'function')
        ? window.isSimpleGreetingOrCourtesy
        : (txt) => Boolean(txt && /^(?:hola|buenas|buenos\s+dias|hi|hello|gracias|ok)\b/i.test(String(txt).trim()));
    const isGreeting = checkGreeting(queryText);
    const focusQuestionFromScan = typeof scanFocusQuestionRef !== 'undefined' ? scanFocusQuestionRef?.current : null;
    if (typeof scanFocusQuestionRef !== 'undefined' && scanFocusQuestionRef) {
      scanFocusQuestionRef.current = null;
    }

    let extractedAudit = null;
    try {
      if (typeof extractDynamicAuditContext === 'function') {
        extractedAudit = extractDynamicAuditContext();
      }
    } catch (_) {}

    // NO VINCULAR EXPEDIENTES VACÍOS AL ARRANCAR:
    // El chip y estado de documento vinculado SOLO se activa cuando el usuario pulsa explícitamente Escanear
    // o haya cargado/analizado un documento con contenido real (nunca en saludos ni estados iniciales vacíos).
    const hasNewAudit = Boolean(
      !isGreeting &&
      extractedAudit &&
      typeof hasActiveDocumentOrAudit === 'function' &&
      hasActiveDocumentOrAudit(extractedAudit)
    );
    let effectiveAudit = typeof activeAuditContextRef !== 'undefined' ? activeAuditContextRef?.current : null;
    if (hasNewAudit && extractedAudit) {
      effectiveAudit = extractedAudit;
      setActiveAuditContext(extractedAudit);
    }
    // SALUDOS SIMPLES SIEMPRE AL CHAT ESTÁNDAR:
    // Si el mensaje es un saludo o cortesía breve, se envía SIEMPRE como chat normal (sin scanMode: "audit_critical")
    const hasCriticalAudit = Boolean(effectiveAudit && !isGreeting);

    let scanData = null;
    if (SCAN_COMMAND_REGEX.test(queryText)) {
      triggerLaserScanEffect();
      try {
        if (typeof window !== 'undefined' && typeof window.ejecutarEscaneoCompleto === 'function') {
          scanData = await window.ejecutarEscaneoCompleto();
        } else if (typeof ejecutarEscaneoCompleto === 'function') {
          scanData = await ejecutarEscaneoCompleto();
        }
      } catch (scanErr) {
        console.warn('[MADRE Scan] Error al ejecutar escaneo completo:', scanErr);
      }

      const pendingMessage = (typeof getScanPendingMessage === 'function')
        ? getScanPendingMessage(typeof window !== 'undefined' ? window.State : {})
        : null;
      if (pendingMessage && !hasCriticalAudit) {
        const pendingAssistantMessage = {
          id: Date.now() + 1,
          sender: 'assistant',
          role: 'assistant',
          text: pendingMessage,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, pendingAssistantMessage]);
        setIsLoading(false);
        (async () => {
          try {
            if (voiceRequestVersion !== playbackVersionRef.current) return;
            await speakText(pendingMessage, typeof window !== 'undefined' ? window.State : {});
          } catch (voiceErr) {
            console.warn('[MADRE Voice] Reproducción de voz omitida o fallida:', voiceErr);
          }
        })();
        return;
      }
    }

    const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : { get: () => null };
    const projectRef = (urlParams.get && urlParams.get('ref')) || (typeof window !== 'undefined' && window.location?.hash?.match(/ref=([^&]+)/)?.[1]) || "RDM/2026-TBN";

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

    const moduloActualDetectado = typeof capturarDomModuloActivo === 'function'
      ? (capturarDomModuloActivo()?.modulo_actual || "calculadora")
      : "calculadora";
    const capturaDOM = typeof capturarDomModuloActivo === 'function'
      ? capturarDomModuloActivo(moduloActualDetectado)
      : null;

    const payload = {
      suite: "SeaCharter Core PRO",
      current_module: "core_pro",
      modulo_actual: moduloActualDetectado,
      mensajeUsuario: textToProcess,
      message: textToProcess,
      prompt: textToProcess,
      history: cleanHistory,
      modo: "manual",
      tipo: "texto",
      tipo_interaccion: "manual",
      tipo_entrada: "teclado",
      origen: "teclado",
      interaccion_manual: true,
      chat_activo: true,
      active_chat: true,
      input_source: "chat",
      input_type: "text",
      canal: "chat",
      bypass_wake_word: true,
      wake_word: false,
      wakeWord: false,
      require_wake_word: false,
      is_text: true,
      from_input: true,
      isGreeting: isGreeting,
      context: {
        origin: "SeaCharter Core PRO",
        suite: "SeaCharter Core PRO",
        modulo_actual: moduloActualDetectado,
        projectRef: projectRef,
        userName: "Esteban", // Injected for Data Bridge personalization parity
        modo: "manual",
        tipo_interaccion: "manual",
        interaccion_manual: true,
        chat_activo: true,
        input_source: "chat",
        input_type: "text",
        bypass_wake_word: true,
        wake_word: false,
        modo_standby: false
      },
      contexto_ui: getCoreProUIContext()
    };

    payload.contexto_ui = {
      ...(payload.contexto_ui || {}),
      modo: "manual",
      interaccion_manual: true,
      tipo_interaccion: "manual",
      bypass_wake_word: true,
      wake_word: false,
      isGreeting: isGreeting
    };

    if (hasCriticalAudit && effectiveAudit) {
      payload.scanMode = "audit_critical";
      if (effectiveAudit.activeScreenContext && typeof effectiveAudit.activeScreenContext === 'object') {
        delete effectiveAudit.activeScreenContext.sensitivityAnalysis;
        delete effectiveAudit.activeScreenContext.rawDocumentText;
        delete effectiveAudit.activeScreenContext.madreUltimaAuditoria;
        delete effectiveAudit.activeScreenContext.reporte_estrategico;
        delete effectiveAudit.activeScreenContext.reporteEstrategico;
        delete effectiveAudit.activeScreenContext.fullAuditData;
      }
      payload.auditPayload = effectiveAudit;
      const focusQuestion = focusQuestionFromScan !== null
        ? focusQuestionFromScan
        : (isScanCommand ? "" : textToProcess);
      payload.userFocusQuestion = focusQuestion;
      payload.userLanguage = effectiveAudit.userLanguage || (typeof localStorage !== 'undefined' && (localStorage.getItem('seacharter_lang') || localStorage.getItem('rodahmar_lang'))) || "es";
      if (!effectiveAudit.activeScreenContext || Object.keys(effectiveAudit.activeScreenContext).length === 0) {
        payload.contexto_ui = {};
      }
    }

    const contextoUI = payload.contexto_ui || {};
    payload.pol = contextoUI.pol || '';
    payload.pod = contextoUI.pod || '';
    payload.port_pol = contextoUI.pol || '';
    payload.port_pod = contextoUI.pod || '';
    payload.cargoQty = contextoUI.cargoQty || 0;
    payload.tonnage = contextoUI.cargoQty || 0;
    payload.cargo_qty = contextoUI.cargoQty || 0;
    payload.loadRate = contextoUI.loadRate || 0;
    payload.loading_rate = contextoUI.loadRate || 0;
    payload.ratePOL = contextoUI.loadRate || 0;
    payload.ritmo_carga = contextoUI.loadRate || 0;
    payload.dischargeRate = contextoUI.dischargeRate || 0;
    payload.discharge_rate = contextoUI.dischargeRate || 0;
    payload.ratePOD = contextoUI.dischargeRate || 0;
    payload.ritmo_descarga = contextoUI.dischargeRate || 0;
    payload.commodity = contextoUI.commodity || '';
    payload.cargoType = contextoUI.commodity || '';
    payload.viaje = {
      pol: contextoUI.pol || '',
      pod: contextoUI.pod || '',
      tonnage: contextoUI.cargoQty || 0,
      cargoQty: contextoUI.cargoQty || 0,
      loadingRate: contextoUI.loadRate || 0,
      loadRate: contextoUI.loadRate || 0,
      ritmo_carga: contextoUI.loadRate || 0,
      dischargeRate: contextoUI.dischargeRate || 0,
      ritmo_descarga: contextoUI.dischargeRate || 0,
      ratePOL: contextoUI.loadRate || 0,
      ratePOD: contextoUI.dischargeRate || 0,
      commodity: contextoUI.commodity || ''
    };
    if (payload.context) {
      payload.context.pol = contextoUI.pol || '';
      payload.context.pod = contextoUI.pod || '';
      payload.context.cargoQty = contextoUI.cargoQty || 0;
      payload.context.loadRate = contextoUI.loadRate || 0;
      payload.context.dischargeRate = contextoUI.dischargeRate || 0;
    }

    // Inyección directa del resultado del escáner en tiempo real (sobrescribe datos viejos/congelados)
    if (scanData && scanData.datos) {
      payload.contexto_ui = payload.contexto_ui || {};
      payload.contexto_ui.escaneo_estructurado = scanData.datos;
      payload.contexto_ui.modulos_1_a_10 = scanData.datos.bloques || payload.contexto_ui.modulos_1_a_10;
      payload.contexto_ui.resumen_operativo = scanData.datos.resumen || payload.contexto_ui.resumen_operativo;

      const b1 = scanData.datos.bloques?.bloque_1_derrota_puertos;
      const b2 = scanData.datos.bloques?.bloque_2_buque_carga_limpieza;
      const b6 = scanData.datos.bloques?.bloque_6_resumen_operacion_costes;
      const b10 = scanData.datos.bloques?.bloque_10_simulador_negociacion_contraofertas;

      // 1. Variable clave: cargoQty
      if (b2?.toneladas_carga != null && Number(b2.toneladas_carga) > 0) {
        const qty = Number(b2.toneladas_carga);
        payload.cargoQty = qty;
        payload.tonnage = qty;
        payload.cargo_qty = qty;
        payload.contexto_ui.cargoQty = qty;
        payload.contexto_ui.tonnage = qty;
        payload.contexto_ui.cargo_qty = qty;
        if (!payload.contexto_ui.parametros_activos) payload.contexto_ui.parametros_activos = {};
        payload.contexto_ui.parametros_activos.cargoQty = qty;
        if (payload.context) payload.context.cargoQty = qty;
        if (payload.viaje) {
          payload.viaje.cargoQty = qty;
          payload.viaje.tonnage = qty;
        }
      }

      // 2. Variable clave: mercancia / commodity
      const mercancia = b2?.commodity || b2?.categoria_carga;
      if (mercancia) {
        payload.commodity = mercancia;
        payload.mercancia = mercancia;
        payload.cargoType = mercancia;
        payload.contexto_ui.commodity = mercancia;
        payload.contexto_ui.mercancia = mercancia;
        payload.contexto_ui.cargoType = mercancia;
        if (payload.context) {
          payload.context.commodity = mercancia;
          payload.context.mercancia = mercancia;
        }
        if (payload.viaje) {
          payload.viaje.commodity = mercancia;
          payload.viaje.cargoType = mercancia;
        }
      }

      // 3. Variable clave: métodos operativos
      const metodoCarga = b2?.metodo_carga;
      const metodoDescarga = b2?.metodo_descarga;
      if (metodoCarga) {
        payload.metodo_carga = metodoCarga;
        payload.contexto_ui.metodo_carga = metodoCarga;
      }
      if (metodoDescarga) {
        payload.metodo_descarga = metodoDescarga;
        payload.contexto_ui.metodo_descarga = metodoDescarga;
      }
      payload.metodos_operativos = {
        metodo_carga: metodoCarga || payload.metodo_carga || '',
        metodo_descarga: metodoDescarga || payload.metodo_descarga || ''
      };
      payload.contexto_ui.metodos_operativos = payload.metodos_operativos;

      if (b2?.ritmo_carga_tpd != null && Number(b2.ritmo_carga_tpd) > 0) {
        const rc = Number(b2.ritmo_carga_tpd);
        payload.loadRate = rc;
        payload.loading_rate = rc;
        payload.ratePOL = rc;
        payload.ritmo_carga = rc;
        payload.ritmo_carga_tpd = rc;
        payload.contexto_ui.loadRate = rc;
        payload.contexto_ui.loading_rate = rc;
        payload.contexto_ui.ratePOL = rc;
        payload.contexto_ui.ritmo_carga = rc;
        payload.contexto_ui.ritmo_carga_tpd = rc;
        if (payload.viaje) {
          payload.viaje.loadRate = rc;
          payload.viaje.loadingRate = rc;
          payload.viaje.ratePOL = rc;
          payload.viaje.ritmo_carga = rc;
        }
        if (payload.context) payload.context.loadRate = rc;
      }

      if (b2?.ritmo_descarga_tpd != null && Number(b2.ritmo_descarga_tpd) > 0) {
        const rd = Number(b2.ritmo_descarga_tpd);
        payload.dischargeRate = rd;
        payload.discharge_rate = rd;
        payload.ratePOD = rd;
        payload.ritmo_descarga = rd;
        payload.ritmo_descarga_tpd = rd;
        payload.contexto_ui.dischargeRate = rd;
        payload.contexto_ui.discharge_rate = rd;
        payload.contexto_ui.ratePOD = rd;
        payload.contexto_ui.ritmo_descarga = rd;
        payload.contexto_ui.ritmo_descarga_tpd = rd;
        if (payload.viaje) {
          payload.viaje.dischargeRate = rd;
          payload.viaje.ratePOD = rd;
          payload.viaje.ritmo_descarga = rd;
        }
        if (payload.context) payload.context.dischargeRate = rd;
      }

      // Puertos y derrotas
      if (b1?.pol) {
        payload.pol = b1.pol;
        payload.port_pol = b1.pol;
        payload.contexto_ui.pol = b1.pol;
        payload.contexto_ui.port_pol = b1.pol;
        if (payload.context) payload.context.pol = b1.pol;
        if (payload.viaje) payload.viaje.pol = b1.pol;
      }
      if (b1?.pod) {
        payload.pod = b1.pod;
        payload.port_pod = b1.pod;
        payload.contexto_ui.pod = b1.pod;
        payload.contexto_ui.port_pod = b1.pod;
        if (payload.context) payload.context.pod = b1.pod;
        if (payload.viaje) payload.viaje.pod = b1.pod;
      }

      // Break-even y flete
      if (b6?.break_even_usd_mt != null && Number(b6.break_even_usd_mt) > 0) {
        const be = Number(b6.break_even_usd_mt);
        payload.breakEven = be;
        payload.breakEvenUnitario = be;
        payload.contexto_ui.breakEvenUnitario = be;
        if (!payload.contexto_ui.parametros_activos) payload.contexto_ui.parametros_activos = {};
        payload.contexto_ui.parametros_activos.breakEven = be;
      }
      if (b10?.flete_venta_fletador_mt != null && Number(b10.flete_venta_fletador_mt) > 0) {
        const fv = Number(b10.flete_venta_fletador_mt);
        payload.fleteUnitario = fv;
        payload.contexto_ui.fleteUnitario = fv;
      }
      if (b10?.tce_obtenido_usd_dia != null) {
        const tce = Number(b10.tce_obtenido_usd_dia);
        payload.tceDiario = tce;
        payload.contexto_ui.tceDiario = tce;
      }
    }

    const stateForVoice = {
      ...(typeof window !== 'undefined' ? window.State : {}),
      breakEven: payload.contexto_ui?.parametros_activos?.breakEven || payload.contexto_ui?.breakEvenUnitario || payload.breakEven || 0,
      cargoQty: payload.contexto_ui?.parametros_activos?.cargoQty || payload.contexto_ui?.cargoQty || payload.cargoQty || 0,
      demurrageRate: payload.contexto_ui?.parametros_activos?.demurrageRate || 0,
      commodity: payload.commodity || payload.contexto_ui?.commodity || ''
    };

    if (SCAN_COMMAND_REGEX.test(queryText) && !/(?:mercado|market|spot)/i.test(queryText)) {
      let finalReply = buildMotherExecutiveScript(stateForVoice);
      void finalReply;
    }

    try {
      let data = {};

      const response = await fetch(MADRE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(safeCloneForJson(payload)),
      });

      try {
        data = await response.json();
      } catch (jsonErr) {
        console.warn('[MADRE] Advertencia: La respuesta no es JSON puro o está vacía.', jsonErr);
      }

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      // Mostrar el resultado real del servidor, procesando el veredicto comercial y operativo unificado
      const finalReply = data.respuesta || data.reply || formatMotherVerdict(data, stateForVoice);
      if (typeof window !== 'undefined' && data && (data.veredicto_general || data.reporte_estrategico)) {
        window.madreUltimaAuditoria = data;
      }
      if (typeof finalReply !== 'string' || !finalReply.trim()) {
        throw new Error('MADRE no devolvió una respuesta válida.');
      }

      // 1. Mostrar inmediatamente la respuesta en el chat (ÉXITO GARANTIZADO)
      const assistantMessage = {
        id: Date.now() + 1,
        sender: 'assistant',
        role: 'assistant',
        text: finalReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 2. Disparar la voz de MADRE siempre que el altavoz del drawer esté activo (no silenciado)
      // y exista texto en data.voiceSummary || data.mensaje_voz || data.reply, sin exigir longitud mínima ni bloquear respuestas cortas/saludos
      const textToVocalize = data.voiceSummary || data.mensaje_voz || finalReply;
      if (!voiceStateRef.current.muted && textToVocalize) {
        (async () => {
          try {
            if (voiceRequestVersion !== playbackVersionRef.current) return;
            await speakText(textToVocalize, stateForVoice);
          } catch (voiceErr) {
            console.warn('[MADRE Voice] Reproducción de voz omitida o fallida:', voiceErr);
          }
        })();
      }

    } catch (err) {
      console.error('[MADRE] Error crítico de red:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          role: 'assistant',
          text: 'Error de conexión de red con el Cerebro Central.',
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUnlock = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioCtxClass === 'function') {
        if (!window.__madreUserAudioCtx || window.__madreUserAudioCtx.state === 'closed') {
          try { window.__madreUserAudioCtx = new AudioCtxClass(); } catch (_) {}
        }
        if (window.__madreUserAudioCtx && window.__madreUserAudioCtx.state === 'suspended' && typeof window.__madreUserAudioCtx.resume === 'function') {
          window.__madreUserAudioCtx.resume().catch(() => {});
        }
      }
    } catch (_) {}
  };

  const handleSubmit = async (e, overridePrompt) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    handleAudioUnlock();
    const queryText = (typeof overridePrompt === 'string' ? overridePrompt : inputValue);
    await handleSendMessage(queryText);
  };

  const handleScan = async (e, forcedQuestion = null) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const questionToFocus = typeof forcedQuestion === 'string' ? forcedQuestion : inputValue;
    scanFocusQuestionRef.current = questionToFocus ? questionToFocus.trim() : "";
    await handleSubmit(e, "Escanear y auditar pantalla Core PRO");
  };

  if (!isMadreOpen) return null;

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" cancel="button, .madre-header-controls">
      <aside
        ref={nodeRef}
        className="fixed bottom-4 right-4 z-[9999] w-[450px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col text-gray-800 overflow-hidden"
      >
        {/* HEADER A PRUEBA DE CONFLICTOS CSS */}
        <header className="drag-handle cursor-move bg-white border-b border-gray-100 p-3 flex justify-between items-center select-none w-full overflow-hidden gap-4">
          
          <div className="flex flex-row items-center gap-2 shrink-0 pointer-events-none">
            <img src="/MADRE.png" alt="MADRE" className="w-6 h-6 rounded-full shadow-sm shrink-0" />
            <span className="font-bold text-sm text-gray-800">MADRE</span>
            <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">Cerebro Central</span>
          </div>

          <div className="madre-header-controls flex flex-row items-center justify-end gap-1.5 shrink-0">
            <button 
              type="button" 
              id="btn-madre-scan-screen"
              onClick={handleScan} 
              className="text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-md px-2 py-1 text-xs font-semibold flex flex-row items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Escanear Pantalla"
            >
              <span className="text-emerald-600 font-bold text-sm">⚡</span>
              <span className="hidden sm:inline-block">Escanear</span>
            </button>
            <button type="button" onClick={toggleMute} className="text-gray-600 hover:bg-gray-100 rounded-md w-7 h-7 flex items-center justify-center transition-colors text-sm cursor-pointer shrink-0" title={isMuted ? 'Activar voz' : 'Silenciar voz'}>
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button type="button" onClick={handleReset} className="text-gray-600 hover:bg-gray-100 rounded-md w-7 h-7 flex items-center justify-center transition-colors text-sm cursor-pointer shrink-0" title="Reiniciar">
              🔄
            </button>
            <button type="button" onClick={handleClose} className="text-gray-600 hover:bg-gray-100 rounded-md w-7 h-7 flex items-center justify-center transition-colors font-bold text-sm cursor-pointer shrink-0" title="Cerrar">
              ✕
            </button>
          </div>
          
        </header>

        {/* ETIQUETA VISUAL DISCRETA DE DOCUMENTO VINCULADO (MEMORIA DE SESIÓN) */}
        {activeAuditContext && (
          <div className="bg-teal-50 border-b border-teal-100 px-3 py-1.5 flex items-center justify-between text-xs text-teal-900">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-teal-600 font-bold">📄</span>
              <span className="truncate">Documento vinculado: <strong>{activeAuditContext.documentName || activeAuditContext.documentType || 'Expediente Activo'}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setActiveAuditContext(null)}
              className="text-teal-700 hover:text-teal-950 font-bold ml-2 px-1 hover:bg-teal-100 rounded cursor-pointer shrink-0"
              title="Desvincular documento de la sesión"
            >
              [x]
            </button>
          </div>
        )}

        {/* CUERPO DEL CHAT LIMPIO */}
        <div className="overflow-y-auto max-h-[60vh] min-h-[300px] bg-gray-50 p-4 flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col w-full ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`text-xs max-w-[90%] sm:max-w-[88%] leading-relaxed font-medium p-3 rounded-xl shadow-sm border ${m.sender === 'user' ? 'bg-blue-50 border border-blue-100 text-gray-800 whitespace-pre-wrap' : m.isError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border border-gray-200 text-gray-800'}`}>
                {m.sender === 'assistant' && !m.isError ? (
                  <>
                    <MarkdownMessage content={m.text} />
                    <div className="mt-2 pt-1 border-t border-gray-100 flex flex-wrap justify-end gap-1">
                      <CopyCounterproposalEmailButton text={m.text} />
                      <CopyReportButton text={m.text} />
                    </div>
                  </>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="text-xs text-teal-700 font-medium animate-pulse flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping"></span> Procesando audio y respuesta...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* FOOTER */}
        <div className="bg-white border-t border-gray-100 p-3 flex gap-2 items-center shrink-0">
          <button type="button" onClick={handleMicClick} disabled={isLoading} className="flex items-center justify-center w-9 h-9 rounded-lg text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors disabled:opacity-50 shrink-0 cursor-pointer">
            🎙️
          </button>
          <form onSubmit={handleSubmit} className="flex gap-2 flex-1">
            <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} disabled={isLoading} placeholder="Comando a MADRE..." className="bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-lg p-2 w-full text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all" />
            <button type="submit" onClick={handleAudioUnlock} disabled={isLoading || !inputValue.trim()} className="px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shrink-0 cursor-pointer">
              Enviar
            </button>
          </form>
        </div>
      </aside>
    </Draggable>
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
  hasOperationalInputData,
  hasRealCalculatorData,
  PENDING_OPERATION_MESSAGE,
  ejecutarEscaneoCompleto,
  ejecutarEscaneoDosTiempos,
  buildMotherExecutiveScript,
  formatMotherVerdict,
  playNeuralMotherVoice,
  extractDynamicAuditContext,
  hasActiveDocumentOrAudit,
  isSimpleGreetingOrCourtesy,
  MarkdownMessage,
  CopyReportButton,
  CopyCounterproposalEmailButton
};

export default GlobalMadreDrawer;
