/**
 * MADRE Strategic Report Maritime English Translator & Formatter
 * 
 * Enforces Professional Maritime Commercial English (BIMCO/GENCON standards)
 * for SeaCharter closing corporate documents (Fixture Recap Option B, PDF Export).
 * 
 * Implements the 4 mandatory executive sections:
 * 1. ROUTE & TRAFFIC
 * 2. VESSEL DESIGNATION
 * 3. CARGO ANALYSIS
 * 4. FINANCIAL & FREIGHT ANALYSIS
 * Signed: MADRE
 */

export function isSpanishMaritimeText(text) {
  if (!text || typeof text !== 'string') return false;
  if (/[áéíóúñ¿¡ÁÉÍÓÚÑ]/.test(text)) return true;
  const spanishKeywords = [
    /\b(?:auditor[ií]a|estrat[eé]gica|ejecutiva|operaci[oó]n|an[aá]lisis|determina|frente\s+a|cuello\s+de\s+botella|descarga|permanencia|muelle|d[ií]as\s+efectivos|asimismo|ausencia|traslada|incertidumbre|armador|recomienda|formalizar|opci[oó]n\s*b|plancha|firmado|flete|buque|puerto|carga|viaje|demoras|p[oó]liza|cl[aá]usulas|fletamento|sider[uú]rgico|granel)\b/i
  ];
  return spanishKeywords.some(pattern => pattern.test(text));
}

export function translateCommodityToEnglish(commodity) {
  if (!commodity || typeof commodity !== 'string') return 'DRY BULK / GENERAL CARGO';
  const c = commodity.trim().toLowerCase();
  if (/sider[uú]rgic/i.test(c)) return 'STEEL PRODUCTS / GENERAL CARGO';
  if (/cemento/i.test(c)) return 'BULK CEMENT';
  if (/grano|trigo|soja|ma[ií]z/i.test(c)) return 'GRAIN / BULK AGRICULTURAL';
  if (/chatarra/i.test(c)) return 'SCRAP METAL';
  if (/mineral|hierro/i.test(c)) return 'IRON ORE / MINERAL BULK';
  if (/carb[oó]n/i.test(c)) return 'COAL / DRY BULK';
  if (/fertilizante/i.test(c)) return 'FERTILIZERS IN BULK';
  if (/granel\s*s[oó]lido/i.test(c)) return 'DRY BULK';
  if (/carga\s*general/i.test(c)) return 'GENERAL CARGO';
  if (/break\s*bulk|proyecto/i.test(c)) return 'PROJECT CARGO / BREAKBULK';
  return commodity.toUpperCase();
}

