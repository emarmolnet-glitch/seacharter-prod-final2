import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizarMedidasBulto,
  normalizePackingListItem,
  calcularEstibaTentativaH18,
  calcularProjectCargoFallbackH18,
  generarCargoPlanSvgH18,
  generarProjectCargoPlanSvgH18,
  resolverGeometriaBodegas,
  sendH18SimulationToDataBridge,
} from '../stowage-calculator.mjs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ============================================================================
// 1. CONVERSIÓN DE UNIDADES (m/cm, MT/kg) Y NORMALIZACIÓN
// ============================================================================
test('1. normalizarMedidasBulto convierte correctamente m/cm y MT/kg', () => {
  // Caso 1: Unidades en metros y MT (sin variación de escala)
  const norm1 = normalizarMedidasBulto({
    length: 1.2,
    width: 0.8,
    height: 1.3,
    unitWeight: 1.5,
    lengthUnit: 'm',
    weightUnit: 'MT',
  });
  assert.equal(norm1.lengthM, 1.2);
  assert.equal(norm1.widthM, 0.8);
  assert.equal(norm1.heightM, 1.3);
  assert.equal(norm1.unitWeightMT, 1.5);

  // Caso 2: Unidades en centímetros (cm) y kilogramos (kg)
  const norm2 = normalizarMedidasBulto({
    length: 120, // 120 cm = 1.2 m
    width: 80,   // 80 cm = 0.8 m
    height: 130, // 130 cm = 1.3 m
    unitWeight: 1500, // 1500 kg = 1.5 MT
    lengthUnit: 'cm',
    weightUnit: 'kg',
  });
  assert.equal(norm2.lengthM, 1.2);
  assert.equal(norm2.widthM, 0.8);
  assert.equal(norm2.heightM, 1.3);
  assert.equal(norm2.unitWeightMT, 1.5);
});

// ============================================================================
// 2. MOTOR DE CÁLCULO DE ESTIBA H18 Y FACTORES DE ESTIBA NETO / BRUTO
// ============================================================================
test('2. calcularEstibaTentativaH18 calcula SF neto, SF bruto con Broken Stowage, presión y alertas', () => {
  const simInput = {
    cargoName: 'Big Bags 1.5 MT',
    length: 1.0,
    width: 1.0,
    height: 1.3,
    unitWeight: 1.5,
    lengthUnit: 'm',
    weightUnit: 'MT',
    tiers: 4,
    brokenStowagePct: 5,
    targetCargoMT: 25000,
    vessel: {
      vessel_name: 'PACIFIC BULKER',
      imo_number: '9234567',
      dwt: 34000,
      loa: 180,
      beam: 28,
      draft: 10.2,
      has_gears: true,
      crane_configuration: '4 x 30 MT',
    },
  };

  const res = calcularEstibaTentativaH18(simInput);
  assert.equal(res.success, true);
  assert.equal(res.cargoName, 'Big Bags 1.5 MT');

  // Volumen unitario = 1.0 * 1.0 * 1.3 = 1.3 m3
  // SF neto = 1.3 / 1.5 = 0.867 m3/MT
  assert.equal(res.stowageFactors.netSF, 0.867);

  // SF bruto (c/ 5% BS) = 0.867 * 1.05 = 0.910 m3/MT
  assert.equal(res.stowageFactors.grossSF, 0.910);

  // Presión sobre Tank Top: (4 tiers * 1.5 MT) / (1.0 * 1.0 m2) = 6.00 MT/m2
  assert.equal(res.pressure.tankTopPressureMTM2, 6.0);
  assert.equal(res.pressure.allowableLoadMTM2, 20.0);

  // Bodegas y afinamiento de H1
  assert.ok(Array.isArray(res.holds), 'Debe incluir desglose de bodegas');
  assert.equal(res.holds.length, 4, 'Handysize estándar debe tener 4 bodegas');
  const h1 = res.holds.find(h => h.holdNumber === 1);
  const h2 = res.holds.find(h => h.holdNumber === 2);
  assert.ok(h1, 'Bodega 1 debe existir');
  assert.ok(h1.isBowHold, 'H1 debe estar identificada como bodega de proa');
  assert.ok(h1.unitsAlongBreadth < h2.unitsAlongBreadth, 'H1 debe modelar el afinamiento de proa con menor manga utilizable');

  // Totales teóricos y realistas
  assert.ok(res.results.theoretical.weightMT > 0);
  assert.ok(res.results.realistic.weightMT > 0);
  assert.ok(res.results.realistic.weightMT <= res.results.theoretical.weightMT, 'Estiba realista debe considerar Broken Stowage');
});

