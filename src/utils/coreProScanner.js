/**
 * Core PRO Visual Scanner & 10-Block Modular Data Extractor for MADRE
 * 
 * Requisitos:
 * 1. Efecto Visual de Escaneo (Luz Verde Láser #10B981, top: 0 -> top: 100vh en ~1.2s).
 * 2. Extracción Estructurada Bloque por Bloque (Módulos 1 al 10 desde Header hasta Footer).
 * 3. Empaquetado Compacto y Optimizado para inyección en contexto_ui hacia madre-chat.js.
 */

// Regex para identificar comandos o frases de escaneo en la conversación
export const SCAN_COMMAND_REGEX = /(?:escan(?:ear|eo)?|scan(?:ner)?|auditar?\s+pantalla|analizar?\s+pantalla|revisar?\s+pantalla|inspeccionar?\s+pantalla|leer?\s+pantalla)/i;

/**
 * Utilidades seguras de lectura del DOM
 */
function safeQuery(selector, context = null) {
  if (typeof document === 'undefined') return null;
  const root = context || document;
  try {
    return typeof root.querySelector === 'function' ? root.querySelector(selector) : null;
  } catch (_) {
    return null;
  }
}

function safeQueryAll(selector, context = null) {
  if (typeof document === 'undefined') return [];
  const root = context || document;
  try {
    return typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll(selector)) : [];
  } catch (_) {
    return [];
  }
}

function safeGetText(selector, fallback = '') {
  const el = safeQuery(selector);
  if (!el) return fallback;
  if ('value' in el && typeof el.value === 'string' && el.value.trim().length > 0) {
    return el.value.trim();
  }
  return (el.textContent || '').trim() || fallback;
}

function safeGetNumber(selector, fallback = null) {
  const raw = safeGetText(selector, '');
  if (!raw) return fallback;
  const cleaned = raw.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
}

function safeGetChecked(selector, fallback = false) {
  const el = safeQuery(selector);
  return el && typeof el.checked === 'boolean' ? el.checked : fallback;
}

/**
 * 1. EFECTO VISUAL DE ESCANEO (LUZ VERDE LÁSER)
 * - div superpuesto: position: fixed, top: 0, left: 0, width: 100vw, height: 4px, z-index: 999999
 * - color verde esmeralda: #10B981 con resplandor box-shadow: 0 0 20px #10B981, 0 0 40px #10B981
 * - transición fluida top: 0 -> top: 100vh en aprox 1.2 segundos y posterior eliminación del DOM
 */
export function triggerLaserScanEffect() {
  if (typeof document === 'undefined' || !document.body) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    // Si ya existiera una línea de escaneo previa, removerla limpiamente
    const existing = document.getElementById('madre-laser-scan-line');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const laser = document.createElement('div');
    laser.id = 'madre-laser-scan-line';
    laser.setAttribute('data-testid', 'madre-laser-scanner');
    laser.setAttribute('aria-hidden', 'true');

    // Estilos exactos según especificación
    laser.style.position = 'fixed';
    laser.style.top = '0';
    laser.style.left = '0';
    laser.style.width = '100vw';
    laser.style.height = '4px';
    laser.style.zIndex = '999999';
    laser.style.backgroundColor = '#10B981';
    laser.style.boxShadow = '0 0 20px #10B981, 0 0 40px #10B981';
    laser.style.pointerEvents = 'none';
    laser.style.transition = 'top 1.2s cubic-bezier(0.25, 1, 0.5, 1)';

    document.body.appendChild(laser);

    // Forzar reflujo del layout para garantizar que arranque en top: 0
    void laser.offsetHeight;

    const cleanup = () => {
      if (laser.parentNode) {
        laser.parentNode.removeChild(laser);
      }
      resolve(true);
    };

    laser.addEventListener('transitionend', cleanup, { once: true });
    // Temporizador de seguridad por si la ventana o tab pierde el foco
    setTimeout(cleanup, 1350);

    // Iniciar descenso suave hacia 100vh
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        laser.style.top = '100vh';
      });
    } else {
      setTimeout(() => {
        laser.style.top = '100vh';
      }, 20);
    }
  });
}

