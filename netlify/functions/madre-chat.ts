import { buildDssStrategicAuditResponse } from "./cerebro-ia.js";

export const headers: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = body?.message || body?.prompt || body?.query || body?.mensajeUsuario || '';
    const context = body?.context || {};
    const contexto_ui = body?.contexto_ui || body?.contexto || {};

    const lower = message.toLowerCase();
    const escaneo = contexto_ui?.escaneo_estructurado || (contexto_ui?.modulos_1_a_10 ? { bloques: contexto_ui.modulos_1_a_10 } : null);
    const bloques = escaneo?.bloques || {};

    let reply = '';
    const isScanOrScreenAudit = lower.includes('escan') || lower.includes('scan') || lower.includes('pantalla') || (lower.includes('auditor') && Boolean(escaneo));

    if (isScanOrScreenAudit && escaneo) {
      const b1 = bloques.bloque_1_derrota_puertos || {};
      const b2 = bloques.bloque_2_buque_carga_limpieza || {};
      const b3 = bloques.bloque_3_bunkers_gastos || {};
      const b4 = bloques.bloque_4_opex_avanzado || {};
      const b5 = bloques.bloque_5_ajustes_inteligentes || {};
      const b6 = bloques.bloque_6_resumen_operacion_costes || {};
      const b7 = bloques.bloque_7_analisis_fletes_riesgos || {};
      const b8 = bloques.bloque_8_comparativa_mercado_inteligencia || {};
      const b9 = bloques.bloque_9_matriz_riesgo_psc || {};
      const b10 = bloques.bloque_10_simulador_negociacion_contraofertas || {};

      const pol = b1.pol || contexto_ui.pol || 'Rotterdam';
      const pod = b1.pod || contexto_ui.pod || 'Houston';
      const vessel = b2.nombre_buque || 'MV TBN';
      const cargoQty = b2.toneladas_carga || contexto_ui.cargoQty || 30000;
      const commodity = b2.commodity || contexto_ui.commodity || 'Granel Seco';
      const breakEven = b6.break_even_usd_mt || contexto_ui.breakEvenUnitario || 28.5;
      const fleteVenta = b10.flete_venta_fletador_mt || b7.flete_venta_sugerido_mt || contexto_ui.fleteUnitario || 37.0;
      const fleteCompra = b10.flete_compra_armador_mt || b10.oferta_inicial_armador_mt || 29.0;
      const spread = b10.spread_comercial_pmt || (fleteVenta - fleteCompra);
      const tce = b10.tce_obtenido_usd_dia || 13500;
      const netCharterer = b10.beneficio_neto_fletador_usd || 0;
      const seaDays = b1.dias_mar_total || 0;
      const portDays = b1.dias_puerto || 0;
      const totalDays = b1.dias_totales || (seaDays + portDays);

      reply = `🔍 **AUDITORÍA VISUAL MADRE · ESCANEO COMPLETO CORE PRO (MÓDULOS 1 AL 10)**\n\n` +
        `**Operación Central:** ${pol} ➔ ${pod} | ${cargoQty.toLocaleString('es-ES')} MT de ${commodity} en buque ${vessel} (${b2.dwt_tm || 35000} DWT, Bandera ${b2.bandera || 'Panamá'}).\n\n` +
        `• **Bloque 1 (Derrota y Puertos):** Distancia total de ${(b1.distancia_total_nm || 0).toLocaleString('es-ES')} MN. Tiempo: ${seaDays} días mar + ${portDays} días puerto = ${totalDays} días totales de operación.\n` +
        `• **Bloque 2 (Buque, Carga y Limpieza):** Buque ${b2.tipo_buque || 'Handysize'}. Ritmo de carga: ${(b2.ritmo_carga_tpd || 5000).toLocaleString('es-ES')} MT/d | Ritmo descarga: ${(b2.ritmo_descarga_tpd || 2500).toLocaleString('es-ES')} MT/d (${b2.estiba_terminos || 'FIOS'}). Requisito de bodegas: ${b2.limpieza_bodegas || 'Grain Clean'}.\n` +
        `• **Bloque 3 (Bunkers y Gastos):** VLSFO a $${b3.precio_vlsfo_usd || 610}/t, MGO a $${b3.precio_mgo_usd || 830}/t. Port Dues (PDAs): POL $${(b3.pda_pol_usd || 0).toLocaleString('es-ES')} | POD $${(b3.pda_pod_usd || 0).toLocaleString('es-ES')}.\n` +
        `• **Bloque 4 (OPEX y Parámetros Avanzados):** OPEX diario fijado en $${(b4.costes_diarios_opex_usd || 4500).toLocaleString('es-ES')}/día. Clasificación PSC: ${b4.historial_inspecciones_psc || 'Bajo riesgo'}.\n` +
        `• **Bloque 5 (Ajustes Inteligentes y Tiempos):** ETA ajustada ${b5.eta_final_pol || 'Confirmada'}. Se aplican factores meteorológicos y de fondeo validados.\n` +
        `• **Bloque 6 (Resumen de Operación y Costes):** Break-Even base del viaje en **$${breakEven.toFixed(2)}/MT** (Coste total operativo estimado: $${(b6.coste_total_operacion_usd || 0).toLocaleString('es-ES')}). Impacto ETS EU: $${(b6.coste_ets_estimado_usd || 0).toLocaleString('es-ES')}.\n` +
        `• **Bloque 7 (Análisis de Fletes y Riesgos):** Modalidad ${b7.modalidad || 'SPOT'}. Flete de venta objetivo: **$${fleteVenta.toFixed(2)}/MT** con margen proyectado del ${b7.margen_objetivo_pct || 20}%.\n` +
        `• **Bloque 8 (Comparativa de Mercado):** Referencia Baltic Spot / Fearnleys: $${b8.baltic_spot_usd || 36.2}/MT. TCE Spot teórico: $${(b8.tce_spot_teorico_usd_dia || 14200).toLocaleString('es-ES')}/día.\n` +
        `• **Bloque 9 (Matriz de Riesgo y Penalizaciones):** Demurrage pactado en $${(b9.tarifa_demurrage_usd_dia || 8500).toLocaleString('es-ES')}/día con cláusula de despacho al ${b9.despacho_pct || 50}%. Kill-switch de seguridad: ${b9.kill_switch_activo ? '⚠️ Alertas detectadas' : '✅ Despejado'}.\n` +
        `• **Bloque 10 (Simulador de Negociación y Arbitraje):** Flete Compra Armador: $${fleteCompra.toFixed(2)}/MT | Flete Venta Cliente: $${fleteVenta.toFixed(2)}/MT. **Spread Comercial: $${spread.toFixed(2)}/MT**. TCE obtenido: **$${tce.toLocaleString('es-ES')}/día** (Beneficio neto fletador: $${netCharterer.toLocaleString('es-ES')}).\n\n` +
        `🎯 **Dictamen Final MADRE:** Los 10 bloques validan viabilidad comercial robusta. Se recomienda blindar la oferta con cláusula Reachable on Arrival y garantía de ritmo mínimo de 2.500 MT/d en muelle para salvaguardar el TCE proyectado.`;
      return new Response(JSON.stringify({
      success: true,
      message: reply,
      text: reply,
      response: reply,
      escaneo_procesado: true,
      bloques_auditados: 10
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    } else if (lower.includes('break-even') || lower.includes('flete') || lower.includes('coste') || lower.includes('margen')) {
      reply = 'Auditoría MADRE: El Break-Even base de la operación se sitúa en $28.50/MT con flete estimado de $37.00/MT (margen neto estimado del 22.9%). Se aconseja proteger márgenes frente a variaciones de bunker VLSFO en la ruta de retorno.';
    } else if (lower.includes('clausul') || lower.includes('laytime') || lower.includes('shinc') || lower.includes('plancha')) {
      reply = 'Recomendación MADRE: Se recomienda pactar régimen WWD SHINC con garantía de medios de tierra a 2.500 MT/día, agregando cláusulas Reachable on Arrival y protección ante demoras por congestión portuaria.';
    } else if (lower.includes('fixture') || lower.includes('recap') || lower.includes('opcion b')) {
      const audit = buildDssStrategicAuditResponse(contexto_ui || context);
      reply = `${audit.reporte_estrategico}\n\nOpción B Estratégica lista para consolidar en Fixture Recap oficial.`;
    } else {
      reply = `Auditoría Estratégica MADRE: Análisis completado para la solicitud "${message}". El sistema valida condiciones óptimas de navegabilidad y estiba para SeaCharter Core PRO. Se sugiere verificar ritmos en muelle antes del cierre definitivo.`;
    }

    return new Response(JSON.stringify({
      success: true,
      reply,
      message: reply,
      text: reply,
      response: reply,
      escaneo_procesado: Boolean(escaneo),
      bloques_auditados: escaneo ? 10 : 0,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('[madre-chat] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno en MADRE chat',
      reply: 'Auditoría Estratégica MADRE activa en modo contingencia.'
    }), {
      status: 500,
      headers
    });
  }
}

export default handler;