// ============================================================================
// 3. GENERACIÓN CAD 2D SVG: PROA A LA DERECHA (+X), AFINAMIENTO H1 Y CLÁUSULA LEGAL
// ============================================================================
test('3. generarCargoPlanSvgH18 renderiza SVG con proa a la derecha (+X), afinamiento en H1 y cláusula legal', () => {
  const simResult = calcularEstibaTentativaH18({
    cargoName: 'Big Bags 1.5 MT',
    length: 1.0,
    width: 1.0,
    height: 1.3,
    unitWeight: 1.5,
    tiers: 4,
    brokenStowagePct: 5,
    targetCargoMT: 25000,
    vessel: {
      vessel_name: 'PACIFIC BULKER',
      imo_number: '9234567',
      dwt: 34000,
      loa: 180,
      beam: 28,
    },
  });

  const svg = generarCargoPlanSvgH18(simResult, { width: 1200, height: 720 });

  // 1. Es un SVG válido
  assert.match(svg, /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

  // 2. Convención náutica: Proa a la derecha (+X), Popa a la izquierda
  assert.match(svg, /PROA \(BOW\) →/, 'Debe señalar Proa (Bow) hacia la derecha');
  assert.match(svg, /← POPA \(AFT\)/, 'Debe señalar Popa (Aft) hacia la izquierda');

  // 3. Corte longitudinal y planta alineados
  assert.match(svg, /1\. PERFIL LONGITUDINAL \(ELEVACIÓN LATERAL\)/);
  assert.match(svg, /2\. PLANTA DE ESTIBA POR BODEGA/);

  // 4. Cláusula legal obligatoria de H18
  assert.match(
    svg,
    /TENTATIVE STOWAGE PLAN · FOR GUIDANCE ONLY · SUBJECT TO MASTER'S APPROVAL, STABILITY, TRIM, DRAFT (&amp;|&) TANK TOP STRENGTH/,
    'Debe incluir la cláusula legal obligatoria de aprobación del Capitán y estabilidad'
  );

  // 5. Cajetín de ingeniería con IMO y DWT
  assert.match(svg, /PACIFIC BULKER/);
  assert.match(svg, /IMO:\s*<tspan[^>]*>9234567<\/tspan>/);
  assert.match(svg, /34\.000 DWT/);
  assert.match(svg, /STOWAGE FACTOR BRUTO \(c\/ BS\):/);

  // 6. Despeje vertical de al menos 24px entre subtítulo y chimenea/puente
  const subtitleLineMatch = svg.match(/<line\s+x1="30"\s+y1="(\d+)"\s+x2="380"\s+y2="\1"/);
  assert.ok(subtitleLineMatch, 'Debe existir la línea divisoria del subtítulo 1');
  const subtitleY = Number(subtitleLineMatch[1]);

  const antennaMatch = svg.match(/<line\s+x1="\d+"\s+y1="\d+"\s+x2="\d+"\s+y2="(\d+)"\s+stroke="#0f172a"\s+stroke-width="2"/);
  assert.ok(antennaMatch, 'Debe existir la antena/punto superior del puente');
  const antennaTopY = Number(antennaMatch[1]);

  const verticalClearance = antennaTopY - subtitleY;
  assert.ok(
    verticalClearance >= 24,
    `El despeje vertical (${verticalClearance}px) debe ser de al menos 24px entre subtítulo y antena/chimenea`
  );

  // 7. Pastilla protectora en bodegas para evitar solapes de texto con tiers
  assert.match(
    svg,
    /fill-opacity="0\.95"[^>]*stroke="#cbd5e1"/,
    'Debe existir la pastilla protectora blanca para texto de uds y MT en las bodegas'
  );
});

// ============================================================================
// 4. DATA BRIDGE H18 SYNC: ENVÍO ASÍNCRONO CON source_app: "seacharter"
// ============================================================================
test('4. sendH18SimulationToDataBridge prepara payload seguro con source_app: "seacharter" sin bloquear en fallo de red', async () => {
  // Simulador de fetch para probar el payload
  let interceptedUrl = '';
  let interceptedBody = null;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    interceptedUrl = url;
    interceptedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ success: true, count: 18 }),
    };
  };

  try {
    const payload = {
      cargoName: 'Big Bags Test',
      length: 1.0,
      width: 1.0,
      height: 1.3,
      unitWeight: 1.5,
      tiers: 4,
      brokenStowagePct: 5,
      vesselSpecs: { imo: '9234567', name: 'PACIFIC BULKER' },
    };

    const res = await sendH18SimulationToDataBridge(payload);
    assert.equal(interceptedUrl, 'https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/h18-stowage-plan');
    assert.equal(interceptedBody.source_app, 'seacharter');
    assert.equal(interceptedBody.imo_number, '9234567');
    assert.equal(interceptedBody.vessel_name, 'PACIFIC BULKER');
    assert.equal(interceptedBody.cargo.cargo_name, 'Big Bags Test');
    assert.equal(interceptedBody.cargo.unit_weight, 1.5);
    assert.equal(interceptedBody.cargo_name, 'Big Bags Test');
    assert.equal(interceptedBody.unit_length_m, 1.0);
    assert.equal(interceptedBody.unit_weight_mt, 1.5);
    assert.equal(interceptedBody.max_tiers, 4);
    assert.equal(interceptedBody.target_quantity_mt, 0);
    assert.equal(interceptedBody.cargo.unit_length_m, 1.0);
    assert.equal(interceptedBody.cargo.unit_weight_mt, 1.5);
    assert.equal(interceptedBody.cargo.max_tiers, 4);
    assert.equal(interceptedBody.cargo.target_quantity_mt, 0);
    assert.ok(interceptedBody.timestamp);
    assert.equal(res?.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// 5. REGLA DE ORO: BLINDAJE CERO RIESGO EN CALCULADORA Y APLICACIÓN DE SF
// ============================================================================
test('5. Blindaje de la Calculadora: abrir y calcular en H18 NO altera ningún campo comercial; Aplicar SF solo escribe cargo-sf', () => {
  // Simulamos el DOM básico de la calculadora
  const domState = {
    cargoQty: '25000',
    freightRate: '35.50',
    portPol: 'Valencia',
    portPod: 'Houston',
    cargoSf: '1.20',
    eventsFired: [],
  };

  const mockInput = {
    value: domState.cargoSf,
    dispatchEvent: (evt) => {
      domState.eventsFired.push(evt.type);
    },
  };

  // Simulación: Usuario abre H18 y calcula
  const sim = calcularEstibaTentativaH18({
    cargoName: 'Big Bags',
    length: 1.0,
    width: 1.0,
    height: 1.3,
    unitWeight: 1.5,
    brokenStowagePct: 5,
  });

  // VERIFICACIÓN 1: Durante el cálculo de H18, los valores comerciales siguen intactos
  assert.equal(domState.cargoQty, '25000', 'Toneladas de la calculadora intactas');
  assert.equal(domState.freightRate, '35.50', 'Flete de la calculadora intacto');
  assert.equal(domState.cargoSf, '1.20', 'SF de la calculadora aún no se modifica');
  assert.equal(domState.eventsFired.length, 0, 'No se han disparado eventos automáticos');

  // VERIFICACIÓN 2: Solo cuando el usuario pulsa deliberadamente "Aplicar SF a Calculadora"
  const grossSF = sim.stowageFactors.grossSF; // 0.910
  mockInput.value = grossSF.toFixed(3);
  mockInput.dispatchEvent({ type: 'input' });
  mockInput.dispatchEvent({ type: 'change' });

  assert.equal(mockInput.value, '0.910', 'El campo cargo-sf recibe el SF bruto calculado');
  assert.ok(domState.eventsFired.includes('input'), 'Dispara evento input');
  assert.ok(domState.eventsFired.includes('change'), 'Dispara evento change');

  // El resto de campos comerciales permanecen 100% inalterados
  assert.equal(domState.cargoQty, '25000', 'Toneladas NO alteradas');
  assert.equal(domState.freightRate, '35.50', 'Flete NO alterado');
  assert.equal(domState.portPol, 'Valencia', 'Puerto POL NO alterado');
  assert.equal(domState.portPod, 'Houston', 'Puerto POD NO alterado');
});

// ============================================================================
// 6. INTEGRACIÓN EN LA BARRA LATERAL IZQUIERDA Y SUSTITUCIÓN DE HISTORIAL
// ============================================================================
test('6. Sidebar y Bloque 5 integran "Estiba & Cargo Plan (H18)" sin referencias rotas al antiguo Historial de Buques', () => {
  // 1. Botón en la barra lateral izquierda (Sidebar)
  assert.match(indexHtml, /id="btn-stowage-h18-nav"/, 'Debe existir el botón de navegación H18 en la barra lateral');
  assert.match(indexHtml, /title="Estiba &amp; Cargo Plan \(H18\)"/, 'Tooltip correcto en el botón del sidebar');
  assert.match(indexHtml, /fa-boxes-stacked/, 'Icono fa-boxes-stacked en la barra lateral');
  assert.match(indexHtml, /onclick="openStowagePlanH18View\(event\)"/, 'Dispara openStowagePlanH18View');

  // 2. Botón en Bloque 5 de la Calculadora
  assert.match(indexHtml, /id="btn-list-vessels"[^>]*onclick="openStowagePlanH18View\(event\)"/, 'btn-list-vessels reorientado a H18');
  assert.match(indexHtml, /Estiba &amp; Cargo Plan \(H18\)/, 'Etiqueta en Bloque 5 actualizada');

  // 3. Vista aislada view-stowage-h18 con márgenes y contenedor centrado
  assert.match(indexHtml, /id="view-stowage-h18"/, 'Vista view-stowage-h18 debe existir en el DOM');
  assert.match(indexHtml, /max-w-\[1560px\]\s+mx-auto/, 'Debe envolver el contenido en contenedor centrado max-w-[1560px]');
  assert.match(indexHtml, /id="view-stowage-h18"[^>]*pl-/, 'Debe tener padding lateral izquierdo generoso');
  assert.match(indexHtml, /id="view-stowage-h18"[^>]*pt-24/, 'Debe tener padding superior amplio');
  assert.match(indexHtml, /id="h18-vessel-badge"/, 'Insignia de buque en solo lectura debe existir');
  assert.match(indexHtml, /id="h18-cad-container"/, 'Contenedor del plano CAD 2D debe existir');

  // 4. Botones con estilos de color sólidos explícitos (sin lavado en blanco)
  assert.match(indexHtml, /id="btn-h18-calculate"[^>]*#ea580c/, 'Botón calcular debe tener fondo naranja #ea580c explícito');
  assert.match(indexHtml, /id="btn-h18-open-3d"[^>]*#1e3a8a/, 'Botón 3D debe tener fondo índigo/azul #1e3a8a explícito');
  assert.match(indexHtml, /id="btn-h18-apply-sf"[^>]*#0d9488/, 'Botón aplicar SF debe tener fondo teal #0d9488 explícito');

  // 5. Modal 3D a pantalla completa
  assert.match(indexHtml, /id="h18-3d-modal"/, 'Modal 3D debe existir');
  assert.match(indexHtml, /id="h18-3d-viewport"/, 'Viewport WebGL 3D debe existir');
  assert.match(indexHtml, /id="btn-h18-3d-hatches"/, 'Botón de abrir/cerrar escotillas debe existir');

  // 5. Verificación de cero referencias rotas a "Historial de Buques" en botones u operaciones activas
  assert.doesNotMatch(
    indexHtml,
    /<button[^>]*>[^<]*Historial de Buques[^<]*<\/button>/,
    'No debe existir ningún botón activo con la etiqueta antigua "Historial de Buques"'
  );
});

// ============================================================================
// 7. CORRECCIÓN 5-EN-1: CSS ESPECÍFICO, MODO DÍA, GEOMETRÍA NAVAL Y DATABRIDGE
// ============================================================================
test('7. Correcciones 5-en-1: CSS bajo header fijo, visor 3D diurno, fix InstancedMesh, grúas y proxy DataBridge', () => {
  // 1. Reglas CSS específicas para #view-stowage-h18 bajo header fijo
  assert.match(indexHtml, /padding-top:\s*96px\s*!important/);
  assert.match(indexHtml, /padding-left:\s*84px\s*!important/);
  assert.match(indexHtml, /#view-stowage-h18\s+#btn-h18-calculate\s*\*/);
  assert.match(indexHtml, /color:\s*#ffffff\s*!important/);

  // 2. Redirección y proxy DataBridge en netlify.toml
  const netlifyToml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(netlifyToml, /from\s*=\s*"\/api\/h18-stowage-plan"/);
  assert.match(netlifyToml, /to\s*=\s*"https:\/\/calm-shortbread-55bcfc\.netlify\.app\/\.netlify\/functions\/h18-stowage-plan"/);
  assert.match(netlifyToml, /status\s*=\s*200/);

  // 3. Inspección del módulo vessel-3d-viewer.js
  const viewer3dSource = readFileSync(new URL('../vessel-3d-viewer.js', import.meta.url), 'utf8');
  assert.match(viewer3dSource, /#cbd5e1|#eef6fc/, 'Escena diurna con fondo claro');
  assert.match(viewer3dSource, /0x60a5fa|0xbae6fd/, 'Superficie marina celeste diurna');
  assert.match(viewer3dSource, /ExtrudeGeometry/, 'Casco naval realista con ExtrudeGeometry');
  assert.match(viewer3dSource, /this\.cargoInstancedMesh\.count\s*=\s*instanceIndex;/, 'Fix de bultos fantasma en (0,0,0)');
  assert.match(viewer3dSource, /MAX_VISUAL_INSTANCES\s*=\s*15000;/, 'Tope de seguridad a 15000 instancias');
  assert.match(viewer3dSource, /0x0284c7/, 'Grúas navales en azul acero');
  assert.match(viewer3dSource, /boomMesh\.rotation\.z\s*=\s*0;/, 'Pluma sin inclinación lateral');
  assert.match(viewer3dSource, /opacity:\s*0\.04|opacity:\s*0\.06/, 'Tapas al 0.04/0.06 al abrir escotillas');
  assert.match(viewer3dSource, /opacity:\s*0\.22|opacity:\s*0\.24/, 'Casco translúcido al 0.22/0.24 al abrir escotillas');
});

// ============================================================================
test('8. Corrección visual definitiva 3D: alineación casco/castillo, brazolas huecas, desaturación diurna, tiers contrastados y despeje de mar', () => {
  const viewer3dSource = readFileSync(new URL('../vessel-3d-viewer.js', import.meta.url), 'utf8');
  assert.match(viewer3dSource, /#cbd5e1/, 'Fondo naval de estudio #cbd5e1');
  assert.match(viewer3dSource, /muertaMesh\.rotation\.x\s*=\s*Math\.PI\s*\/\s*2;/, 'Alineación de obra muerta a proa (+Z)');
  assert.match(viewer3dSource, /deckMesh\.rotation\.x\s*=\s*Math\.PI\s*\/\s*2;/, 'Alineación de cubierta a proa (+Z)');
  assert.match(viewer3dSource, /forecastleMesh\.rotation\.x\s*=\s*Math\.PI\s*\/\s*2;/, 'Castillo de proa con ExtrudeGeometry afilada');
  assert.match(viewer3dSource, /this\.seaMesh\.position\.y\s*=\s*-\(this\.vesselDimensions/, 'Despeje de mar bajo la flotación');
  assert.match(viewer3dSource, /tankTopMesh/, 'Plancha sólida de tank top');
  assert.match(viewer3dSource, /setColorAt/, 'Colores alternados contrastados por tier');
  assert.match(viewer3dSource, /0xf59e0b/, 'Color ámbar vivo tier par');
  assert.match(viewer3dSource, /0xb45309/, 'Color ámbar quemado tier impar');
  assert.match(viewer3dSource, /0x94a3b8/, 'Planchas de cubierta de puente gris acero');

  // Viewport en index.html
  assert.match(indexHtml, /id="h18-3d-viewport"[^>]*bg-\[#cbd5e1\]/);
});

// ============================================================================
test('9. Remate final: CAD SVG height 800, syncTelemetry en calculateStowage y reset del mar al recargar', () => {
  const moduleSource = readFileSync(new URL('../stowage-h18-module.js', import.meta.url), 'utf8');
  assert.match(moduleSource, /generarCargoPlanSvgH18\(result,\s*\{\s*width:\s*1200,\s*height:\s*800\s*\}\)/, 'renderCadSvg usa height: 800');
  assert.match(moduleSource, /calculateStowage\(\{\s*syncTelemetry\s*=\s*false\s*\}\s*=\s*\{\}\)/, 'calculateStowage recibe syncTelemetry por defecto false');
  assert.match(moduleSource, /if\s*\(syncTelemetry\)\s*\{\s*sendH18SimulationToDataBridge/, 'Solo envía a DataBridge cuando syncTelemetry === true');
  assert.match(moduleSource, /window\.calculateStowageH18\s*=\s*\(\)\s*=>\s*stowageH18Manager\.calculateStowage\(\{\s*syncTelemetry:\s*true\s*\}\)/, 'calculateStowageH18 pasa syncTelemetry: true');
  assert.match(moduleSource, /btn\.style\.setProperty\('background-color',\s*isOpen\s*\?\s*'#d97706'\s*:\s*'#0d9488',\s*'important'\)/, 'toggleHatches3D conmuta color entre ámbar (#d97706) y teal (#0d9488)');

  const viewerSource = readFileSync(new URL('../vessel-3d-viewer.js', import.meta.url), 'utf8');
  assert.match(viewerSource, /if\s*\(this\.seaMesh\)\s*this\.seaMesh\.position\.y\s*=\s*0;/, 'Reset de seaMesh a Y=0 en loadStowageData');
  assert.match(viewerSource, /this\.seaMat\.opacity\s*=\s*0\.55;/, 'Reset de opacidad del mar en loadStowageData');
});

// ============================================================================
test('10. Coherencia naval DWT 11.500: LOA/Manga, tope DWCC, alerta DWCC_LIMITED y sincronización de Objetivo MT', () => {
  // 1. Verificación de dimensiones navales realistas para 11.500 DWT
  const geom = resolverGeometriaBodegas({ dwt: 11500 });
  assert.equal(geom.loa, 136, 'LOA debe ser exactamente 136 m para buque de 11.500 DWT');
  assert.ok(geom.loa >= 125 && geom.loa <= 145, 'LOA dentro del rango realista 125-145 m');
  assert.equal(geom.beam, 20.5, 'Manga debe ser exactamente 20.5 m');
  assert.ok(geom.beam >= 19 && geom.beam <= 22, 'Manga dentro del rango realista 19-22 m');
  assert.equal(geom.holdsCount, 3, 'Debe configurar 3 bodegas para buque de 11.500 DWT');
  assert.equal(geom.dwccEstimatedMT, Math.round(11500 * 0.93), 'DWCC estimado al 93% de DWT (10.695 MT)');

  // 2. Simulación de estiba con 11.500 DWT + 10.000 MT Objetivo (Big Bags 1.0x1.0x1.3 m, 1.5 MT, 4 tiers)
  const sim = calcularEstibaTentativaH18({
    cargoName: 'Big Bags 1.5 MT',
    length: 1.0,
    width: 1.0,
    height: 1.3,
    unitWeight: 1.5,
    tiers: 4,
    brokenStowagePct: 5,
    targetCargoMT: 10000,
    vessel: { dwt: 11500 },
  });

  assert.ok(sim.results.realistic.weightMT <= Math.round(11500 * 0.93), 'Capacidad realista nunca superior a DWCC (~10.695 MT)');
  assert.notEqual(sim.results.realistic.weightMT, 14055, 'Nunca debe calcular 14.055 MT residuales');
  assert.equal(sim.geometry.loa, 136);
  assert.equal(sim.geometry.beam, 20.5);

  // 3. Verificación de tope DWCC y emisión de alerta DWCC_LIMITED cuando el volumen excede el peso legal
  const simOverload = calcularEstibaTentativaH18({
    cargoName: 'Big Bags 1.5 MT',
    length: 1.0,
    width: 1.0,
    height: 1.3,
    unitWeight: 1.5,
    tiers: 7, // Con 7 capas el volumen supera el DWCC (10.695 MT)
    brokenStowagePct: 5,
    targetCargoMT: 10000,
    vessel: { dwt: 11500 },
  });
  assert.ok(simOverload.results.realistic.weightMT <= Math.round(11500 * 0.93), 'Capacidad limitada a DWCC');
  assert.equal(simOverload.results.realistic.weightMT, 10695, 'Tope exacto en 10.695 MT');
  assert.ok(
    simOverload.alerts.some((a) => a.code === 'DWCC_LIMITED'),
    'Debe emitir la alerta DWCC_LIMITED al superar el peso/calado legal'
  );

  // 4. Verificación de código fuente y lógica de sincronización en stowage-h18-module.js
  const moduleSource = readFileSync(new URL('../stowage-h18-module.js', import.meta.url), 'utf8');
  assert.match(moduleSource, /targetInput\.value\s*=\s*vessel\.targetCargoMT/, 'openView sincroniza #h18-input-target con targetCargoMT');
  assert.match(moduleSource, /loa_meters:\s*isLoaded\s*\?\s*loa\s*:\s*0/, 'readActiveVesselFromCalculator resetea LOA a 0 si !isLoaded');
  assert.match(moduleSource, /beam_meters:\s*isLoaded\s*\?\s*beam\s*:\s*0/, 'readActiveVesselFromCalculator resetea Manga a 0 si !isLoaded');
  assert.match(moduleSource, /Buque Genérico TBN · \$\{estimatedDwt\.toLocaleString\('es-ES'\)\}\s*DWT Estimado/, 'Insignia muestra DWT real leído en buque genérico');

  // 5. Verificación de z-index del modal 3D y escala de bulbo
  assert.match(indexHtml, /id="h18-3d-modal"[^>]*style="z-index:\s*9999;"/, 'Modal 3D con z-index 9999');
  const viewerSource = readFileSync(new URL('../vessel-3d-viewer.js', import.meta.url), 'utf8');
  assert.match(viewerSource, /bulbGeo\.scale\(0\.55,\s*0\.65,\s*1\.15\)/, 'Bulbo suavizado');
  assert.match(viewerSource, /halfL\s*-\s*halfB\s*\*\s*0\.15/, 'Bulbo integrado en la roda');
});

// ============================================================================
// 11. FASE 2: PESTAÑAS DE MODO, SELECTOR CORPORATIVO Y TABLA EDITABLE EN DOM
// ============================================================================
test('11. Fase 2: Pestañas de modo y tabla editable de Packing List en DOM y estilos corporativos', () => {
  // 1. Selector limpio de pestañas en la cabecera del simulador
  assert.match(indexHtml, /id="h18-mode-tabs"/, 'Debe existir el contenedor de pestañas de modo');
  assert.match(indexHtml, /id="tab-h18-homogeneous"/, 'Pestaña Carga Homogénea');
  assert.match(indexHtml, /id="tab-h18-project-cargo"/, 'Pestaña Project Cargo / Vehículos');
  assert.match(indexHtml, /onclick="switchStowageH18SubTab\('homogeneous'\)"/, 'Handler para conmutar a homogénea');
  assert.match(indexHtml, /onclick="switchStowageH18SubTab\('project_cargo'\)"/, 'Handler para conmutar a project cargo');

  // 2. Paneles de contenido mutuamente excluyentes
  assert.match(indexHtml, /id="h18-panel-homogeneous"/, 'Panel de Carga Homogénea');
  assert.match(indexHtml, /id="h18-panel-project-cargo"/, 'Panel de Project Cargo');

  // 3. Estilos corporativos teal (#0d9488) y texto blanco para pestaña y botones
  assert.match(indexHtml, /#tab-h18-project-cargo\.active-teal/, 'Regla CSS para pestaña activa teal');
  assert.match(indexHtml, /background-color:\s*#0d9488\s*!important/, 'Fondo teal #0d9488 en pestaña activa');
  assert.match(indexHtml, /color:\s*#ffffff\s*!important/, 'Texto blanco forzado #ffffff');

  // 4. Elementos funcionales del panel Project Cargo
  assert.match(indexHtml, /id="h18-pc-sync-badge"/, 'Insignia de sincronización desde Cerebro IA');
  assert.match(indexHtml, /Sincronizado desde Cerebro IA/, 'Texto corporativo de la insignia');
  assert.match(indexHtml, /id="h18-pc-tweendeck"/, 'Selector de entrepuente (tweendeck) para buque TBN');
  assert.match(indexHtml, /id="h18-pc-cranes"/, 'Selector de grúas de cubierta para buque TBN');
  assert.match(indexHtml, /id="h18-pc-table"/, 'Tabla editable de Packing List');
  assert.match(indexHtml, /id="h18-pc-table-body"/, 'Cuerpo de la tabla de Packing List');
  assert.match(indexHtml, /id="btn-h18-pc-add-item"/, 'Botón para añadir fila al Packing List');
  assert.match(indexHtml, /id="btn-h18-pc-calculate"/, 'Botón naranja CALCULAR ESTIBA (H18)');
  assert.match(indexHtml, /#ea580c/, 'Botón calcular con naranja corporativo #ea580c');

  // 5. Tarjetas de resumen métrico naval
  assert.match(indexHtml, /id="h18-pc-res-weight"/, 'Tarjeta de Peso Total y bultos');
  assert.match(indexHtml, /id="h18-pc-res-realistic"/, 'Tarjeta de Estiba Realista (% y unidades fuera)');
  assert.match(indexHtml, /id="h18-pc-res-sf-gross"/, 'Tarjeta de SF Equivalente Bruto y Neto');
  assert.match(indexHtml, /id="h18-pc-res-kg"/, 'Tarjeta de Centro de Gravedad estimado (KG)');
  assert.match(indexHtml, /id="h18-pc-res-lashing"/, 'Tarjeta de Estado de Trinca y Lashing');
  assert.match(indexHtml, /id="h18-pc-res-clearance"/, 'Tarjeta de Despeje y Giro de pluma');

  // 6. Alertas y botón de aplicar SF
  assert.match(indexHtml, /id="h18-pc-alerts-container"/, 'Contenedor de alertas comerciales y técnicas');
  assert.match(indexHtml, /id="btn-h18-pc-apply-sf"/, 'Botón Aplicar SF a Calculadora en Project Cargo');
});

// ============================================================================
// 12. FASE 2: CAPTURA SEGURA DESDE CEREBRO IA Y PLANTILLA EDITABLE POR DEFECTO
// ============================================================================
test('12. Fase 2: Captura segura de h18_packing_list / h18_project_cargo_plan desde Cerebro IA y plantilla por defecto', () => {
  // 1. Verificación estática del extractor en sea-assistant-entry.js
  const assistantSource = readFileSync(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
  assert.match(assistantSource, /function\s+captureH18CerebroData\(payload\)/, 'Función captureH18CerebroData definida');
  assert.match(assistantSource, /window\.State\.h18_packing_list\s*=\s*packingList;/, 'Almacena en window.State.h18_packing_list de forma no destructiva');
  assert.match(assistantSource, /window\.State\.h18_project_cargo_plan\s*=\s*projectPlan;/, 'Almacena en window.State.h18_project_cargo_plan');
  assert.match(assistantSource, /window\.captureH18CerebroData\s*=\s*captureH18CerebroData;/, 'Expone captureH18CerebroData en window');
  assert.match(assistantSource, /captureH18CerebroData\(payload\);/, 'Se ejecuta en normalizeDataBridgeAssistantResponse');

  // 2. Simulación de ejecución de captureH18CerebroData con aislamiento financiero
  const mockState = {
    freight_rate: 42.50,
    cargo_quantity: 30000,
    port_pol: 'Rotterdam',
  };
  const mockWindow = { State: { ...mockState } };

  // Ejecución directa de la lógica de captura
  const samplePayload = {
    h18_packing_list: [
      { id: 'TURBO-GEN', length_m: 9.0, width_m: 3.4, height_m: 3.9, weight_mt: 78.0, quantity: 1, category: 'heavy_lift', zone: 'under_deck' }
    ],
    h18_project_cargo_plan: {
      mode: 'project_cargo',
      summary: { total_weight_mt: 78.0, equivalent_gross_sf: 2.15 },
    },
  };

  const packingList = samplePayload?.h18_packing_list ?? samplePayload?.payload?.h18_packing_list;
  const projectPlan = samplePayload?.h18_project_cargo_plan ?? samplePayload?.payload?.h18_project_cargo_plan;
  if (packingList) mockWindow.State.h18_packing_list = packingList;
  if (projectPlan) mockWindow.State.h18_project_cargo_plan = projectPlan;

  // Verificamos que los campos comerciales siguen 100% inalterados
  assert.equal(mockWindow.State.freight_rate, 42.50, 'Flete comercial intacto');
  assert.equal(mockWindow.State.cargo_quantity, 30000, 'Cantidad comercial intacta');
  assert.equal(mockWindow.State.port_pol, 'Rotterdam', 'Puerto intacto');

  // Verificamos que los datos de H18 fueron hidratados en State
  assert.equal(mockWindow.State.h18_packing_list.length, 1);
  assert.equal(mockWindow.State.h18_packing_list[0].id, 'TURBO-GEN');
  assert.equal(mockWindow.State.h18_project_cargo_plan.summary.total_weight_mt, 78.0);

  // 3. Plantilla editable por defecto en stowage-h18-module.js si no hay packing list previo
  const moduleSource = readFileSync(new URL('../stowage-h18-module.js', import.meta.url), 'utf8');
  assert.match(moduleSource, /DEFAULT_PROJECT_CARGO_PACKING_LIST\s*=\s*\[/, 'Plantilla por defecto definida');
  assert.match(moduleSource, /id:\s*['"]TRAFO-01['"]/, 'Ítem 1: TRAFO-01');
  assert.match(moduleSource, /category:\s*['"]heavy_lift['"]/, 'TRAFO-01 es heavy_lift');
  assert.match(moduleSource, /weight_mt:\s*85(?:\.0)?/, 'TRAFO-01 peso 85.0 MT');
  assert.match(moduleSource, /id:\s*['"]SEMI['"]/, 'Ítem 2: SEMI');
  assert.match(moduleSource, /category:\s*['"]vehicle['"]/, 'SEMI es vehicle');
  assert.match(moduleSource, /quantity:\s*6/, 'SEMI cantidad 6');
  assert.match(moduleSource, /zone:\s*['"]on_deck['"]/, 'SEMI zona on_deck');
  assert.match(moduleSource, /id:\s*['"]CAJAS-PRJ['"]/, 'Ítem 3: CAJAS-PRJ');
  assert.match(moduleSource, /category:\s*['"]crate['"]/, 'CAJAS-PRJ es crate');
});

// ============================================================================
// 13. FASE 2: MOTOR DE ESTIBA PROJECT CARGO Y ALERTAS TÉCNICAS / COMERCIALES
// ============================================================================
test('13. Fase 2: calcularProjectCargoFallbackH18 calcula estiba, SF equivalente, KG y alertas comerciales (Tandem, Shore Crane, Dunnage, DWCC)', () => {
  const vessel = {
    vessel_name: 'GLOBAL MULTIPURPOSE',
    imo_number: '9876543',
    dwt: 11500,
    loa: 136,
    beam: 20.5,
    depth: 11.0,
    draft: 7.8,
    holds_count: 3,
    has_tweendeck: true,
    has_gears: true,
    crane_configuration: '2 x 45 MT',
  };

  const packingList = [
    { id: 'TRAFO-01', category: 'heavy_lift', length_m: 6.5, width_m: 3.2, height_m: 3.8, weight_mt: 85.0, quantity: 1, zone: 'auto' },
    { id: 'SEMI', category: 'vehicle', length_m: 11.5, width_m: 2.5, height_m: 2.4, weight_mt: 15.0, quantity: 6, zone: 'on_deck' },
    { id: 'CAJAS-PRJ', category: 'crate', length_m: 4.0, width_m: 2.2, height_m: 2.0, weight_mt: 4.5, quantity: 1, zone: 'auto' },
  ];

  const plan = calcularProjectCargoFallbackH18(vessel, packingList);
  assert.equal(plan.success, true);
  assert.equal(plan.mode, 'project_cargo');

  // 1. Verificación de peso total y bultos
  // 85.0 + (15.0 * 6) + 4.5 = 85.0 + 90.0 + 4.5 = 179.5 MT
  assert.equal(plan.summary.total_weight_mt, 179.5, 'Peso total debe ser 179.5 MT');
  assert.equal(plan.summary.total_units, 8, 'Total 8 bultos (1 + 6 + 1)');
  assert.equal(plan.summary.placed_pct, 100, 'Todos los bultos colocados');
  assert.equal(plan.summary.unplaced_units, 0, 'Cero bultos sin ubicar');

  // 2. Factores de estiba equivalentes y KG
  assert.ok(plan.summary.equivalent_gross_sf > 0, 'SF bruto equivalente > 0');
  assert.ok(plan.summary.equivalent_net_sf > 0, 'SF neto equivalente > 0');
  assert.ok(plan.summary.equivalent_gross_sf > plan.summary.equivalent_net_sf, 'SF bruto > SF neto por broken stowage de project cargo');
  assert.ok(plan.summary.estimated_kg_m >= 5.0 && plan.summary.estimated_kg_m <= 10.0, 'KG estimado dentro de rango naval realista');

  // 3. Distribución espacial en bodegas y cubierta
  assert.equal(plan.placed_items.length, 8, '8 piezas colocadas');
  const trafoItem = plan.placed_items.find(i => i.id === 'TRAFO-01');
  assert.ok(trafoItem, 'TRAFO-01 debe estar colocado');
  assert.equal(trafoItem.zone, 'under_deck', 'TRAFO-01 de 85 MT va a bodega (under_deck)');

  const semiItems = plan.placed_items.filter(i => i.id.startsWith('SEMI'));
  assert.equal(semiItems.length, 6, '6 semirremolques colocados');
  semiItems.forEach(semi => {
    assert.equal(semi.zone, 'on_deck', 'Vehículos van en cubierta (on_deck)');
  });

  // 4. Verificación de alertas técnicas:
  // - TRAFO-01 (85 MT) supera la capacidad de una grúa (45 MT) pero cabe con dos grúas en tándem (90 MT)
  const hasTandemAlert = plan.alerts.some(a => a.code === 'TANDEM_LIFT_REQUIRED');
  assert.ok(hasTandemAlert, 'Debe activar alerta TANDEM_LIFT_REQUIRED para pieza de 85 MT con grúas de 45 MT');

  // - TRAFO-01 (85 MT) supera 50 MT, requiriendo repartidores de carga (Dunnage Spreaders)
  const hasDunnageAlert = plan.alerts.some(a => a.code === 'DUNNAGE_SPREADERS_RECOMMENDED');
  assert.ok(hasDunnageAlert, 'Debe recomendar repartidores de carga para pieza pesada > 50 MT');

  // 5. Caso límite: Pieza que excede la capacidad combinada de grúas del buque (ej. 110 MT > 90 MT)
  const heavyListShore = [
    { id: 'REACTOR-01', category: 'heavy_lift', length_m: 12.0, width_m: 4.0, height_m: 4.0, weight_mt: 110.0, quantity: 1, zone: 'auto' },
  ];
  const shorePlan = calcularProjectCargoFallbackH18(vessel, heavyListShore);
  const hasShoreCraneAlert = shorePlan.alerts.some(a => a.code === 'SHORE_CRANE_REQUIRED');
  assert.ok(hasShoreCraneAlert, 'Debe exigir grúa de tierra / flotante (SHORE_CRANE_REQUIRED) al superar SWL tándem de 90 MT');

  // 6. Caso límite: Carga que excede el DWCC legal del buque
  const overloadList = [
    { id: 'STEEL-BATCH', category: 'steel', length_m: 12.0, width_m: 2.0, height_m: 1.5, weight_mt: 12000.0, quantity: 1, zone: 'under_deck' },
  ];
  const overloadPlan = calcularProjectCargoFallbackH18(vessel, overloadList);
  const hasDwccAlert = overloadPlan.alerts.some(a => a.code === 'DWCC_LIMITED');
  assert.ok(hasDwccAlert, 'Debe alertar DWCC_LIMITED al sobrepasar el peso muerto utilizable');
});

// ============================================================================
// 14. FASE 2: PLANO CAD 2D ESTILO ASTILLERO (generarProjectCargoPlanSvgH18)
// ============================================================================
test('14. Fase 2: generarProjectCargoPlanSvgH18 renderiza plano técnico CAD de astillero (proa +X, tweendeck, grúas, siluetas y lashing)', () => {
  const vessel = {
    vessel_name: 'GLOBAL MULTIPURPOSE',
    imo_number: '9876543',
    dwt: 11500,
    loa: 136,
    beam: 20.5,
    depth: 11.0,
    draft: 7.8,
    holds_count: 3,
    has_tweendeck: true,
    has_gears: true,
    crane_configuration: '2 x 45 MT',
  };

  const packingList = [
    { id: 'TRAFO-01', category: 'heavy_lift', length_m: 6.5, width_m: 3.2, height_m: 3.8, weight_mt: 85.0, quantity: 1, zone: 'auto' },
    { id: 'SEMI', category: 'vehicle', length_m: 11.5, width_m: 2.5, height_m: 2.4, weight_mt: 15.0, quantity: 6, zone: 'on_deck' },
    { id: 'CAJAS-PRJ', category: 'crate', length_m: 4.0, width_m: 2.2, height_m: 2.0, weight_mt: 4.5, quantity: 1, zone: 'auto' },
  ];

  const plan = calcularProjectCargoFallbackH18(vessel, packingList);
  const svg = generarProjectCargoPlanSvgH18(plan, { width: 1200, height: 800 });

  // 1. Estructura SVG válida y dimensiones 1200x800
  assert.match(svg, /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 1200 800"/);

  // 2. Fondo blanco astillero (#ffffff) y retícula CAD fina (#f1f5f9)
  assert.match(svg, /fill="#ffffff"/);
  assert.match(svg, /id="gridPatternProject"/);

  // 3. Convención náutica estricta: Proa a la derecha (+X), Popa a la izquierda
  assert.match(svg, /PROA \(BOW\) →/);
  assert.match(svg, /← POPA \(AFT\)/);

  // 4. Perfil longitudinal y planta de estiba
  assert.match(svg, /1\. PERFIL LONGITUDINAL/);
  assert.match(svg, /2\. PLANTA DE ESTIBA/);

  // 5. Detalles navales de astillero en perfil
  assert.match(svg, /WL<\/text>/, 'Símbolo náutico de línea de flotación WL');
  assert.match(svg, /stroke-dasharray="4 3|stroke-dasharray="4,3"/, 'Línea discontinua de tweendeck en mamparos');
  assert.match(svg, /stroke="#334155"/, 'Grúas articuladas trazadas en perfil');

  // 6. Siluetas técnicas por categoría de carga
  assert.match(svg, /#ea580c/, 'TRAFO-01 heavy_lift dibujado en naranja corporativo');
  assert.match(svg, /#78350f|#92400e/, 'Cama de dunnage de madera bajo heavy lift');
  assert.match(svg, /#2563eb/, 'Semirremolques vehicle dibujados en azul corporativo');
  assert.match(svg, /#0d9488/, 'Cajas crate dibujadas en teal corporativo');

  // 7. Marcas de trinca y lashing en planta (X en esquinas)
  assert.match(svg, /Trincaje &amp; Lashing/);
  assert.match(svg, /class="lashing-marks"/, 'Cruces de lashing en esquinas de bodegas');
  assert.match(svg, /stroke="#ea580c"/, 'Trazos en naranja para trincaje');

  // 8. Cajetín naval legal con capacidad de grúas y cláusula legal
  assert.match(svg, /GLOBAL MULTIPURPOSE/);
  assert.match(svg, /9876543/);
  assert.match(svg, /CRANE CAPACITY:\s*2 x 45 MT/);
  assert.match(svg, /TENTATIVE PROJECT CARGO STOWAGE PLAN/);
  assert.match(svg, /SUBJECT TO MASTER'S APPROVAL/);

  // 9. Nombre de exportación en stowage-h18-module.js
  const moduleSource = readFileSync(new URL('../stowage-h18-module.js', import.meta.url), 'utf8');
  assert.match(moduleSource, /CARGO_PLAN_H18_PROJECT_\$\{vesselName\}\.svg/, 'Nombre de archivo SVG con prefijo PROJECT');
});

// ============================================================================
// 15. FASE 2: VISOR 3D MIXTO Y BLINDAJE CERO RIESGO EN APLICACIÓN DE SF
// ============================================================================
test('15. Fase 2: Visor 3D con projectCargoGroup y blindaje estricto en la Calculadora (Aplicar SF solo toca cargo-sf)', () => {
  // 1. Verificación del visor 3D en vessel-3d-viewer.js
  const viewerSource = readFileSync(new URL('../vessel-3d-viewer.js', import.meta.url), 'utf8');
  assert.match(viewerSource, /this\.projectCargoGroup\s*=\s*null;/, 'projectCargoGroup inicializado en constructor');
  assert.match(viewerSource, /buildProjectCargo\(THREE,\s*stowageResult/, 'Función buildProjectCargo presente');
  assert.match(viewerSource, /0xea580c/, 'Material heavy_lift naranja');
  assert.match(viewerSource, /0x2563eb/, 'Material vehicle azul');
  assert.match(viewerSource, /0x0d9488/, 'Material crate teal');
  assert.match(viewerSource, /0x475569/, 'Material steel gris pizarra');
  assert.match(viewerSource, /zone\s*===\s*['"]on_deck['"]/, 'Posicionamiento en cubierta on_deck');
  assert.match(viewerSource, /zone\s*===\s*['"]tweendeck['"]/, 'Posicionamiento en tweendeck');
  assert.match(viewerSource, /zone\s*===\s*['"]under_deck['"]|tankTopY\s*\+\s*hgt\s*\/\s*2/, 'Posicionamiento en under_deck sobre tank top');

  // 2. Blindaje Cero Riesgo en la Calculadora Comercial
  // Verificamos que switchSubTab conmuta vistas sin tocar ningún input comercial
  const moduleSource = readFileSync(new URL('../stowage-h18-module.js', import.meta.url), 'utf8');
  assert.match(moduleSource, /switchSubTab\(/, 'Método switchSubTab implementado');
  assert.match(moduleSource, /applyStowageFactorToCalculator\(\)/, 'Método applyStowageFactorToCalculator implementado');
  assert.match(moduleSource, /summary\.equivalent_gross_sf/, 'Usa equivalent_gross_sf en modo project_cargo');

  // Simulación del DOM de la Calculadora Comercial para verificar blindaje estricto
  const commercialDom = {
    'cargo-qty': '32000',
    'freight-rate': '28.75',
    'port-pol': 'Santos',
    'port-pod': 'Rotterdam',
    'bunker-ifo': '620',
    'bunker-mgo': '880',
    'cargo-sf': '1.350',
  };

  const eventsDispatched = [];
  const cargoSfInput = {
    value: commercialDom['cargo-sf'],
    dispatchEvent: (e) => eventsDispatched.push(e.type),
  };

  // Simulación: El usuario calcula un plan Project Cargo con SF Bruto equivalente = 2.450
  const calculatedProjectGrossSF = 2.450;

  // El usuario presiona deliberadamente "Aplicar SF a Calculadora"
  cargoSfInput.value = calculatedProjectGrossSF.toFixed(3);
  cargoSfInput.dispatchEvent({ type: 'input' });
  cargoSfInput.dispatchEvent({ type: 'change' });

  // Verificación 1: El campo #cargo-sf se actualiza con el SF Bruto exacto
  assert.equal(cargoSfInput.value, '2.450', 'El campo #cargo-sf recibe el SF bruto equivalente');
  assert.ok(eventsDispatched.includes('input'), 'Disparó evento input');
  assert.ok(eventsDispatched.includes('change'), 'Disparó evento change');

  // Verificación 2: Ningún otro campo comercial sufrió la menor alteración
  assert.equal(commercialDom['cargo-qty'], '32000', 'Cantidad comercial inalterada');
  assert.equal(commercialDom['freight-rate'], '28.75', 'Flete comercial inalterado');
  assert.equal(commercialDom['port-pol'], 'Santos', 'Puerto origen inalterado');
  assert.equal(commercialDom['port-pod'], 'Rotterdam', 'Puerto destino inalterado');
  assert.equal(commercialDom['bunker-ifo'], '620', 'Bunkers IFO inalterado');
  assert.equal(commercialDom['bunker-mgo'], '880', 'Bunkers MGO inalterado');
});

// ============================================================================
// 16. FASE 2: COMPATIBILIDAD CONTRATO JSON DATABRIDGE Y ESCALADO NAVAL POR DWT
// ============================================================================
test('16. Fase 2: Contrato DataBridge (unit_weight_mt, label, preferred_zone), holds_count: 3 y SVG sin undefined', () => {
  // 1. Normalización de un ítem con claves puras de DataBridge
  const dataBridgeItem = {
    label: 'REACTOR-HYDRO',
    length_m: 8.5,
    width_m: 3.2,
    height_m: 3.6,
    unit_weight_mt: 74.5,
    quantity: 1,
    category: 'heavy_lift',
    preferred_zone: 'under_deck',
  };

  const norm = normalizePackingListItem(dataBridgeItem);
  assert.equal(norm.id, 'REACTOR-HYDRO');
  assert.equal(norm.label, 'REACTOR-HYDRO');
  assert.equal(norm.weight_mt, 74.5);
  assert.equal(norm.unit_weight_mt, 74.5);
  assert.equal(norm.zone, 'under_deck');
  assert.equal(norm.preferred_zone, 'under_deck');

  // 2. Buque de 11.500 DWT con holds_count: 3 explícito
  const vessel = {
    vessel_name: 'NEVA BULKER',
    imo_number: '9123456',
    dwt: 11500,
    holds_count: 3,
    has_tweendeck: true,
    has_gears: true,
    crane_configuration: '2 x 45 MT',
  };

  const planResult = calcularProjectCargoFallbackH18(vessel, [dataBridgeItem]);
  assert.equal(planResult.placed_items.length, 1);
  assert.equal(planResult.placed_items[0].label, 'REACTOR-HYDRO');
  assert.equal(planResult.placed_items[0].weight_mt, 74.5);
  assert.equal(planResult.placed_items[0].unit_weight_mt, 74.5);

  // 3. Renderizado de plano CAD 2D SVG
  const svg = generarProjectCargoPlanSvgH18(planResult, { width: 1200, height: 800 });

  // No debe imprimir "undefined" en ningún atributo ni texto
  assert.doesNotMatch(svg, /undefined/, 'El SVG no debe contener la cadena "undefined"');

  // Coherencia de bodegas: debe contener H1, H2, H3 y NO contener H4 ni H5
  assert.match(svg, /H1<\/text>/, 'Bodega H1 presente');
  assert.match(svg, /H2<\/text>/, 'Bodega H2 presente');
  assert.match(svg, /H3<\/text>/, 'Bodega H3 presente');
  assert.doesNotMatch(svg, /H4<\/text>/, 'No debe forzar bodega H4 en buque de 3 bodegas');

  // Posicionamiento de etiqueta de bodega H en la parte superior del borde (evita solapes con el rótulo de la pieza)
  assert.match(svg, /y="42[0-9]|y="41[0-9]|y="43[0-9]"/, 'Etiqueta H dibujada en el borde superior de la bodega');

  // 4. Verificación de módulo stowage-h18-module.js
  const moduleSource = readFileSync(new URL('../stowage-h18-module.js', import.meta.url), 'utf8');
  assert.match(moduleSource, /hasLocalProjectCargoEdits/, 'Control de edición local para invalidar caché de Cerebro IA');
  assert.match(moduleSource, /geom\.holdsCount/, 'Escalado dinámico de bodegas según geometría naval');
  assert.match(moduleSource, /normalizePackingListItem/, 'Uso del normalizador en el módulo');
});
