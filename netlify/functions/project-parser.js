import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const VALID_CATEGORIES = [
  'Mercancía Ensacada / Dry Bulk',
  'Maquinaria / Equipos Industriales',
  'Vehículo / Unidades Rodadas',
  'Estructura Metálica',
  'Carga General / General Cargo',
  'Suministros / Supplies',
];

const VALID_SHIPPING_MODES = [
  'Big Bags / Granel',
  'Contenedor (FCL / LCL)',
  'Breakbulk / Maquinaria Suelta',
  'Plataforma / Flat Rack',
  'Ro-Ro / Vehículo Rodado',
];

function normalizeStr(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hasWord(str, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(str);
}

function normalizeCategory(rawCategory, desc = '', type = '') {
  if (typeof rawCategory === 'string') {
    const trimmed = rawCategory.trim();
    if (VALID_CATEGORIES.includes(trimmed)) {
      return trimmed;
    }
  }

  const combined = normalizeStr(`${rawCategory || ''} ${type || ''} ${desc || ''}`);

  // 1. Mercancía Ensacada / Dry Bulk
  if (
    combined.includes('ensacad') || combined.includes('dry bulk') || hasWord(combined, 'bulk') ||
    combined.includes('granel') || combined.includes('big bag') || combined.includes('bigbag') ||
    combined.includes('fibc') || combined.includes('saco') || combined.includes('cereal') ||
    combined.includes('trigo') || hasWord(combined, 'wheat') || combined.includes('maiz') ||
    hasWord(combined, 'corn') || combined.includes('cebada') || hasWord(combined, 'barley') ||
    hasWord(combined, 'soja') || hasWord(combined, 'soya') || combined.includes('grano') ||
    hasWord(combined, 'grain') || combined.includes('cemento') || hasWord(combined, 'cement') ||
    combined.includes('clinker') || combined.includes('clinquer') || combined.includes('yeso') ||
    combined.includes('gypsum') || hasWord(combined, 'cal') || hasWord(combined, 'lime') ||
    combined.includes('fertilizante') || combined.includes('fertilizer') || combined.includes('abono') ||
    combined.includes('urea') || combined.includes('pellet') || combined.includes('biomasa') ||
    combined.includes('carbon') || hasWord(combined, 'coal') || combined.includes('mineral') ||
    combined.includes('bauxita') || hasWord(combined, 'arena') || hasWord(combined, 'sand') ||
    combined.includes('grava') || hasWord(combined, 'gravel') || hasWord(combined, 'vrac')
  ) {
    return 'Mercancía Ensacada / Dry Bulk';
  }

  // 2. Estructura Metálica
  if (
    combined.includes('estructura metalica') || combined.includes('estructura de acero') ||
    combined.includes('steel structure') || combined.includes('metal structure') ||
    combined.includes('viga') || hasWord(combined, 'beam') || hasWord(combined, 'beams') || combined.includes('girder') ||
    hasWord(combined, 'pilar') || combined.includes('perfil') || combined.includes('profile') ||
    combined.includes('tuberia') || combined.includes('tuberias') || hasWord(combined, 'pipe') ||
    hasWord(combined, 'pipes') || combined.includes('pipeline') || hasWord(combined, 'tubo') ||
    hasWord(combined, 'tubos') || hasWord(combined, 'chapa') || hasWord(combined, 'chapas') ||
    combined.includes('steel plate') || combined.includes('bobina de acero') || combined.includes('steel coil') ||
    combined.includes('bobina') || hasWord(combined, 'coil') || hasWord(combined, 'coils') ||
    combined.includes('varilla') || combined.includes('rebar') || combined.includes('alambron') ||
    combined.includes('hierro') || hasWord(combined, 'iron') || combined.includes('acero') ||
    hasWord(combined, 'steel') || hasWord(combined, 'stahl') || hasWord(combined, 'acier') ||
    hasWord(combined, 'ferro') || hasWord(combined, 'aco') || combined.includes('cercha') ||
    combined.includes('celosia') || combined.includes('truss') || combined.includes('torre metalica') ||
    combined.includes('andamio') || combined.includes('scaffolding') || combined.includes('pasarela metalica') ||
    hasWord(combined, 'metal') || hasWord(combined, 'siderurgico') || hasWord(combined, 'estructura')
  ) {
    return 'Estructura Metálica';
  }

  // 3. Vehículo / Unidades Rodadas
  if (
    combined.includes('vehiculo') || combined.includes('vehicle') || combined.includes('unidad rodada') ||
    combined.includes('unidades rodadas') || combined.includes('rodado') || combined.includes('rodada') ||
    combined.includes('rolling unit') || combined.includes('automovil') || hasWord(combined, 'coche') ||
    hasWord(combined, 'auto') || combined.includes('camion') || hasWord(combined, 'truck') ||
    hasWord(combined, 'lkw') || combined.includes('autocarro') || combined.includes('caminhao') ||
    combined.includes('cabeza tractora') || combined.includes('tractora') || combined.includes('tractor unit') ||
    combined.includes('zugmaschine') || combined.includes('cavalo mecanico') || combined.includes('remolque') ||
    hasWord(combined, 'trailer') || combined.includes('anhanger') || combined.includes('semirremolque') ||
    combined.includes('semi-trailer') || combined.includes('furgoneta') || hasWord(combined, 'van') ||
    hasWord(combined, 'vans') || combined.includes('fourgonnette') || combined.includes('autobus') ||
    hasWord(combined, 'bus') || combined.includes('autocar') || combined.includes('dumper') ||
    combined.includes('tombereau') || combined.includes('kipper') || combined.includes('volquete') ||
    combined.includes('chasis') || combined.includes('chassis') || combined.includes('ro-ro') ||
    combined.includes('roro')
  ) {
    return 'Vehículo / Unidades Rodadas';
  }

  // 4. Suministros / Supplies
  if (
    combined.includes('suministro') || combined.includes('supplies') || hasWord(combined, 'supply') ||
    combined.includes('repuesto') || combined.includes('spare part') || hasWord(combined, 'spare') ||
    hasWord(combined, 'spares') || combined.includes('recambio') || combined.includes('herramienta') ||
    hasWord(combined, 'tool') || hasWord(combined, 'tools') || combined.includes('ferreteria') ||
    combined.includes('hardware') || combined.includes('valvula') || hasWord(combined, 'valve') ||
    hasWord(combined, 'valves') || combined.includes('filtro') || hasWord(combined, 'filter') ||
    hasWord(combined, 'filters') || combined.includes('tornillo') || combined.includes('tuerca') ||
    combined.includes('perno') || hasWord(combined, 'bolt') || hasWord(combined, 'bolts') ||
    hasWord(combined, 'screw') || hasWord(combined, 'screws') || hasWord(combined, 'nut') ||
    hasWord(combined, 'nuts') || hasWord(combined, 'cable') || hasWord(combined, 'cables') ||
    combined.includes('wiring') || combined.includes('rodamiento') || combined.includes('bearing') ||
    combined.includes('junta') || combined.includes('gasket') || hasWord(combined, 'seal') ||
    hasWord(combined, 'seals') || combined.includes('consumible') || combined.includes('avituallamiento') ||
    combined.includes('provision') || combined.includes('lubricante') || hasWord(combined, 'aceite') ||
    combined.includes('accesorio') || combined.includes('fitting')
  ) {
    return 'Suministros / Supplies';
  }

  // 5. Maquinaria / Equipos Industriales
  if (
    combined.includes('maquinaria') || combined.includes('machinery') || combined.includes('machine') ||
    combined.includes('maquina') || combined.includes('equipo industrial') || combined.includes('equipos industriales') ||
    combined.includes('industrial equipment') || combined.includes('equipos de proceso') || combined.includes('equipo de proceso') ||
    combined.includes('process equipment') || combined.includes('transformador') || combined.includes('transformer') ||
    combined.includes('transformateur') || combined.includes('generador') || combined.includes('generator') ||
    combined.includes('genset') || combined.includes('turbina') || combined.includes('turbine') ||
    combined.includes('caldera') || combined.includes('boiler') || combined.includes('chaudiere') ||
    combined.includes('compresor') || combined.includes('compressor') || combined.includes('bomba') ||
    hasWord(combined, 'pump') || hasWord(combined, 'pumps') || combined.includes('motor') ||
    hasWord(combined, 'engine') || combined.includes('excavadora') || combined.includes('excavator') ||
    combined.includes('bagger') || combined.includes('pelle') || combined.includes('escavatore') ||
    combined.includes('escavadeira') || combined.includes('pala cargadora') || combined.includes('wheel loader') ||
    combined.includes('radlader') || combined.includes('grua') || hasWord(combined, 'crane') ||
    hasWord(combined, 'kran') || combined.includes('guindaste') || combined.includes('molino') ||
    combined.includes('crusher') || combined.includes('trituradora') || combined.includes('chancadora') ||
    combined.includes('bastidor') || combined.includes('skid') || combined.includes('osmosis') ||
    combined.includes('prensa') || hasWord(combined, 'torno') || combined.includes('fresadora') ||
    combined.includes('reactor') || combined.includes('intercambiador') || combined.includes('planta') ||
    combined.includes('heavy equipment')
  ) {
    return 'Maquinaria / Equipos Industriales';
  }

  // 6. Carga General / General Cargo (default y para mercancía suelta/palets/cajas)
  return 'Carga General / General Cargo';
}

function normalizeShippingMode(rawMode, desc = '', weightVal = 0, len = 0, wid = 0, heightVal = 0, category = '') {
  if (typeof rawMode === 'string') {
    const trimmed = rawMode.trim();
    if (VALID_SHIPPING_MODES.includes(trimmed)) {
      return trimmed;
    }

    const m = normalizeStr(trimmed);

    // Ro-Ro / Vehículo Rodado
    if (
      m.includes('ro-ro') || m.includes('roro') || m.includes('rodad') ||
      m.includes('vehiculo') || m.includes('rolling')
    ) {
      return 'Ro-Ro / Vehículo Rodado';
    }

    // Plataforma / Flat Rack
    if (
      m.includes('plataforma') || m.includes('flat rack') || m.includes('flatrack') ||
      m.includes('flat-rack') || m.includes('mafi') || m.includes('platform')
    ) {
      return 'Plataforma / Flat Rack';
    }

    // Contenedor (FCL / LCL) - detectado antes de "suelto" para evitar que "Paletizado / Suelto" caiga en Breakbulk
    if (
      m.includes('contenedor') || m.includes('container') || m.includes('fcl') ||
      m.includes('lcl') || m.includes("20'") || m.includes("40'") ||
      m.includes('palet') || m.includes('pallet')
    ) {
      return 'Contenedor (FCL / LCL)';
    }

    // Breakbulk / Maquinaria Suelta (evaluado antes de "bulk" para evitar falsos positivos con "breakbulk")
    if (
      m.includes('breakbulk') || m.includes('break bulk') || m.includes('break-bulk') ||
      m.includes('maquinaria suelta') || m.includes('carga suelta') || m.includes('heavy lift') ||
      (!m.includes('palet') && (hasWord(m, 'suelto') || hasWord(m, 'suelta') || hasWord(m, 'loose')))
    ) {
      return 'Breakbulk / Maquinaria Suelta';
    }

    // Big Bags / Granel
    if (
      m.includes('big bag') || m.includes('bigbag') || m.includes('granel') ||
      m.includes('dry bulk') || hasWord(m, 'bulk') || m.includes('saco') ||
      m.includes('fibc') || hasWord(m, 'vrac') || m.includes('ensacad')
    ) {
      return 'Big Bags / Granel';
    }
  }

  // Deducción contextual multilingüe (ES, EN, FR, DE, CA, IT, PT) y por parámetros físicos
  const d = normalizeStr(`${desc || ''} ${category || ''}`);

  // 1. Vehículos o unidades rodadas (incluso pesados como dumpers o camiones de 30t van por Ro-Ro)
  if (
    category === 'Vehículo / Unidades Rodadas' ||
    d.includes('camion') || d.includes('camio') || d.includes('caminhao') || d.includes('cabeza tractora') ||
    d.includes('tractor') || hasWord(d, 'trailer') || d.includes('remolque') || d.includes('anhanger') ||
    d.includes('semirremolque') || d.includes('semi-trailer') || d.includes('furgoneta') || hasWord(d, 'van') ||
    d.includes('vehiculo') || d.includes('veicolo') || d.includes('veiculo') || d.includes('autocarro') ||
    d.includes('autoarticolato') || hasWord(d, 'lkw') || d.includes('zugmaschine') || d.includes('cavalo mecanico') ||
    d.includes('chassis') || d.includes('dumper') || d.includes('tombereau') || d.includes('kipper') ||
    d.includes('volquete') || d.includes('automovil') || hasWord(d, 'coche') || d.includes('autobus') || hasWord(d, 'bus')
  ) {
    return 'Ro-Ro / Vehículo Rodado';
  }

  // 2. Plataforma / Flat Rack explícito en descripción o contexto
  if (
    d.includes('flat rack') || d.includes('flatrack') || d.includes('flat-rack') ||
    d.includes('plataforma') || d.includes('platform') || d.includes('pritsche') || d.includes('mafi')
  ) {
    return 'Plataforma / Flat Rack';
  }

  // 3. Granel y sacos / Big Bags
  if (
    category === 'Mercancía Ensacada / Dry Bulk' ||
    d.includes('big bag') || d.includes('bigbag') || d.includes('granel') || d.includes('dry bulk') ||
    hasWord(d, 'bulk') || d.includes('saco') || d.includes('fibc') || hasWord(d, 'vrac') || d.includes('ensacad')
  ) {
    return 'Big Bags / Granel';
  }

  // 4. Breakbulk / Maquinaria Suelta por peso o dimensiones sobredimensionadas (maquinaria, transformadores, turbinas, vigas largas)
  if (
    weightVal > 15000 || len > 12 || wid > 2.5 || heightVal > 2.6 ||
    d.includes('bastidor') || d.includes('skid') || d.includes('maquinaria') || d.includes('machinery') ||
    d.includes('grua') || hasWord(d, 'crane') || hasWord(d, 'kran') || d.includes('guindaste') ||
    d.includes('molino') || d.includes('transformador') || d.includes('transformer') ||
    d.includes('transformateur') || d.includes('excavadora') || d.includes('excavator') ||
    d.includes('bagger') || d.includes('pelle') || d.includes('escavatore') || d.includes('escavadeira') ||
    d.includes('generador') || d.includes('generator') || d.includes('turbina') || d.includes('turbine') ||
    d.includes('caldera') || d.includes('breakbulk') || d.includes('break bulk') || d.includes('heavy lift')
  ) {
    return 'Breakbulk / Maquinaria Suelta';
  }

  // 5. Contenedor (FCL / LCL) para cajas, palets, suministros o carga general estandarizada
  return 'Contenedor (FCL / LCL)';
}

const WEIGHT_THRESHOLD_TONS = 40;

/**
 * Suma el peso total acumulado de todos los ítems de la orden,
 * además del volumen métrico total y el peso unitario máximo.
 *
 * @param {Array<Object>} items Lista de ítems de carga
 * @returns {Object} Resumen consolidado de la orden
 */
function calculateOrderTotals(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      totalItems: 0,
      totalPieces: 0,
      totalWeightKg: 0,
      totalWeightTons: 0,
      totalVolumeCbm: 0,
      maxPieceWeightKg: 0,
      maxPieceWeightTons: 0,
      weightThresholdTons: WEIGHT_THRESHOLD_TONS,
      exceedsCharterThreshold: false,
    };
  }

  let totalPieces = 0;
  let totalWeightKg = 0;
  let totalVolumeCbm = 0;
  let maxPieceWeightKg = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unitWeight = Math.max(0, Number(item.weight ?? item.unit_weight_kg) || 0);
    const lineWeight = qty * unitWeight;

    const len = Math.max(0, Number(item.length ?? item.length_m) || 0);
    const wid = Math.max(0, Number(item.width ?? item.width_m) || 0);
    const hgt = Math.max(0, Number(item.height ?? item.height_m) || 0);
    const unitVolume = len * wid * hgt;
    const lineVolume = qty * unitVolume;

    totalPieces += qty;
    totalWeightKg += lineWeight;
    totalVolumeCbm += lineVolume;
    if (unitWeight > maxPieceWeightKg) {
      maxPieceWeightKg = unitWeight;
    }
  }

  const totalWeightTons = totalWeightKg / 1000;
  const maxPieceWeightTons = maxPieceWeightKg / 1000;
  const exceedsCharterThreshold = totalWeightTons >= WEIGHT_THRESHOLD_TONS;

  return {
    totalItems: items.length,
    totalPieces,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    totalWeightTons: Math.round(totalWeightTons * 1000) / 1000,
    totalVolumeCbm: Math.round(totalVolumeCbm * 1000) / 1000,
    maxPieceWeightKg: Math.round(maxPieceWeightKg * 100) / 100,
    maxPieceWeightTons: Math.round(maxPieceWeightTons * 1000) / 1000,
    weightThresholdTons: WEIGHT_THRESHOLD_TONS,
    exceedsCharterThreshold,
  };
}

