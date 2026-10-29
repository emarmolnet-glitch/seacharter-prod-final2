import React, { useState, useEffect, useRef } from 'react';
import {
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  SCAN_COMMAND_REGEX,
  ejecutarEscaneoCompleto
} from '../utils/coreProScanner.js';

export const SEACHARTER_DOM_DICTIONARY = {
  "cuartel_general": { "contenedor": "#view-ais", "inputs": ["#header-vessel-search-input", "#tracking-input-vessel", "#tracking-input-pol", "#tracking-input-pod", "#tracking-input-laydays", "#tracking-input-cancelling", "#tracking-input-cargo", "#ais-vessel-class-select", "#ais-radius-select", "#ais-ballast-filter"], "metricas": ["#ais-radar-status-badge", "#ais-kpi-total-vessels", "#ais-kpi-ballast-count", "#ais-kpi-laden-count", "#ais-kpi-fair-freight", "#ais-kpi-avg-dwt", "#ais-kpi-avg-speed", "#tracking-live-connection", "#tracking-live-last-sync", "#vessel-master-preview-card"] },
  "market_intel": { "contenedor": "#market-intel-dashboard", "inputs": ["#market-intel-capesize-tc", "#market-intel-panamax-tc", "#market-intel-supramax-tc", "#market-intel-handysize-tc", "#market-intel-bdi-index", "#market-intel-spot-v2-tc", "#market-intel-vlsfo-price", "#market-intel-lsmgo-price", "#market-intel-ifo380-price", "#market-calibration-factor", "#inverse-tce-target", "#market-intelligence-client-offer"], "metricas": ["#baltic-spot-value", "#baltic-spot-variation", "#tce-spot-theoretical-value", "#res-market-benchmark-rate", "#res-market-benchmark-alert"] },
  "mapa": { "contenedor": "#view-map", "inputs": ["#map-port-ballast", "#map-port-pol", "#map-port-pod", "#map-laycan-date", "#map-cancelling-date"], "metricas": ["#sync-miles-label", "#sync-miles-breakdown", "#sync-pol-label", "#sync-pod-label"] },
  "calculadora": { "contenedor": "#view-estimator", "inputs": ["#port-ballast", "#port-pol", "#port-pod", "#dist-ballast", "#dist-laden", "#dist-total", "#spd-ballast", "#spd-laden", "#nombre-buque-calculadora", "#vessel-dwt", "#cargo-type", "#cargo-qty", "#cargo-sf", "#rate-load", "#rate-disch", "#price-sea", "#price-port", "#pda-pol", "#pda-pod", "#opex-daily", "#margin-charterer", "#margin-owner", "#freight-rate", "#freight-sell", "#demurrage-rate"], "metricas": ["#res-days-sea-total", "#res-days-port", "#res-days-total", "#res-cost-bunker", "#res-cost-pda", "#res-cost-opex", "#res-cost-total", "#res-breakeven", "#res-sug-charterer", "#res-net-profit-charterer", "#res-tce-label", "#negotiation-spread-pmt"] },
  "dossiers": { "contenedor": "#view-dossiers", "inputs": ["#dossiers-search", "#quick-ref"], "metricas": ["#dossiers-count", "#dossiers-table-body"] },
  "decisiones": { "contenedor": "#view-decisiones", "inputs": ["#input-jwlaPremiumUSD", "#input-ballastDays", "#input-freight-all-in", "#input-sim-speed", "#input-sim-loadrate", "#input-sim-bunker-price"], "metricas": ["#badge-jwc-risk", "#section-flete-all-in-gross", "#card-laycan", "#card-loadrate", "#card-financial", "#madre-offcanvas-veredicto-val"] },
  "agenda": { "contenedor": "#market-directory-shell", "inputs": ["#market-directory-search", "#market-contact-company", "#market-contact-name", "#market-contact-role", "#market-contact-country", "#market-contact-imo-input"], "metricas": ["#market-directory-summary", "#market-directory-list"] }
};

/**
 * Detecta el identificador del módulo activo en el DOM de SeaCharter Core PRO
 */