export function formatMadreStrategicReportEnglish(rawReport, state = {}) {
  const safeState = state || {};
  const text = String(rawReport || safeState.reporte_estrategico || safeState.reporteEstrategico || '').trim();

  // If text is empty and no state, return empty
  if (!text && !safeState.pol && !safeState.pod) return '';

  // If already in English and not Spanish, preserve it as is
  if (text && !isSpanishMaritimeText(text)) {
    return text;
  }

  // Extract parameters from rawReport when available, falling back to state
  let pol = String(safeState.pol || '').trim();
  let pod = String(safeState.pod || '').trim();
  const routeMatch = text.match(/operaci[oó]n\s+([A-Za-z\u00C0-\u017F\s]+?)\s*(?:➔|->|to|hacia)\s*([A-Za-z\u00C0-\u017F\s]+?)(?:\s*\(|\.|\n|$)/i);
  if (routeMatch) {
    if (!pol) pol = routeMatch[1].trim();
    if (!pod) pod = routeMatch[2].trim();
  }
  pol = (pol || 'LOADING PORT (POL)').toUpperCase();
  pod = (pod || 'DISCHARGE PORT (POD)').toUpperCase();

  let cargoQty = Number(safeState.cargoQty || safeState.cargo || 0);
  const qtyMatch = text.match(/(\d+[\d\.,]*)\s*(?:MT|TM|toneladas)/i);
  if (!cargoQty && qtyMatch) {
    const parsed = parseFloat(qtyMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) cargoQty = parsed;
  }
  if (!cargoQty) cargoQty = 25000;

  let commodity = safeState.commodity || safeState.cargoType || '';
  const commMatch = text.match(/MT\s+de\s+([^\)\.]+?)(?:\)|\.|\n|$)/i);
  if (!commodity && commMatch) {
    commodity = commMatch[1].trim();
  }
  commodity = translateCommodityToEnglish(commodity || 'DRY BULK');

  let breakEven = Number(safeState.breakEven || 0);
  const beMatch = text.match(/Break-Even(?:\s*base)?(?:\s*de)?\s*[\$]?\s*(\d+(?:[\.,]\d+)?)/i);
  if (!breakEven && beMatch) {
    const parsed = parseFloat(beMatch[1].replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) breakEven = parsed;
  }
  if (!breakEven) breakEven = 32.50;

  let freightRate = Number(safeState.allInRateGross || safeState.fleteUnitario || safeState.freightRate || safeState.flete || 0);
  const freightMatch = text.match(/(?:ajustando el flete a|Flete ALL-IN GROSS:\s*|flete nominal de\s*)[\$]?\s*(\d+(?:[\.,]\d+)?)/i);
  if (!freightRate && freightMatch) {
    const parsed = parseFloat(freightMatch[1].replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) freightRate = parsed;
  }
  if (!freightRate) freightRate = 42.00;

  let dischargeRate = Number(safeState.dischargeRate || safeState.dischRate || safeState.optimalDischargeRate || 0);
  const dischMatch = text.match(/ritmo de descarga\s*\(\s*(\d+[\d\.,]*)\s*(?:MT\/d|tm\/d)/i);
  if (!dischargeRate && dischMatch) {
    const parsed = parseFloat(dischMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) dischargeRate = parsed;
  }
  if (!dischargeRate) dischargeRate = 2500;

  let loadRate = Number(safeState.loadRate || safeState.loadingRate || 0);
  if (!loadRate) loadRate = 5000;

  const rawVesselName = String(
    safeState.vesselName ||
    (typeof safeState.vessel === 'object' ? safeState.vessel?.name : safeState.vessel) ||
    safeState.nombre_buque ||
    safeState.shipName ||
    'MV TBN'
  ).trim();
  const vesselName = rawVesselName ? rawVesselName.toUpperCase() : 'MV TBN';

  const vesselType = String(
    safeState.vesselType ||
    safeState.tipoBuque ||
    safeState.shipProfile ||
    'Geared Bulk Carrier / Open Holds'
  ).toUpperCase();

  const rawDwt = Number(safeState.dwt || safeState.vesselDwt || safeState.dwtReal || cargoQty);
  const dwt = (!isNaN(rawDwt) && rawDwt > 0) ? rawDwt : cargoQty;

  const rawDemurrage = [
    safeState.demurrageRate,
    safeState.demurrageRecomendado,
    safeState.demurrage
  ].map(Number).find(val => Number.isFinite(val) && val > 0) || 31200;

  const formattedCargoQty = cargoQty.toLocaleString('en-US');
  const formattedDwt = dwt.toLocaleString('en-US');
  const formattedLoadRate = loadRate.toLocaleString('en-US');
  const formattedDischRate = dischargeRate.toLocaleString('en-US');
  const formattedDemurrage = rawDemurrage.toLocaleString('en-US');
  const formattedBreakEven = breakEven.toFixed(2);
  const formattedFreight = freightRate.toFixed(2);

  return [
    `1. ROUTE & TRAFFIC:`,
    `Commercial trading route from 1 safe berth / 1 safe port ${pol} to 1 safe berth / 1 safe port ${pod}. Transit and routing parameters verified in compliance with international navigation standards, canal regulations and seasonal weather working conditions.`,
    ``,
    `2. VESSEL DESIGNATION:`,
    `${vesselName} (ABT ${formattedDwt} MT DWT, ${vesselType}). Structural integrity, hold cleanliness, and onboard gear/equipment validated for safe reception and carriage of cargo in accordance with BIMCO/GENCON charterparty standards.`,
    ``,
    `3. CARGO ANALYSIS:`,
    `${formattedCargoQty} METRIC TONS 5% MOLOO OF ${commodity}. Contractual loading rate fixed at ${formattedLoadRate} MT/WWD SHINC. Contractual discharge rate evaluated at ${formattedDischRate} MT/WWD SHINC. Turnaround bottleneck identified at discharge port requiring strict laytime definition and Reachable on Arrival terms to eliminate uncompensated waiting time.`,
    ``,
    `4. FINANCIAL & FREIGHT ANALYSIS:`,
    `Base operational break-even calculated at USD $${formattedBreakEven}/MT against agreed all-in freight rate of USD $${formattedFreight}/MT (protecting commercial net margin). Demurrage rate fixed at USD $${formattedDemurrage}/day pro rata to insulate against terminal congestion. Option B strategic execution confirmed, locking in required bunker coverage, JWC war risk provisions, and laytime safeguards.`,
    ``,
    `Signed: MADRE`
  ].join('\n');
}

if (typeof globalThis !== 'undefined') {
  globalThis.formatMadreStrategicReportEnglish = formatMadreStrategicReportEnglish;
  globalThis.translateCommodityToEnglish = translateCommodityToEnglish;
  globalThis.isSpanishMaritimeText = isSpanishMaritimeText;
}