// =============================================================================
// CATÁLOGO DE PUERTOS Y DISTANCIAS NÁUTICAS DE REFERENCIA (POL / POD)
// =============================================================================
const WORLD_PORTS = {
  valencia: { name: 'Valencia, Spain', lat: 39.45, lon: -0.32 },
  barcelona: { name: 'Barcelona, Spain', lat: 41.35, lon: 2.17 },
  bilbao: { name: 'Bilbao, Spain', lat: 43.35, lon: -3.05 },
  algeciras: { name: 'Algeciras, Spain', lat: 36.13, lon: -5.44 },
  rotterdam: { name: 'Rotterdam, Netherlands', lat: 51.95, lon: 4.14 },
  antwerp: { name: 'Antwerp, Belgium', lat: 51.27, lon: 4.33 },
  hamburg: { name: 'Hamburg, Germany', lat: 53.53, lon: 9.96 },
  houston: { name: 'Houston, USA', lat: 29.74, lon: -95.27 },
  'new orleans': { name: 'New Orleans, USA', lat: 29.95, lon: -90.07 },
  'new york': { name: 'New York, USA', lat: 40.67, lon: -74.04 },
  santos: { name: 'Santos, Brazil', lat: -23.95, lon: -46.30 },
  'buenos aires': { name: 'Buenos Aires, Argentina', lat: -34.60, lon: -58.37 },
  alexandria: { name: 'Alexandria, Egypt', lat: 31.20, lon: 29.88 },
  genoa: { name: 'Genoa, Italy', lat: 44.41, lon: 8.92 },
  singapore: { name: 'Singapore', lat: 1.28, lon: 103.85 },
  shanghai: { name: 'Shanghai, China', lat: 31.23, lon: 121.50 },
  'jebel ali': { name: 'Jebel Ali, UAE', lat: 25.01, lon: 55.06 },
  dubai: { name: 'Dubai, UAE', lat: 25.27, lon: 55.30 },
  casablanca: { name: 'Casablanca, Morocco', lat: 33.60, lon: -7.60 },
  dakar: { name: 'Dakar, Senegal', lat: 14.68, lon: -17.43 }
};

const KNOWN_PORT_DISTANCES_NM = {
  'valencia-houston': 4850,
  'houston-valencia': 4850,
  'bilbao-rotterdam': 750,
  'rotterdam-bilbao': 750,
  'valencia-rotterdam': 1950,
  'rotterdam-valencia': 1950,
  'valencia-alexandria': 1600,
  'alexandria-valencia': 1600,
  'barcelona-santos': 5100,
  'santos-barcelona': 5100,
  'algeciras-houston': 4650,
  'houston-algeciras': 4650,
  'antwerp-houston': 4900,
  'houston-antwerp': 4900,
  'rotterdam-houston': 4920,
  'houston-rotterdam': 4920
};

/**
 * Calcula la distancia náutica aproximada en millas náuticas (NM) entre dos puertos.
 *
 * @param {string} pol Puerto de Carga (origen)
 * @param {string} pod Puerto de Descarga (destino)
 * @returns {number} Distancia en Millas Náuticas (NM)
 */