export function detectarModuloActual() {
  if (typeof document === 'undefined') return 'calculadora';

  // 1. Agenda de Brokers abierta (modal/drawer)
  try {
    const agendaShell = document.querySelector('#market-directory-shell');
    if (agendaShell && !agendaShell.hasAttribute('hidden') && agendaShell.getAttribute('aria-hidden') !== 'true' && agendaShell.style.display !== 'none') {
      return 'agenda';
    }
  } catch (_) {}

  // 2. Decisiones DSS activo
  try {
    const viewDecisiones = document.querySelector('#view-decisiones');
    if (viewDecisiones && (!viewDecisiones.classList.contains('hidden') || viewDecisiones.classList.contains('active-block') || viewDecisiones.classList.contains('active-flex'))) {
      return 'decisiones';
    }
  } catch (_) {}

  // 3. Dossiers activo
  try {
    const viewDossiers = document.querySelector('#view-dossiers');
    if (viewDossiers && !viewDossiers.classList.contains('hidden')) {
      return 'dossiers';
    }
  } catch (_) {}

  // 4. Cuartel General / Radar AIS activo
  try {
    const viewAis = document.querySelector('#view-ais');
    if (viewAis && (!viewAis.classList.contains('hidden') || viewAis.classList.contains('active-block') || viewAis.classList.contains('active-flex'))) {
      return 'cuartel_general';
    }
  } catch (_) {}

  // 5. Mapa activo
  try {
    const viewMap = document.querySelector('#view-map');
    if (viewMap && (!viewMap.classList.contains('hidden') || viewMap.classList.contains('active-block') || viewMap.classList.contains('active-flex'))) {
      return 'mapa';
    }
  } catch (_) {}

  // 6. Market Intel activo
  try {
    const currentTab = typeof window !== 'undefined' ? (window.currentTab || window.activeTab) : null;
    if (currentTab === 'market_intel') return 'market_intel';
  } catch (_) {}

  // 7. Estimador / Calculadora
  try {
    const viewEstimator = document.querySelector('#view-estimator');
    if (viewEstimator && (!viewEstimator.classList.contains('hidden') || viewEstimator.classList.contains('active-block') || viewEstimator.classList.contains('active-flex'))) {
      return 'calculadora';
    }
  } catch (_) {}

  // 8. Chequeo por tab global si existe
  if (typeof window !== 'undefined') {
    const tab = window.currentTab || window.activeTab;
    const tabMap = {
      ais: 'cuartel_general',
      map: 'mapa',
      estimator: 'calculadora',
      dossiers: 'dossiers',
      decisiones: 'decisiones',
      agenda: 'agenda',
      market_intel: 'market_intel'
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
          directory: 'agenda'
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
function buildMotherExecutiveScript(state = {}) {
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
 * Reproducción de voz neuronal MADRE conectando con DataBridge (madre-voice.js / ElevenLabs)
 * Reproducción directa en hardware usando Web Audio API (Bypass CSP media-src / blob:)
 */
async function playNeuralMotherVoice(textToSpeak) {
  try {
    // Ajusta la URL base apuntando a la instancia de DataBridge del usuario
    const databridgeUrl = (typeof window !== 'undefined' && window.DATABRIDGE_API_URL) ? window.DATABRIDGE_API_URL : 'https://calm-shortbread-55bcfc.netlify.app';
    const response = await fetch(`${databridgeUrl}/.netlify/functions/madre-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textToSpeak })
    });

    if (!response.ok) throw new Error('Error en DataBridge TTS');

    const arrayBuffer = await response.arrayBuffer();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    return source;
  } catch (error) {
    console.error("Fallo al invocar a Madre neuronal en DataBridge:", error);
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

  // Se lo enviamos TODO a MADRE
  return {
    suite: "SeaCharter Core PRO",
    modulo_actual: moduloActual,
    current_module: "core_pro",
    vista_activa: "Core PRO - Panel y Mapa Operativo",
    vista_dinamica: vistaActivaActual,
    referenciaMadre: referenciaActiva, // <- VITAL PARA QUE NO FALLE NEON
    parametros_activos: params,        // <- AQUÍ VAN LOS GASTOS DE PUERTO
    escaneo_estructurado: escaneoCompacto,
    modulos_1_a_10: escaneoCompacto?.bloques,
    resumen_operativo: escaneoCompacto?.resumen,
    captura_dom: capturaDOM,
    elementos_visibles: capturaDOM?.elementos_visibles,
    pol: escaneoCompacto?.bloques?.bloque_1_derrota_puertos?.pol || 'Rotterdam',
    pod: escaneoCompacto?.bloques?.bloque_1_derrota_puertos?.pod || 'Houston',
    cargoQty: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.toneladas_carga || 30000,
    commodity: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.commodity || 'Siderúrgico / Carga General',
    breakEvenUnitario: escaneoCompacto?.bloques?.bloque_6_resumen_operacion_costes?.break_even_usd_mt || 28.5,
    fleteUnitario: escaneoCompacto?.bloques?.bloque_10_simulador_negociacion_contraofertas?.flete_venta_fletador_mt || escaneoCompacto?.bloques?.bloque_7_analisis_fletes_riesgos?.flete_venta_sugerido_mt || 37.0,
    loadRate: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.ritmo_carga_tpd || 5000,
    dischargeRate: escaneoCompacto?.bloques?.bloque_2_buque_carga_limpieza?.ritmo_descarga_tpd || 2500,
    tceDiario: escaneoCompacto?.bloques?.bloque_10_simulador_negociacion_contraofertas?.tce_obtenido_usd_dia || 13500
  };
}

if (typeof window !== 'undefined') {
  window.SEACHARTER_DOM_DICTIONARY = SEACHARTER_DOM_DICTIONARY;
  window.capturarDomModuloActivo = capturarDomModuloActivo;
  window.detectarModuloActual = detectarModuloActual;
  window.getCoreProUIContext = getCoreProUIContext;
  window.triggerLaserScanEffect = triggerLaserScanEffect;
  window.ejecutarEscaneoVisual = ejecutarEscaneoVisual;
  window.ejecutarEfectoLaserScan = ejecutarEfectoLaserScan;
  window.extractStructuredCoreProData = extractStructuredCoreProData;
  window.extraerDatosEstructuradosCorePro = extraerDatosEstructuradosCorePro;
  window.compactPayload = compactPayload;
  window.ejecutarEscaneoCompleto = ejecutarEscaneoCompleto;
  window.buildMotherExecutiveScript = buildMotherExecutiveScript;
  window.playNeuralMotherVoice = playNeuralMotherVoice;
}

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

  const currentAudioRef = useRef(null);

  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      try {
        if (typeof currentAudioRef.current.stop === 'function') {
          currentAudioRef.current.stop();
        } else if (typeof currentAudioRef.current.pause === 'function') {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
        }
      } catch (_) {}
      currentAudioRef.current = null;
    }
  };

  useEffect(() => {
    setInternalIsOpen(isOpen);
    if (!isOpen) {
      stopCurrentAudio();
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
      setInternalIsOpen(true);
    };

    const handleWakeWord = () => {
      // Apertura permitida: Invocación explícita mediante Wake Word por voz
      setInternalIsOpen(true);
    };
    
    const handleCloseEvent = () => {
      setInternalIsOpen(false);
      stopCurrentAudio();
    };

    window.addEventListener('madre:toggle', handleToggle);
    window.addEventListener('madre:open', handleOpen);
    window.addEventListener('madre:wake-word', handleWakeWord);
    window.addEventListener('madre:close', handleCloseEvent);

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
      window.getCoreProUIContext = getCoreProUIContext;
    }

    return () => {
      window.removeEventListener('madre:toggle', handleToggle);
      window.removeEventListener('madre:open', handleOpen);
      window.removeEventListener('madre:wake-word', handleWakeWord);
      window.removeEventListener('madre:close', handleCloseEvent);
      stopCurrentAudio();
    };
  }, []);

  const speakText = async (text, stateForVoice = null) => {
    if (isMuted || !internalIsOpen) return;
    try {
      stopCurrentAudio();
      const clean = String(text || '')
        .replace(/[*#_`~>\[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return;
      const audioInstance = await playNeuralMotherVoice(clean);
      if (audioInstance) {
        currentAudioRef.current = audioInstance;
      }
    } catch (_) {}
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    if (typeof onMuteToggle === 'function') {
      onMuteToggle(nextMuted);
    } else {
      setInternalIsMuted(nextMuted);
    }
    stopCurrentAudio();
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
    stopCurrentAudio();
  };

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
    setInternalIsOpen(false);
    stopCurrentAudio();
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
    const textToProcess = queryText;
    if (!queryText || isLoading) return;

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

    const urlParams = new URLSearchParams(window.location.search);
    const projectRef = urlParams.get('ref') || window.location.hash.match(/ref=([^&]+)/)?.[1] || "RDM/2026-TBN";

    // Si la consulta solicita escaneo o análisis de pantalla, dispara el efecto láser visual
    if (SCAN_COMMAND_REGEX.test(queryText)) {
      triggerLaserScanEffect();
    }

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

    const moduloActualDetectado = capturarDomModuloActivo()?.modulo_actual || "calculadora";
    const capturaDOM = capturarDomModuloActivo(moduloActualDetectado);

    const payload = {
      suite: "SeaCharter Core PRO",
      modulo_actual: moduloActualDetectado,
      mensajeUsuario: textToProcess,
      message: textToProcess,
      prompt: textToProcess,
      history: cleanHistory,
      context: {
        origin: "SeaCharter Core PRO",
        suite: "SeaCharter Core PRO",
        modulo_actual: moduloActualDetectado,
        projectRef: projectRef,
        userName: "Esteban" // Injected for Data Bridge personalization parity
      },
      contexto_ui: getCoreProUIContext()
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
      let replyText = data?.reply || data?.message || data?.text || 'Auditoría procesada.';

      // Limpieza de impresión en el Chat:
      // Si la consulta es un escaneo explícito de pantalla o auditoría visual de módulos,
      // sustituimos la respuesta por el guion ejecutivo exacto que narra Madre.
      let stateForVoice = {
        ...(typeof window !== 'undefined' ? window.State : {}),
        breakEven: contextoUI.parametros_activos?.breakEven || 0,
        cargoQty: contextoUI.parametros_activos?.cargoQty || 10000,
        demurrageRate: contextoUI.parametros_activos?.demurrageRate || 0
      };
      if (SCAN_COMMAND_REGEX.test(queryText)) {
        const isScanButton = queryText.includes('Escanear y auditar pantalla');
        const isMarketQuery = /(?:mercado|market|spot|baltic|flete)/i.test(queryText);
        const isStrictScan = isScanButton || !isMarketQuery;

        if (isStrictScan) {
          const rawUi = payload?.contexto_ui || {};
          const b6 = rawUi?.modulos_1_a_10?.bloque_6_resumen_operacion_costes || {};
          const b3 = rawUi?.modulos_1_a_10?.bloque_3_bunkers_gastos || {};
          const b9 = rawUi?.modulos_1_a_10?.bloque_9_matriz_riesgo_psc || {};
          stateForVoice = {
            ...stateForVoice,
            breakEven: stateForVoice.breakEven || b6.break_even_usd_mt || rawUi.breakEvenUnitario || 0,
            cargoQty: stateForVoice.cargoQty !== 10000 ? stateForVoice.cargoQty : (rawUi.cargoQty || 10000),
            demurrageRate: stateForVoice.demurrageRate || b9.tarifa_demurrage_usd_dia || 0,
            pdaInyectada: Boolean(stateForVoice.pdaInyectada || b3.pda_pol_usd || b3.pda_pod_usd || rawUi?.parametros_activos?.pda_pol || rawUi?.parametros_activos?.pda_pod),
            riesgosDetectados: Boolean(stateForVoice.riesgosDetectados || b9.kill_switch_activo || (b9.tarifa_demurrage_usd_dia && b9.tarifa_demurrage_usd_dia > 10000))
          };
          replyText = buildMotherExecutiveScript(stateForVoice);
        }
      }

     const assistantMessage = {
  id: Date.now() + 1,
  sender: 'assistant',
  role: 'assistant',
  text: replyText,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

setMessages((prev) => [...prev, assistantMessage]);

try {
  await speakText(replyText, stateForVoice);
} catch (voiceErr) {
  console.warn('Reproducción de voz omitida:', voiceErr);
}
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

  const handleSubmit = async (e, overridePrompt) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const queryText = (typeof overridePrompt === 'string' ? overridePrompt : inputValue);
    await handleSendMessage(queryText);
  };

  if (!internalIsOpen) return null;

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-[9999] w-[450px] max-w-lg bg-[#0B1121] text-slate-300 shadow-2xl border-r border-slate-800/80 flex flex-col font-sans transition-all duration-300"
      style={{ backgroundColor: '#0B1121' }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 shrink-0 bg-[#0B1121] text-slate-200">
        {/* Left side: Logo and Title */}
        <div className="flex items-center gap-2 min-w-0">
          <img src="/MADRE.png" alt="MADRE" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm" />
          <span className="font-bold text-base text-white">MADRE</span>
          <span className="text-[10px] font-mono bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30 shrink-0">Cerebro Central</span>
        </div>

        {/* Right side: Action Buttons (Mute, Reset, Close) */}
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={toggleMute} className="flex items-center justify-center w-8 h-8 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer" title={isMuted ? 'Activar voz' : 'Silenciar voz'}>{isMuted ? '🔇' : '🔊'}</button>
          <button type="button" onClick={handleReset} className="flex items-center justify-center w-8 h-8 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer" title="Reiniciar conversación">🔄</button>
          <button type="button" onClick={handleClose} className="flex items-center justify-center w-8 h-8 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer" title="Cerrar panel">✕</button>
        </div>
      </header>

      {/* Barra de acción rápida: Escaneo Visual Láser */}
      <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/70 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 truncate">Escaneo Visual Core PRO</span>
        </div>
        <button
          type="button"
          id="btn-madre-scan-screen"
          onClick={(e) => {
            triggerLaserScanEffect();
            if (typeof handleSubmit === 'function') {
               // Enviar la petición al instante (One-Click)
               handleSubmit(e, "Escanear y auditar pantalla Core PRO (Módulos 1 al 10)");
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
          title="Disparar escaneo visual láser y auditar módulos 1 al 10"
        >
          <span className="text-emerald-400 font-bold">⚡</span>
          <span>Escanear Pantalla</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col w-full ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`text-xs max-w-[90%] sm:max-w-[88%] leading-relaxed whitespace-pre-wrap font-medium ${
                m.sender === 'user'
                  ? 'bg-teal-950/40 border border-teal-900/50 text-teal-200 rounded-xl p-3 shadow-sm'
                  : m.isError
                  ? 'bg-red-950 border border-red-800 text-red-200 rounded-xl p-3 shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-slate-300 rounded-xl p-3 shadow-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {isLoading && <div className="text-xs text-teal-300 font-medium animate-pulse flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping"></span>Procesando audio y respuesta...</div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-slate-800/80 bg-[#0B1121] flex gap-2 items-center shrink-0">
        <button 
          type="button" 
          onClick={handleMicClick} 
          disabled={isLoading}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-700 text-teal-400 border border-slate-700/50 transition-all cursor-pointer shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          title={isLoading ? 'Procesando...' : 'Dictar por voz'}
        >
          🎙️
        </button>
        <form onSubmit={handleSubmit} className="flex gap-2 flex-1">
          <input 
            ref={inputRef}
            type="text" 
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)} 
            disabled={isLoading}
            placeholder={isLoading ? "Procesando audio..." : "Comando a MADRE..."} 
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
          />
          <button 
            type="submit" 
            disabled={isLoading || !inputValue.trim()}
            className="px-3 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs transition-all font-medium cursor-pointer shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </form>
      </div>
    </aside>
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
  ejecutarEscaneoCompleto,
  buildMotherExecutiveScript,
  playNeuralMotherVoice
};

export default GlobalMadreDrawer;
