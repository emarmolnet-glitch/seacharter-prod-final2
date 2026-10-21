import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

try {
  register(new URL('./jsx-loader.mjs', import.meta.url));
} catch (_) {}

const scannerSource = readFileSync(new URL('../src/utils/coreProScanner.js', import.meta.url), 'utf8');
const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const madreChatSource = readFileSync(new URL('../netlify/functions/madre-chat.ts', import.meta.url), 'utf8');

test('1. Efecto Visual de Escaneo (Luz Verde Láser): Especificaciones de estilo y animación DOM', () => {
  // Div superpuesto con position fixed, top 0, left 0, width 100vw, height 4px, z-index 999999
  assert.match(scannerSource, /laser\.style\.position\s*=\s*['"]fixed['"]/);
  assert.match(scannerSource, /laser\.style\.top\s*=\s*['"]0['"]/);
  assert.match(scannerSource, /laser\.style\.left\s*=\s*['"]0['"]/);
  assert.match(scannerSource, /laser\.style\.width\s*=\s*['"]100vw['"]/);
  assert.match(scannerSource, /laser\.style\.height\s*=\s*['"]4px['"]/);
  assert.match(scannerSource, /laser\.style\.zIndex\s*=\s*['"]999999['"]/);

  // Color verde esmeralda brillante (#10B981) con efecto resplandor láser box-shadow
  assert.match(scannerSource, /laser\.style\.backgroundColor\s*=\s*['"]#10B981['"]/);
  assert.match(scannerSource, /laser\.style\.boxShadow\s*=\s*['"]0 0 20px #10B981, 0 0 40px #10B981['"]/);

  // Transición suave de aproximadamente 1.2 segundos y descenso hacia 100vh
  assert.match(scannerSource, /laser\.style\.transition\s*=\s*['"]top 1\.2s/);
  assert.match(scannerSource, /laser\.style\.top\s*=\s*['"]100vh['"]/);

  // Eliminación del elemento del DOM al finalizar la animación
  assert.match(scannerSource, /laser\.parentNode\.removeChild\(laser\)/);
  assert.match(scannerSource, /laser\.addEventListener\(['"]transitionend['"],\s*cleanup/);
});

test('2. Extracción Estructurada Bloque por Bloque: Cobertura completa de los Módulos 1 al 10', () => {
  // Bloque 1: Derrota y Puertos (Distancias, velocidades, días de mar y puerto)
  assert.match(scannerSource, /bloque_1_derrota_puertos/);
  assert.match(scannerSource, /distancia_lastre_nm/);
  assert.match(scannerSource, /distancia_carga_nm/);
  assert.match(scannerSource, /distancia_total_nm/);
  assert.match(scannerSource, /velocidad_lastre_knts/);
  assert.match(scannerSource, /velocidad_carga_knts/);
  assert.match(scannerSource, /dias_mar_total/);
  assert.match(scannerSource, /dias_puerto/);

  // Bloque 2: Buque, Carga y Limpieza (Tipo de buque, toneladas, commodity, estiba)
  assert.match(scannerSource, /bloque_2_buque_carga_limpieza/);
  assert.match(scannerSource, /tipo_buque/);
  assert.match(scannerSource, /toneladas_carga/);
  assert.match(scannerSource, /commodity/);
  assert.match(scannerSource, /estiba_terminos/);
  assert.match(scannerSource, /limpieza_bodegas/);

  // Bloque 3: Bunkers y Gastos (Precios de IFO/MGO, consumos, PDAs POL y POD)
  assert.match(scannerSource, /bloque_3_bunkers_gastos/);
  assert.match(scannerSource, /precio_vlsfo_usd/);
  assert.match(scannerSource, /precio_ifo380_usd/);
  assert.match(scannerSource, /precio_mgo_usd/);
  assert.match(scannerSource, /consumo_mar_tpd/);
  assert.match(scannerSource, /pda_pol_usd/);
  assert.match(scannerSource, /pda_pod_usd/);

  // Bloque 4: OPEX y Parámetros Avanzados (Costes diarios, bandera, PSC)
  assert.match(scannerSource, /bloque_4_opex_avanzado/);
  assert.match(scannerSource, /costes_diarios_opex_usd/);
  assert.match(scannerSource, /historial_inspecciones_psc/);

  // Bloque 5: Ajustes Inteligentes y Tiempos / Smart Calculations
  assert.match(scannerSource, /bloque_5_ajustes_inteligentes/);
  assert.match(scannerSource, /delta_historico_horas/);
  assert.match(scannerSource, /coste_remolcadores_usd/);
  assert.match(scannerSource, /factor_clima_pol/);

  // Bloque 6: Resumen de Operación y Costes (Break-even, ETS estimado, costes totales)
  assert.match(scannerSource, /bloque_6_resumen_operacion_costes/);
  assert.match(scannerSource, /break_even_usd_mt/);
  assert.match(scannerSource, /coste_total_operacion_usd/);
  assert.match(scannerSource, /coste_ets_estimado_usd/);

  // Bloque 7: Análisis de Fletes y Riesgos (Spot, COA, primas de riesgo)
  assert.match(scannerSource, /bloque_7_analisis_fletes_riesgos/);
  assert.match(scannerSource, /flete_venta_sugerido_mt/);
  assert.match(scannerSource, /primas_riesgo_jwla_activo/);
  assert.match(scannerSource, /modo_lumpsum_activo/);

  // Bloque 8: Comparativa de Mercado / Inteligencia Comercial (UN Comtrade, Datalastic)
  assert.match(scannerSource, /bloque_8_comparativa_mercado_inteligencia/);
  assert.match(scannerSource, /benchmark_mercado_mt/);
  assert.match(scannerSource, /baltic_spot_usd/);
  assert.match(scannerSource, /tce_spot_teorico_usd_dia/);

  // Bloque 9: Matriz de Riesgo y Penalizaciones / Inspecciones PSC
  assert.match(scannerSource, /bloque_9_matriz_riesgo_psc/);
  assert.match(scannerSource, /tarifa_demurrage_usd_dia/);
  assert.match(scannerSource, /clausula_despacho_activa/);

  // Bloque 10: Simulador de Negociación y Contraofertas (TCE final, fletes de oferta y margen comercial)
  assert.match(scannerSource, /bloque_10_simulador_negociacion_contraofertas/);
  assert.match(scannerSource, /flete_compra_armador_mt/);
  assert.match(scannerSource, /flete_venta_fletador_mt/);
  assert.match(scannerSource, /spread_comercial_pmt/);
  assert.match(scannerSource, /tce_obtenido_usd_dia/);
});

test('3. Empaquetado Compacto y Optimizado: compactPayload previene sobrecarga HTTP y timeouts', async () => {
  const { compactPayload } = await import('../src/utils/coreProScanner.js');

  const messyObject = {
    textoLimpio: '   Valor Importante   ',
    textoVacio: '     ',
    nulo: null,
    indefinido: undefined,
    numeroLargo: 123.456789,
    booleano: true,
    anidado: {
      subVacio: '',
      subValido: 'OK',
      subNumero: 42.001
    },
    arrayVacio: ['', null, undefined],
    arrayValido: ['A', 99.999, '']
  };

  const compacted = compactPayload(messyObject);

  assert.equal(compacted.textoLimpio, 'Valor Importante');
  assert.equal(compacted.textoVacio, undefined);
  assert.equal(compacted.nulo, undefined);
  assert.equal(compacted.indefinido, undefined);
  assert.equal(compacted.numeroLargo, 123.46);
  assert.equal(compacted.booleano, true);
  assert.deepEqual(compacted.anidado, { subValido: 'OK', subNumero: 42 });
  assert.equal(compacted.arrayVacio, undefined);
  assert.deepEqual(compacted.arrayValido, ['A', 100]);
});

test('4. Inyección en contexto_ui hacia madre-chat: getCoreProUIContext integra escaneo_estructurado', () => {
  // getCoreProUIContext debe inyectar escaneo_estructurado y modulos_1_a_10
  assert.match(globalMadreDrawerSource, /escaneo_estructurado:\s*escaneoCompacto/);
  assert.match(globalMadreDrawerSource, /modulos_1_a_10:\s*escaneoCompacto\?\.bloques/);

  // Debe disparar triggerLaserScanEffect ante frases o comandos de escaneo
  assert.match(globalMadreDrawerSource, /if\s*\(SCAN_COMMAND_REGEX\.test\(queryText\)\)\s*\{\s*triggerLaserScanEffect\(\);/);

  // Botón directo de escaneo en la interfaz del Drawer
  assert.match(globalMadreDrawerSource, /id="btn-madre-scan-screen"/);
  assert.match(globalMadreDrawerSource, /triggerLaserScanEffect\(\)/);
});

test('5. Backend madre-chat procesa el escaneo estructurado y genera dictamen con los 10 bloques', () => {
  // madre-chat.ts debe procesar peticiones de escaneo y reconocer contexto_ui con los 10 bloques
  assert.match(madreChatSource, /lower\.includes\(['"]escan['"]\)/);
  assert.match(madreChatSource, /bloque_1_derrota_puertos/);
  assert.match(madreChatSource, /bloque_10_simulador_negociacion_contraofertas/);
  assert.match(madreChatSource, /escaneo_procesado:\s*Boolean\(escaneo\)/);
  assert.match(madreChatSource, /bloques_auditados:\s*escaneo \? 10 : 0/);
});

test('6. Ejecución funcional en entorno DOM: Disparo visual y extracción limpia de los 10 bloques', async () => {
  const { triggerLaserScanEffect, extractStructuredCoreProData, compactPayload } = await import('../src/utils/coreProScanner.js');

  const createdElements = [];
  const fakeDoc = {
    body: {
      appendChild: (el) => {
        createdElements.push(el);
        el.parentNode = fakeDoc.body;
      },
      removeChild: (el) => {
        const idx = createdElements.indexOf(el);
        if (idx !== -1) createdElements.splice(idx, 1);
        el.parentNode = null;
      }
    },
    getElementById: (id) => {
      return createdElements.find(el => el.id === id) || null;
    },
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        listeners: {},
        addEventListener: (evt, fn) => { el.listeners[evt] = fn; },
        setAttribute: (k, v) => { el[k] = v; },
        parentNode: null
      };
      return el;
    },
    querySelector: (sel) => {
      if (sel === '#port-pol') return { value: 'Rotterdam', textContent: '' };
      if (sel === '#port-pod') return { value: 'Houston', textContent: '' };
      if (sel === '#dist-total') return { value: '5420', textContent: '' };
      if (sel === '#vessel-dwt') return { value: '38000', textContent: '' };
      if (sel === '#cargo-qty') return { value: '32000', textContent: '' };
      if (sel === '#cargo-product') return { value: 'Bobinas de Acero', textContent: '' };
      if (sel === '#price-sea') return { value: '625.50', textContent: '' };
      if (sel === '#price-port') return { value: '840.00', textContent: '' };
      if (sel === '#pda-pol') return { value: '18500', textContent: '' };
      if (sel === '#pda-pod') return { value: '22000', textContent: '' };
      if (sel === '#opex-daily') return { value: '4700', textContent: '' };
      if (sel === '#res-breakeven') return { value: '', textContent: '$29.40 / MT' };
      if (sel === '#freight-sell') return { value: '38.50', textContent: '' };
      if (sel === '#res-tce-label') return { value: '', textContent: 'TCE: $14,200 / día' };
      return null;
    },
    querySelectorAll: () => []
  };

  const originalDoc = globalThis.document;
  try {
    globalThis.document = fakeDoc;

    // Disparo del efecto visual
    const scanPromise = triggerLaserScanEffect();
    assert.equal(createdElements.length, 1);
    const laser = createdElements[0];
    assert.equal(laser.style.position, 'fixed');
    assert.equal(laser.style.backgroundColor, '#10B981');
    assert.equal(laser.style.boxShadow, '0 0 20px #10B981, 0 0 40px #10B981');
    assert.equal(laser.style.zIndex, '999999');

    // Simular fin de animación
    if (typeof laser.listeners['transitionend'] === 'function') {
      laser.listeners['transitionend']();
    }
    await scanPromise;
    assert.equal(createdElements.length, 0);

    // Extracción estructurada de los 10 bloques
    const extracted = extractStructuredCoreProData();
    assert.ok(extracted.bloques.bloque_1_derrota_puertos);
    assert.equal(extracted.bloques.bloque_1_derrota_puertos.pol, 'Rotterdam');
    assert.equal(extracted.bloques.bloque_1_derrota_puertos.pod, 'Houston');
    assert.equal(extracted.bloques.bloque_1_derrota_puertos.distancia_total_nm, 5420);

    assert.equal(extracted.bloques.bloque_2_buque_carga_limpieza.dwt_tm, 38000);
    assert.equal(extracted.bloques.bloque_2_buque_carga_limpieza.toneladas_carga, 32000);
    assert.equal(extracted.bloques.bloque_2_buque_carga_limpieza.commodity, 'Bobinas de Acero');

    assert.equal(extracted.bloques.bloque_3_bunkers_gastos.precio_vlsfo_usd, 625.5);
    assert.equal(extracted.bloques.bloque_3_bunkers_gastos.pda_pol_usd, 18500);

    assert.equal(extracted.bloques.bloque_4_opex_avanzado.costes_diarios_opex_usd, 4700);
    assert.equal(extracted.bloques.bloque_6_resumen_operacion_costes.break_even_usd_mt, 29.4);
    assert.equal(extracted.bloques.bloque_10_simulador_negociacion_contraofertas.flete_venta_fletador_mt, 38.5);

    // Compactación
    const compacted = compactPayload(extracted);
    assert.ok(compacted.bloques.bloque_1_derrota_puertos);
    assert.ok(compacted.bloques.bloque_10_simulador_negociacion_contraofertas);
  } finally {
    globalThis.document = originalDoc;
  }
});