function calculatePortDistanceNm(pol, pod) {
  const normPol = String(pol || '').trim().toLowerCase();
  const normPod = String(pod || '').trim().toLowerCase();
  if (!normPol || !normPod) return 1500;
  if (normPol === normPod) return 50;

  const key = `${normPol}-${normPod}`;
  if (KNOWN_PORT_DISTANCES_NM[key]) {
    return KNOWN_PORT_DISTANCES_NM[key];
  }

  const findPort = (name) => {
    for (const [k, p] of Object.entries(WORLD_PORTS)) {
      if (name.includes(k) || k.includes(name)) return p;
    }
    return null;
  };

  const p1 = findPort(normPol);
  const p2 = findPort(normPod);

  if (p1 && p2) {
    const earthRadiusNm = 3440.065;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLon = toRad(p2.lon - p1.lon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    // Factor de ruta marítima 1.20 por desvío de masas terrestres y canales
    const nauticalDist = Math.round(earthRadiusNm * c * 1.20);
    return Math.max(100, nauticalDist);
  }

  return 1500;
}

/**
 * Motor paramétrico de rotación de buque y flete marítimo TCE.
 *
 * @param {Object} params Parámetros de navegación y ritmos
 * @returns {Object} Desglose paramétrico de duración de rotación y coste de flete TCE
 */
function calculateRotationAndTce({
  totalWeightTons = 0,
  loadingRateMtDay = 1200,
  dischargingRateMtDay = 1000,
  distanceNm = 1500,
  serviceSpeedKnots = 12.0,
  vesselDailyRateUsd = 11500,
  exchangeRateUsdToEur = 0.92,
  pol = 'Valencia',
  pod = 'Houston'
} = {}) {
  const weight = Math.max(0, Number(totalWeightTons) || 0);
  const loadRate = Math.max(1, Number(loadingRateMtDay) || 1200);
  const dischRate = Math.max(1, Number(dischargingRateMtDay) || 1000);
  const dist = Math.max(10, Number(distanceNm) || 1500);
  const speed = Math.max(1, Number(serviceSpeedKnots) || 12.0);
  const dailyRate = Math.max(0, Number(vesselDailyRateUsd) || 11500);
  const exRate = Math.max(0.01, Number(exchangeRateUsdToEur) || 0.92);

  // 1. Días de Carga = Peso Total de la Carga (MT) / Ritmo de Carga (MT/día)
  const loadingDays = Math.round((weight / loadRate) * 100) / 100;

  // 2. Días de Descarga = Peso Total de la Carga (MT) / Ritmo de Descarga (MT/día)
  const dischargingDays = Math.round((weight / dischRate) * 100) / 100;

  // 3. Días de Navegación = Distancia Náutica POL-POD / (Velocidad de Servicio del Buque en nudos × 24)
  const navigationDays = Math.round((dist / (speed * 24)) * 100) / 100;

  // 4. Duración Total de la Rotación del Buque (D_total)
  const totalRotationDays = Math.round((loadingDays + dischargingDays + navigationDays) * 100) / 100;

  // 5. Flete Marítimo (TCE) = D_total × Tarifa Diaria (USD/día) × Tipo de Cambio aplicable
  const oceanFreightTceUsd = Math.round(totalRotationDays * dailyRate * 100) / 100;
  const oceanFreightTceEur = Math.round(oceanFreightTceUsd * exRate * 100) / 100;

  return {
    pol: String(pol || 'Valencia').trim(),
    pod: String(pod || 'Houston').trim(),
    totalWeightTons: weight,
    loadingRateMtDay: loadRate,
    dischargingRateMtDay: dischRate,
    distanceNm: dist,
    serviceSpeedKnots: speed,
    dailyHireRateUsd: dailyRate,
    exchangeRateUsdToEur: exRate,
    loadingDays,
    dischargingDays,
    navigationDays,
    totalRotationDays,
    oceanFreightTceUsd,
    oceanFreightTceEur,
    formula: 'Flete Marítimo (TCE) = D_total × Tarifa diaria del buque (USD/día) × Tipo de cambio aplicable',
    formulaRotation: 'D_total = Días de Carga + Días de Descarga + Días de Navegación',
  };
}

/**
 * Cálculo y gestión de demoras portuarias (Demurrage) por exceso de tiempo de operativa en muelle.
 *
 * @param {Object} params Tiempos permitidos y tiempos reales en muelle
 * @returns {Object} Liquidación de demoras y penalizaciones
 */
function calculateDemurrage({
  allowedLoadingDays = 0,
  allowedDischargingDays = 0,
  actualLoadingDays = null,
  actualDischargingDays = null,
  actualPortDays = null,
  demurrageDays = null,
  demurrageRateDailyUsd = 11500,
  exchangeRateUsdToEur = 0.92
} = {}) {
  const allowedLoad = Math.max(0, Number(allowedLoadingDays) || 0);
  const allowedDisch = Math.max(0, Number(allowedDischargingDays) || 0);
  const allowedTotalPortDays = Math.round((allowedLoad + allowedDisch) * 100) / 100;

  const actualLoad = actualLoadingDays !== null && actualLoadingDays !== undefined && actualLoadingDays !== ''
    ? Math.max(0, Number(actualLoadingDays)) : null;
  const actualDisch = actualDischargingDays !== null && actualDischargingDays !== undefined && actualDischargingDays !== ''
    ? Math.max(0, Number(actualDischargingDays)) : null;
  const actualPort = actualPortDays !== null && actualPortDays !== undefined && actualPortDays !== ''
    ? Math.max(0, Number(actualPortDays)) : null;
  const explicitDemurrage = demurrageDays !== null && demurrageDays !== undefined && demurrageDays !== ''
    ? Math.max(0, Number(demurrageDays)) : null;

  let loadingDemurrageDays = 0;
  if (actualLoad !== null && actualLoad > allowedLoad) {
    loadingDemurrageDays = Math.round((actualLoad - allowedLoad) * 100) / 100;
  }

  let dischargingDemurrageDays = 0;
  if (actualDisch !== null && actualDisch > allowedDisch) {
    dischargingDemurrageDays = Math.round((actualDisch - allowedDisch) * 100) / 100;
  }

  let totalDemurrageDays = 0;
  if (explicitDemurrage !== null && explicitDemurrage > 0) {
    totalDemurrageDays = explicitDemurrage;
  } else if (actualLoad !== null || actualDisch !== null) {
    totalDemurrageDays = Math.round((loadingDemurrageDays + dischargingDemurrageDays) * 100) / 100;
  } else if (actualPort !== null && actualPort > allowedTotalPortDays) {
    totalDemurrageDays = Math.round((actualPort - allowedTotalPortDays) * 100) / 100;
  }

  const dailyRate = Math.max(0, Number(demurrageRateDailyUsd) || 0);
  const exRate = Math.max(0.01, Number(exchangeRateUsdToEur) || 0.92);

  const totalPenaltyUsd = Math.round(totalDemurrageDays * dailyRate * 100) / 100;
  const totalPenaltyEur = Math.round(totalPenaltyUsd * exRate * 100) / 100;

  const hasDemurrage = totalDemurrageDays > 0;
  const status = hasDemurrage ? 'EXCESO DE ESTADÍA (ON DEMURRAGE)' : 'DENTRO DE PLANCHA (ON SCHEDULE)';

  return {
    hasDemurrage,
    status,
    allowedLoadingDays: allowedLoad,
    allowedDischargingDays: allowedDisch,
    allowedTotalPortDays,
    actualLoadingDays: actualLoad !== null ? actualLoad : allowedLoad,
    actualDischargingDays: actualDisch !== null ? actualDisch : allowedDisch,
    actualTotalPortDays: actualPort !== null ? actualPort : (actualLoad !== null && actualDisch !== null ? Math.round((actualLoad + actualDisch) * 100) / 100 : allowedTotalPortDays),
    loadingDemurrageDays,
    dischargingDemurrageDays,
    demurrageDays: totalDemurrageDays,
    demurrageRateDailyUsd: dailyRate,
    demurrageRateDailyEur: Math.round(dailyRate * exRate * 100) / 100,
    totalPenaltyUsd,
    totalPenaltyEur,
  };
}

/**
 * Evalúa la modalidad de fletamento según el umbral de 40 toneladas:
 * - Si peso < 40t: Omite por completo el cálculo de TCE y fletamento completo.
 *                  Computa automáticamente costes bajo modalidad de grupaje LCL.
 * - Si peso >= 40t: Aplica modelo de fletamento y calcula el TCE del buque sugerido.
 *
 * @param {Object} orderTotals Resumen de totales de la orden
 * @param {Array<Object>} items Lista de ítems
 * @param {Object} options Opciones operativas y de ruta (POL, POD, ritmos, demoras)
 * @returns {Object} Evaluación de fletamento y desglose económico
 */
function evaluateCharteringModel(orderTotals, items = [], options = {}) {
  const totalWeightTons = Number(orderTotals?.totalWeightTons) || 0;
  const totalVolumeCbm = Number(orderTotals?.totalVolumeCbm) || 0;
  const maxPieceWeightTons = Number(orderTotals?.maxPieceWeightTons) || 0;

  // REGLA 1: Peso < 40 toneladas => MODALIDAD LCL, OMITIR TCE Y FLETAMENTO COMPLETO
  if (totalWeightTons < WEIGHT_THRESHOLD_TONS) {
    // Cálculo de Revenue Tons (W/M) para grupaje marítimo LCL (1 t = 1 m3, mínimo de facturación 1 RT)
    const chargeableWeightTons = Math.max(0.1, totalWeightTons);
    const chargeableVolumeCbm = Math.max(0.1, totalVolumeCbm);
    const revenueTons = Math.max(1, Math.max(chargeableWeightTons, chargeableVolumeCbm));
    const wmBasis = chargeableWeightTons >= chargeableVolumeCbm ? 'Weight (W)' : 'Measurement (M)';

    // Tarifas comerciales marítimas estándar para grupaje internacional LCL
    const oceanFreightRatePerRt = 65.0; // Tarifa base flete marítimo LCL por RT
    const cfsOriginRatePerRt = 22.0;    // Terminal handling / consolidación CFS origen por RT
    const cfsDestRatePerRt = 25.0;      // Terminal handling / desconsolidación CFS destino por RT
    const portT3RatePerRt = 4.5;        // Tasas portuarias mercadería T3 por RT
    const blDocumentationFee = 85.0;    // Emisión de Bill of Lading y gestión aduanera documental (fijo)

    const oceanFreightCost = Math.round(revenueTons * oceanFreightRatePerRt * 100) / 100;
    const cfsOriginCost = Math.round(revenueTons * cfsOriginRatePerRt * 100) / 100;
    const cfsDestCost = Math.round(revenueTons * cfsDestRatePerRt * 100) / 100;
    const portChargesCost = Math.round(revenueTons * portT3RatePerRt * 100) / 100;
    const totalLclCost = Math.round((oceanFreightCost + cfsOriginCost + cfsDestCost + portChargesCost + blDocumentationFee) * 100) / 100;

    return {
      weightThresholdTons: WEIGHT_THRESHOLD_TONS,
      totalWeightTons,
      mode: 'Grupaje LCL (Less than Container Load)',
      shippingModeCategory: 'LCL',
      isFullCharter: false,
      fullCharterOmitted: true,
      tceCalculated: false,
      tce: null,
      timeCharterEquivalent: null,
      suggestedVessel: null,
      tceCalculation: null,
      reasoning: `El peso total acumulado (${totalWeightTons.toFixed(2)} t) es inferior a ${WEIGHT_THRESHOLD_TONS} toneladas. Se omite por completo la modalidad de fletamento completo y el cálculo del TCE del buque. Se computan automáticamente los costes bajo grupaje LCL.`,
      lclCostEstimation: {
        currency: 'USD',
        revenueTons: Math.round(revenueTons * 100) / 100,
        chargeableWeightTons: Math.round(chargeableWeightTons * 1000) / 1000,
        chargeableVolumeCbm: Math.round(chargeableVolumeCbm * 1000) / 1000,
        wmBasis,
        totalLclCost,
        rates: {
          oceanFreightRatePerRt,
          cfsOriginRatePerRt,
          cfsDestRatePerRt,
          portT3RatePerRt,
          blDocumentationFee,
        },
        costs: {
          oceanFreight: oceanFreightCost,
          cfsOriginHandling: cfsOriginCost,
          cfsDestinationHandling: cfsDestCost,
          portChargesT3: portChargesCost,
          documentationBL: blDocumentationFee,
          totalLclCost,
        },
        breakdown: [
          { concept: 'Flete Marítimo LCL (Ocean Freight)', ratePerRt: oceanFreightRatePerRt, amount: oceanFreightCost },
          { concept: 'Manipulación y Consolidación CFS Origen', ratePerRt: cfsOriginRatePerRt, amount: cfsOriginCost },
          { concept: 'Manipulación y Desconsolidación CFS Destino', ratePerRt: cfsDestRatePerRt, amount: cfsDestCost },
          { concept: 'Tasas Portuarias Mercancía (T3/Wharfage)', ratePerRt: portT3RatePerRt, amount: portChargesCost },
          { concept: 'Emisión B/L y Gestión Documental (Flat)', rateFlat: blDocumentationFee, amount: blDocumentationFee },
        ],
      },
    };
  }

  // REGLA 2: Peso >= 40 toneladas => MODALIDAD FLETAMENTO COMPLETO Y CÁLCULO DE TCE
  let vesselType = 'Coaster / Buque de Carga General (Mini-Bulker)';
  let dwt = 3500;
  let serviceSpeed = 10.5; // nudos
  let marketDailyTce = 8500; // USD/día benchmark de mercado spot
  let seaFuelConsumptionMt = 6.5; // VLSFO MT/día
  let portFuelConsumptionMt = 0.8; // LSMGO MT/día
  let gear = maxPieceWeightTons > 20 ? 'Geared (Grúas 2 x 25t)' : 'Gearless / Apoyo grúas de muelle';
  let portDisbursementsBase = 16000; // PDA combinada POL + POD

  if (totalWeightTons >= 35000) {
    vesselType = 'Supramax / Ultramax Bulk Carrier';
    dwt = 58000;
    serviceSpeed = 13.5;
    marketDailyTce = 16500;
    seaFuelConsumptionMt = 24.0;
    portFuelConsumptionMt = 3.0;
    gear = 'Geared (4 x 35t con cucharas 12m³)';
    portDisbursementsBase = 45000;
  } else if (totalWeightTons >= 10000) {
    vesselType = 'Handysize Bulk Carrier';
    dwt = 32000;
    serviceSpeed = 13.0;
    marketDailyTce = 13800;
    seaFuelConsumptionMt = 17.5;
    portFuelConsumptionMt = 2.2;
    gear = 'Geared (4 x 30t grúas con cucharas)';
    portDisbursementsBase = 32000;
  } else if (totalWeightTons >= 3000) {
    vesselType = 'Multi-Purpose MPP / Tween-decker';
    dwt = 9500;
    serviceSpeed = 12.0;
    marketDailyTce = 11500;
    seaFuelConsumptionMt = 12.0;
    portFuelConsumptionMt = 1.5;
    gear = 'Geared (Grúas combinables 2 x 60t a 120t SWL)';
    portDisbursementsBase = 24000;
  }

  const isBulkOrBags = isBulkOrBigBagsCargo(items);
  const pol = String(options.pol || options.port_of_loading || options.polPort || 'Valencia').trim();
  const pod = String(options.pod || options.port_of_discharge || options.podPort || 'Houston').trim();

  // Distancia náutica POL-POD (calculada paramétricamente o provista)
  let voyageDistanceNm = Number(options.distanceNm || options.voyageDistanceNm || options.distance);
  if (!voyageDistanceNm || isNaN(voyageDistanceNm) || voyageDistanceNm <= 0) {
    voyageDistanceNm = calculatePortDistanceNm(pol, pod);
  }

  // Ritmos de carga y descarga portuaria según tipo de mercancía o especificados
  const defaultLoadRate = isBulkOrBags ? 1200 : (maxPieceWeightTons > 30 ? 600 : 850);
  const defaultDischargeRate = isBulkOrBags ? 1000 : (maxPieceWeightTons > 30 ? 500 : 750);

  const loadRateTonsPerDay = Math.max(1, Number(options.loadingRate || options.loadingRateMtDay || options.loadRate) || defaultLoadRate);
  const dischargeRateTonsPerDay = Math.max(1, Number(options.dischargingRate || options.dischargingRateMtDay || options.dischargeRate) || defaultDischargeRate);

  if (options.serviceSpeedKnots || options.serviceSpeed || options.speedKnots) {
    serviceSpeed = Number(options.serviceSpeedKnots || options.serviceSpeed || options.speedKnots) || serviceSpeed;
  }

  const dailyHireRate = Number(options.dailyHireRate || options.vesselDailyRateUsd || options.dailyRateUsd) || marketDailyTce;
  const exchangeRate = Number(options.exchangeRate || options.usdEurExchangeRate) || 0.92;

  // MOTOR DE CÁLCULO DINÁMICO DE ROTACIÓN Y FLETE (TCE)
  // Días de Carga = Peso Total de la Carga (MT) / Ritmo de Carga (MT/día)
  // Días de Descarga = Peso Total de la Carga (MT) / Ritmo de Descarga (MT/día)
  // Días de Navegación = Distancia Náutica POL-POD / (Velocidad de Servicio del Buque en nudos × 24)
  // D_total = Días de Carga + Días de Descarga + Días de Navegación
  // Flete Marítimo (TCE) = D_total × Tarifa diaria (USD/día) × Tipo de cambio aplicable
  const rotation = calculateRotationAndTce({
    totalWeightTons,
    loadingRateMtDay: loadRateTonsPerDay,
    dischargingRateMtDay: dischargeRateTonsPerDay,
    distanceNm: voyageDistanceNm,
    serviceSpeedKnots: serviceSpeed,
    vesselDailyRateUsd: dailyHireRate,
    exchangeRateUsdToEur: exchangeRate,
    pol,
    pod,
  });

  // CÁLCULO Y GESTIÓN DE DEMORAS (DEMURRAGE)
  const demurrage = calculateDemurrage({
    allowedLoadingDays: rotation.loadingDays,
    allowedDischargingDays: rotation.dischargingDays,
    actualLoadingDays: options.actualLoadingDays,
    actualDischargingDays: options.actualDischargingDays,
    actualPortDays: options.actualPortDays,
    demurrageDays: options.demurrageDays,
    demurrageRateDailyUsd: options.demurrageRate || dailyHireRate,
    exchangeRateUsdToEur: exchangeRate,
  });

  const totalVoyageDays = rotation.totalRotationDays;
  const seaDays = rotation.navigationDays;
  const portDays = Math.round((rotation.loadingDays + rotation.dischargingDays) * 100) / 100;

  // Gastos de viaje del armador (Bunkers + PDA portuaria)
  const bunkerPriceVlsfo = 620; // USD/MT
  const bunkerPriceLsmgo = 840; // USD/MT
  const seaBunkerCost = Math.round(seaDays * seaFuelConsumptionMt * bunkerPriceVlsfo);
  const portBunkerCost = Math.round(portDays * portFuelConsumptionMt * bunkerPriceLsmgo);
  const totalBunkerCost = seaBunkerCost + portBunkerCost;
  const totalVoyageExpenses = totalBunkerCost + portDisbursementsBase;

  const tceEffectiveDaily = dailyHireRate;

  return {
    weightThresholdTons: WEIGHT_THRESHOLD_TONS,
    totalWeightTons,
    mode: 'Fletamento Completo / Buque Exclusivo (Full / Voyage Charter)',
    shippingModeCategory: 'Full Charter',
    isFullCharter: true,
    fullCharterOmitted: false,
    tceCalculated: true,
    tce: tceEffectiveDaily,
    timeCharterEquivalent: {
      dailyUsd: tceEffectiveDaily,
      calculatedTceDaily: tceEffectiveDaily,
      marketBenchmarkDailyTce: marketDailyTce,
      totalVoyageDays,
      rotationDays: totalVoyageDays,
      seaDays,
      navigationDays: seaDays,
      portDays,
      loadingDays: rotation.loadingDays,
      dischargingDays: rotation.dischargingDays,
      pol,
      pod,
      distanceNm: voyageDistanceNm,
      loadingRateMtDay: loadRateTonsPerDay,
      dischargingRateMtDay: dischargeRateTonsPerDay,
      serviceSpeedKnots: serviceSpeed,
      exchangeRateUsdToEur: exchangeRate,
      oceanFreightTceUsd: rotation.oceanFreightTceUsd,
      oceanFreightTceEur: rotation.oceanFreightTceEur,
      grossFreightRevenueUsd: rotation.oceanFreightTceUsd,
      totalVoyageExpensesUsd: totalVoyageExpenses,
      bunkerCostUsd: totalBunkerCost,
      portDisbursementsUsd: portDisbursementsBase,
      demurrage,
      formula: 'TCE = (Gross Freight - Voyage Expenses) / Total Voyage Duration Days | Flete Marítimo (TCE) = D_total × Tarifa diaria del buque (USD/día) × Tipo de cambio aplicable',
      formulaFreight: 'Flete Marítimo (TCE) = D_total × Tarifa diaria del buque (USD/día) × Tipo de cambio aplicable',
      formulaRotation: 'D_total = Días de Carga + Días de Descarga + Días de Navegación',
    },
    rotationBreakdown: {
      ...rotation,
      demurrage,
    },
    suggestedVessel: {
      vesselType,
      dwt,
      gear,
      serviceSpeedKnots: serviceSpeed,
      marketDailyTceUsd: marketDailyTce,
      dailyHireRateUsd: dailyHireRate,
      fuelSeaMtPerDay: seaFuelConsumptionMt,
      fuelPortMtPerDay: portFuelConsumptionMt,
    },
    reasoning: `El peso total acumulado (${totalWeightTons.toFixed(2)} t) iguala o supera las ${WEIGHT_THRESHOLD_TONS} toneladas. Se aplica el modelo de fletamento marítimo de buque completo (Voyage Charter) con rotación de ${totalVoyageDays.toFixed(2)} días (${rotation.loadingDays.toFixed(2)} d carga + ${rotation.dischargingDays.toFixed(2)} d descarga + ${seaDays.toFixed(2)} d navegación entre ${pol} y ${pod}) y tarifa de ${dailyHireRate.toLocaleString('es-ES')} USD/día.`,
    lclCostEstimation: null,
  };
}

/**
 * Identifica si la orden corresponde a cargas masivas o en Big Bags / graneles ensacados.
 *
 * @param {Array<Object>} items Lista de ítems
 * @returns {boolean}
 */
function isBulkOrBigBagsCargo(items = []) {
  if (!Array.isArray(items) || items.length === 0) return false;

  for (const it of items) {
    const cat = String(it.category || '');
    const shipping = String(it.shipping_mode_supported || '');
    const combined = normalizeStr(`${cat} ${it.type || ''} ${shipping}`);

    if (
      cat === 'Mercancía Ensacada / Dry Bulk' ||
      shipping === 'Big Bags / Granel' ||
      combined.includes('big bag') || combined.includes('bigbag') || combined.includes('fibc') ||
      combined.includes('saco') || combined.includes('ensacad') || combined.includes('granel') ||
      combined.includes('dry bulk') || hasWord(combined, 'bulk') || combined.includes('cereal') ||
      combined.includes('trigo') || combined.includes('cemento') || combined.includes('fertilizante') ||
      combined.includes('urea') || combined.includes('pellet') || combined.includes('biomasa') ||
      hasWord(combined, 'vrac') || combined.includes('mineral')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Establece un perfil operativo coherente:
 * - Las cargas masivas o en Big Bags emplean estiba en bloque, sacos de aire y láminas
 *   antihumedad, excluyendo por completo los cables de acero pesados o cunas de madera
 *   estructurales de proyectos industriales pesados.
 * - Las cargas industriales pesadas (maquinaria, transformadores, estructuras) emplean
 *   cunas de madera estructurales y cables de acero pesados.
 *
 * @param {Array<Object>} items Lista de ítems
 * @param {Object} orderTotals Totales consolidados de la orden
 * @returns {Object} Perfil operativo detallado con materiales requeridos y estrictamente excluidos
 */
function buildOperationalProfile(items = [], orderTotals) {
  const isBulkOrBags = isBulkOrBigBagsCargo(items);
  const totalPcs = Number(orderTotals?.totalPieces) || (Array.isArray(items) ? items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0) : 1);

  if (isBulkOrBags) {
    const estimatedCycles = Math.ceil(totalPcs / 15);

    return {
      profileType: 'CARGA_MASIVA_BIG_BAGS',
      title: 'Perfil Operativo: Cargas Masivas / Ensacadas en Big Bags',
      isMassiveOrBigBags: true,
      stowageMethod: 'Estiba en bloque (Block Stowage)',
      stowageDescription: 'Estiba compacta en bloque trabado y autosustentado en bodega corrida, eliminando huecos intermedios para maximizar el factor de estiba y prevenir corrimientos de carga durante la navegación marítima.',

      // Utillaje, equipamiento de izado y técnicas aplicadas obligatoriamente
      requiredEquipment: [
        'Spreader multipunto para izado en bloque (14-16 Big Bags por ciclo)',
        'Alquiler de grúa móvil portuaria y operador certificado por jornada',
        'Acopio previo en muelle del 70% de la carga (Pre-Stacking)',
        'Estiba en bloque (Block Stowage)',
        'Sacos de aire inflables (Dunnage Air Bags / Cojines neumáticos)',
        'Láminas antihumedad (Moisture Barrier Sheets / Papel Kraft / Polietileno)',
      ],
      spreaderEquipment: {
        applied: true,
        required: true,
        equipment: 'Spreader multipunto para Big Bags (bloques de 14 a 16 sacos por ciclo de izado)',
        capacityBagsPerCycle: '14-16 sacos/ciclo',
        cyclesEstimated: estimatedCycles,
        function: 'Manipulación simultánea y segura de bloques de 14 a 16 Big Bags por ciclo de izado, manteniendo flujo continuo hacia bodega y eliminando por completo eslingas sueltas individuales.',
      },
      portCraneEquipment: {
        applied: true,
        required: true,
        equipment: 'Grúa móvil portuaria con operador certificado por jornada',
        function: 'Alquiler obligatorio de grúa móvil portuaria y su operador por jornada para la manipulación y elevación continua de bloques de sacos con spreader multipunto en muelle.',
      },
      preStackingRule: {
        applied: true,
        required: true,
        percentage: 70,
        function: 'Acopio previo en muelle del 70% de la carga total antes de la llegada del buque para sostener el ritmo operativo con spreader multipunto.',
      },
      stevedoringLabor: {
        applied: true,
        required: true,
        focus: 'Cuadrillas de estiba en tierra especializadas en enganche rápido al spreader',
        pacingBasis: 'Dimensionamiento del personal de tierra en función de los ciclos de retorno de grúa (buque o grúa móvil portuaria de muelle) para mantener flujo continuo hacia bodega.',
      },
      airBags: {
        applied: true,
        required: true,
        material: 'Sacos de aire inflables (Dunnage Air Bags)',
        function: 'Inmovilización neumática y relleno de huecos perimetrales contra mamparos y costados para absorber esfuerzos dinámicos transversales.',
      },
      moistureBarrier: {
        applied: true,
        required: true,
        material: 'Láminas antihumedad (Moisture Barrier Sheets / Papel Kraft / Polietileno)',
        function: 'Aislamiento continuo sobre el plan de bodega y mamparos para proteger de condensaciones y sudor del buque (ship sweat).',
      },
      blockStowage: {
        applied: true,
        required: true,
        method: 'Estiba en bloque',
        function: 'Disposición continua trabada formando un prisma compacto de carga autosoportado.',
      },

      // EXCLUSIONES ESTRICTAS SEGÚN REGLA DE COHERENCIA OPERATIVA Y SEGURIDAD PORTUARIA
      excludedEquipment: [
        'Eslingas sueltas individuales (Loose individual slings)',
        'Cables de acero pesados (Heavy steel wire ropes)',
        'Cunas de madera estructurales (Structural timber saddles / Heavy wood cradles)',
        'Cadenas de trincaje pesado grado 80/100 (Heavy G80 lashing chains)',
        'Personal técnico especializado en trincaje industrial a bordo (no aplicable a estiba en bloque)',
      ],
      looseSlings: {
        applied: false,
        required: false,
        permitted: false,
        status: 'EXCLUIDO POR COMPLETO',
        reason: 'Queda prohibido calcular eslingas sueltas individuales para cargas de Big Bags; el izado debe computar obligatoriamente un Spreader multipunto para bloques de 14 a 16 Big Bags por ciclo.',
      },
      heavySteelCables: {
        applied: false,
        required: false,
        permitted: false,
        status: 'EXCLUIDO POR COMPLETO',
        reason: 'Incompatibilidad técnico-operativa: Los cables de acero pesados desgarran y seccionan los sacos y Big Bags de polipropileno, comprometiendo la integridad de la carga; están absolutamente prohibidos en estibas de mercancía masiva ensacada.',
      },
      structuralTimberCradles: {
        applied: false,
        required: false,
        permitted: false,
        status: 'EXCLUIDO POR COMPLETO',
        reason: 'Incompatibilidad estructural: Las cunas de madera estructurales corresponden a maquinaria industrial pesada indivisible o transformadores, quedando excluidas por completo en cargas en Big Bags o graneles.',
      },
      heavyLashingChains: {
        applied: false,
        required: false,
        permitted: false,
        status: 'EXCLUIDO POR COMPLETO',
        reason: 'Incompatibilidad operativa: Las cadenas de trincaje pesado dañan los sacos y corresponden a trincaje de maquinaria y piezas pesadas sobre cubierta o plan de bodega.',
      },
      industrialLashingPersonnel: {
        applied: false,
        required: false,
        permitted: false,
        status: 'EXCLUIDO POR COMPLETO',
        reason: 'En granel ensacado / Big Bags la estiba se ejecuta en bloque por cuadrillas portuarias de enganche rápido y posicionamiento, excluyendo el personal técnico especializado en trincaje industrial a bordo.',
      },

      operationalRecommendations: [
        'Verificar bodegas limpias y secas antes del embarque (Dry Cargo Clean).',
        'Extender láminas antihumedad continuas en el plan de bodega y costados.',
        'Utilizar obligatoriamente Spreader multipunto (14-16 Big Bags por ciclo) para izado simultáneo en bloque.',
        'Dimensionar cuadrillas de estiba en tierra para enganche rápido según ciclos de retorno de grúa (buque o móvil portuaria), garantizando flujo continuo hacia bodega.',
        'Ejecutar estiba en bloque trabado sin dejar vacíos entre fardos o sacos.',
        'Instalar sacos de aire inflables (Dunnage Bags) para inmovilizar huecos contra mamparos.',
        'PROHIBIDO utilizar eslingas sueltas individuales, cables de acero pesados o cunas de madera estructurales sobre esta mercancía.',
      ],
    };
  }

  // Carga industrial de proyecto / maquinaria pesada / breakbulk / mercancías paletizadas
  return {
    profileType: 'CARGA_PROYECTO_INDUSTRIAL',
    title: 'Perfil Operativo: Carga de Proyecto Industrial / Breakbulk / Maquinaria / Paletizado',
    isMassiveOrBigBags: false,
    stowageMethod: 'Estiba Individualizada de Carga de Proyecto y Reparto de Presiones',
    stowageDescription: 'Estiba individualizada sobre vagras y dobles fondos con cálculo de presión admisible (t/m2), empleando maderas de dunnage, cunas estructurales y trincajes directos mediante cables de acero pesados o cadenas con tensores.',
    requiredEquipment: [
      'Maderas de dunnage y cunas estructurales (Structural timber saddles / Dunnage wood)',
      'Cables de acero pesados con guardacabos y tensores',
      'Cadenas de trincaje de alta resistencia grado 80/100',
      'Personal técnico especializado en trincaje industrial a bordo',
    ],
    dunnageWood: {
      applied: true,
      required: true,
      status: 'REQUERIDO',
      reason: 'Imprescindible para el reparto de presiones y calce de seguridad de mercancías paletizadas, maquinaria y piezas de proyecto.',
    },
    heavySteelCables: {
      applied: true,
      required: true,
      permitted: true,
      status: 'REQUERIDO',
      reason: 'Imprescindible para el trincaje de piezas pesadas a cáncamos D-rings soldables según Código CSS de la OMI.',
    },
    lashingChainsG80: {
      applied: true,
      required: true,
      permitted: true,
      status: 'REQUERIDO',
      reason: 'Cadenas de trincaje de alta resistencia grado 80/100 con tensores de trinquete para trincaje primario.',
    },
    structuralTimberCradles: {
      applied: true,
      required: true,
      permitted: true,
      status: 'REQUERIDO',
      reason: 'Imprescindible para el asiento y reparto uniforme del peso concentrado de la maquinaria sobre la estructura del doble fondo del buque.',
    },
    industrialLashingPersonnel: {
      applied: true,
      required: true,
      permitted: true,
      status: 'REQUERIDO',
      reason: 'Personal técnico especializado en trincaje industrial a bordo para ejecución y certificación del trincaje según IMO CSS Code.',
    },
    airBags: {
      applied: false,
      required: false,
      material: 'Sacos de aire inflables',
      function: 'No aplicable como trincaje primario para piezas pesadas de maquinaria.',
    },
    moistureBarrier: {
      applied: false,
      required: false,
      material: 'Láminas antihumedad',
      function: 'No requeridas a nivel de bodega completa; se emplea embalaje propio del fabricante.',
    },
    blockStowage: {
      applied: false,
      required: false,
      method: 'Estiba individualizada',
      function: 'Apoyos distribuidos con cálculo de carga por cuaderna.',
    },
    excludedEquipment: [],
    operationalRecommendations: [
      'Verificar capacidad de carga local del doble fondo (t/m2).',
      'Asentar sobre maderas de dunnage y cunas estructurales adecuadamente dimensionadas.',
      'Trincar mediante cables de acero pesados o cadenas grado 80 con tensores a cáncamos D-rings certificados.',
      'Contar con personal técnico especializado en trincaje industrial a bordo durante toda la operativa de carga y fijación.',
    ],
  };
}

/**
 * Realiza el cálculo económico final del proyecto separando de forma explícita y rigurosa:
 * 1. Flete Marítimo (Ocean Freight / TCE del buque)
 * 2. Costes FOB y Operativa Portuaria (manipulación en muelle, estiba, trincaje, almacenaje, peritaje, inland, aduanas)
 * 3. Subtotales y Total Global (All-In) con precio de cotización o venta.
 *
 * Queda prohibido agrupar todos los conceptos en una cifra única sin antes detallar
 * estas dos grandes partidas de forma independiente.
 *
 * @param {Array<Object>} items Lista de ítems del proyecto
 * @param {Object} orderTotals Totales físicos calculados (peso, volumen, piezas)
 * @param {Object} charteringAssessment Evaluación de fletamento (LCL o buque completo con TCE)
 * @param {Object} operationalProfile Perfil operativo (estiba en bloque vs trincaje estructural)
 * @param {Object} options Parámetros adicionales (días almacenaje, peritaje, inland, aduanas, valor de mercancía)
 * @returns {Object} Desglose financiero detallado y transparente
 */
function calculateFinancialBreakdown(items = [], orderTotals, charteringAssessment, operationalProfile, options = {}) {
  const totals = orderTotals || calculateOrderTotals(items);
  const assessment = charteringAssessment || evaluateCharteringModel(totals, items, options);
  const profile = operationalProfile || buildOperationalProfile(items, totals);

  const currency = options.currency || 'EUR';
  const totalWeightTons = Number(totals?.totalWeightTons) || 0;
  const totalVolumeCbm = Number(totals?.totalVolumeCbm) || 0;
  const totalPieces = Number(totals?.totalPieces) || (Array.isArray(items) ? items.length : 1);
  const maxPieceWeightKg = Number(totals?.maxPieceWeightKg) || 0;
  const revenueTons = Math.max(1, Math.max(totalWeightTons, totalVolumeCbm));
  const isUnderThreshold = totalWeightTons < WEIGHT_THRESHOLD_TONS;

  // Parámetros periféricos
  const storageDays = Math.max(0, Number(options.storageDays) || 0);
  let surveyorCost = Math.max(0, Number(options.surveyorCost) || 0);
  if (surveyorCost === 0 && maxPieceWeightKg > 35000) {
    surveyorCost = 1500;
  }
  const inlandCost = Math.max(0, Number(options.inlandCost || options.inlandTrucksCount) || 0);
  const customsCost = Math.max(0, Number(options.customsCost) || 0);
  const merchandiseValue = Math.max(0, Number(options.merchandiseValue || options.cargoValue) || 0);

  // Superficie aproximada para almacenaje muelle/terminal
  let totalAreaM2 = 0;
  let roRoCount = 0;
  const roRoRegex = /camion|vehiculo|trailer|tractor|coche|furgoneta/i;
  for (const it of (Array.isArray(items) ? items : [])) {
    const q = Math.max(1, Number(it.quantity) || 1);
    const l = Math.max(0, Number(it.length ?? it.length_m) || 0);
    const w = Math.max(0, Number(it.width ?? it.width_m) || 0);
    totalAreaM2 += q * (l * w);
    const typ = String(it.type || '');
    if (roRoRegex.test(typ) || roRoRegex.test(normalizeStr(typ))) {
      roRoCount += q;
    }
  }
  const terminalStorageCost = Math.ceil(totalAreaM2) * storageDays * 2;

  // =========================================================================
  // 1. SUB-BLOQUE: FLETE MARÍTIMO (OCEAN FREIGHT / TCE BUQUE)
  // =========================================================================
  let oceanFreightSubtotal = 0;
  const oceanFreightItems = [];

  if (isUnderThreshold) {
    // Modalidad LCL
    const oceanFreightRatePerRt = 65.0;
    oceanFreightSubtotal = Math.round(revenueTons * oceanFreightRatePerRt * 100) / 100;
    oceanFreightItems.push({
      concept: 'Flete Marítimo LCL Base (Ocean Freight)',
      rate: oceanFreightRatePerRt,
      basis: `${revenueTons.toFixed(2)} RT (W/M)`,
      amount: oceanFreightSubtotal,
      currency,
      description: 'Tarifa base de flete marítimo internacional en régimen de grupaje consolidado',
    });
  } else {
    // Modalidad Fletamento Completo: Multiplicación estricta de D_total por la tarifa diaria del buque (USD/día) y el tipo de cambio aplicable
    const rot = assessment?.rotationBreakdown || assessment?.timeCharterEquivalent;
    const D_total = rot?.totalRotationDays ?? rot?.totalVoyageDays ?? 10;
    const dailyHire = rot?.dailyHireRateUsd ?? rot?.dailyUsd ?? assessment?.tce ?? 8500;
    const exRate = rot?.exchangeRateUsdToEur ?? (Number(options.exchangeRate || options.usdEurExchangeRate) || 0.92);

    // Flete Marítimo (TCE) = D_total × Tarifa diaria (USD/día) × Tipo de cambio aplicable
    oceanFreightSubtotal = Math.round(D_total * dailyHire * exRate * 100) / 100;
    const vesselName = assessment?.suggestedVessel?.vesselType || 'Buque de Carga General / Coaster';
    const polName = rot?.pol || options.pol || 'Valencia';
    const podName = rot?.pod || options.pod || 'Houston';
    const loadDays = rot?.loadingDays ?? 1;
    const dischDays = rot?.dischargingDays ?? 1;
    const navDays = rot?.navigationDays ?? rot?.seaDays ?? 6;

    oceanFreightItems.push({
      concept: 'Flete Marítimo Buque Completo (Ocean Freight / TCE)',
      rate: Math.round(dailyHire * exRate * 100) / 100,
      basis: `${D_total.toFixed(2)} días rotación (${loadDays.toFixed(2)}d carga + ${dischDays.toFixed(2)}d descarga + ${navDays.toFixed(2)}d nav)`,
      amount: oceanFreightSubtotal,
      currency,
      tceDaily: dailyHire,
      suggestedVessel: vesselName,
      rotationDays: D_total,
      loadingDays: loadDays,
      dischargingDays: dischDays,
      navigationDays: navDays,
      pol: polName,
      pod: podName,
      exchangeRate: exRate,
      description: `Flete de travesía marítima para buque fletado (${vesselName}, TCE: ${dailyHire.toLocaleString('es-ES')} USD/día) en rotación ${polName} a ${podName} (${D_total.toFixed(2)} días).`,
    });
  }

  // =========================================================================
  // 2. SUB-BLOQUE: COSTES FOB Y OPERATIVA PORTUARIA
  // =========================================================================
  let fobPortOperationsSubtotal = 0;
  const fobPortOperationsItems = [];

  if (isUnderThreshold) {
    // Desglose de costes operativos portuarios en régimen LCL
    const cfsOriginRatePerRt = 22.0;
    const cfsDestRatePerRt = 25.0;
    const portT3RatePerRt = 4.5;
    const blFee = 85.0;

    const cfsOriginCost = Math.round(revenueTons * cfsOriginRatePerRt * 100) / 100;
    const cfsDestCost = Math.round(revenueTons * cfsDestRatePerRt * 100) / 100;
    const portT3Cost = Math.round(revenueTons * portT3RatePerRt * 100) / 100;

    fobPortOperationsItems.push({
      concept: 'Manipulación y Consolidación CFS en Muelle Origen',
      rate: cfsOriginRatePerRt,
      basis: `${revenueTons.toFixed(2)} RT`,
      amount: cfsOriginCost,
      category: 'Manipulación en Muelle',
    });
    fobPortOperationsItems.push({
      concept: 'Manipulación y Desconsolidación CFS en Muelle Destino',
      rate: cfsDestRatePerRt,
      basis: `${revenueTons.toFixed(2)} RT`,
      amount: cfsDestCost,
      category: 'Manipulación en Muelle',
    });
    fobPortOperationsItems.push({
      concept: 'Tasas Portuarias sobre Mercancía (T3 / Wharfage)',
      rate: portT3RatePerRt,
      basis: `${revenueTons.toFixed(2)} RT`,
      amount: portT3Cost,
      category: 'Tasas Portuarias',
    });
    fobPortOperationsItems.push({
      concept: 'Emisión Documental B/L y Gestión de Despacho Portuario',
      rate: blFee,
      basis: 'Tarifa Fija',
      amount: blFee,
      category: 'Documentación y Despacho',
    });
  } else {
    // Desglose de costes operativos portuarios en régimen Breakbulk / Full Charter / Granel Ensacado
    const isBigBags = profile?.isMassiveOrBigBags || isBulkOrBigBagsCargo(items);

    if (isBigBags) {
      // =======================================================================
      // OPERATIVA ESPECÍFICA PARA GRANEL ENSACADO EN BIG BAGS
      // =======================================================================
      // Mano de Obra Portuaria y Ciclos de Operación:
      // Se calcula con base en cuadrillas y turnos de estiba enfocados en el enganche rápido
      // de los sacos al spreader multipunto (14-16 Big Bags por ciclo).
      // El modelo dimensiona el personal de tierra en función de los ciclos de retorno de grúa
      // (grúa propia de buque ~135 ciclos/turno o grúa móvil portuaria de muelle ~170 ciclos/turno).
      const bagsPerCycle = 15; // Bloques de 14 a 16 Big Bags por ciclo
      const totalCraneCycles = Math.max(1, Math.ceil(totalPieces / bagsPerCycle));

      const isPortCrane = options.craneType === 'port_crane' || options.usePortCrane === true;
      const cyclesPerShift = isPortCrane ? 170 : 135;
      const stevedoreGangs = Math.max(1, Math.ceil(totalCraneCycles / cyclesPerShift));
      const stevedoringGangsCost = stevedoreGangs * 1200;

      fobPortOperationsItems.push({
        concept: `Cuadrillas de Estiba en Muelle (Enganche Rápido Spreader: ${stevedoreGangs} turno${stevedoreGangs === 1 ? '' : 's'}, ${totalCraneCycles} ciclos)`,
        units: stevedoreGangs,
        unitCost: 1200,
        amount: stevedoringGangsCost,
        category: 'Manipulación en Muelle',
        craneCycles: totalCraneCycles,
        bagsPerCycle: '14-16',
        cranePacing: isPortCrane ? 'Grúa Móvil Portuaria de Muelle' : 'Grúa Propia del Buque',
        description: 'Cuadrilla portuaria de estibadores en muelle dimensionada para enganche rápido al spreader multipunto según ciclos de retorno de grúa, garantizando flujo continuo hacia bodega.',
      });

      // Utillaje y Equipamiento de Izado ("Trincaje y Operativa"):
      // Prohibidas eslingas sueltas individuales, cadenas y maderas de cuna estructurales.
      // Obligatorio Spreader multipunto (14-16 sacos por ciclo).
      const spreaderSets = Math.max(1, Math.min(2, Math.ceil(totalPieces / 1500)));
      const spreaderCost = spreaderSets * 600;
      fobPortOperationsItems.push({
        concept: 'Spreader Multipunto de Izado para Big Bags (Bloques de 14-16 sacos/ciclo)',
        units: spreaderSets,
        unitCost: 600,
        amount: spreaderCost,
        category: 'Trincaje y Operativa',
        description: 'Bastidor esparcidor multipunto homologado para izado simultáneo en bloque de 14 a 16 sacos. Prohibidas eslingas sueltas individuales y trincaje pesado.',
      });

      // Medios neumáticos de inmovilización en bodega (Dunnage Air Bags y láminas antihumedad)
      const airBagsUnits = Math.max(2, Math.ceil(totalWeightTons / 50));
      const airBagsCost = airBagsUnits * 35;
      fobPortOperationsItems.push({
        concept: `Medios Neumáticos de Estiba en Bloque (Dunnage Air Bags y Barrera Antihumedad: ${airBagsUnits} unid.)`,
        units: airBagsUnits,
        unitCost: 35,
        amount: airBagsCost,
        category: 'Trincaje y Operativa',
        description: 'Cojines neumáticos y láminas protectoras de aislamiento para inmovilizar huecos contra mamparos en estiba en bloque compacta.',
      });

      // 1. Alquiler obligatorio de grúa móvil portuaria y operador certificado por jornada para spreader
      const portCraneShifts = Math.max(1, stevedoreGangs);
      const portCraneDailyRate = 1800;
      const portCraneCost = portCraneShifts * portCraneDailyRate;
      fobPortOperationsItems.push({
        concept: `Alquiler de Grúa Móvil Portuaria y Operador (${portCraneShifts} jornada${portCraneShifts === 1 ? '' : 's'})`,
        units: portCraneShifts,
        unitCost: portCraneDailyRate,
        amount: portCraneCost,
        category: 'Equipos Auxiliares',
        description: 'Alquiler operativo de grúa móvil portuaria de muelle y operador certificado por jornada, imprescindible para sostener la elevación continua con spreader multipunto.',
      });

      // 2. Regla de acumulación en muelle: Pre-Stacking obligatorio del 70% de la carga total
      // Para proyectos de gran volumen / Big Bags, al menos el 70% debe estar acopiado en el puerto
      // antes de la llegada del buque para garantizar el ritmo de carga con spreader.
      const preStackingRatio = 0.70;
      const preStackedTons = Math.round(totalWeightTons * preStackingRatio * 100) / 100;
      const preStackingDays = Math.max(5, storageDays || 5);
      const effectiveAreaM2 = totalAreaM2 > 0 ? totalAreaM2 : (totalWeightTons > 0 ? totalWeightTons * 0.8 : totalPieces * 0.8);
      const preStackedAreaM2 = Math.ceil(effectiveAreaM2 * preStackingRatio);
      const preStackingStorageCost = Math.round(preStackedAreaM2 * preStackingDays * 2 * 100) / 100;

      fobPortOperationsItems.push({
        concept: `Almacenaje Portuario y Acopio Previo (Pre-Stacking 70%: ${preStackedTons.toLocaleString('es-ES')} MT, ${preStackingDays} días previos al atraque)`,
        units: preStackingDays,
        basis: `${preStackedAreaM2} m² (${preStackedTons.toLocaleString('es-ES')} MT acopiadas en muelle)`,
        amount: preStackingStorageCost,
        category: 'Almacenaje y Terminal',
        preStackedTons,
        preStackingDays,
        preStackedAreaM2,
        description: 'Estadía y almacenaje portuario obligatorio en muelle/terminal del 70% de la carga acumulada previamente a la llegada del buque para sostener el ritmo de carga con spreader.',
      });

      // Manipulación inicial: recepción terrestre, descarga y formación de acopio previo en explanada
      const initialHandlingRate = 2.00;
      const initialHandlingCost = Math.round(preStackedTons * initialHandlingRate * 100) / 100;
      fobPortOperationsItems.push({
        concept: `Manipulación Inicial y Acopio en Muelle (Recepción Pre-Stacking 70%: ${preStackedTons.toLocaleString('es-ES')} MT)`,
        units: preStackedTons,
        unitCost: initialHandlingRate,
        rate: initialHandlingRate,
        amount: initialHandlingCost,
        category: 'Manipulación en Muelle',
        preStackedTons,
        description: 'Recepción, descarga terrestre de camiones inland y formación de acopio en explanada del 70% de la carga acumulada previa al atraque para asegurar ritmo operativo de izado.',
      });

      // Personal técnico de trincaje industrial a bordo: EXCLUIDO (0 €)
      // Grúa heavy lift auxiliar: EXCLUIDA (0 €)
    } else {
      // =======================================================================
      // OPERATIVA PARA CARGA GENERAL, PALETIZADA Y PROYECTO (BREAKBULK / HEAVY LIFT)
      // =======================================================================
      // Mano de obra portuaria estándar
      const stevedoreGangs = Math.max(1, Math.ceil(totalPieces / 15));
      const stevedoringGangsCost = stevedoreGangs * 1200;
      fobPortOperationsItems.push({
        concept: `Cuadrillas de Estibadores en Muelle (${stevedoreGangs} turno${stevedoreGangs === 1 ? '' : 's'})`,
        units: stevedoreGangs,
        unitCost: 1200,
        amount: stevedoringGangsCost,
        category: 'Manipulación en Muelle',
      });

      if (maxPieceWeightKg > 8000) {
        const heavyLiftCost = 2500;
        fobPortOperationsItems.push({
          concept: 'Grúa Auxiliar de Muelle Heavy Lift (Izado de Alta Capacidad)',
          units: 1,
          unitCost: 2500,
          amount: heavyLiftCost,
          category: 'Manipulación en Muelle',
        });
      }

      if (roRoCount > 0) {
        const mafiUnits = roRoCount;
        const mafiCost = mafiUnits * 300;
        fobPortOperationsItems.push({
          concept: `Plataformas MAFI / Roll Trailers (${mafiUnits} unid.)`,
          units: mafiUnits,
          unitCost: 300,
          amount: mafiCost,
          category: 'Manipulación en Muelle',
        });
      }

      // Personal técnico especializado en trincaje industrial a bordo
      const lashingTeamCount = Math.max(1, Math.ceil(totalPieces / 20) + (roRoCount > 0 ? 1 : 0));
      const lashingTeamCost = lashingTeamCount * 800;
      fobPortOperationsItems.push({
        concept: `Personal Técnico Especializado en Trincaje Industrial a Bordo (${lashingTeamCount} equipo${lashingTeamCount === 1 ? '' : 's'})`,
        units: lashingTeamCount,
        unitCost: 800,
        amount: lashingTeamCost,
        category: 'Trincaje y Estiba',
        description: 'Especialistas homologados para ejecución y certificación del trincaje a bordo según Código CSS de la OMI.',
      });

      // Materiales de sujeción específicos: maderas de dunnage, cables de acero, cadenas de trincaje G80
      const dunnageCount = Math.ceil(totalWeightTons / 5);
      const chainsCount = Math.max(2, (roRoCount * 4) || Math.ceil(totalPieces * 1.5));
      const slingsCount = Math.ceil(totalPieces / 2);
      const shacklesCount = (slingsCount * 2) + (chainsCount * 2);
      const lashingCost = (dunnageCount * 30) + (chainsCount * 80) + (slingsCount * 40) + (shacklesCount * 15);

      fobPortOperationsItems.push({
        concept: 'Materiales de Sujeción y Trincaje Pesado (Maderas Dunnage, Cadenas G80, Cables de Acero, Grilletes)',
        units: totalPieces,
        amount: lashingCost,
        category: 'Trincaje y Estiba',
      });
    }
  }

  // Servicios Asociados y Periféricos
  const isBigBagsCargoProfile = profile?.isMassiveOrBigBags || isBulkOrBigBagsCargo(items);
  if (!isBigBagsCargoProfile && (terminalStorageCost > 0 || storageDays > 0)) {
    fobPortOperationsItems.push({
      concept: `Almacenaje en Terminal Portuaria (${storageDays} día${storageDays === 1 ? '' : 's'}, ${Math.ceil(totalAreaM2)} m²)`,
      units: storageDays,
      amount: terminalStorageCost,
      category: 'Servicios Asociados',
    });
  } else if (isBigBagsCargoProfile && storageDays > 5) {
    const extraDays = storageDays - 5;
    const effectiveAreaM2 = totalAreaM2 > 0 ? totalAreaM2 : (totalWeightTons > 0 ? totalWeightTons * 0.8 : totalPieces * 0.8);
    const extraStorageCost = Math.round(Math.ceil(effectiveAreaM2) * extraDays * 2 * 100) / 100;
    fobPortOperationsItems.push({
      concept: `Almacenaje Adicional en Terminal (${extraDays} día${extraDays === 1 ? '' : 's'} adicionales, ${Math.ceil(effectiveAreaM2)} m²)`,
      units: extraDays,
      amount: extraStorageCost,
      category: 'Servicios Asociados',
    });
  }

  if (surveyorCost > 0) {
    fobPortOperationsItems.push({
      concept: 'Inspección Pericial / Surveyor Portuario Independiente',
      units: 1,
      amount: surveyorCost,
      category: 'Servicios Asociados',
    });
  }

  if (inlandCost > 0) {
    fobPortOperationsItems.push({
      concept: 'Transporte Terrestre Inland / Acarreo Portuario',
      units: 1,
      amount: inlandCost,
      category: 'Servicios Asociados',
    });
  }

  if (customsCost > 0) {
    fobPortOperationsItems.push({
      concept: 'Despacho Aduanero y Tramitación de Aranceles',
      units: 1,
      amount: customsCost,
      category: 'Servicios Asociados',
    });
  }

  if (merchandiseValue > 0) {
    fobPortOperationsItems.push({
      concept: 'Valor de la Mercancía / Cobertura y Seguro Repercutible',
      units: 1,
      amount: merchandiseValue,
      category: 'Valor de Mercancía',
    });
  }

  // Gestión y penalización automática por demoras (Demurrage) en muelle
  const demurrage = assessment?.timeCharterEquivalent?.demurrage || assessment?.rotationBreakdown?.demurrage;
  if (demurrage && demurrage.hasDemurrage && demurrage.totalPenaltyEur > 0) {
    fobPortOperationsItems.push({
      concept: 'Penalización por Demoras en Muelle (Demurrage)',
      units: demurrage.demurrageDays,
      unitCost: demurrage.demurrageRateDailyEur,
      amount: demurrage.totalPenaltyEur,
      category: 'Servicios Asociados',
      subCategory: 'Demoras y Penalizaciones Portuarias',
      basis: `${demurrage.demurrageDays.toFixed(2)} días demora (${demurrage.demurrageRateDailyUsd.toLocaleString('es-ES')} USD/día)`,
      status: demurrage.status,
      description: `Sobrecoste automático por superar plazos de plancha en muelle (${demurrage.allowedTotalPortDays.toFixed(2)} d permitidos vs ${demurrage.actualTotalPortDays.toFixed(2)} d reales). Tarifa diaria de demora: ${demurrage.demurrageRateDailyUsd.toLocaleString('es-ES')} USD/día.`,
    });
  }

  // Suma exacta del Subtotal FOB y Operativa Portuaria
  fobPortOperationsSubtotal = fobPortOperationsItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  fobPortOperationsSubtotal = Math.round(fobPortOperationsSubtotal * 100) / 100;

  // =========================================================================
  // 3. SUBTOTALES Y TOTAL GLOBAL (ALL-IN)
  // =========================================================================
  const totalCostAllIn = Math.round((oceanFreightSubtotal + fobPortOperationsSubtotal) * 100) / 100;
  const marginPercentage = Number(options.marginPercent) || 15;
  const totalQuotationAllIn = Math.round((totalCostAllIn * (1 + (marginPercentage / 100))) * 100) / 100;
  const marginAmount = Math.round((totalQuotationAllIn - totalCostAllIn) * 100) / 100;

  const formatCurrency = (val) => `${Number(val || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  const summaryLines = [
    `📊 DESGLOSE FINANCIERO SEPARADO (SEACHARTER CORE PRO):`,
    `🌊 Subtotal Flete Marítimo / TCE: ${formatCurrency(oceanFreightSubtotal)} (${isUnderThreshold ? 'Grupaje LCL' : 'Fletamento Completo'})`,
    `🏗️ Subtotal Costes FOB y Operativa Portuaria: ${formatCurrency(fobPortOperationsSubtotal)} (Manipulación muelle, estiba/trincaje, tasas y servicios asociados)`,
  ];

  if (demurrage && demurrage.hasDemurrage) {
    summaryLines.push(`⚠️ Demoras en Muelle (Demurrage): ${formatCurrency(demurrage.totalPenaltyEur)} (${demurrage.demurrageDays.toFixed(2)} días de sobrecoste a ${demurrage.demurrageRateDailyUsd.toLocaleString('es-ES')} USD/día)`);
  }

  summaryLines.push(`💰 Coste Total Estimado All-In: ${formatCurrency(totalCostAllIn)}`);
  summaryLines.push(`🏷️ Importe Total Cotización / Venta (All-In): ${formatCurrency(totalQuotationAllIn)} (Margen: ${marginPercentage}%, ${formatCurrency(marginAmount)})`);

  const summaryText = summaryLines.join('\n');

  return {
    currency,
    isSeparatedBreakdown: true,
    subtotalOceanFreight: oceanFreightSubtotal,
    subtotalFobPortOperations: fobPortOperationsSubtotal,
    subtotals: {
      oceanFreight: oceanFreightSubtotal,
      fobAndPortOperations: fobPortOperationsSubtotal,
    },
    oceanFreight: {
      concept: 'Flete Marítimo / Ocean Freight (TCE Buque)',
      subtotal: oceanFreightSubtotal,
      currency,
      mode: isUnderThreshold ? 'Grupaje LCL' : 'Fletamento Completo',
      tceDaily: isUnderThreshold ? null : (assessment?.tce || 8500),
      items: oceanFreightItems,
    },
    fobAndPortOperations: {
      concept: 'Costes FOB y Operativa Portuaria',
      subtotal: fobPortOperationsSubtotal,
      currency,
      items: fobPortOperationsItems,
    },
    demurrage: demurrage || null,
    rotationBreakdown: assessment?.rotationBreakdown || assessment?.timeCharterEquivalent || null,
    totalCostAllIn,
    totalQuotationAllIn,
    salePriceAllIn: totalQuotationAllIn,
    marginPercentage,
    marginAmount,
    summaryText,
  };
}

/**
 * Función consolidadora para evaluar completamente la operativa portuaria y de fletamento.
 *
 * @param {Array<Object>} items Lista de ítems de la orden
 * @param {Object} options Opciones financieras y operativas
 * @returns {Object} Evaluación consolidada (orderTotals, charteringAssessment, operationalProfile, financialBreakdown)
 */
function evaluateOrderPortOperations(items = [], options = {}) {
  const orderTotals = calculateOrderTotals(items);
  const charteringAssessment = evaluateCharteringModel(orderTotals, items, options);
  const operationalProfile = buildOperationalProfile(items, orderTotals);
  const financialBreakdown = calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, options);

  return {
    orderTotals,
    charteringAssessment,
    operationalProfile,
    financialBreakdown,
  };
}

function detectFileMimeType(fileName, buffer, headerContentType) {
  if (buffer && buffer.length >= 4) {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    if (buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
  }

  const lowerName = (fileName || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lowerName.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lowerName.endsWith('.doc')) return 'application/msword';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) return 'text/plain';

  if (headerContentType && !headerContentType.includes('application/octet-stream') && !headerContentType.includes('multipart')) {
    const cleanHeader = headerContentType.split(';')[0].trim();
    if (cleanHeader) return cleanHeader;
  }

  return 'application/pdf';
}

function isExcelFormat(mimeType = '', fileName = '') {
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  return (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.csv') ||
    lowerMime.includes('spreadsheet') ||
    lowerMime.includes('excel') ||
    lowerMime.includes('csv')
  );
}

function isWordFormat(mimeType = '', fileName = '') {
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  return (
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc') ||
    lowerMime.includes('wordprocessingml') ||
    lowerMime.includes('msword')
  );
}

async function extractTextFromSpreadsheet(buffer) {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const textParts = [];
    for (const sheetName of (workbook.SheetNames || [])) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv && csv.trim()) {
        textParts.push(`[Hoja Excel: ${sheetName}]\n${csv.trim()}`);
      }
    }
    return textParts.join('\n\n') || buffer.toString('utf8');
  } catch (err) {
    console.warn('Advertencia al procesar hoja de cálculo con XLSX:', err?.message || err);
    return buffer.toString('utf8');
  }
}

async function extractTextFromWord(buffer) {
  try {
    const mammoth = await import('mammoth');
    const res = await mammoth.extractRawText({ buffer });
    if (res?.value && res.value.trim()) {
      return res.value.trim();
    }
    return buffer.toString('utf8');
  } catch (err) {
    console.warn('Advertencia al procesar documento Word con mammoth:', err?.message || err);
    return buffer.toString('utf8');
  }
}

export async function handler(req, context) {
  const method = req?.method || req?.httpMethod || '';

  // 1. Interceptar obligatoriamente peticiones OPTIONS (preflight CORS) respondiendo con 204 y cabeceras completas
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // 2. Permitir exclusivamente el método POST para la ejecución de negocio; rechazar cualquier otro método con 405
  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });
  }

  try {
    const rawContentType = (
      (typeof req?.headers?.get === 'function' ? req.headers.get('content-type') : null) ||
      req?.headers?.['content-type'] ||
      req?.headers?.['Content-Type'] ||
      ''
    );
    const contentType = rawContentType.toLowerCase();

    let headerFileName = (
      (typeof req?.headers?.get === 'function' ? (req.headers.get('x-file-name') || req.headers.get('content-disposition')) : null) ||
      req?.headers?.['x-file-name'] ||
      req?.headers?.['X-File-Name'] ||
      req?.headers?.['content-disposition'] ||
      ''
    );
    if (headerFileName.includes('filename=')) {
      const match = headerFileName.match(/filename=["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        headerFileName = match[1].trim();
      }
    }

    // 3. Soportar lectura dual de entrada (archivos adjuntos PDF/Excel/Word y órdenes en texto plano)
    let body = null;
    let isJsonRequest = false;
    let isTextPlainRequest = contentType.includes('text/plain') || contentType.includes('text/markdown');

    if (contentType.includes('application/json')) {
      isJsonRequest = true;
      if (typeof req.json === 'function') {
        try {
          body = await req.json();
        } catch (_) {
          body = null;
        }
      } else if (typeof req.body === 'string') {
        try {
          body = JSON.parse(req.body);
        } catch (_) {
          if (req.isBase64Encoded) {
            try {
              const decoded = Buffer.from(req.body, 'base64').toString('utf8');
              body = JSON.parse(decoded);
            } catch (_) {
              body = null;
            }
          }
        }
      } else if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        body = req.body;
      }
    }

    let fileBuffer = null;
    let pureBase64 = '';
    let fileName = headerFileName || '';
    let mimeType = '';
    let isChatOrder = false;

    if (isJsonRequest || (body && typeof body === 'object')) {
      let rawData = body?.fileBase64 ?? body?.pdfBase64 ?? body?.data ?? body?.file ?? body?.document ?? '';
      if (typeof rawData === 'string' && (rawData.trim().toLowerCase() === 'opcional' || rawData.trim().toLowerCase() === 'null' || rawData.trim().toLowerCase() === 'undefined')) {
        rawData = '';
      }
      fileName = body?.fileName || body?.name || headerFileName || '';
      mimeType = body?.mimeType || body?.type || '';

      const conversationalText = (
        body?.text ||
        body?.message ||
        body?.prompt ||
        body?.instruction ||
        body?.order ||
        body?.query ||
        body?.content ||
        body?.description
      );

      // Soporte directo prioritario para peticiones con lista de items ya estructurados
      const rawStructuredItems = Array.isArray(body?.items) ? body.items : (Array.isArray(body?.cargo_items) ? body.cargo_items : null);
      if ((!rawData || typeof rawData !== 'string' || !rawData.trim()) && Array.isArray(rawStructuredItems) && rawStructuredItems.length > 0) {
        const items = rawStructuredItems.map((it, idx) => {
          const qty = Number(it.quantity);
          const len = Number(it.length ?? it.length_m);
          const wid = Number(it.width ?? it.width_m);
          const hgt = Number(it.height ?? it.height_m);
          const wt = Number(it.weight ?? it.unit_weight_kg);

          const lengthVal = !isNaN(len) && len > 0 ? len : 0;
          const widthVal = !isNaN(wid) && wid > 0 ? wid : 0;
          const heightVal = !isNaN(hgt) && hgt > 0 ? hgt : 0;
          const weightVal = !isNaN(wt) && wt > 0 ? wt : 0;

          const rawCategory = typeof it.category === 'string' ? it.category.trim() : '';
          const typeVal = typeof it.type === 'string' ? it.type.trim() : '';
          const desc = `${rawCategory} ${typeVal}`.trim();

          const category = normalizeCategory(rawCategory, desc, typeVal);
          const shippingMode = normalizeShippingMode(it.shipping_mode_supported, desc, weightVal, lengthVal, widthVal, heightVal, category);

          return {
            id: it.id || `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
            category,
            type: typeVal,
            quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
            length: lengthVal,
            width: widthVal,
            height: heightVal,
            weight: weightVal,
            shipping_mode_supported: shippingMode,
            length_m: lengthVal,
            width_m: widthVal,
            height_m: heightVal,
            unit_weight_kg: weightVal,
          };
        });

        const orderTotals = calculateOrderTotals(items);
        const charteringAssessment = evaluateCharteringModel(orderTotals, items, body || {});
        const operationalProfile = buildOperationalProfile(items, orderTotals);
        const financialBreakdown = calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, body || {});

        return new Response(JSON.stringify({
          success: true,
          items,
          orderTotals,
          charteringAssessment,
          operationalProfile,
          financialBreakdown,
          reply: financialBreakdown.summaryText,
          documentMeta: {
            name: fileName || 'Items_Estructurados.json',
            size: 0,
            itemsCount: items.length,
            uploadedAt: new Date().toISOString(),
            dataBase64: null,
          },
        }), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        });
      }

      // Si no se adjuntó archivo en Base64 pero se envió una orden en texto plano desde el chat
      if ((!rawData || typeof rawData !== 'string' || !rawData.trim()) && (typeof conversationalText === 'string' && conversationalText.trim())) {
        const textStr = conversationalText.trim();
        isChatOrder = true;
        rawData = Buffer.from(textStr, 'utf8').toString('base64');
        if (!mimeType) mimeType = 'text/plain';
        fileName = fileName || 'orden_conversacional.txt';
      }

      if (!rawData || typeof rawData !== 'string' || !rawData.trim()) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No se encontró el archivo Base64 ni la orden en texto en el cuerpo de la petición.',
          items: [],
        }), {
          status: 400,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        });
      }

      // Limpieza estricta de Base64 eliminando prefijos DataURL (ej: "data:application/pdf;base64,...") y espacios en blanco
      pureBase64 = rawData.includes(',') ? rawData.split(',')[1].trim() : rawData.trim();
      fileBuffer = Buffer.from(pureBase64, 'base64');

      if (!fileBuffer || fileBuffer.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'El archivo Base64 proporcionado está vacío o no es válido.',
          items: [],
        }), {
          status: 400,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        });
      }
    } else {
      // Lectura de flujo binario directo o texto plano (non-JSON)
      let rawBinaryBuffer = null;
      if (typeof req.arrayBuffer === 'function') {
        try {
          const ab = await req.arrayBuffer();
          if (ab && ab.byteLength > 0) {
            rawBinaryBuffer = Buffer.from(ab);
          }
        } catch (_) {}
      } else if (Buffer.isBuffer(req.body)) {
        rawBinaryBuffer = req.body;
      } else if (typeof req.body === 'string') {
        if (req.isBase64Encoded) {
          try {
            rawBinaryBuffer = Buffer.from(req.body, 'base64');
          } catch (_) {}
        } else {
          rawBinaryBuffer = Buffer.from(req.body, 'utf8');
        }
      } else if (typeof req.text === 'function') {
        try {
          const txt = await req.text();
          if (txt) {
            rawBinaryBuffer = Buffer.from(txt, 'utf8');
          }
        } catch (_) {}
      }

      // Comprobar si el flujo binario recibido era en realidad un JSON sin cabecera Content-Type
      if (rawBinaryBuffer && rawBinaryBuffer.length > 0) {
        try {
          const textCandidate = rawBinaryBuffer.toString('utf8').trim();
          if (textCandidate.startsWith('{') && textCandidate.endsWith('}')) {
            const parsed = JSON.parse(textCandidate);
            if (parsed && typeof parsed === 'object') {
              body = parsed;
              const rawData = body.fileBase64 || body.pdfBase64 || body.data || body.file || '';
              fileName = body.fileName || body.name || headerFileName || '';
              mimeType = body.mimeType || body.type || '';

              const conversationalText = body?.text || body?.message || body?.prompt || body?.instruction || body?.order || body?.query || body?.content || body?.description;
              if ((!rawData || typeof rawData !== 'string' || !rawData.trim()) && typeof conversationalText === 'string' && conversationalText.trim()) {
                isChatOrder = true;
                pureBase64 = Buffer.from(conversationalText.trim(), 'utf8').toString('base64');
                fileBuffer = Buffer.from(pureBase64, 'base64');
                mimeType = 'text/plain';
                fileName = fileName || 'orden_conversacional.txt';
              } else if (rawData && typeof rawData === 'string' && rawData.trim()) {
                pureBase64 = rawData.includes(',') ? rawData.split(',')[1].trim() : rawData.trim();
                fileBuffer = Buffer.from(pureBase64, 'base64');
              }
            }
          }
        } catch (_) {}
      }

      if (!fileBuffer) {
        if (!rawBinaryBuffer || rawBinaryBuffer.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No se encontró el archivo Base64, flujo binario ni orden en texto en el cuerpo de la petición.',
            items: [],
          }), {
            status: 400,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
            },
          });
        }

        // Si es texto plano (orden de chat o documento .txt)
        const isPdfMagic = rawBinaryBuffer.subarray(0, 5).toString('ascii').startsWith('%PDF-');
        const isZipOrDoc = rawBinaryBuffer[0] === 0x50 && rawBinaryBuffer[1] === 0x4B; // PK...
        const isOle = rawBinaryBuffer[0] === 0xD0 && rawBinaryBuffer[1] === 0xCF; // OLE...
        const isPngOrJpg = (rawBinaryBuffer[0] === 0x89 && rawBinaryBuffer[1] === 0x50) || (rawBinaryBuffer[0] === 0xFF && rawBinaryBuffer[1] === 0xD8);

        if (isTextPlainRequest || (!isPdfMagic && !isZipOrDoc && !isOle && !isPngOrJpg && !headerFileName.toLowerCase().endsWith('.pdf') && !headerFileName.toLowerCase().endsWith('.xlsx') && !headerFileName.toLowerCase().endsWith('.docx'))) {
          isChatOrder = true;
          fileBuffer = rawBinaryBuffer;
          pureBase64 = fileBuffer.toString('base64');
          mimeType = 'text/plain';
          fileName = headerFileName || 'orden_conversacional.txt';
        } else {
          fileBuffer = rawBinaryBuffer;
          pureBase64 = fileBuffer.toString('base64');
          fileName = headerFileName || 'Documento_Proyecto.pdf';
        }
      }
    }

    if (!fileName) {
      fileName = isChatOrder ? 'orden_conversacional.txt' : 'Documento_Proyecto.pdf';
    }

    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = detectFileMimeType(fileName, fileBuffer, rawContentType);
    }

    const apiKey = (typeof Netlify !== 'undefined' && (Netlify.env?.get?.('GEMINI_API_KEY') || Netlify.env?.get?.('GOOGLE_API_KEY') || Netlify.env?.get?.('GOOGLE_GENAI_API_KEY')))
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      console.error('GEMINI_API_KEY no configurada en las variables de entorno.');
      return new Response(JSON.stringify({
        success: false,
        error: 'GEMINI_API_KEY no configurada en el servidor.',
        items: [],
      }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = `Eres el motor experto de inteligencia logística, estiba y fletamentos marítimos para SeaCharter Core PRO.
Analiza exhaustivamente el documento adjunto o la orden en lenguaje natural / texto plano enviada desde el widget conversacional.

DETECCIÓN AUTOMÁTICA DE IDIOMAS Y NORMALIZACIÓN LOGÍSTICA:
Detecta automáticamente el idioma de origen del documento (inglés, francés, alemán, catalán, italiano, portugués o español).
Traduce y normaliza obligatoriamente todos los términos técnicos, descripciones de mercancías, categorías y tipos de embalaje al ESPAÑOL profesional de la logística marítima y portuaria (por ejemplo: 'digger/excavator' -> 'Excavadora', 'tombereau' -> 'Dúmper / Camión volquete', 'Radlader' -> 'Pala cargadora sobre ruedas', 'carró' -> 'Carro / Remolque', 'trattore stradale' -> 'Cabeza tractora', 'guindaste' -> 'Grúa'). Todos los valores de 'category' y 'type' deben entregarse obligatoriamente normalizados en español.

APLICA UN FILTRADO INTELIGENTE EN TRES FASES ESTRICTAS:
1. ENCABEZADO: Identifica e ignora por completo los metadatos de la empresa emisora/receptora, fechas, números de contrato, referencias generales, direcciones, identificadores fiscales y logotipos. Ninguno de estos datos debe ser extraído como ítem de carga.
2. CUERPO DEL DOCUMENTO: Es la fuente principal donde se detalla la carga de forma tabular o descriptiva. Extrae con la máxima fidelidad y rigor técnico cada ítem o línea real de carga.
3. PIE DE PÁGINA / FINAL: Identifica e ignora los totales globales (ej. Total Bruto, Total Bultos, Sumas acumuladas, Peso Total General), notas legales, condiciones generales y firmas para evitar duplicidades de ítems.

REGLAS DE NEGOCIO ESTRICTAS PARA CADA ÍTEM EXTRAÍDO:
- category: Clasifica OBLIGATORIAMENTE la mercancía en una de las siguientes categorías oficiales del catálogo controlado (ESTÁ ESTRICTAMENTE PROHIBIDO generar valores personalizados fuera de estos catálogos):
  * "Mercancía Ensacada / Dry Bulk" (para mercancías ensacadas, sacos, big bags, graneles secos, minerales, cereales, etc.)
  * "Maquinaria / Equipos Industriales" (para maquinaria de construcción, equipos industriales, equipos de proceso, transformadores, generadores, turbinas, etc.)
  * "Vehículo / Unidades Rodadas" (para camiones, cabezas tractoras, remolques, turismos, furgonetas, dumpers, etc.)
  * "Estructura Metálica" (para vigas, perfiles, tubos, tuberías, bobinas de acero, celosías, etc.)
  * "Carga General / General Cargo" (para carga general, mercancía paletizada, cajas, bultos estándar, etc.)
  * "Suministros / Supplies" (para repuestos, herramientas, consumibles, accesorios, ferretería, etc.)
  Si no se puede determinar, clasifícalo obligatoriamente en "Carga General / General Cargo".
- type: Detalle exacto y profesional de la mercancía tal como aparece en el documento, traducido y normalizado al español. Si no aparece, devuélvelo como "".
- quantity: Número de unidades (entero positivo). Si el documento agrupa varias líneas idénticas (mismo tipo, mismas dimensiones y mismo peso unitario), suma las cantidades de forma lógica; si tienen variaciones en dimensiones, peso o especificaciones, mantenlas como filas independientes. Por defecto 1 si no se indica.
- length: Medida en metros (número decimal). Si el documento indica dimensiones en centímetros o milímetros, conviértelas obligatoriamente a metros (ej: 6000 mm -> 6.0; 240 cm -> 2.4). Si hay múltiples elementos con distintas dimensiones, NUNCA los promedies: colócalos por separado con sus medidas reales en líneas distintas. Si no aparece, pon 0.
- width: Ancho en metros (número decimal). Si no aparece, pon 0.
- height: Alto en metros (número decimal). Si no aparece, pon 0.
- weight: Peso unitario en kilogramos (kg, número decimal o entero). Si en el documento viene expresado en toneladas (MT/t), conviértelo a kg multiplicando por 1000 (ej: 12.6 t -> 12600). Si hay varios elementos bajo la misma categoría o descripción pero con distinto peso real, respeta el peso independiente de cada línea (ESTÁ ESTRICTAMENTE PROHIBIDO unificar o promediar pesos si varían en el documento). Si no aparece el peso, pon obligatoriamente 0.
- shipping_mode_supported: Clasifica OBLIGATORIAMENTE el modo de transporte adecuado seleccionando estrictamente uno de los siguientes valores oficiales del catálogo controlado (ESTÁ ESTRICTAMENTE PROHIBIDO generar valores personalizados fuera de estos catálogos):
  * "Big Bags / Granel" (para big bags, sacos, graneles secos, ensacados)
  * "Contenedor (FCL / LCL)" (para contenedores FCL/LCL, mercancía paletizada o en cajas contenerizable)
  * "Breakbulk / Maquinaria Suelta" (para maquinaria pesada, piezas sobredimensionadas, carga suelta de proyecto)
  * "Plataforma / Flat Rack" (para equipos que requieren plataforma, flat rack o mafi trailer)
  * "Ro-Ro / Vehículo Rodado" (para vehículos rodados, camiones, unidades autopropulsadas o remolques)
  (Si el documento no lo menciona explícitamente, dedúcelo de manera lógica según las dimensiones, peso y naturaleza descrita de la carga, seleccionando obligatoriamente uno de estos 5 valores oficiales).

CERO DATOS PREGRABADOS:
Está totalmente prohibido inventar datos o usar funciones de respaldo con datos fijos (como plantas desaladoras o ítems por defecto). Si un campo numérico no aparece en el documento, devuelve 0; si es texto, cadena vacía "". Todo debe salir exclusivamente de la lectura real del documento analizado. Si el documento no contiene partidas de carga, devuelve una lista de items vacía [].

Devuelve la respuesta EXCLUSIVAMENTE en formato JSON cumpliendo con esta estructura:
{
  "success": true,
  "items": [
    {
      "category": "Maquinaria / Equipos Industriales",
      "type": "Excavadora sobre orugas CAT 320",
      "quantity": 1,
      "length": 8.9,
      "width": 2.98,
      "height": 3.15,
      "weight": 22500,
      "shipping_mode_supported": "Breakbulk / Maquinaria Suelta"
    }
  ]
}`;

    let contentParts;
    if (isExcelFormat(mimeType, fileName)) {
      const extractedText = await extractTextFromSpreadsheet(fileBuffer);
      contentParts = [
        prompt,
        `Contenido de la hoja de cálculo de carga (${fileName}):\n${extractedText}`,
      ];
    } else if (isWordFormat(mimeType, fileName)) {
      const extractedText = await extractTextFromWord(fileBuffer);
      contentParts = [
        prompt,
        `Contenido del documento Word de carga (${fileName}):\n${extractedText}`,
      ];
    } else if (mimeType.startsWith('text/') || isChatOrder) {
      const textContent = fileBuffer.toString('utf8');
      const intro = isChatOrder
        ? 'Orden o instrucción en texto plano enviada desde el widget de chat conversacional:'
        : `Contenido del documento de texto plano (${fileName}):`;
      contentParts = [
        prompt,
        `${intro}\n${textContent}`,
      ];
    } else {
      contentParts = [
        prompt,
        {
          inlineData: {
            data: pureBase64,
            mimeType: mimeType,
          },
        },
      ];
    }

    const result = await model.generateContent(contentParts);
    const responseText = result.response.text();

    let parsedData = { success: true, items: [] };
    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Error parseando JSON de respuesta de IA:', e);
      parsedData = { success: true, items: [] };
    }

    const rawItems = Array.isArray(parsedData?.items) ? parsedData.items : [];
    const items = rawItems.map((it, idx) => {
      const qty = Number(it.quantity);
      const len = Number(it.length);
      const wid = Number(it.width);
      const hgt = Number(it.height);
      const wt = Number(it.weight);

      const lengthVal = !isNaN(len) && len > 0 ? len : 0;
      const widthVal = !isNaN(wid) && wid > 0 ? wid : 0;
      const heightVal = !isNaN(hgt) && hgt > 0 ? hgt : 0;
      const weightVal = !isNaN(wt) && wt > 0 ? wt : 0;

      const rawCategory = typeof it.category === 'string' ? it.category.trim() : '';
      const typeVal = typeof it.type === 'string' ? it.type.trim() : '';
      const desc = `${rawCategory} ${typeVal}`.trim();

      const category = normalizeCategory(rawCategory, desc, typeVal);
      const shippingMode = normalizeShippingMode(it.shipping_mode_supported, desc, weightVal, lengthVal, widthVal, heightVal, category);

      return {
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        category,
        type: typeVal,
        quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
        length: lengthVal,
        width: widthVal,
        height: heightVal,
        weight: weightVal,
        shipping_mode_supported: shippingMode,
        length_m: lengthVal,
        width_m: widthVal,
        height_m: heightVal,
        unit_weight_kg: weightVal,
      };
    });

    const orderTotals = calculateOrderTotals(items);
    const charteringAssessment = evaluateCharteringModel(orderTotals, items, body || {});
    const operationalProfile = buildOperationalProfile(items, orderTotals);
    const financialBreakdown = calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, body || {});

    const fullDataUrl = `data:${mimeType};base64,${pureBase64}`;

    return new Response(JSON.stringify({
      success: true,
      items,
      orderTotals,
      charteringAssessment,
      operationalProfile,
      financialBreakdown,
      reply: financialBreakdown.summaryText,
      documentMeta: {
        name: fileName,
        size: fileBuffer.length,
        itemsCount: items.length,
        uploadedAt: new Date().toISOString(),
        dataBase64: fullDataUrl,
      },
    }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Error crítico en project-parser:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Error interno del servidor al procesar el documento',
      items: [],
      orderTotals: null,
      charteringAssessment: null,
      operationalProfile: null,
      financialBreakdown: null,
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });
  }
}