// Alias corporativo en español
export const ejecutarEscaneoVisual = triggerLaserScanEffect;
export const ejecutarEfectoLaserScan = triggerLaserScanEffect;

/**
 * 2. EXTRACCIÓN ESTRUCTURADA BLOQUE POR BLOQUE (Módulos 1 al 10)
 * Recorre el DOM de arriba a abajo: desde la Cabecera hasta el Footer.
 */
export function extractStructuredCoreProData() {
  if (typeof document === 'undefined') {
    return {
      metadata: { fuente: 'no-dom' },
      bloques: {}
    };
  }

  // --- CABECERA Y METADATOS DEL ENTORNO ---
  const projectRefInput = safeQuery('#quick-ref');
  const projectRef = projectRefInput?.value?.trim() || (() => {
    if (typeof window !== 'undefined' && window.location) {
      const match = window.location.search?.match(/[?&]ref=([^&#]+)/) || window.location.hash?.match(/ref=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return 'RDM/2026-TBN';
  })();

  const headerSearchImo = safeGetText('#header-vessel-search-input', '');
  const activeMode = safeQuery('#technical-workspace') && !safeQuery('#technical-workspace')?.classList.contains('hidden') ? 'tech' : 'exec';
  const copyrightText = safeGetText('.app-footer', '© 2026 SeaCharter Core PRO. All rights reserved. v1.0.1');

  // --- BLOQUE 1: DERROTA Y PUERTOS ---
  // Distancias, velocidades, días de mar y puerto
  const b1_pol = safeGetText('#port-pol') || safeGetText('#exec-pol', 'Rotterdam');
  const b1_pod = safeGetText('#port-pod') || safeGetText('#exec-pod', 'Houston');
  const b1_dist_ballast = safeGetNumber('#dist-ballast', 0);
  const b1_dist_laden = safeGetNumber('#dist-laden', 0);
  const b1_dist_total = safeGetNumber('#dist-total', (b1_dist_ballast + b1_dist_laden));
  const b1_spd_ballast = safeGetNumber('#spd-ballast', 12.0);
  const b1_spd_laden = safeGetNumber('#spd-laden', 11.5);
  const b1_days_sea_ballast = safeGetNumber('#res-days-ballast', 0);
  const b1_days_sea_laden = safeGetNumber('#res-days-laden', 0);
  const b1_days_sea_total = safeGetNumber('#exec-sea-days', (b1_days_sea_ballast + b1_days_sea_laden));
  const b1_days_port = safeGetNumber('#res-days-port', safeGetNumber('#exec-port-days', 0));
  const b1_days_total = safeGetNumber('#res-days-total', safeGetNumber('#exec-total-days', 0));
  const b1_days_margin = safeGetNumber('#days-margin', safeGetNumber('#res-days-margin', 0));
  const b1_vessel_draft = safeGetNumber('#vessel-draft', null);
  const b1_vessel_loa = safeGetNumber('#vessel-loa', null);
  const b1_radar_status = safeGetText('#ais-radar-status-text', safeGetText('#estimator-route-sync-status', 'Ruta Sincronizada'));

  const bloque1 = {
    pol: b1_pol,
    pod: b1_pod,
    distancia_lastre_nm: b1_dist_ballast,
    distancia_carga_nm: b1_dist_laden,
    distancia_total_nm: b1_dist_total,
    velocidad_lastre_knts: b1_spd_ballast,
    velocidad_carga_knts: b1_spd_laden,
    dias_mar_lastre: b1_days_sea_ballast,
    dias_mar_carga: b1_days_sea_laden,
    dias_mar_total: b1_days_sea_total,
    dias_puerto: b1_days_port,
    dias_totales: b1_days_total,
    dias_margen_clima: b1_days_margin,
    calado_max_buque_m: b1_vessel_draft,
    eslora_max_buque_m: b1_vessel_loa,
    estado_radar_ais: b1_radar_status
  };

  // --- BLOQUE 2: BUQUE, CARGA Y LIMPIEZA ---
  // Tipo de buque, toneladas, commodity, estiba
  const b2_vessel_name = safeGetText('#nombre-buque-calculadora') || (typeof window !== 'undefined' && window.State?.vessel) || 'MV TBN BULKER';
  const b2_vessel_type = safeGetText('#vessel-badge') || safeGetText('#exec-vessel-type') || safeGetText('#cargo-vessel-class-display', 'Handysize / Geared Bulker');
  const b2_dwt = safeGetNumber('#vessel-dwt', safeGetNumber('#vessel-identity-dwt', 35000));
  const b2_gt = safeGetNumber('#vessel-identity-gt', null);
  const b2_flag = safeGetText('#vessel-identity-flag', safeGetText('#vessel-flag', 'Panama'));
  const b2_year = safeGetNumber('#vessel-identity-year', 2018);
  const b2_imo = safeGetText('#vessel-identity-imo', headerSearchImo || '');
  const b2_cargo_qty = safeGetNumber('#cargo-qty', safeGetNumber('#exec-cargo-qty', 30000));
  const b2_cargo_cat = safeGetText('#cargo-type', 'Granel Seco / Dry Bulk');
  const b2_commodity = safeGetText('#cargo-product', safeGetText('#cargo-type-manual', safeGetText('#exec-cargo-type', 'Carga General / Siderúrgicos')));
  const b2_cp_standard = safeGetText('#charter-party-standard', 'GENCON 1994');
  const b2_nav_strategy = (typeof window !== 'undefined' && window.State?.navigationStrategy) || (safeQuery('#nav-strategy-full')?.classList.contains('active') ? 'Full Speed' : 'Eco Speed');
  const b2_has_scrubber = safeGetChecked('#vessel-has-scrubber-yes', false);
  const b2_rate_load = safeGetNumber('#rate-load', safeGetNumber('#exec-load-rate', 5000));
  const b2_rate_disch = safeGetNumber('#rate-disch', safeGetNumber('#exec-disch-rate', 2500));
  const b2_load_method = safeGetText('#metodo_carga', 'Grúas del Buque (Ship Cranes)');
  const b2_disch_method = safeGetText('#metodo_descarga', 'Medios de Tierra (Shore Cranes)');
  const b2_stevedoring_terms = safeGetText('#terms-stevedoring', 'FIOS - Free In and Out Stowed');
  const b2_cleaning = safeGetText('#vessel-hold-cleaning', 'Grain Clean / Holds inspected and passed prior loading');

  const bloque2 = {
    nombre_buque: b2_vessel_name,
    tipo_buque: b2_vessel_type,
    dwt_tm: b2_dwt,
    gt: b2_gt,
    bandera: b2_flag,
    año_construccion: b2_year,
    imo: b2_imo,
    toneladas_carga: b2_cargo_qty,
    categoria_carga: b2_cargo_cat,
    commodity: b2_commodity,
    poliza_estandar: b2_cp_standard,
    estrategia_navegacion: b2_nav_strategy,
    scrubber: b2_has_scrubber,
    ritmo_carga_tpd: b2_rate_load,
    ritmo_descarga_tpd: b2_rate_disch,
    metodo_carga: b2_load_method,
    metodo_descarga: b2_disch_method,
    estiba_terminos: b2_stevedoring_terms,
    limpieza_bodegas: b2_cleaning
  };

  // --- BLOQUE 3: BUNKERS Y GASTOS ---
  // Precios de IFO/MGO, consumos, PDAs POL y POD
  const b3_price_vlsfo = safeGetNumber('#price-sea', 610.0);
  const b3_price_ifo = safeGetNumber('#price-ifo', 480.0);
  const b3_price_mgo = safeGetNumber('#price-port', safeGetNumber('#mgo-price', 830.0));
  const b3_cons_sea = safeGetNumber('#cons-sea', 5.5);
  const b3_cons_port = safeGetNumber('#cons-port', 0.5);
  const b3_cons_anchorage = safeGetNumber('#cons-anchorage', 0.8);
  const b3_pda_pol = safeGetNumber('#pda-pol', 0);
  const b3_pda_pod = safeGetNumber('#pda-pod', 0);
  const b3_extras_canal = safeGetNumber('#pda-misc', 0);
  const b3_selected_canal = safeGetText('#selected-canal', 'Auto');
  const b3_stevedoring_cost = safeGetNumber('#stevedoring-costs', 0);
  const b3_cargo_surcharge = safeGetNumber('#cargo-surcharge', 0);
  const b3_seca_pol = safeGetText('#seca-pol-indicator', 'Fuera de Zona SECA');
  const b3_seca_pod = safeGetText('#seca-pod-indicator', 'Fuera de Zona SECA');

  const bloque3 = {
    precio_vlsfo_usd: b3_price_vlsfo,
    precio_ifo380_usd: b3_price_ifo,
    precio_mgo_usd: b3_price_mgo,
    consumo_mar_tpd: b3_cons_sea,
    consumo_puerto_tpd: b3_cons_port,
    consumo_fondeo_tpd: b3_cons_anchorage,
    pda_pol_usd: b3_pda_pol,
    pda_pod_usd: b3_pda_pod,
    extras_canal_usd: b3_extras_canal,
    canal_seleccionado: b3_selected_canal,
    coste_estiba_usd: b3_stevedoring_cost,
    recargo_carga_usd: b3_cargo_surcharge,
    zona_seca_pol: b3_seca_pol,
    zona_seca_pod: b3_seca_pod
  };

  // --- BLOQUE 4: OPEX Y PARÁMETROS AVANZADOS ---
  // Costes diarios, bandera, PSC
  const b4_opex_daily = safeGetNumber('#opex-daily', 4500.0);
  const b4_psc_status = safeGetText('#vessel-psc', 'low (<= 3 deficiencias)');
  const b4_cost_capex = safeGetNumber('#res-cost-capex', 0);

  const bloque4 = {
    costes_diarios_opex_usd: b4_opex_daily,
    bandera: b2_flag,
    historial_inspecciones_psc: b4_psc_status,
    coste_capex_usd: b4_cost_capex
  };

  // --- BLOQUE 5: AJUSTES INTELIGENTES Y TIEMPOS / SMART CALCULATIONS ---
  const b5_eta_radar = safeGetText('#eta-radar', safeGetText('#res-base-eta', ''));
  const b5_delta_hist = safeGetNumber('#delta-historico', 0);
  const b5_tug_cost = safeGetNumber('#t-remolcadores', 0);
  const b5_weather_pol = safeGetNumber('#factor-clima', 0);
  const b5_anchorage_pol = safeGetNumber('#t-fondeo', 0);
  const b5_weather_pod = safeGetNumber('#factor-clima-pod', 0);
  const b5_anchorage_pod = safeGetNumber('#t-fondeo-pod', 0);
  const b5_risk_impact = safeGetText('#res-risk-impact', 'Normal');
  const b5_laycan_days = safeGetNumber('#laycan-dias-libres', 0);
  const b5_eta_final_pol = safeGetText('#res-adjusted-eta', '');
  const b5_eta_final_pod = safeGetText('#res-final-pod-eta', '');
  const b5_adj_days = safeGetNumber('#res-adjusted-days', b1_days_total);

  const bloque5 = {
    eta_base_radar: b5_eta_radar,
    delta_historico_horas: b5_delta_hist,
    coste_remolcadores_usd: b5_tug_cost,
    factor_clima_pol: b5_weather_pol,
    fondeo_pol_horas: b5_anchorage_pol,
    factor_clima_pod: b5_weather_pod,
    fondeo_pod_horas: b5_anchorage_pod,
    impacto_riesgo: b5_risk_impact,
    laycan_dias_libres: b5_laycan_days,
    eta_final_pol: b5_eta_final_pol,
    eta_final_pod: b5_eta_final_pod,
    dias_ajustados_totales: b5_adj_days
  };

  // --- BLOQUE 6: RESUMEN DE OPERACIÓN Y COSTES ---
  // Break-even, ETS estimado, costes totales
  const b6_break_even = safeGetNumber('#res-breakeven', safeGetNumber('#res-cost-base-break-even', safeGetNumber('#exec-buy-freight', 28.5)));
  const b6_cost_total = safeGetNumber('#res-cost-total', 0);
  const b6_cost_bunkers = safeGetNumber('#res-cost-bunker', 0);
  const b6_cost_opex_total = safeGetNumber('#res-cost-opex', 0);
  const b6_cost_pda_total = safeGetNumber('#res-cost-pda', 0);
  const b6_cost_ets = safeGetNumber('#res-cost-ets', safeGetNumber('#res-ets-total-cost', 0));
  const b6_ets_emissions = safeGetNumber('#res-ets-emissions', 0);
  const b6_eu_carbon_price = safeGetNumber('#eu-carbon-price', 75.0);
  const b6_ets_route_type = safeGetText('#ets-route-type', 'Extra-EU (50% Scope)');

  const bloque6 = {
    break_even_usd_mt: b6_break_even,
    coste_total_operacion_usd: b6_cost_total,
    coste_bunkers_total_usd: b6_cost_bunkers,
    coste_opex_total_usd: b6_cost_opex_total,
    coste_puertos_total_usd: b6_cost_pda_total,
    coste_ets_estimado_usd: b6_cost_ets,
    ets_emisiones_mt: b6_ets_emissions,
    precio_carbono_eu_usd: b6_eu_carbon_price,
    tipo_ruta_ets: b6_ets_route_type,
    dias_totales_resumen: b1_days_total
  };

  // --- BLOQUE 7: ANÁLISIS DE FLETES Y RIESGOS ---
  // Spot, COA, primas de riesgo
  const b7_mode = safeQuery('#btn-mode-coa')?.classList.contains('active') ? 'COA' : 'SPOT';
  const b7_freight_sug_chr = safeGetNumber('#res-venta-sugerida', safeGetNumber('#res-sug-charterer', safeGetNumber('#exec-sell-freight', 37.0)));
  const b7_target_margin = safeGetNumber('#target-margin', safeGetNumber('#margin-charterer', 20.0));
  const b7_freight_sug_own = safeGetNumber('#res-sug-owner', b6_break_even * 1.15);
  const b7_jwla_active = safeGetChecked('#input-jwlaRiskActive', false);
  const b7_jwla_usd = safeGetNumber('#input-jwlaPremiumUSD', 0);
  const b7_ballast_extra_days = safeGetNumber('#input-ballastDays', 0);
  const b7_lumpsum_mode = safeGetChecked('#lumpsum-mode', false);
  const b7_lumpsum_sell = safeGetNumber('#res-lumpsum-sell', 0);
  const b7_lumpsum_base_mt = safeGetNumber('#lumpsum-base-mt', b2_cargo_qty);

  const bloque7 = {
    modalidad: b7_mode,
    flete_venta_sugerido_mt: b7_freight_sug_chr,
    margen_objetivo_pct: b7_target_margin,
    flete_sugerido_armador_mt: b7_freight_sug_own,
    primas_riesgo_jwla_activo: b7_jwla_active,
    primas_riesgo_jwla_usd: b7_jwla_usd,
    dias_lastre_adicionales: b7_ballast_extra_days,
    modo_lumpsum_activo: b7_lumpsum_mode,
    flete_lumpsum_venta_usd: b7_lumpsum_sell,
    base_lumpsum_mt: b7_lumpsum_base_mt
  };

  // --- BLOQUE 8: COMPARATIVA DE MERCADO / INTELIGENCIA COMERCIAL ---
  // UN Comtrade, Datalastic
  const b8_market_benchmark = safeGetNumber('#res-market-benchmark-rate', 35.5);
  const b8_market_source = safeGetText('#res-market-benchmark-source', 'Baltic Exchange FFA / Fearnleys Reference');
  const b8_baltic_spot = safeGetNumber('#baltic-spot-value', 36.2);
  const b8_baltic_var = safeGetText('#baltic-spot-variation', '+1.8%');
  const b8_tce_spot_theo = safeGetNumber('#tce-spot-theoretical-value', 14200);
  const b8_tce_spot_class = safeGetText('#tce-spot-theoretical-class', b2_vessel_type);
  const b8_comtrade_active = Boolean(safeQuery('#comtrade-competitiveness-radar'));
  const b8_datalastic_active = safeGetText('#btn-wpi', '').includes('Datalastic activo');

  const bloque8 = {
    benchmark_mercado_mt: b8_market_benchmark,
    fuente_benchmark: b8_market_source,
    baltic_spot_usd: b8_baltic_spot,
    baltic_spot_variacion: b8_baltic_var,
    tce_spot_teorico_usd_dia: b8_tce_spot_theo,
    tce_spot_teorico_clase: b8_tce_spot_class,
    mercado_dry_bulk_tc: {
      capesize: safeGetNumber('#market-intel-capesize-tc', 24500),
      panamax: safeGetNumber('#market-intel-panamax-tc', 16800),
      supramax: safeGetNumber('#market-intel-supramax-tc', 14100),
      handysize: safeGetNumber('#market-intel-handysize-tc', 11900),
      bdi_index: safeGetNumber('#market-intel-bdi-index', 1845)
    },
    radar_un_comtrade_activo: b8_comtrade_active,
    datalastic_activo: b8_datalastic_active
  };

  // --- BLOQUE 9: MATRIZ DE RIESGO Y PENALIZACIONES / INSPECCIONES PSC ---
  const b9_risk_matrix_status = safeGetText('#auto-risk-status', 'Analizado');
  const b9_risk_tooltip = safeGetText('#auto-risk-tooltip', 'Margen operativo evaluado');
  const b9_demurrage_rate = safeGetNumber('#demurrage-rate', 8500.0);
  const b9_dispatch_active = safeGetChecked('#dispatch-clause-active', true);
  const b9_dispatch_pct = safeGetNumber('#dispatch-pct', 50.0);
  const b9_kill_switch = Boolean(safeQuery('#core-kill-switch-alert') && !safeQuery('#core-kill-switch-alert')?.classList.contains('hidden'));

  const bloque9 = {
    estado_matriz_riesgo: b9_risk_matrix_status,
    alerta_riesgo_margen: b9_risk_tooltip,
    tarifa_demurrage_usd_dia: b9_demurrage_rate,
    clausula_despacho_activa: b9_dispatch_active,
    despacho_pct: b9_dispatch_pct,
    inspecciones_psc_nivel: b4_psc_status,
    kill_switch_activo: b9_kill_switch
  };

  // --- BLOQUE 10: SIMULADOR DE NEGOCIACIÓN Y CONTRAOFERTAS ---
  // TCE final, fletes de oferta y margen comercial
  const b10_freight_buy = safeGetNumber('#freight-rate', safeGetNumber('#exec-buy-freight', 29.0));
  const b10_freight_sell = safeGetNumber('#freight-sell', safeGetNumber('#exec-sell-freight', 37.0));
  const b10_comm_pct = safeGetNumber('#comm-pct', 2.5);
  const b10_net_owner = safeGetNumber('#res-net-profit-owner', 0);
  const b10_tce_obtained = safeGetNumber('#res-tce-label', safeGetNumber('#exec-tce', 13500));
  const b10_net_charterer = safeGetNumber('#res-net-profit-charterer', safeGetNumber('#exec-charterer-profit', 0));
  const b10_spread = safeGetNumber('#negotiation-spread-pmt', safeGetNumber('#exec-spread-mt', (b10_freight_sell - b10_freight_buy)));
  const b10_savings = safeGetNumber('#negotiation-total-savings', 0);
  const b10_owner_offer = safeGetNumber('#negotiation-owner-offer', b10_freight_buy);
  const b10_owner_tce = safeGetText('#negotiation-owner-tce', '');
  const b10_charterer_target = safeGetNumber('#negotiation-charterer-target', b10_freight_sell);
  const b10_target_tce = safeGetText('#negotiation-target-tce', '');
  const b10_break_even_sim = safeGetNumber('#negotiation-break-even', b6_break_even);
  const b10_viability_msg = safeGetText('#negotiation-viability-message', 'Operación Comercialmente Viable');
  const b10_safety_factor = safeGetNumber('#negotiation-safety-factor', 0);
  const b10_mi_client_offer = safeGetNumber('#market-intelligence-client-offer', null);
  const b10_mi_delta = safeGetText('[data-mi-delta-value]', '');

  const bloque10 = {
    flete_compra_armador_mt: b10_freight_buy,
    flete_venta_fletador_mt: b10_freight_sell,
    comisiones_brokerage_pct: b10_comm_pct,
    beneficio_neto_armador_usd: b10_net_owner,
    tce_obtenido_usd_dia: b10_tce_obtained,
    beneficio_neto_fletador_usd: b10_net_charterer,
    spread_comercial_pmt: b10_spread,
    ahorro_total_proyectado_usd: b10_savings,
    oferta_inicial_armador_mt: b10_owner_offer,
    tce_proyectado_armador: b10_owner_tce,
    target_fletador_contraoferta_mt: b10_charterer_target,
    tce_proyectado_target: b10_target_tce,
    break_even_armador_simulador_mt: b10_break_even_sim,
    termometro_viabilidad_msg: b10_viability_msg,
    factor_seguridad_contingencia_pct: b10_safety_factor,
    panel_inteligencia_oferta_cliente_mt: b10_mi_client_offer,
    panel_inteligencia_brecha: b10_mi_delta
  };

  return {
    metadata: {
      expediente_ref: projectRef,
      buque_consultado: headerSearchImo,
      modo_visual: activeMode,
      fecha_escaneo: new Date().toISOString(),
      origen_pantalla: "SeaCharter Core PRO - Navegación Completa",
      footer_copyright: copyrightText
    },
    resumen: {
      ruta: `${b1_pol} ➔ ${b1_pod}`,
      buque: `${b2_vessel_name} (${b2_dwt} DWT)`,
      carga: `${b2_cargo_qty} MT ${b2_commodity}`,
      break_even: b6_break_even,
      flete_venta: b10_freight_sell,
      tce_diario: b10_tce_obtained,
      beneficio_fletador: b10_net_charterer
    },
    bloques: {
      bloque_1_derrota_puertos: bloque1,
      bloque_2_buque_carga_limpieza: bloque2,
      bloque_3_bunkers_gastos: bloque3,
      bloque_4_opex_avanzado: bloque4,
      bloque_5_ajustes_inteligentes: bloque5,
      bloque_6_resumen_operacion_costes: bloque6,
      bloque_7_analisis_fletes_riesgos: bloque7,
      bloque_8_comparativa_mercado_inteligencia: bloque8,
      bloque_9_matriz_riesgo_psc: bloque9,
      bloque_10_simulador_negociacion_contraofertas: bloque10
    }
  };
}

// Alias corporativo en español
export const extraerDatosEstructuradosCorePro = extractStructuredCoreProData;

/**
 * 3. EMPAQUETADO COMPACTO Y OPTIMIZADO PARA NETLIFY FUNCTIONS
 * Elimina valores nulos, vacíos y formatea los números con precisión limpia
 * para mantener el tamaño del JSON HTTP ultra ligero (<2 KB) y prevenir timeouts.
 */
export function compactPayload(data) {
  if (data === null || data === undefined) return undefined;

  if (typeof data === 'number') {
    if (!Number.isFinite(data)) return undefined;
    return Math.round(data * 100) / 100;
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    const cleaned = data
      .map(item => compactPayload(item))
      .filter(item => item !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }

  if (typeof data === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(data)) {
      const compacted = compactPayload(value);
      if (compacted !== undefined) {
        output[key] = compacted;
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  }

  return data;
}

/**
 * Función integral de escaneo: dispara la luz verde láser y retorna los datos
 * estructurados compactos listos para el backend de MADRE.
 */
export async function ejecutarEscaneoCompleto() {
  const [laserOk, datos] = await Promise.all([
    triggerLaserScanEffect(),
    Promise.resolve(extractStructuredCoreProData())
  ]);

  return {
    laserEjecutado: Boolean(laserOk),
    datos: compactPayload(datos)
  };
}

// Exponer en window si estamos en el navegador
if (typeof window !== 'undefined') {
  window.triggerLaserScanEffect = triggerLaserScanEffect;
  window.ejecutarEscaneoVisual = ejecutarEscaneoVisual;
  window.ejecutarEfectoLaserScan = ejecutarEfectoLaserScan;
  window.extractStructuredCoreProData = extractStructuredCoreProData;
  window.extraerDatosEstructuradosCorePro = extraerDatosEstructuradosCorePro;
  window.compactPayload = compactPayload;
  window.ejecutarEscaneoCompleto = ejecutarEscaneoCompleto;
}

export default {
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  ejecutarEscaneoCompleto,
  SCAN_COMMAND_REGEX
};