handler.VALID_CATEGORIES = VALID_CATEGORIES;
handler.VALID_SHIPPING_MODES = VALID_SHIPPING_MODES;
handler.normalizeCategory = normalizeCategory;
handler.normalizeShippingMode = normalizeShippingMode;
handler.WEIGHT_THRESHOLD_TONS = WEIGHT_THRESHOLD_TONS;
handler.calculateOrderTotals = calculateOrderTotals;
handler.evaluateCharteringModel = evaluateCharteringModel;
handler.isBulkOrBigBagsCargo = isBulkOrBigBagsCargo;
handler.buildOperationalProfile = buildOperationalProfile;
handler.evaluateOrderPortOperations = evaluateOrderPortOperations;
handler.calculateFinancialBreakdown = calculateFinancialBreakdown;
handler.WORLD_PORTS = WORLD_PORTS;
handler.KNOWN_PORT_DISTANCES_NM = KNOWN_PORT_DISTANCES_NM;
handler.calculatePortDistanceNm = calculatePortDistanceNm;
handler.calculateRotationAndTce = calculateRotationAndTce;
handler.calculateDemurrage = calculateDemurrage;
handler.detectFileMimeType = detectFileMimeType;
handler.isExcelFormat = isExcelFormat;
handler.isWordFormat = isWordFormat;
handler.extractTextFromSpreadsheet = extractTextFromSpreadsheet;
handler.extractTextFromWord = extractTextFromWord;

export default handler;
